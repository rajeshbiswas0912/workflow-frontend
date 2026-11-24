import type { EmployeeStatus } from '../types';
import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → Employees) ----

type ApiStatus = 'active' | 'inactive' | 'on_leave';

interface ApiEmployeeListItem {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: ApiStatus;
  department_id: number;
  department_name: string | null;
  job_title: string;
  reports_to_id: number | null;
  hire_date: string;
  role_id: number;
  role_name: string | null;
  deleted_at: string | null;
}

interface ApiEmployee extends ApiEmployeeListItem {
  monthly_salary: string;
  is_temporary_password: boolean;
  department: { id: number; name: string } | null;
  role: { id: number; name: string } | null;
  manager: { id: number; first_name: string; last_name: string } | null;
}

interface ApiEmployeeList {
  items: ApiEmployeeListItem[];
  total: number;
  limit: number;
  offset: number;
}

// ---- App shapes ----

export interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: EmployeeStatus;
  departmentId: string;
  departmentName: string;
  title: string;
  managerId: string | null;
  hireDate: string;
  roleId: string;
  roleName: string;
  deletedAt: string | null;
}

export interface EmployeeDetail extends EmployeeRow {
  salary: number;
  managerName: string | null;
}

export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: EmployeeStatus;
  departmentId: string;
  title: string;
  managerId: string | null;
  hireDate: string;
  salary: number;
  roleId: string;
  /** Required when creating; optional (blank = keep) when updating. */
  password: string;
}

export interface EmployeeQuery {
  search?: string;
  departmentId?: string;
  roleId?: string;
  status?: EmployeeStatus | '';
  includeDeleted?: boolean;
  limit: number;
  offset: number;
}

// ---- System Admin ----

/**
 * The first employee (backend ID 1) is the System Admin. Their record is read-only for everyone,
 * including themselves, whatever their role: it can't be edited, have its status changed or be deleted.
 */
export const SYSTEM_ADMIN_EMPLOYEE_ID = '1';
export const isSystemAdmin = (employeeId: string | number | null | undefined) =>
  employeeId != null && String(employeeId) === SYSTEM_ADMIN_EMPLOYEE_ID;
export const SYSTEM_ADMIN_LOCKED_MESSAGE = 'The System Admin account can’t be edited or deleted.';

function assertNotSystemAdmin(id: string) {
  if (isSystemAdmin(id)) throw new Error(SYSTEM_ADMIN_LOCKED_MESSAGE);
}

// ---- Mapping ----

const STATUS_FROM_API: Record<ApiStatus, EmployeeStatus> = { active: 'Active', on_leave: 'On leave', inactive: 'Inactive' };
const STATUS_TO_API: Record<EmployeeStatus, ApiStatus> = { Active: 'active', 'On leave': 'on_leave', Inactive: 'inactive' };

const toRow = (e: ApiEmployeeListItem): EmployeeRow => ({
  id: String(e.id),
  firstName: e.first_name,
  lastName: e.last_name,
  email: e.email,
  phone: e.phone ?? '',
  status: STATUS_FROM_API[e.status] ?? 'Active',
  departmentId: String(e.department_id),
  departmentName: e.department_name ?? '',
  title: e.job_title,
  managerId: e.reports_to_id == null ? null : String(e.reports_to_id),
  hireDate: e.hire_date,
  roleId: String(e.role_id),
  roleName: e.role_name ?? '',
  deletedAt: e.deleted_at ?? null,
});

const toDetail = (e: ApiEmployee): EmployeeDetail => ({
  ...toRow({ ...e, department_name: e.department?.name ?? null, role_name: e.role?.name ?? null }),
  salary: Number(e.monthly_salary) || 0,
  managerName: e.manager ? `${e.manager.first_name} ${e.manager.last_name}`.trim() : null,
});

const baseBody = (d: EmployeeInput) => ({
  first_name: d.firstName,
  last_name: d.lastName,
  email: d.email,
  phone: d.phone || null,
  status: STATUS_TO_API[d.status],
  department_id: Number(d.departmentId),
  job_title: d.title,
  reports_to_id: d.managerId ? Number(d.managerId) : null,
  hire_date: d.hireDate,
  monthly_salary: d.salary,
  role_id: Number(d.roleId),
});

export const employeeApi = {
  async list(q: EmployeeQuery): Promise<{ items: EmployeeRow[]; total: number }> {
    const { data } = await api.get<ApiResponse<ApiEmployeeList>>('/employees', {
      params: {
        search: q.search || undefined,
        department_id: q.departmentId || undefined,
        role_id: q.roleId || undefined,
        status: q.status ? STATUS_TO_API[q.status] : undefined,
        include_deleted: q.includeDeleted || undefined,
        limit: q.limit,
        offset: q.offset,
      },
    });
    const list = unwrap(data, 'Could not load employees.');
    return { items: list.items.map(toRow), total: list.total };
  },

  /** Every active-record employee (up to the API's 200 page cap), for pickers like "Reports to". */
  async all(): Promise<EmployeeRow[]> {
    return (await employeeApi.list({ limit: 200, offset: 0 })).items;
  },

  async get(id: string): Promise<EmployeeDetail> {
    const { data } = await api.get<ApiResponse<ApiEmployee>>(`/employees/${id}`);
    return toDetail(unwrap(data, 'Could not load this employee.'));
  },

  async create(input: EmployeeInput): Promise<EmployeeDetail> {
    const { data } = await api.post<ApiResponse<ApiEmployee>>('/employees', {
      ...baseBody(input),
      temporary_password: input.password,
    });
    return toDetail(unwrap(data, 'Could not create the employee.'));
  },

  async update(id: string, input: EmployeeInput): Promise<EmployeeDetail> {
    assertNotSystemAdmin(id);
    const { data } = await api.put<ApiResponse<ApiEmployee>>(`/employees/${id}`, {
      ...baseBody(input),
      ...(input.password ? { new_password: input.password } : {}),
    });
    return toDetail(unwrap(data, 'Could not save the employee.'));
  },

  async setStatus(id: string, status: EmployeeStatus): Promise<EmployeeDetail> {
    assertNotSystemAdmin(id);
    const { data } = await api.patch<ApiResponse<ApiEmployee>>(`/employees/${id}/status`, { status: STATUS_TO_API[status] });
    return toDetail(unwrap(data, 'Could not change the status.'));
  },

  async remove(id: string): Promise<void> {
    assertNotSystemAdmin(id);
    const { data } = await api.delete<ApiResponse<null>>(`/employees/${id}`);
    unwrap(data, 'Could not delete the employee.');
  },

  async restore(id: string): Promise<EmployeeDetail> {
    const { data } = await api.post<ApiResponse<ApiEmployee>>(`/employees/${id}/restore`);
    return toDetail(unwrap(data, 'Could not restore the employee.'));
  },
};
