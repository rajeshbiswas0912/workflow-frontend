import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppSelector, useCan } from '../app/hooks';
import { selCurrency } from '../app/selectors';
import { Badge, EmptyRow, orderTone, PageHeader, Pagination } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { customerApi } from '../services/customerApi';
import { orderApi, type OrderRow } from '../services/orderApi';
import { formatDate, formatMoney } from '../utils/format';
import { ORDER_STATUSES } from '../utils/orders';
import type { OrderStatus } from '../types';

const PAGE_SIZE = 8;

/** Waits until the user stops typing before using a value. */
function useDebounced(value: string, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function OrdersPage() {
  const can = useCan();
  const currency = useAppSelector(selCurrency);
  const canDelete = can('Orders', 'delete');

  // Status and customer live in the URL so other pages can link here (?status=Pending, ?customer=<id>).
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status: OrderStatus | '' = ORDER_STATUSES.includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : '';
  const customerId = params.get('customer') ?? '';

  const [queryInput, setQueryInput] = useState('');
  const query = useDebounced(queryInput);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<OrderStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  // Back to page 1 whenever the filters change.
  useEffect(() => setPage(1), [query, from, to, status, customerId, showDeleted]);

  // Name for the "Showing orders for …" banner.
  useEffect(() => {
    setCustomerName('');
    if (!customerId) return;
    customerApi.get(customerId).then((c) => setCustomerName(c.name)).catch(() => setCustomerName('unknown customer'));
  }, [customerId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await orderApi.list({
        search: query,
        customerId,
        status,
        dateFrom: from,
        dateTo: to,
        includeDeleted: showDeleted,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if (res.items.length === 0 && res.total > 0 && page > 1) {
        setPage((p) => p - 1);
        return;
      }
      setRows(res.items);
      setTotal(res.total);
      setCounts(res.statusCounts);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load orders.'));
    } finally {
      setLoading(false);
    }
  }, [query, customerId, status, from, to, showDeleted, page]);

  useEffect(() => {
    load();
  }, [load]);

  const rowAction = async (o: OrderRow, action: () => Promise<unknown>, done: string, failed: string) => {
    setBusyId(o.id);
    setNotice('');
    try {
      await action();
      setNotice(done);
      await load();
    } catch (err) {
      window.alert(getErrorMessage(err, failed));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = (o: OrderRow) => {
    if (!window.confirm(`Delete order ${o.number}? You can restore it later from "Show deleted".`)) return;
    rowAction(o, () => orderApi.remove(o.id), `Order ${o.number} was deleted.`, 'Could not delete the order.');
  };
  const onRestore = (o: OrderRow) =>
    rowAction(o, () => orderApi.restore(o.id), `Order ${o.number} was restored.`, 'Could not restore the order.');

  const allCount = ORDER_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const chips: { label: string; value: OrderStatus | ''; count: number }[] = [
    { label: 'All', value: '', count: allCount },
    ...ORDER_STATUSES.map((s) => ({ label: s, value: s, count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={`${allCount} orders${query || from || to || customerId ? ' match these filters' : ' in total'}`}
        actions={can('Orders', 'create') && <Link to="/orders/new" className="btn-primary">New order</Link>}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {chips.map((c) => {
          const on = c.value === status;
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={on}
              onClick={() => setParam('status', c.value || null)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                on ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
              }`}
            >
              {c.label} <span className="font-medium">{c.count}</span>
            </button>
          );
        })}
      </div>

      {customerId && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Showing orders for <strong>{customerName || '…'}</strong>
          <button type="button" className="link" onClick={() => setParam('customer', null)}>Clear</button>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-[2_1_260px] flex-col gap-1">
            <label htmlFor="oq" className="label-muted">Search</label>
            <input id="oq" type="search" placeholder="Order number or customer" className="input" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} />
          </div>
          <div className="flex flex-[1_1_180px] flex-col gap-1">
            <label htmlFor="of" className="label-muted">From</label>
            <input id="of" type="date" className="input px-3" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-[1_1_180px] flex-col gap-1">
            <label htmlFor="ot" className="label-muted">To</label>
            <input id="ot" type="date" className="input px-3" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          {canDelete && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              Show deleted
            </label>
          )}
        </div>
        {notice && <div role="status" className="border-b border-slate-200 px-5 py-2 text-sm text-green-700">{notice}</div>}
        <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                {['Order', 'Customer', 'Handled by', 'Date', 'Line items', 'Total', 'Status', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loadError ? (
                <EmptyRow colSpan={8}>
                  <span className="text-red-700">{loadError}</span>
                  <button type="button" className="link ml-2" onClick={load}>Try again</button>
                </EmptyRow>
              ) : loading && rows.length === 0 ? (
                <EmptyRow colSpan={8}>Loading orders…</EmptyRow>
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={8}>No orders match these filters.</EmptyRow>
              ) : (
                rows.map((o) => {
                  const deleted = !!o.deletedAt;
                  const busy = busyId === o.id;
                  const deletable = o.status === 'Pending' || o.status === 'Cancelled';
                  return (
                    <tr key={o.id} className={`row-hover ${deleted ? 'opacity-60' : ''}`}>
                      <td className="td">
                        {deleted ? o.number : <Link to={`/orders/${o.id}`} className="link">{o.number}</Link>}
                        {deleted && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Deleted</span>}
                      </td>
                      <td className="td">{o.customerName}</td>
                      <td className="td">{o.handlerName}</td>
                      <td className="td">{formatDate(o.date)}</td>
                      <td className="td">{o.itemCount}</td>
                      <td className="td font-semibold">{formatMoney(o.total, currency)}</td>
                      <td className="td"><Badge tone={orderTone[o.status]}>{o.status}</Badge></td>
                      <td className="td whitespace-nowrap">
                        {deleted ? (
                          canDelete && (
                            <button type="button" className="link" disabled={busy} onClick={() => onRestore(o)}>
                              {busy ? 'Restoring…' : 'Restore'}
                            </button>
                          )
                        ) : (
                          <>
                            <Link to={`/orders/${o.id}`} className="link mr-4">View</Link>
                            {canDelete && deletable && (
                              <button type="button" className="link-danger" disabled={busy} onClick={() => onDelete(o)}>
                                {busy ? 'Deleting…' : 'Delete'}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </>
  );
}
