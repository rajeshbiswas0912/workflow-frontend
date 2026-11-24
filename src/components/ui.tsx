import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import type { EmployeeStatus, OrderStatus } from '../types';
import { initials } from '../utils/format';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';

const toneClass: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  mute: 'bg-slate-200 text-slate-700',
};

export const orderTone: Record<OrderStatus, Tone> = {
  Pending: 'warn',
  Confirmed: 'info',
  Shipped: 'info',
  Delivered: 'ok',
  Cancelled: 'bad',
};

export const employeeTone: Record<EmployeeStatus, Tone> = { Active: 'ok', 'On leave': 'warn', Inactive: 'mute' };

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClass[tone]}`}>{children}</span>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  badge,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && (
          <Link to={back.to} className="link text-sm">
            {back.label}
          </Link>
        )}
        <div className={`flex flex-wrap items-center gap-3 ${back ? 'mt-2' : ''}`}>
          <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const letters = initials(name);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-blue-100 text-[13px] font-semibold text-blue-800"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {letters}
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  muted?: boolean;
}

function FieldShell({ id, label, error, muted, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={muted ? 'label-muted' : 'label'}>
        {label}
      </label>
      {children}
      {error && (
        <span id={`${id}-err`} className="text-[13px] text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}

const a11y = (id: string, error?: string) =>
  error ? { 'aria-invalid': true, 'aria-describedby': `${id}-err` } : {};

export function TextField({ id, label, error, muted, className = '', ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell id={id} label={label} error={error} muted={muted}>
      <input id={id} className={`input ${error ? 'input-error' : ''} ${className}`} {...a11y(id, error)} {...rest} />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  error,
  muted,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell id={id} label={label} error={error} muted={muted}>
      <select id={id} className={`input px-3 ${error ? 'input-error' : ''}`} {...a11y(id, error)} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({ id, label, error, muted, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell id={id} label={label} error={error} muted={muted}>
      <textarea id={id} className={`input h-auto! resize-y py-3! ${error ? 'input-error' : ''}`} {...a11y(id, error)} {...rest} />
    </FieldShell>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const base = 'min-h-11 min-w-11 rounded-lg border px-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span className="text-[13px] text-slate-600">
        Showing {from} to {to} of {total}
      </span>
      {pages > 1 && (
        <div className="flex gap-1.5">
          <button type="button" className={`${base} border-slate-300 bg-white text-slate-600`} disabled={page === 1} onClick={() => onChange(page - 1)}>
            Prev
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              aria-current={p === page ? 'page' : undefined}
              className={
                p === page
                  ? `${base} border-blue-700 bg-blue-700 font-semibold text-white`
                  : `${base} border-slate-300 bg-white text-slate-900`
              }
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          ))}
          <button type="button" className={`${base} border-slate-300 bg-white text-slate-900`} disabled={page === pages} onClick={() => onChange(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="td py-10 text-center text-slate-600">
        {children}
      </td>
    </tr>
  );
}

export function StatCard({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="card p-5">
      <div className="text-[13px] font-medium text-slate-600">{label}</div>
      <div className="mt-1.5 text-3xl font-bold">{value}</div>
      <div className="mt-0.5 text-[13px] text-slate-600">{note}</div>
    </div>
  );
}

/** Vertical bar chart; the last bar is highlighted as the current period. */
export function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-[230px] items-end gap-4" role="img" aria-label={data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}>
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-xs font-semibold">{format(d.value)}</span>
          <div
            className={`w-full max-w-14 rounded-t-md ${i === data.length - 1 ? 'bg-blue-900' : 'bg-blue-500'}`}
            style={{ height: `${Math.round((d.value / max) * 170)}px` }}
          />
          <span className="text-xs text-slate-600">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Labelled horizontal meters. */
export function MeterList({
  rows,
}: {
  rows: { key: string; label: string; display: ReactNode; value: number; color?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="font-medium">{r.label}</span>
            <span className="text-slate-600">{r.display}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.round((r.value / max) * 100)}%`, background: r.color ?? '#1D4ED8' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-600" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
      {label}
    </div>
  );
}
