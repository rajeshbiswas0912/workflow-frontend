import { useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useCan } from '../app/hooks';
import { saveSettings } from '../features/settings/settingsSlice';
import { PageHeader, SelectField, TextField } from '../components/ui';
import RolesPanel from '../components/RolesPanel';
import type { GeneralSettings, SecuritySettings } from '../types';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'security', label: 'Security' },
  { id: 'roles', label: 'Roles and permissions' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function SettingsPage() {
  const dispatch = useAppDispatch();
  const can = useCan();
  const readOnly = !can('Settings', 'edit');
  const saved = useAppSelector((s) => s.settings);
  const [general, setGeneral] = useState<GeneralSettings>(saved.general);
  const [security, setSecurity] = useState<SecuritySettings>(saved.security);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [params, setParams] = useSearchParams();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const requested = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : 'general';

  const dirtyGeneral = !same(general, saved.general);
  const dirtySecurity = !same(security, saved.security);
  const dirty = dirtyGeneral || dirtySecurity;
  const unsaved: Record<TabId, boolean> = { general: dirtyGeneral, security: dirtySecurity, roles: false };

  const selectTab = (id: TabId, focus = false) => {
    setParams(id === 'general' ? {} : { tab: id }, { replace: true });
    if (focus) tabRefs.current[id]?.focus();
  };

  // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern).
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(TABS[next].id, true);
  };

  const g = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    setGeneral((s) => ({ ...s, [key]: value }));
    setMessage(null);
  };
  const sec = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => {
    setSecurity((s) => ({ ...s, [key]: value }));
    setMessage(null);
  };

  const save = async () => {
    if (!general.companyName.trim() || !general.orderPrefix.trim()) {
      selectTab('general');
      setMessage({ ok: false, text: 'Company name and order prefix cannot be empty.' });
      return;
    }
    await dispatch(saveSettings({ general, security }));
    setMessage({ ok: true, text: 'Settings saved.' });
  };

  const discard = () => {
    setGeneral(saved.general);
    setSecurity(saved.security);
    setMessage(null);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle={readOnly ? 'Company defaults, security rules and role permissions. You have view-only access.' : 'Company defaults, security rules and role permissions.'} />

      <div className="card overflow-hidden">
        <div role="tablist" aria-label="Settings sections" className="flex overflow-x-auto border-b border-slate-200 px-2">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(t.id)}
                onKeyDown={onTabKeyDown}
                className={`relative -mb-px inline-flex min-h-12 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:rounded-t-md focus-visible:outline-offset-[-2px] ${
                  active ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {t.label}
                {unsaved[t.id] && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="unsaved changes" />}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="p-6 focus:outline-none">
          <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
          {tab === 'general' && (
            <div className="flex max-w-3xl flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold">General</h2>
                <p className="mt-1 text-[13px] text-slate-600">Used on orders, invoices and reports.</p>
              </div>
              <TextField id="co" label="Company name" value={general.companyName} onChange={(e) => g('companyName', e.target.value)} />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <SelectField id="cu" label="Currency" value={general.currency} onChange={(e) => g('currency', e.target.value as GeneralSettings['currency'])}>
                  <option value="INR">Indian rupee (₹)</option>
                  <option value="USD">US dollar ($)</option>
                </SelectField>
                <SelectField id="tz" label="Time zone" value={general.timeZone} onChange={(e) => g('timeZone', e.target.value)}>
                  <option>Asia/Kolkata</option>
                  <option>UTC</option>
                </SelectField>
                <TextField id="gs" label="Tax rate (GST, %)" type="number" min={0} max={100} value={general.gstRate} onChange={(e) => g('gstRate', Math.max(0, Number(e.target.value)))} />
                <TextField id="px" label="Order number prefix" value={general.orderPrefix} onChange={(e) => g('orderPrefix', e.target.value)} />
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="flex max-w-3xl flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold">Security</h2>
                <p className="mt-1 text-[13px] text-slate-600">Sign-in sessions and password rules for every user.</p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <SelectField id="at" label="Access token lifetime" value={security.accessTokenMinutes} onChange={(e) => sec('accessTokenMinutes', Number(e.target.value))}>
                  {[15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </SelectField>
                <SelectField id="rt" label="Refresh token lifetime" value={security.refreshTokenDays} onChange={(e) => sec('refreshTokenDays', Number(e.target.value))}>
                  {[1, 7, 30].map((d) => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
                </SelectField>
                <TextField id="pl" label="Minimum password length" type="number" min={6} value={security.minPasswordLength} onChange={(e) => sec('minPasswordLength', Number(e.target.value))} />
                <TextField id="fa" label="Lock account after failed sign-ins" type="number" min={1} value={security.lockAfterFailedAttempts} onChange={(e) => sec('lockAfterFailedAttempts', Number(e.target.value))} />
              </div>
              <div className="flex items-center gap-2.5">
                <input id="sp" type="checkbox" className="h-[18px] w-[18px] accent-blue-700" checked={security.requireComplexPassword} onChange={(e) => sec('requireComplexPassword', e.target.checked)} />
                <label htmlFor="sp" className="text-sm">Require letters, numbers and a symbol in passwords</label>
              </div>
            </div>
          )}

          </fieldset>
          {tab === 'roles' && <RolesPanel readOnly={readOnly} />}
        </div>

        {tab !== 'roles' && !readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            {message && (
              <span role="status" className={`mr-auto text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {message.text}
              </span>
            )}
            {!message && dirty && <span className="mr-auto text-sm text-slate-600">You have unsaved changes.</span>}
            <button type="button" className="btn-secondary" onClick={discard} disabled={!dirty || saved.saving}>
              Discard
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={!dirty || saved.saving}>
              {saved.saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
