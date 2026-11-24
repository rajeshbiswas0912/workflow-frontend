import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { PageHeader, SelectField, Spinner, TextField } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { departmentApi } from '../services/departmentApi';
import { employeeApi, isSystemAdmin, SYSTEM_ADMIN_LOCKED_MESSAGE, type EmployeeDetail, type EmployeeRow } from '../services/employeeApi';
import type { EmployeeStatus } from '../types';

type Form = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  departmentId: string;
  title: string;
  managerId: string;
  hireDate: string;
  salary: string;
  status: EmployeeStatus;
  roleId: string;
  password: string;
};

const EMPTY: Form = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  departmentId: '',
  title: '',
  managerId: '',
  hireDate: '',
  salary: '',
  status: 'Active',
  roleId: '',
  password: '',
};

/** The API rejects passwords shorter than this, whatever Settings says. */
const API_MIN_PASSWORD = 10;

const toForm = (e: EmployeeDetail): Form => ({
  firstName: e.firstName,
  lastName: e.lastName,
  email: e.email,
  phone: e.phone,
  departmentId: e.departmentId,
  title: e.title,
  managerId: e.managerId ?? '',
  hireDate: e.hireDate,
  salary: String(e.salary),
  status: e.status,
  roleId: e.roleId,
  password: '',
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">{children}</div>
    </section>
  );
}

export default function EmployeeFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const minPw = Math.max(useAppSelector((s) => s.settings.security.minPasswordLength), API_MIN_PASSWORD);
  const roles = useAppSelector((s) => s.roles.items);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);

  const [existing, setExisting] = useState<EmployeeDetail | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<EmployeeRow[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the employee being edited plus the options for the dropdowns.
  useEffect(() => {
    if (isSystemAdmin(id)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [emp, depts, all] = await Promise.all([
          id ? employeeApi.get(id) : Promise.resolve(null),
          departmentApi.options(),
          employeeApi.all().catch(() => [] as EmployeeRow[]),
        ]);
        if (cancelled) return;
        setExisting(emp);
        setDepartments(depts);
        setPeople(all);
        setForm(emp ? toForm(emp) : { ...EMPTY, roleId: roles.find((r) => r.name === 'Staff')?.id ?? '' });
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err, id ? 'Could not load this employee.' : 'Could not load the form.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const back = { to: '/employees', label: 'Back to employees' };
  if (isSystemAdmin(id)) {
    return (
      <>
        <PageHeader title="System Admin" back={back} />
        <p className="card mt-4 max-w-[640px] p-6 text-sm text-slate-700">
          {SYSTEM_ADMIN_LOCKED_MESSAGE} This account is kept as is so there is always someone who can manage the app.
        </p>
      </>
    );
  }
  if (loading) return <><PageHeader title={id ? 'Edit employee' : 'Add employee'} back={back} /><Spinner /></>;
  if (loadError) {
    return (
      <>
        <PageHeader title={id ? 'Employee not found' : 'Add employee'} back={back} />
        <p className="mt-4 text-sm text-red-700">{loadError}</p>
      </>
    );
  }

  const managers = people.filter((e) => e.id !== id && e.status !== 'Inactive');
  // Keep the current manager selectable even if they aren't in the list we loaded.
  if (existing?.managerId && !managers.some((m) => m.id === existing.managerId)) {
    const [firstName = '', ...rest] = (existing.managerName ?? `Employee #${existing.managerId}`).split(' ');
    managers.unshift({ ...existing, id: existing.managerId, firstName, lastName: rest.join(' ') });
  }
  const isSelf = !!existing && existing.id === currentUserId;
  const roleOptions = roles.filter((r) => r.isActive || r.id === form.roleId);
  // A user who can't list roles still needs to see the employee's current role.
  if (existing && !roleOptions.some((r) => r.id === existing.roleId)) {
    roleOptions.unshift({ id: existing.roleId, name: existing.roleName || `Role #${existing.roleId}`, description: '', isActive: true, system: false, permissions: {} as never });
  }

  const set = <K extends keyof Form>(key: K) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
    setFormError('');
  };

  const validate = () => {
    const er: typeof errors = {};
    if (!form.firstName.trim()) er.firstName = 'Enter a first name.';
    if (!form.lastName.trim()) er.lastName = 'Enter a last name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) er.email = 'Enter a valid email address.';
    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) er.phone = 'Enter a 10-digit mobile number.';
    if (!form.departmentId) er.departmentId = 'Select a department.';
    if (!form.title.trim()) er.title = 'Enter a job title.';
    if (!form.hireDate) er.hireDate = 'Pick a hire date.';
    if (!(Number(form.salary) > 0)) er.salary = 'Enter a salary greater than 0.';
    if (!form.roleId) er.roleId = 'Select a role.';
    if (!existing && form.password.length < minPw) er.password = `Use at least ${minPw} characters.`;
    if (existing && form.password && form.password.length < minPw) er.password = `Use at least ${minPw} characters.`;
    if (form.password.length > 72) er.password = 'Use 72 characters or fewer.';
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setFormError('');
    const data = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.replace(/\s/g, ''),
      departmentId: form.departmentId,
      title: form.title.trim(),
      managerId: form.managerId || null,
      hireDate: form.hireDate,
      salary: Number(form.salary),
      status: form.status,
      roleId: form.roleId,
      password: form.password,
    };
    try {
      if (existing) await employeeApi.update(existing.id, data);
      else await employeeApi.create(data);
      navigate('/employees');
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save the employee.'));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PageHeader
        title={existing ? `Edit ${existing.firstName} ${existing.lastName}` : 'Add employee'}
        subtitle="Fields marked with * are required."
        back={back}
      />
      <div className="flex max-w-[880px] flex-col gap-5">
        <Section title="Personal details">
          <TextField id="fn" label="First name *" maxLength={100} placeholder="First name" value={form.firstName} onChange={set('firstName')} error={errors.firstName} />
          <TextField id="ln" label="Last name *" maxLength={100} placeholder="Last name" value={form.lastName} onChange={set('lastName')} error={errors.lastName} />
          <TextField id="em" label="Work email *" type="email" maxLength={255} placeholder="name@company.com" value={form.email} onChange={set('email')} error={errors.email} />
          <TextField id="ph" label="Phone" type="tel" placeholder="10-digit mobile number" value={form.phone} onChange={set('phone')} error={errors.phone} />
        </Section>
        <Section title="Job details">
          <SelectField id="dp" label="Department *" value={form.departmentId} onChange={set('departmentId')} error={errors.departmentId}>
            <option value="">Select department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectField>
          <TextField id="jt" label="Job title *" maxLength={100} placeholder="For example, Sales Executive" value={form.title} onChange={set('title')} error={errors.title} />
          <SelectField id="mg" label="Reports to" value={form.managerId} onChange={set('managerId')}>
            <option value="">No manager</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{`${m.firstName} ${m.lastName}`.trim()}</option>)}
          </SelectField>
          <TextField id="hd" label="Hire date *" type="date" value={form.hireDate} onChange={set('hireDate')} error={errors.hireDate} />
          <TextField id="sl" label="Monthly salary (₹) *" type="number" min={0} placeholder="0" value={form.salary} onChange={set('salary')} error={errors.salary} />
          <SelectField id="st" label="Status" value={form.status} onChange={set('status')}>
            <option>Active</option>
            <option>On leave</option>
            <option>Inactive</option>
          </SelectField>
        </Section>
        <Section title="System access">
          <div className="flex flex-col gap-1.5">
            <SelectField id="rl" label="Role *" value={form.roleId} onChange={set('roleId')} error={errors.roleId} disabled={isSelf}>
              <option value="">Select a role</option>
              {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isActive ? '' : ' (inactive)'}</option>)}
            </SelectField>
            <span className="text-[13px] text-slate-600">
              {isSelf
                ? 'You can’t change your own role. Ask another admin.'
                : roles.find((r) => r.id === form.roleId)?.description || 'Roles are managed in Settings → Roles and permissions.'}
            </span>
          </div>
          <TextField
            id="pw"
            label={existing ? 'New password' : 'Temporary password *'}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            placeholder={existing ? 'Leave blank to keep current password' : `At least ${minPw} characters`}
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />
        </Section>
        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Link to="/employees" className="btn-secondary px-5">Cancel</Link>
          <button type="submit" className="btn-primary px-5" disabled={saving}>
            {saving ? 'Saving…' : 'Save employee'}
          </button>
        </div>
      </div>
    </form>
  );
}
