import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector, useCan } from '../app/hooks';
import { selCurrency } from '../app/selectors';
import { EmptyRow, PageHeader, Pagination, TextAreaField, TextField } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { customerApi, type CustomerRecord } from '../services/customerApi';
import { formatMoney } from '../utils/format';

const PAGE_SIZE = 8;
const EMPTY = { name: '', email: '', phone: '', city: '', address: '' };
type Form = typeof EMPTY;

/** Waits until the user stops typing before using a value. */
function useDebounced(value: string, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function CustomersPage() {
  const can = useCan();
  const currency = useAppSelector(selCurrency);
  const canCreate = can('Customers', 'create');
  const canEdit = can('Customers', 'edit');
  const canDelete = can('Customers', 'delete');

  // ---- List state (server-side search, city filter and pagination) ----
  const [rows, setRows] = useState<CustomerRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const query = useDebounced(queryInput);
  const city = useDebounced(cityInput);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // ---- Form state ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Form>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Back to page 1 whenever the filters change.
  useEffect(() => setPage(1), [query, city, showDeleted]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await customerApi.list({ search: query, city, includeDeleted: showDeleted, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      // If the current page emptied out (e.g. after a delete), step back one page.
      if (res.items.length === 0 && res.total > 0 && page > 1) {
        setPage((p) => p - 1);
        return;
      }
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load customers.'));
    } finally {
      setLoading(false);
    }
  }, [query, city, showDeleted, page]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
    setFormError('');
  };

  const startEdit = (c: CustomerRecord) => {
    setEditingId(c.id);
    setForm({ name: c.name, email: c.email, phone: c.phone, city: c.city, address: c.address });
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

  const onDelete = async (c: CustomerRecord) => {
    if (!window.confirm(`Delete ${c.name}? You can restore them later from "Show deleted".`)) return;
    setBusyId(c.id);
    setNotice('');
    try {
      await customerApi.remove(c.id);
      if (editingId === c.id) reset();
      setNotice(`${c.name} was deleted.`);
      await load();
    } catch (err) {
      window.alert(getErrorMessage(err, 'Could not delete the customer.'));
    } finally {
      setBusyId(null);
    }
  };

  const onRestore = async (c: CustomerRecord) => {
    setBusyId(c.id);
    setNotice('');
    try {
      await customerApi.restore(c.id);
      setNotice(`${c.name} was restored.`);
      await load();
    } catch (err) {
      window.alert(getErrorMessage(err, 'Could not restore the customer.'));
    } finally {
      setBusyId(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Partial<Form> = {};
    if (!form.name.trim()) er.name = 'Enter a name or company.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) er.email = 'Enter a valid email address.';
    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) er.phone = 'Enter a 10-digit mobile number.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    setFormError('');
    setNotice('');
    const data = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.replace(/\s/g, ''),
      city: form.city.trim(),
      address: form.address.trim(),
    };
    try {
      const saved = editingId ? await customerApi.update(editingId, data) : await customerApi.create(data);
      setNotice(editingId ? `${saved.name} was updated.` : `${saved.name} was added.`);
      reset();
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save the customer.'));
    } finally {
      setSaving(false);
    }
  };

  const showForm = editingId ? canEdit : canCreate;
  const filtered = !!(query || city);

  return (
    <>
      <PageHeader title="Customers" subtitle={filtered ? `${total} matching customers` : `${total} customers`} />
      <div className="flex flex-wrap items-start gap-5">
        <section className="card min-w-0 flex-[2_1_560px] overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex flex-[2_1_220px] flex-col gap-1">
              <label htmlFor="cq" className="label-muted">Search</label>
              <input id="cq" type="search" placeholder="Search customers" className="input" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} />
            </div>
            <div className="flex flex-[1_1_160px] flex-col gap-1">
              <label htmlFor="ccity" className="label-muted">City</label>
              <input id="ccity" type="search" placeholder="Any city" className="input" value={cityInput} onChange={(e) => setCityInput(e.target.value)} />
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
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>{['Customer', 'City', 'Orders', 'Total spent', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {loadError ? (
                  <EmptyRow colSpan={5}>
                    <span className="text-red-700">{loadError}</span>
                    <button type="button" className="link ml-2" onClick={load}>Try again</button>
                  </EmptyRow>
                ) : loading && rows.length === 0 ? (
                  <EmptyRow colSpan={5}>Loading customers…</EmptyRow>
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={5}>{filtered ? 'No customers match these filters.' : 'No customers yet.'}</EmptyRow>
                ) : (
                  rows.map((c) => {
                    const deleted = !!c.deletedAt;
                    const busy = busyId === c.id;
                    return (
                      <tr key={c.id} className={`row-hover ${editingId === c.id ? 'bg-blue-50' : ''} ${deleted ? 'opacity-60' : ''}`}>
                        <td className="td py-3">
                          <div className="font-semibold">
                            {c.name}
                            {deleted && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Deleted</span>}
                          </div>
                          <div className="text-[13px] text-slate-600">{c.email}</div>
                        </td>
                        <td className="td">{c.city || '—'}</td>
                        <td className="td">{c.orderCount}</td>
                        <td className="td">{formatMoney(c.spent, currency)}</td>
                        <td className="td">
                          {deleted ? (
                            canDelete && (
                              <button type="button" className="link" disabled={busy} onClick={() => onRestore(c)}>
                                {busy ? 'Restoring…' : 'Restore'}
                              </button>
                            )
                          ) : (
                            <>
                              {can('Orders') && <Link to={`/orders?customer=${c.id}`} className="link mr-4">View orders</Link>}
                              {canEdit && <button type="button" className="link mr-4" onClick={() => startEdit(c)}>Edit</button>}
                              {canDelete && (
                                <button type="button" className="link-danger" disabled={busy} onClick={() => onDelete(c)}>
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

        {showForm && (
          <form onSubmit={submit} noValidate className="card flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-6 lg:sticky lg:top-8">
            <h2 className="text-base font-semibold">{editingId ? 'Edit customer' : 'Add customer'}</h2>
            <TextField id="cn" label="Name or company *" maxLength={100} placeholder="Customer name" value={form.name} onChange={set('name')} error={errors.name} />
            <TextField id="ce" label="Email *" type="email" maxLength={255} placeholder="name@company.com" value={form.email} onChange={set('email')} error={errors.email} />
            <TextField id="cp" label="Phone" type="tel" placeholder="10-digit mobile number" value={form.phone} onChange={set('phone')} error={errors.phone} />
            <TextField id="cc" label="City" maxLength={100} placeholder="City" value={form.city} onChange={set('city')} />
            <TextAreaField id="ca" label="Address" rows={3} maxLength={2000} placeholder="Street and postal code" value={form.address} onChange={set('address')} />
            {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save customer'}</button>
            {editingId && <button type="button" className="btn-secondary" onClick={reset}>Cancel editing</button>}
          </form>
        )}
      </div>
    </>
  );
}
