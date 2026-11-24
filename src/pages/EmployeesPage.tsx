import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppSelector, useCan } from '../app/hooks';
import { Avatar, Badge, EmptyRow, employeeTone, PageHeader, Pagination } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { departmentApi } from '../services/departmentApi';
import { employeeApi, isSystemAdmin, type EmployeeRow } from '../services/employeeApi';
import { formatDate } from '../utils/format';
import type { EmployeeStatus } from '../types';

const PAGE_SIZE = 8;
const STATUSES: EmployeeStatus[] = ['Active', 'On leave', 'Inactive'];

export default function EmployeesPage() {
  const can = useCan();
  const canEdit = can('Employees', 'edit');
  const canDelete = can('Employees', 'delete');
  const roles = useAppSelector((s) => s.roles.items);

  // Department filter lives in the URL so the Departments page can link here (?dept=<id>).
  const [params, setParams] = useSearchParams();
  const dept = params.get('dept') ?? '';

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const [roleId, setRoleId] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    departmentApi.options().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await employeeApi.list({
        search: query,
        departmentId: dept,
        roleId,
        status,
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
      setLoadError(getErrorMessage(err, 'Could not load employees.'));
    } finally {
      setLoading(false);
    }
  }, [query, dept, roleId, status, showDeleted, page]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (e: EmployeeRow) => {
    const name = `${e.firstName} ${e.lastName}`;
    if (!window.confirm(`Delete ${name}? You can restore them later from "Show deleted".`)) return;
    setBusyId(e.id);
    setNotice('');
    try {
      await employeeApi.remove(e.id);
      setNotice(`${name} was deleted.`);
      await load();
    } catch (err) {
      window.alert(getErrorMessage(err, 'Could not delete the employee.'));
    } finally {
      setBusyId(null);
    }
  };

  const onRestore = async (e: EmployeeRow) => {
    const name = `${e.firstName} ${e.lastName}`;
    setBusyId(e.id);
    setNotice('');
    try {
      await employeeApi.restore(e.id);
      setNotice(`${name} was restored.`);
      await load();
    } catch (err) {
      window.alert(getErrorMessage(err, 'Could not restore the employee.'));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = !!(query || dept || roleId || status);
  const roleName = (e: EmployeeRow) => e.roleName || roles.find((r) => r.id === e.roleId)?.name || '—';
  const deptName = (e: EmployeeRow) => e.departmentName || departments.find((d) => d.id === e.departmentId)?.name || '—';

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={filtered ? `${total} matching employees` : `${total} employees across ${departments.length} departments`}
        actions={can('Employees', 'create') && <Link to="/employees/new" className="btn-primary">Add employee</Link>}
      />
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-[2_1_260px] flex-col gap-1">
            <label htmlFor="q" className="label-muted">Search</label>
            <input id="q" type="search" placeholder="Name, email or job title" className="input" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} />
          </div>
          <div className="flex flex-[1_1_180px] flex-col gap-1">
            <label htmlFor="dept" className="label-muted">Department</label>
            <select
              id="dept"
              className="input px-3"
              value={dept}
              onChange={(e) => {
                setParams(e.target.value ? { dept: e.target.value } : {});
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {roles.length > 0 && (
            <div className="flex flex-[1_1_160px] flex-col gap-1">
              <label htmlFor="role" className="label-muted">Role</label>
              <select id="role" className="input px-3" value={roleId} onChange={(e) => { setRoleId(e.target.value); setPage(1); }}>
                <option value="">All roles</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-[1_1_160px] flex-col gap-1">
            <label htmlFor="status" className="label-muted">Status</label>
            <select id="status" className="input px-3" value={status} onChange={(e) => { setStatus(e.target.value as EmployeeStatus | ''); setPage(1); }}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {canDelete && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }} />
              Show deleted
            </label>
          )}
        </div>
        {notice && <div role="status" className="border-b border-slate-200 px-5 py-2 text-sm text-green-700">{notice}</div>}
        <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr>
                {['Employee', 'Job title', 'Department', 'Role', 'Joined', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}
                {(canEdit || canDelete) && <th className="th">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loadError ? (
                <EmptyRow colSpan={7}>
                  <span className="text-red-700">{loadError}</span>{' '}
                  <button type="button" className="link ml-2" onClick={load}>Try again</button>
                </EmptyRow>
              ) : loading && rows.length === 0 ? (
                <EmptyRow colSpan={7}>Loading employees…</EmptyRow>
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={7}>{filtered ? 'No employees match these filters.' : 'No employees yet.'}</EmptyRow>
              ) : (
                rows.map((e) => {
                  const name = `${e.firstName} ${e.lastName}`;
                  const deleted = !!e.deletedAt;
                  const busy = busyId === e.id;
                  const locked = isSystemAdmin(e.id);
                  return (
                    <tr key={e.id} className={`row-hover ${deleted ? 'opacity-60' : ''}`}>
                      <td className="td py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <div>
                            <div className="font-semibold">
                              {name}
                              {deleted && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Deleted</span>}
                            </div>
                            <div className="text-[13px] text-slate-600">{e.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="td">{e.title}</td>
                      <td className="td">{deptName(e)}</td>
                      <td className="td">{roleName(e)}</td>
                      <td className="td">{formatDate(e.hireDate)}</td>
                      <td className="td"><Badge tone={employeeTone[e.status]}>{e.status}</Badge></td>
                      {(canEdit || canDelete) && (
                        <td className="td">
                          {locked ? null : deleted ? (
                            canDelete && (
                              <button type="button" className="link" disabled={busy} onClick={() => onRestore(e)}>
                                {busy ? 'Restoring…' : 'Restore'}
                              </button>
                            )
                          ) : (
                            <>
                              {canEdit && <Link to={`/employees/${e.id}/edit`} className="link mr-4">Edit</Link>}
                              {canDelete && (
                                <button type="button" className="link-danger" disabled={busy} onClick={() => onDelete(e)}>
                                  {busy ? 'Deleting…' : 'Delete'}
                                </button>
                              )}
                            </>
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
    </>
  );
}
