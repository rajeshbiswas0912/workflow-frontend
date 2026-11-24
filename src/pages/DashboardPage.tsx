import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector, useCan } from '../app/hooks';
import { selCurrency } from '../app/selectors';
import { Badge, BarChart, EmptyRow, MeterList, orderTone, PageHeader, StatCard } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { dashboardApi, type MonthlySales, type RecentOrder } from '../services/dashboardApi';
import { formatDate, formatLakh, formatMoney } from '../utils/format';
import type { OrderStatus } from '../types';

const STATUS_COLOR: Record<OrderStatus, string> = {
  Pending: '#B45309',
  Confirmed: '#2563EB',
  Shipped: '#7C3AED',
  Delivered: '#047857',
  Cancelled: '#B91C1C',
};

/** One dashboard widget's data: loading until it arrives, then either the value or an error message. */
type Slot<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: string };
const LOADING = { status: 'loading' } as const;

/** Each widget loads on its own, so one failing endpoint (e.g. no access to orders) doesn't blank the page. */
function useSlot<T>(fetcher: () => Promise<T>, reloadKey: number): Slot<T> {
  const [slot, setSlot] = useState<Slot<T>>(LOADING);
  useEffect(() => {
    let cancelled = false;
    setSlot(LOADING);
    fetcher()
      .then((data) => !cancelled && setSlot({ status: 'ok', data }))
      .catch((err) => !cancelled && setSlot({ status: 'error', error: getErrorMessage(err, 'Could not load this.') }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);
  return slot;
}

/** Renders a slot's value, or a placeholder while loading / on error. */
function show<T>(slot: Slot<T>, render: (d: T) => ReactNode, placeholder: ReactNode = '—'): ReactNode {
  return slot.status === 'ok' ? render(slot.data) : placeholder;
}
const note = <T,>(slot: Slot<T>, render: (d: T) => string) =>
  slot.status === 'ok' ? render(slot.data) : slot.status === 'loading' ? 'Loading…' : 'Could not load';

function WidgetMessage({ slot }: { slot: Slot<unknown> }) {
  if (slot.status === 'loading') return <p className="py-10 text-center text-sm text-slate-600">Loading…</p>;
  if (slot.status === 'error') return <p className="py-10 text-center text-sm text-red-700">{slot.error}</p>;
  return null;
}

export default function DashboardPage() {
  const can = useCan();
  const currency = useAppSelector(selCurrency);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const employees = useSlot(dashboardApi.employees, reloadKey);
  const openOrders = useSlot(dashboardApi.openOrders, reloadKey);
  const revenue = useSlot(dashboardApi.revenue, reloadKey);
  const customers = useSlot(dashboardApi.customers, reloadKey);
  const sales = useSlot<MonthlySales[]>(() => dashboardApi.salesByMonth(6), reloadKey);
  const byStatus = useSlot(dashboardApi.ordersByStatus, reloadKey);
  const recent = useSlot<RecentOrder[]>(() => dashboardApi.recentOrders(5), reloadKey);

  const anyLoading = [employees, openOrders, revenue, customers, sales, byStatus, recent].some((s) => s.status === 'loading');
  const monthLabel =
    revenue.status === 'ok' ? revenue.data.monthLabel : new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Overview for ${monthLabel}`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={reload} disabled={anyLoading}>
              {anyLoading ? 'Refreshing…' : 'Refresh'}
            </button>
            {can('Orders', 'create') && <Link to="/orders/new" className="btn-primary">New order</Link>}
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Employees" value={show(employees, (d) => d.total)} note={note(employees, (d) => `Across ${d.departments} departments`)} />
        <StatCard
          label="Open orders"
          value={show(openOrders, (d) => d.open)}
          note={note(openOrders, (d) => `${d.pending} waiting for confirmation`)}
        />
        <StatCard
          label="Revenue this month"
          value={show(revenue, (d) => formatMoney(d.amount, currency))}
          note={note(revenue, (d) => `Month to date · ${d.orderCount} order${d.orderCount === 1 ? '' : 's'}`)}
        />
        <StatCard label="Customers" value={show(customers, (d) => d.total)} note={note(customers, () => 'Active accounts')} />
      </div>

      <div className="flex flex-wrap gap-4">
        <section className="card flex min-w-0 flex-[2_1_420px] flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Sales by month</h2>
            <span className="text-[13px] text-slate-600">₹ lakh</span>
          </div>
          {sales.status === 'ok' ? (
            <BarChart data={sales.data.map((m) => ({ label: m.label, value: m.total }))} format={formatLakh} />
          ) : (
            <WidgetMessage slot={sales} />
          )}
        </section>
        <section className="card flex min-w-0 flex-[1_1_280px] flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Orders by status</h2>
            {byStatus.status === 'ok' && <span className="text-[13px] text-slate-600">{byStatus.data.total} total</span>}
          </div>
          {byStatus.status === 'ok' ? (
            <MeterList
              rows={byStatus.data.statuses.map((s) => ({
                key: s.status,
                label: s.label || s.status,
                display: s.count,
                value: s.count,
                color: STATUS_COLOR[s.status],
              }))}
            />
          ) : (
            <WidgetMessage slot={byStatus} />
          )}
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-semibold">Recent orders</h2>
          {can('Orders') && <Link to="/orders" className="link text-sm">View all orders</Link>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                {['Order', 'Customer', 'Date', 'Total', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {recent.status === 'loading' && <EmptyRow colSpan={5}>Loading…</EmptyRow>}
              {recent.status === 'error' && <EmptyRow colSpan={5}><span className="text-red-700">{recent.error}</span></EmptyRow>}
              {recent.status === 'ok' && recent.data.length === 0 && <EmptyRow colSpan={5}>No orders yet.</EmptyRow>}
              {recent.status === 'ok' &&
                recent.data.map((o) => (
                  <tr key={o.id} className="row-hover">
                    <td className="td">{can('Orders') ? <Link to={`/orders/${o.id}`} className="link">{o.number}</Link> : o.number}</td>
                    <td className="td">{o.customerName}</td>
                    <td className="td">{formatDate(o.date)}</td>
                    <td className="td">{formatMoney(o.total, currency)}</td>
                    <td className="td"><Badge tone={orderTone[o.status]}>{o.status}</Badge></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
