import { useEffect, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectCurrentRole, selectRoleUserCounts } from '../app/selectors';
import { createRole, reloadRoles, updateRole } from '../features/roles/rolesSlice';
import { ACCESS_HELP, ACCESS_LEVELS, AREAS, emptyPermissions } from '../utils/permissions';
import type { Access, Area, Permissions, Role } from '../types';
import { Badge, Spinner, TextField, type Tone } from './ui';

const ACCESS_TONE: Record<Access, Tone> = { Full: 'ok', Edit: 'info', View: 'mute', None: 'mute' };
const AREA_NOTE: Partial<Record<Area, string>> = {
  Settings: 'Includes managing roles, so treat this like admin access.',
  Reports: 'Sales, customer and payroll figures.',
};

type Draft = { name: string; isActive: boolean; permissions: Permissions };
const NEW = 'new';

const toDraft = (r: Role): Draft => ({ name: r.name, isActive: r.isActive, permissions: { ...r.permissions } });
const blank = (): Draft => ({ name: '', isActive: true, permissions: emptyPermissions() });
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
const MANAGE: Access[] = ['Edit', 'Full'];

export default function RolesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const roles = useAppSelector((s) => s.roles.items);
  const listError = useAppSelector((s) => s.roles.listError);
  const counts = useAppSelector(selectRoleUserCounts);
  const myRole = useAppSelector(selectCurrentRole);

  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? NEW);
  const selected = roles.find((r) => r.id === selectedId);
  const [draft, setDraft] = useState<Draft>(() => (selected ? toDraft(selected) : blank()));
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const isNew = selectedId === NEW;
  const locked = !!selected?.system || readOnly;
  const systemRole = !!selected?.system;
  const baseline: Draft = selected ? toDraft(selected) : blank();
  const dirty = !locked && !same(draft, baseline);
  const userCount = selected ? counts.get(selected.id) ?? 0 : 0;
  const isMine = !!selected && myRole?.id === selected.id;
  /** Roles can't be deleted, only made inactive, and only when nobody has them. */
  const cantDeactivate = !isNew && !!selected?.isActive && userCount > 0;
  const areasWithAccess = (p: Permissions) => AREAS.filter((a) => p[a] !== 'None').length;

  const open = (id: string, nextDraft: Draft) => {
    setSelectedId(id);
    setDraft(nextDraft);
    setError('');
    setSaveError('');
  };

  // Fetch the latest roles from the server whenever the tab opens.
  const reload = async () => {
    setLoading(true);
    await dispatch(reloadRoles());
    setLoading(false);
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the selected role is gone after a reload (or nothing was selected yet), show the first role.
  useEffect(() => {
    if (selected || dirty || (isNew && draft.name) || !roles[0]) return;
    open(roles[0].id, toDraft(roles[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

  const confirmLeave = () => !dirty || window.confirm('Discard your unsaved changes to this role?');

  const selectRole = (r: Role) => {
    if (r.id === selectedId || !confirmLeave()) return;
    setNotice('');
    open(r.id, toDraft(r));
  };

  const startNew = (from?: Role) => {
    if (!confirmLeave()) return;
    setNotice('');
    open(NEW, from ? { name: `Copy of ${from.name}`, isActive: true, permissions: { ...from.permissions } } : blank());
  };

  const touch = () => {
    setNotice('');
    setSaveError('');
  };
  const setAccess = (area: Area, access: Access) => {
    setDraft((d) => ({ ...d, permissions: { ...d.permissions, [area]: access } }));
    touch();
  };
  const setAll = (access: Access) => {
    setDraft((d) => ({ ...d, permissions: Object.fromEntries(AREAS.map((a) => [a, access])) as Permissions }));
    touch();
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return setError('Enter a role name.');
    if (name.length > 100) return setError('Use 100 characters or fewer.');
    if (roles.some((r) => r.id !== selectedId && r.name.toLowerCase() === name.toLowerCase()))
      return setError('Another role already has this name.');
    if (cantDeactivate && !draft.isActive)
      return setSaveError('Move everyone off this role before making it inactive.');
    if (
      isMine &&
      MANAGE.includes(baseline.permissions.Settings) &&
      (!MANAGE.includes(draft.permissions.Settings) || !draft.isActive) &&
      !window.confirm('This is your own role. Saving will take away your access to manage settings and roles. Continue?')
    )
      return;

    setSaving(true);
    setSaveError('');
    const input = { name, isActive: draft.isActive, permissions: draft.permissions };
    if (isNew) {
      const res = await dispatch(createRole(input));
      if (createRole.fulfilled.match(res)) {
        open(res.payload.id, toDraft(res.payload));
        setNotice(`${name} created.`);
      } else setSaveError(res.payload ?? 'Could not create the role.');
    } else if (selected) {
      const res = await dispatch(updateRole({ id: selected.id, system: selected.system, ...input }));
      if (updateRole.fulfilled.match(res)) {
        setDraft(toDraft(res.payload));
        setNotice('Changes saved.');
      } else setSaveError(res.payload ?? 'Could not save the role.');
    }
    setSaving(false);
  };

  if (roles.length === 0 && loading) return <Spinner label="Loading roles…" />;

  if (roles.length === 0 && listError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h2 className="text-base font-semibold">Roles and permissions</h2>
        <p role="alert" className="text-sm text-red-700">{listError}</p>
        <button type="button" className="btn-secondary" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Roles and permissions</h2>
          <p className="mt-1 text-[13px] text-slate-600">
            Create roles for how your company works, then choose what each role can do. Assign roles to people on the employee form.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {listError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn’t refresh roles: {listError}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {/* Role list */}
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2 lg:max-w-[280px]">
          {!readOnly && (
            <button type="button" className="btn-secondary w-full" onClick={() => startNew()}>
              + New role
            </button>
          )}
          <ul className="flex flex-col gap-1.5" aria-label="Roles">
            {isNew && (
              <li>
                <div className="rounded-lg border-2 border-blue-700 bg-blue-50 px-3.5 py-3">
                  <div className="text-sm font-semibold">{draft.name.trim() || 'Untitled role'}</div>
                  <div className="text-xs text-slate-600">Not saved yet</div>
                </div>
              </li>
            )}
            {roles.map((r) => {
              const active = r.id === selectedId;
              const n = counts.get(r.id) ?? 0;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectRole(r)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full rounded-lg border px-3.5 py-3 text-left transition-colors ${
                      active ? 'border-2 border-blue-700 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{r.name}</span>
                      <span className="flex shrink-0 gap-1">
                        {r.system && <Badge tone="mute">System</Badge>}
                        {!r.isActive && <Badge tone="warn">Inactive</Badge>}
                        {myRole?.id === r.id && <Badge tone="info">You</Badge>}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {n} {n === 1 ? 'person' : 'people'} · access to {areasWithAccess(r.permissions)} of {AREAS.length} areas
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Editor */}
        <form onSubmit={save} noValidate className="flex min-w-0 flex-[3_1_520px] flex-col gap-5 rounded-xl border border-slate-200 p-5">
          {readOnly && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              You can view roles but not change them. Ask an admin if something needs updating.
            </div>
          )}
          {systemRole && !readOnly && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <strong>{selected?.name}</strong> is a system role. It always has full access so someone can manage settings, and it
              can’t be edited here.
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            <TextField
              id="role-name"
              label="Role name *"
              placeholder="For example, Warehouse supervisor"
              value={draft.name}
              disabled={locked}
              error={error}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
                setError('');
                touch();
              }}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Status</span>
              <label htmlFor="role-active" className={`inline-flex min-h-10 items-center gap-2.5 ${locked ? '' : 'cursor-pointer'}`}>
                <input
                  id="role-active"
                  type="checkbox"
                  className="h-[18px] w-[18px] accent-blue-700"
                  checked={draft.isActive}
                  disabled={locked || cantDeactivate}
                  aria-describedby="role-active-help"
                  onChange={(e) => {
                    setDraft({ ...draft, isActive: e.target.checked });
                    touch();
                  }}
                />
                <span className="text-sm">Active</span>
              </label>
              <span id="role-active-help" className="text-xs text-slate-600">
                {cantDeactivate
                  ? `Assigned to ${userCount} ${userCount === 1 ? 'person' : 'people'}. Move them to another role before making it inactive.`
                  : 'Inactive roles can’t be given to anyone.'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Permissions</h3>
              {!locked && (
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600">
                  Set all to
                  {ACCESS_LEVELS.map((a) => (
                    <button key={a} type="button" onClick={() => setAll(a)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100">
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr>
                    <th className="th">Area</th>
                    {ACCESS_LEVELS.map((a) => (
                      <th key={a} className="th text-center" title={ACCESS_HELP[a]}>
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((area) => (
                    <tr key={area}>
                      <td className="td">
                        <div className="font-semibold">{area}</div>
                        {AREA_NOTE[area] && <div className="text-xs whitespace-normal text-slate-600">{AREA_NOTE[area]}</div>}
                      </td>
                      {ACCESS_LEVELS.map((access) => {
                        const id = `perm-${area}-${access}`;
                        const checked = draft.permissions[area] === access;
                        return (
                          <td key={access} className={`td text-center ${checked ? 'bg-blue-50/60' : ''}`}>
                            <label htmlFor={id} className={`inline-flex min-h-8 min-w-8 items-center justify-center ${locked ? '' : 'cursor-pointer'}`}>
                              <input
                                id={id}
                                type="radio"
                                name={`perm-${area}`}
                                className="h-[18px] w-[18px] accent-blue-700"
                                checked={checked}
                                disabled={locked}
                                onChange={() => setAccess(area, access)}
                              />
                              <span className="sr-only">
                                {area}: {access}
                              </span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
              {ACCESS_LEVELS.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5">
                  <Badge tone={ACCESS_TONE[a]}>{a}</Badge> {ACCESS_HELP[a]}
                </span>
              ))}
            </div>
          </div>

          {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <div className="mr-auto text-sm">
              {saveError ? (
                <span role="alert" className="text-red-700">{saveError}</span>
              ) : notice ? (
                <span role="status" className="text-emerald-700">{notice}</span>
              ) : dirty ? (
                <span className="text-slate-600">Unsaved changes</span>
              ) : selected && !locked && userCount > 0 ? (
                <span className="text-slate-600">
                  Assigned to {userCount} {userCount === 1 ? 'person' : 'people'}. Changes apply to them straight away.
                </span>
              ) : null}
            </div>
            {selected && !readOnly && (
              <button type="button" className="btn-secondary" onClick={() => startNew(selected)}>
                Duplicate
              </button>
            )}
            {!locked && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!dirty && !isNew}
                  onClick={() => {
                    if (isNew) {
                      const first = roles[0];
                      if (first) open(first.id, toDraft(first));
                    } else setDraft(baseline);
                  }}
                >
                  {isNew ? 'Cancel' : 'Discard'}
                </button>
                <button type="submit" className="btn-primary" disabled={saving || (!dirty && !isNew)}>
                  {saving ? 'Saving…' : isNew ? 'Create role' : 'Save role'}
                </button>
              </>
            )}
          </div>
          )}
        </form>
      </div>
    </div>
  );
}
