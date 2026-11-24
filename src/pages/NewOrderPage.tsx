import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { PageHeader, SelectField, Spinner, TextAreaField, TextField } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { customerApi, type CustomerRecord } from '../services/customerApi';
import { employeeApi, type EmployeeRow } from '../services/employeeApi';
import { orderApi } from '../services/orderApi';
import { todayIso } from '../utils/format';

export default function NewOrderPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useAppSelector((s) => s.auth.user);

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [customerId, setCustomerId] = useState(params.get('customer') ?? '');
  const [handlerId, setHandlerId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ customer?: string; handler?: string }>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Employees may be off-limits for some roles; the backend then defaults the handler to the signed-in user.
        const [cs, es] = await Promise.all([customerApi.all(), employeeApi.all().catch(() => [] as EmployeeRow[])]);
        const active = es.filter((e) => e.status !== 'Inactive');
        setCustomers(cs);
        setEmployees(active);
        if (user && active.some((e) => e.id === user.id)) setHandlerId(user.id);
      } catch (err) {
        setLoadError(getErrorMessage(err, 'Could not load customers.'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er = {
      customer: customerId ? undefined : 'Select a customer.',
      handler: handlerId || employees.length === 0 ? undefined : 'Select who handles this order.',
    };
    setErrors(er);
    if (er.customer || er.handler) return;
    setSaving(true);
    setFormError('');
    try {
      const order = await orderApi.create({ customerId, handlerId, date, notes: notes.trim() });
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not create the order.'));
      setSaving(false);
    }
  };

  const header = (
    <PageHeader title="New order" subtitle="Create the order, then add line items on the next screen." back={{ to: '/orders', label: 'Back to orders' }} />
  );
  if (loading) return <>{header}<Spinner /></>;
  if (loadError) return <>{header}<p className="text-sm text-red-700">{loadError}</p></>;

  return (
    <>
      {header}
      <form onSubmit={submit} noValidate className="card flex max-w-[560px] flex-col gap-4 p-6">
        <SelectField id="nc" label="Customer *" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setFormError(''); }} error={errors.customer}>
          <option value="">Select a customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>)}
        </SelectField>
        {employees.length > 0 ? (
          <SelectField id="nh" label="Handled by *" value={handlerId} onChange={(e) => { setHandlerId(e.target.value); setFormError(''); }} error={errors.handler}>
            <option value="">Select an employee</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}{e.title ? ` — ${e.title}` : ''}</option>)}
          </SelectField>
        ) : (
          <p className="text-[13px] text-slate-600">This order will be assigned to you.</p>
        )}
        <TextField id="nd" label="Order date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextAreaField id="nn" label="Notes" rows={3} maxLength={2000} placeholder="Delivery instructions, PO number…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Link to="/orders" className="btn-secondary px-5">Cancel</Link>
          <button type="submit" className="btn-primary px-5" disabled={saving}>{saving ? 'Creating…' : 'Create order'}</button>
        </div>
      </form>
    </>
  );
}
