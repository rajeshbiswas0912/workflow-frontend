import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → Departments) ----

interface ApiDepartment {
  id: number;
  name: string;
  description: string | null;
  department_head_id: number | null;
  head_name: string | null;
  employee_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ApiDepartmentList {
  items: ApiDepartment[];
  total: number;
  total_employees: number;
  limit: number;
  offset: number;
}

interface ApiEmployeeListItem {
  id: number;
  first_name: string;
  last_name: string;
  status: string;
}

// ---- App shapes ----

export interface DepartmentRecord {
  id: string;
  name: string;
  description: string;
  headId: string | null;
  headName: string | null;
  employeeCount: number;
  deletedAt: string | null;
}

export interface DepartmentPage {
  items: DepartmentRecord[];
  total: number;
  totalEmployees: number;
}

export interface DepartmentInput {
  name: string;
  description: string;
  headId: string | null;
}

export interface HeadOption {
  id: string;
  name: string;
  status: string;
}

const toRecord = (d: ApiDepartment): DepartmentRecord => ({
  id: String(d.id),
  name: d.name,
  description: d.description ?? '',
  headId: d.department_head_id == null ? null : String(d.department_head_id),
  headName: d.head_name,
  employeeCount: d.employee_count,
  deletedAt: d.deleted_at,
});

const toBody = (d: DepartmentInput) => ({
  name: d.name,
  description: d.description || null,
  department_head_id: d.headId ? Number(d.headId) : null,
});

export const departmentApi = {
  async list(params: { search?: string; includeDeleted?: boolean; limit: number; offset: number }): Promise<DepartmentPage> {
    const { data } = await api.get<ApiResponse<ApiDepartmentList>>('/departments', {
      params: {
        search: params.search || undefined,
        include_deleted: params.includeDeleted || undefined,
        limit: params.limit,
        offset: params.offset,
      },
    });
    const list = unwrap(data, 'Could not load departments.');
    return { items: list.items.map(toRecord), total: list.total, totalEmployees: list.total_employees };
  },

  async create(input: DepartmentInput): Promise<DepartmentRecord> {
    const { data } = await api.post<ApiResponse<ApiDepartment>>('/departments', toBody(input));
    return toRecord(unwrap(data, 'Could not create the department.'));
  },

  async update(id: string, input: DepartmentInput): Promise<DepartmentRecord> {
    const { data } = await api.put<ApiResponse<ApiDepartment>>(`/departments/${id}`, toBody(input));
    return toRecord(unwrap(data, 'Could not save the department.'));
  },

  async remove(id: string): Promise<void> {
    const { data } = await api.delete<ApiResponse<null>>(`/departments/${id}`);
    unwrap(data, 'Could not delete the department.');
  },

  async restore(id: string): Promise<DepartmentRecord> {
    const { data } = await api.post<ApiResponse<ApiDepartment>>(`/departments/${id}/restore`);
    return toRecord(unwrap(data, 'Could not restore the department.'));
  },

  /** Every department as {id, name}, for dropdowns (up to the API's 200 page cap). */
  async options(): Promise<{ id: string; name: string }[]> {
    const { items } = await departmentApi.list({ limit: 200, offset: 0 });
    return items.map((d) => ({ id: d.id, name: d.name }));
  },

  /** Employees who can be picked as a department head (max page size the API allows). */
  async headOptions(): Promise<HeadOption[]> {
    const { data } = await api.get<ApiResponse<{ items: ApiEmployeeListItem[] }>>('/employees', { params: { limit: 200 } });
    return unwrap(data, 'Could not load employees.').items.map((e) => ({
      id: String(e.id),
      name: `${e.first_name} ${e.last_name}`.trim(),
      status: e.status,
    }));
  },
};
