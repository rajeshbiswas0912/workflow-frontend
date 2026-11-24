import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAppSelector, useCan } from '../app/hooks';
import { selCurrency } from '../app/selectors';
import { Badge, EmptyRow, PageHeader, Pagination, SelectField, StatCard, TextAreaField, TextField } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { productApi, type ProductRecord, type ProductSummary } from '../services/productApi';
import { formatMoney } from '../utils/format';
import type { ProductStatus } from '../types';

const PAGE_SIZE = 8;

type Form = {
  name: string;
  sku: string;
  category: string;
  price: string;
  stock: string;
  status: ProductStatus;
  description: string;
};
const EMPTY: Form = { name: '', sku: '', category: '', price: '', stock: '0', status: 'Active', description: '' };

/** Waits until the user stops typing before using a value. */
function useDebounced(value: string, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function ProductsPage() {
  const can = useCan();
  const currency = useAppSelector(selCurrency);
  const money = (v: number) => formatMoney(v, currency);
  const canCreate = can('Products', 'create');
  const canEdit = can('Products', 'edit');
  const canDelete = can('Products', 'delete');

  // ---- Stat cards and categories ----
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // ---- List state (server-side filters + pagination) ----
  const [rows, setRows] = useState<ProductRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const query = useDebounced(queryInput);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // ---- Form state ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const [s, cats] = await Promise.all([productApi.summary(), productApi.categories()]);
      setSummary(s);
      setCategories(cats.map((c) => c.name).sort());
      setSummaryError(false);
    } catch {
      setSummaryError(true);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Back to page 1 whenever the filters change.
  useEffect(() => setPage(1), [query, category, status, inStockOnly, showDeleted]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await productApi.list({
        search: query,
        category,
        status,
        inStockOnly,
        includeDeleted: showDeleted,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      // If the current page emptied out (e.g. after a delete), step back one page.
      if (res.items.length === 0 && res.total > 0 && page > 1) {
        setPage((p) => p - 1);
        return;
      }
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load products.'));
    } finally {
      setLoading(false);
    }
  }, [query, category, status, inStockOnly, showDeleted, page]);

  useEffect(() => {
    load();
  }, [load]);

  /** After any change: reload the table and the stat cards. */
  const refresh = () => Promise.all([load(), loadSummary()]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
    setFormError('');
  };

  const startEdit = (p: ProductRecord) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: String(p.price),
      stock: String(p.stock),
      status: p.status,
      description: p.description,
    });
    setErrors({});
    setFormError('');
    setNotice('');
  };

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
    setErrors({});
    setFormError('');
  };

  /** Runs a row action with a busy state, a success notice and an alert on failure. */
  const rowAction = async (p: ProductRecord, action: () => Promise<unknown>, done: string, failed: string) => {
    setBusyId(p.id);
    setNotice('');
    try {
      await action();
      setNotice(done);
      await refresh();
    } catch (err) {
      window.alert(getErrorMessage(err, failed));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = (p: ProductRecord) => {
    if (p.unitsSold > 0 && !window.confirm(`${p.name} has been sold before. Marking it Discontinued keeps it in reports. Delete it anyway?`)) return;
    if (p.unitsSold === 0 && !window.confirm(`Delete ${p.name}? You can restore it later from "Show deleted".`)) return;
    rowAction(p, async () => {
      await productApi.remove(p.id);
      if (editingId === p.id) reset();
    }, `${p.name} was deleted.`, 'Could not delete the product.');
  };

  const onRestore = (p: ProductRecord) =>
    rowAction(p, () => productApi.restore(p.id), `${p.name} was restored.`, 'Could not restore the product.');

  const onToggleStatus = (p: ProductRecord) => {
    const next: ProductStatus = p.status === 'Active' ? 'Discontinued' : 'Active';
    rowAction(p, () => productApi.setStatus(p.id, next), `${p.name} is now ${next.toLowerCase()}.`, 'Could not change the status.');
  };

  const onAdjustStock = (p: ProductRecord) => {
    const input = window.prompt(`Add or remove units for ${p.name} (current stock ${p.stock}).\nUse a negative number to remove, e.g. -3.`, '10');
    if (input == null) return;
    const delta = Number(input.trim());
    if (!Number.isInteger(delta) || delta === 0) {
      window.alert('Enter a whole number other than 0, such as 10 or -3.');
      return;
    }
    rowAction(p, () => productApi.adjustStock(p.id, delta), `${p.name} stock ${delta > 0 ? 'increased' : 'reduced'} by ${Math.abs(delta)}.`, 'Could not adjust the stock.');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: typeof errors = {};
    const sku = form.sku.trim().toUpperCase();
    if (!form.name.trim()) er.name = 'Enter a product name.';
    if (!sku) er.sku = 'Enter a SKU.';
    if (!form.category.trim()) er.category = 'Enter a category.';
    if (!(Number(form.price) > 0)) er.price = 'Enter a price greater than 0.';
    if (!Number.isInteger(Number(form.stock)) || Number(form.stock) < 0) er.stock = 'Stock must be a whole number, 0 or more.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    setFormError('');
    setNotice('');
    const data = {
      name: form.name.trim(),
      sku,
      category: form.category.trim(),
      price: Number(form.price),
      stock: Number(form.stock),
      status: form.status,
      description: form.description.trim(),
    };
    try {
      const saved = editingId ? await productApi.update(editingId, data) : await productApi.create(data);
      setNotice(editingId ? `${saved.name} was updated.` : `${saved.name} was added.`);
      reset();
      await refresh();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save the product.'));
    } finally {
      setSaving(false);
    }
  };

  const showForm = editingId ? canEdit : canCreate;
  const threshold = summary?.lowStockThreshold ?? 10;
  const filtered = !!(query || category || status || inStockOnly);
  const stat = (v: () => string | number) => (summary ? v() : summaryError ? '—' : '…');
  const best = summary?.bestSeller;

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={filtered ? `${total} matching products` : `${summary?.total ?? total} products in the catalogue`}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Active products" value={stat(() => summary!.active)} note={summary ? `${summary.discontinued} discontinued` : summaryError ? 'Could not load' : 'Loading…'} />
        <StatCard label="Low stock" value={stat(() => summary!.lowStock)} note={`Fewer than ${threshold} units left`} />
        <StatCard label="Stock value" value={stat(() => money(summary!.stockValue))} note="Active products at list price" />
        <StatCard
          label="Best seller"
          value={<span className="text-xl">{summary ? best?.name ?? '—' : stat(() => '')}</span>}
          note={best ? `${money(best.revenue)} sold · ${best.unitsSold} units` : summary ? 'No sales yet' : 'Loading…'}
        />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className="card min-w-0 flex-[2_1_560px] overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex flex-[2_1_220px] flex-col gap-1">
              <label htmlFor="pq" className="label-muted">Search</label>
              <input id="pq" type="search" placeholder="Product name or SKU" className="input" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} />
            </div>
            <div className="flex flex-[1_1_160px] flex-col gap-1">
              <label htmlFor="pc" className="label-muted">Category</label>
              <select id="pc" className="input px-3" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-[1_1_150px] flex-col gap-1">
              <label htmlFor="ps" className="label-muted">Status</label>
              <select id="ps" className="input px-3" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus | '')}>
                <option value="">All statuses</option>
                <option>Active</option>
                <option>Discontinued</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="flex min-h-8 items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
                In stock only
              </label>
              {canDelete && (
                <label className="flex min-h-8 items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
                  Show deleted
                </label>
              )}
            </div>
          </div>
          {notice && <div role="status" className="border-b border-slate-200 px-5 py-2 text-sm text-green-700">{notice}</div>}
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  {['Product', 'Unit price', 'Stock', 'Sales', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}
                  {(canEdit || canDelete) && <th className="th">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loadError ? (
                  <EmptyRow colSpan={6}>
                    <span className="text-red-700">{loadError}</span>
                    <button type="button" className="link ml-2" onClick={load}>Try again</button>
                  </EmptyRow>
                ) : loading && rows.length === 0 ? (
                  <EmptyRow colSpan={6}>Loading products…</EmptyRow>
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={6}>{filtered ? 'No products match these filters.' : 'No products yet.'}</EmptyRow>
                ) : (
                  rows.map((p) => {
                    const deleted = !!p.deletedAt;
                    const busy = busyId === p.id;
                    const low = p.status === 'Active' && p.lowStock;
                    return (
                      <tr key={p.id} className={`row-hover ${editingId === p.id ? 'bg-blue-50' : ''} ${deleted ? 'opacity-60' : ''}`}>
                        <td className="td py-3">
                          <div className="font-semibold">
                            {p.name}
                            {deleted && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Deleted</span>}
                          </div>
                          <div className="text-[13px] text-slate-600">{[p.sku, p.category].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="td">{money(p.price)}</td>
                        <td className="td">
                          <span className={low ? 'font-semibold text-red-700' : ''}>{p.stock}</span>
                          {low && <span className="ml-2"><Badge tone={p.stock === 0 ? 'bad' : 'warn'}>{p.stock === 0 ? 'Out' : 'Low'}</Badge></span>}
                        </td>
                        <td className="td py-3">
                          <div>{money(p.revenue)}</div>
                          <div className="text-[13px] text-slate-600">{p.unitsSold} units</div>
                        </td>
                        <td className="td"><Badge tone={p.status === 'Active' ? 'ok' : 'mute'}>{p.status}</Badge></td>
                        {(canEdit || canDelete) && (
                          <td className="td whitespace-nowrap">
                            {deleted ? (
                              canDelete && (
                                <button type="button" className="link" disabled={busy} onClick={() => onRestore(p)}>
                                  {busy ? 'Restoring…' : 'Restore'}
                                </button>
                              )
                            ) : (
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {canEdit && <button type="button" className="link" disabled={busy} onClick={() => startEdit(p)}>Edit</button>}
                                {canEdit && <button type="button" className="link" disabled={busy} onClick={() => onAdjustStock(p)}>Stock</button>}
                                {canEdit && (
                                  <button type="button" className="link" disabled={busy} onClick={() => onToggleStatus(p)}>
                                    {p.status === 'Active' ? 'Discontinue' : 'Reactivate'}
                                  </button>
                                )}
                                {canDelete && (
                                  <button type="button" className="link-danger" disabled={busy} onClick={() => onDelete(p)}>
                                    {busy ? 'Working…' : 'Delete'}
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </section>

        {showForm && (
          <form onSubmit={submit} noValidate className="card flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-6 lg:sticky lg:top-8">
            <h2 className="text-base font-semibold">{editingId ? 'Edit product' : 'Add product'}</h2>
            <TextField id="pn" label="Product name *" maxLength={150} placeholder="For example, Bookshelf" value={form.name} onChange={set('name')} error={errors.name} />
            <div className="grid grid-cols-2 gap-4">
              <TextField id="pk" label="SKU *" maxLength={100} placeholder="STR-010" value={form.sku} onChange={set('sku')} error={errors.sku} />
              <TextField
                id="pg"
                label="Category *"
                maxLength={100}
                list="product-categories"
                placeholder="Pick or type"
                value={form.category}
                onChange={set('category')}
                error={errors.category}
              />
              <datalist id="product-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              <TextField id="pp" label="Unit price (₹) *" type="number" min={0} step="0.01" placeholder="0" value={form.price} onChange={set('price')} error={errors.price} />
              <TextField id="pt" label="Stock *" type="number" min={0} value={form.stock} onChange={set('stock')} error={errors.stock} />
            </div>
            <SelectField id="pa" label="Status" value={form.status} onChange={set('status')}>
              <option>Active</option>
              <option>Discontinued</option>
            </SelectField>
            <TextAreaField id="pd" label="Description" rows={3} maxLength={5000} placeholder="Short description for the sales team" value={form.description} onChange={set('description')} />
            <p className="text-[13px] text-slate-600">Prices exclude GST. Price changes apply to new order lines only.</p>
            {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save product'}</button>
            {editingId && <button type="button" className="btn-secondary" onClick={reset}>Cancel editing</button>}
          </form>
        )}
      </div>
    </>
  );
}
