import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppSelector, useCan } from '../app/hooks';
import { selCurrency } from '../app/selectors';
import { Avatar, Badge, EmptyRow, orderTone, PageHeader, Spinner } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { orderApi, type OrderDetail, type OrderLine } from '../services/orderApi';
import { productApi, type ProductRecord } from '../services/productApi';
import { formatDate, formatDateTime, formatMoney } from '../utils/format';
import { ORDER_FLOW } from '../utils/orders';
import type { OrderStatus } from '../types';

function Stepper({ status }: { status: OrderStatus }) {
  const reached = ORDER_FLOW.indexOf(status);
  return (
    <section className="card px-6 py-5">
      {status === 'Cancelled' ? (
        <p className="text-sm font-semibold text-red-700">This order was cancelled.</p>
      ) : (
        <ol className="flex flex-wrap gap-x-10 gap-y-4">
          {ORDER_FLOW.map((step, i) => {
            const state = i < reached || status === 'Delivered' ? 'done' : i === reached ? 'now' : 'todo';
            const dot = {
              done: 'bg-emerald-700 text-white',
              now: 'bg-blue-700 text-white',
              todo: 'border-2 border-slate-300 bg-white text-slate-600',
            }[state];
            const note = state === 'done' ? 'Done' : state === 'now' ? 'Current step' : i === reached + 1 ? 'Next' : 'Not yet';
            return (
              <li key={step} className="flex items-center gap-3" aria-current={state === 'now' ? 'step' : undefined}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold ${dot}`}>{i + 1}</div>
                <div>
                  <div className="text-sm font-semibold">{step}</div>
                  <div className="text-xs text-slate-600">{note}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Quantity box that saves when you leave it or press Enter, only if the value changed. */
function QtyInput({ line, disabled, onSave }: { line: OrderLine; disabled: boolean; onSave: (qty: number) => void }) {
  const [value, setValue] = useState(String(line.qty));
  useEffect(() => setValue(String(line.qty)), [line.qty]);
  const commit = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) {
      setValue(String(line.qty));
      return;
    }
    if (n !== line.qty) onSave(n);
  };
  return (
    <input
      type="number"
      min={1}
      aria-label={`Quantity of ${line.productName}`}
      className="input h-9! w-20 px-2"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
    />
  );
}

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const currency = useAppSelector(selCurrency);
  const money = (v: number) => formatMoney(v, currency);
  const canEdit = can('Orders', 'edit');
  const canDelete = can('Orders', 'delete');

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [itemError, setItemError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setOrder(await orderApi.get(id));
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load this order.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const editable = canEdit && !!order && (order.status === 'Pending' || order.status === 'Confirmed') && !order.deletedAt;

  // Active products for the "Add product" picker, only when lines can be edited.
  useEffect(() => {
    if (!editable || products.length) return;
    productApi
      .list({ status: 'Active', limit: 200, offset: 0 })
      .then((r) => setProducts(r.items))
      .catch(() => setProducts([]));
  }, [editable, products.length]);

  if (loading && !order) {
    return <><PageHeader title="Order" back={{ to: '/orders', label: 'Back to orders' }} /><Spinner label="Loading order…" /></>;
  }
  if (!order) {
    return (
      <>
        <PageHeader title="Order not found" subtitle={loadError || `No order with id ${id}.`} back={{ to: '/orders', label: 'Back to orders' }} />
        <div><button type="button" className="btn-secondary" onClick={load}>Try again</button></div>
      </>
    );
  }

  /** Runs a change against the API; the response is the updated order, so the page re-renders from it. */
  const run = async (action: () => Promise<OrderDetail>, onError: (msg: string) => void = setActionError) => {
    setBusy(true);
    setActionError('');
    setItemError('');
    try {
      setOrder(await action());
      return true;
    } catch (err) {
      onError(getErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const next = order.allowedNext.find((s) => s !== 'Cancelled') ?? null;
  const cancellable = canEdit && order.allowedNext.includes('Cancelled');
  const deletable = canDelete && (order.status === 'Pending' || order.status === 'Cancelled');

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(qty);
    if (!productId) return setItemError('Select a product.');
    if (!Number.isInteger(n) || n < 1) return setItemError('Quantity must be a whole number of at least 1.');
    const ok = await run(() => orderApi.addItem(order.id, productId, n), setItemError);
    if (ok) {
      setProductId('');
      setQty('1');
    }
  };

  const advance = () => {
    if (!next) return;
    if (order.items.length === 0) {
      window.alert('Add at least one item before moving this order forward.');
      return;
    }
    run(() => orderApi.setStatus(order.id, next));
  };

  const cancel = () => {
    if (window.confirm(`Cancel order ${order.number}? This cannot be undone.`)) run(() => orderApi.setStatus(order.id, 'Cancelled'));
  };

  const remove = async () => {
    if (!window.confirm(`Delete order ${order.number}?`)) return;
    setBusy(true);
    try {
      await orderApi.remove(order.id);
      navigate('/orders', { replace: true });
    } catch (err) {
      setActionError(getErrorMessage(err, 'Could not delete the order.'));
      setBusy(false);
    }
  };

  const showActions = cancellable || (canEdit && next) || deletable;

  return (
    <>
      <PageHeader
        title={`Order ${order.number}`}
        badge={<Badge tone={orderTone[order.status]}>{order.status}</Badge>}
        subtitle={`Placed on ${formatDate(order.date)} for ${order.customer.name}`}
        back={{ to: '/orders', label: 'Back to orders' }}
        actions={
          showActions && (
            <>
              {deletable && <button type="button" className="btn-secondary px-5" onClick={remove} disabled={busy}>Delete</button>}
              {cancellable && <button type="button" className="btn-danger-outline px-5" onClick={cancel} disabled={busy}>Cancel order</button>}
              {canEdit && next && <button type="button" className="btn-primary px-5" onClick={advance} disabled={busy}>Mark as {next.toLowerCase()}</button>}
            </>
          )
        }
      />

      {actionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</p>}

      <Stepper status={order.status} />

      <div className="flex flex-wrap items-start gap-5">
        <section className="card min-w-0 flex-[2_1_520px] overflow-hidden">
          <div className="px-5 py-4"><h2 className="text-base font-semibold">Order items</h2></div>
          <div className={`overflow-x-auto ${busy ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  {['Product', 'Qty', 'Unit price', 'Line total'].map((h) => <th key={h} className="th">{h}</th>)}
                  {editable && <th className="th">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {order.items.length === 0 && <EmptyRow colSpan={5}>{editable ? 'No items yet. Add a product below.' : 'No items.'}</EmptyRow>}
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td className="td">
                      <div className="font-semibold">{i.productName}</div>
                      {i.sku && <div className="text-[13px] text-slate-600">{i.sku}</div>}
                    </td>
                    <td className="td">
                      {editable ? <QtyInput line={i} disabled={busy} onSave={(n) => run(() => orderApi.updateItem(order.id, i.id, n))} /> : i.qty}
                    </td>
                    <td className="td">{money(i.unitPrice)}</td>
                    <td className="td">{money(i.lineTotal)}</td>
                    {editable && (
                      <td className="td">
                        <button type="button" className="link-danger" disabled={busy} onClick={() => run(() => orderApi.removeItem(order.id, i.id))}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && (
            <form onSubmit={addItem} noValidate className="flex flex-wrap items-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex flex-[2_1_200px] flex-col gap-1">
                <label htmlFor="ap" className="label-muted">Add product</label>
                <select id="ap" className="input px-3" value={productId} onChange={(e) => { setProductId(e.target.value); setItemError(''); }}>
                  <option value="">Select a product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock === 0}>
                      {p.name} — {money(p.price)}{p.stock === 0 ? ' (out of stock)' : ` (${p.stock} in stock)`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-[0_1_100px] flex-col gap-1">
                <label htmlFor="aq" className="label-muted">Quantity</label>
                <input id="aq" type="number" min={1} className="input px-3" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary px-5" disabled={busy}>Add item</button>
              {itemError && <p className="basis-full text-[13px] text-red-700" role="alert">{itemError}</p>}
            </form>
          )}

          <div className="flex justify-end border-t border-slate-200 px-5 py-4">
            <dl className="flex w-[280px] max-w-full flex-col gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">GST ({order.gstRate}%)</dt><dd>{money(order.gst)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2.5 text-[17px] font-bold"><dt>Total</dt><dd>{money(order.total)}</dd></div>
            </dl>
          </div>
        </section>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold">Customer</h2>
            <div>
              <div className="text-[15px] font-semibold">{order.customer.name}</div>
              <div className="mt-0.5 text-sm text-slate-600">{order.customer.email}</div>
              {order.customer.city && <div className="text-sm text-slate-600">{order.customer.city}</div>}
            </div>
            <Link to={`/orders?customer=${order.customer.id}`} className="link text-sm">View customer orders</Link>
          </section>
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold">Handled by</h2>
            <div className="flex items-center gap-3">
              <Avatar name={order.handler.name} size={40} />
              <div>
                <div className="text-sm font-semibold">{order.handler.name}</div>
                {order.handler.title && <div className="text-[13px] text-slate-600">{order.handler.title}</div>}
              </div>
            </div>
          </section>
          {order.notes && (
            <section className="card flex flex-col gap-2 p-5">
              <h2 className="text-base font-semibold">Notes</h2>
              <p className="whitespace-pre-line text-sm text-slate-700">{order.notes}</p>
            </section>
          )}
          <section className="card flex flex-col gap-3.5 p-5">
            <h2 className="text-base font-semibold">Activity</h2>
            {order.activity.length === 0 && <p className="text-sm text-slate-600">No activity yet.</p>}
            {order.activity.map((a, i) => (
              <div key={i} className="flex flex-col gap-0.5 border-l-2 border-slate-300 pl-3.5">
                <div className="text-sm font-semibold">{a.event}</div>
                <div className="text-[13px] text-slate-600">{[a.by, formatDateTime(a.at)].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
