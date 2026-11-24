import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCan } from '../app/hooks';
import { PageHeader, Pagination, SelectField, Spinner, TextAreaField, TextField } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { departmentApi, type DepartmentRecord, type HeadOption } from '../services/departmentApi';

const EMPTY = { name: '', headId: '', description: '' };
const PAGE_SIZE = 9;

export default function DepartmentsPage() {
  const can = useCan();
  const canCreate = can('Departments', 'create');
  const canEdit = can('Departments', 'edit');
  const canDelete = can('Departments', 'delete');

  // ---- List state (server-side search + pagination) ----
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // ---- Form state ----
  const [heads, setHeads] = useState<HeadOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const showForm = editingId ? canEdit : canCreate;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await departmentApi.list({ search, includeDeleted: showDeleted, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      // If the current page emptied out (e.g. after a delete), step back one page.
      if (res.items.length === 0 && res.total > 0 && page > 1) {
        setPage((p) => p - 1);
        return;
      }
      setDepartments(res.items);
      setTotal(res.total);
      setTotalEmployees(res.totalEmployees);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load departments.'));
    } finally {
      setLoading(false);
    }
  }, [search, showDeleted, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Employees for the "Department head" picker. Not fatal if the user can't list employees.
  useEffect(() => {
    if (!canCreate && !canEdit) return;
    departmentApi.headOptions().then(setHeads).catch(() => setHeads([]));
  }, [canCreate, canEdit]);

  /** Reload the current page from the server. */
  const refresh = async () => {
    await load();
  };

  const startEdit = (d: DepartmentRecord) => {
    setEditingId(d.id);
    setForm({ name: d.name, headId: d.headId ?? '', description: d.description });
    setError('');
    setNotice('');
  };

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
    setError('');
  };

  const onDelete = async (d: DepartmentRecord) => {
    if (d.employeeCount > 0) {
      window.alert(`${d.name} still has ${d.employeeCount} employee(s). Move them to another department first.`);
      return;
    }
    if (!window.confirm(`Delete the ${d.name} department?`)) return;
    setBusyId(d.id);
    setNotice('');
    try {
      await departmentApi.remove(d.id);
      if (editingId === d.id) reset();
      setNotice(`${d.name} was deleted.`);
      await refresh();
    } catch (err) {
      window.alert(getErrorMessage(err, 'Could not delete the department.'));
    } finally {
      setBusyId(null);
    }
  };

  const onRestore = async (d: DepartmentRecord) => {
    setBusyId(d.id);
    setNotice('');
    try {
      await departmentApi.restore(d.id);
      setNotice(`${d.name} was restored.`);
      await refresh();
    } catch (err) {
      window.alert(getErrorMessage(err, 'Could not restore the department.'));
    } finally {
      setBusyId(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return setError('Enter a department name.');
    if (name.length > 100) return setError('Use 100 characters or fewer.');
    setSaving(true);
    setError('');
    setNotice('');
    const data = { name, headId: form.headId || null, description: form.description.trim() };
    try {
      const saved = editingId ? await departmentApi.update(editingId, data) : await departmentApi.create(data);
      setNotice(editingId ? `${saved.name} was updated.` : `${saved.name} was added.`);
      reset();
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the department.'));
    } finally {
      setSaving(false);
    }
  };

  // Keep the current head selectable even if they're not in the employee list we loaded.
  const editing = departments.find((d) => d.id === editingId);
  const headChoices = heads.filter((h) => h.status !== 'inactive');
  if (editing?.headId && !headChoices.some((h) => h.id === editing.headId)) {
    headChoices.unshift({ id: editing.headId, name: editing.headName ?? `Employee #${editing.headId}`, status: 'active' });
  }

  return (
    <>
      <PageHeader title="Departments" subtitle={`${total} departments, ${totalEmployees} employees`} />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          type="search"
          aria-label="Search departments"
          placeholder="Search departments"
          className="input max-w-xs"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {canDelete && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }} />
            Show deleted
          </label>
        )}
        {notice && <span role="status" className="text-sm text-green-700">{notice}</span>}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[2_1_520px]">
          {loading && departments.length === 0 ? (
            <Spinner label="Loading departments…" />
          ) : loadError ? (
            <div className="card flex flex-col items-center gap-3 p-8 text-center text-sm text-slate-600">
              <p className="text-red-700">{loadError}</p>
              <button type="button" className="btn-secondary" onClick={load}>Try again</button>
            </div>
          ) : departments.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-600">
              {search ? `No departments match “${search}”.` : 'No departments yet.'}
            </div>
          ) : (
            <>
              <div className={`grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 ${loading ? 'opacity-60' : ''}`}>
                {departments.map((d) => {
                  const deleted = !!d.deletedAt;
                  const busy = busyId === d.id;
                  return (
                    <section
                      key={d.id}
                      className={`card flex flex-col gap-4 p-5 ${editingId === d.id ? 'ring-2 ring-blue-700' : ''} ${deleted ? 'opacity-70' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-[17px] font-semibold">
                            {d.name}
                            {deleted && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Deleted</span>}
                          </h2>
                          <div className="mt-1 text-[13px] text-slate-600">Head: {d.headName || 'Not assigned'}</div>
                        </div>
                        <div className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-blue-100 text-lg font-bold text-blue-800">
                          {d.employeeCount}
                        </div>
                      </div>
                      <p className="flex-1 text-sm leading-normal text-slate-600">{d.description || 'No description yet.'}</p>
                      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-sm">
                        {deleted ? (
                          canDelete && (
                            <button type="button" className="link" disabled={busy} onClick={() => onRestore(d)}>
                              {busy ? 'Restoring…' : 'Restore'}
                            </button>
                          )
                        ) : (
                          <>
                            {can('Employees') && <Link to={`/employees?dept=${d.id}`} className="link">View employees</Link>}
                            {canEdit && <button type="button" className="link" onClick={() => startEdit(d)}>Edit</button>}
                            {canDelete && (
                              <button type="button" className="link-danger" disabled={busy} onClick={() => onDelete(d)}>
                                {busy ? 'Deleting…' : 'Delete'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
            </>
          )}
        </div>

        {showForm && (
          <form onSubmit={submit} noValidate className="card flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-6 lg:sticky lg:top-8">
            <h2 className="text-base font-semibold">{editingId ? 'Edit department' : 'Add department'}</h2>
            <TextField
              id="dn"
              label="Name *"
              maxLength={100}
              placeholder="For example, Marketing"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }}
              error={error}
            />
            <SelectField id="dh" label="Department head" value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}>
              <option value="">No head</option>
              {headChoices.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </SelectField>
            <TextAreaField
              id="dd"
              label="Description"
              rows={4}
              maxLength={2000}
              placeholder="What does this team do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save department'}</button>
            {editingId && <button type="button" className="btn-secondary" onClick={reset}>Cancel editing</button>}
          </form>
        )}
      </div>
    </>
  );
}
