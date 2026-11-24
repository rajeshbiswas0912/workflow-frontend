import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → Customers) ----

interface ApiCustomer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  order_count?: number;
  total_spent?: string;
  deleted_at: string | null;
}

interface ApiCustomerList {
  items: ApiCustomer[];
  total: number;
  limit: number;
  offset: number;
}

// ---- App shapes ----

export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  orderCount: number;
  spent: number;
  deletedAt: string | null;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
}

const toRecord = (c: ApiCustomer): CustomerRecord => ({
  id: String(c.id),
  name: c.name,
  email: c.email,
  phone: c.phone ?? '',
  city: c.city ?? '',
  address: c.address ?? '',
  orderCount: c.order_count ?? 0,
  spent: Number(c.total_spent ?? 0) || 0,
  deletedAt: c.deleted_at ?? null,
});

/** Blank optional fields are sent as null, which the API treats as "clear this value". */
const toBody = (c: CustomerInput) => ({
  name: c.name,
  email: c.email,
  phone: c.phone || null,
  city: c.city || null,
  address: c.address || null,
});

export const customerApi = {
  async list(q: { search?: string; city?: string; includeDeleted?: boolean; limit: number; offset: number }) {
    const { data } = await api.get<ApiResponse<ApiCustomerList>>('/customers', {
      params: {
        search: q.search || undefined,
        city: q.city || undefined,
        include_deleted: q.includeDeleted || undefined,
        limit: q.limit,
        offset: q.offset,
      },
    });
    const list = unwrap(data, 'Could not load customers.');
    return { items: list.items.map(toRecord), total: list.total };
  },

  async get(id: string): Promise<CustomerRecord> {
    const { data } = await api.get<ApiResponse<ApiCustomer>>(`/customers/${id}`);
    return toRecord(unwrap(data, 'Could not load this customer.'));
  },

  /** Every customer as a lightweight list for dropdowns (up to the API's 200 page cap). */
  async all(): Promise<CustomerRecord[]> {
    return (await customerApi.list({ limit: 200, offset: 0 })).items;
  },

  async create(input: CustomerInput): Promise<CustomerRecord> {
    const { data } = await api.post<ApiResponse<ApiCustomer>>('/customers', toBody(input));
    return toRecord(unwrap(data, 'Could not create the customer.'));
  },

  async update(id: string, input: CustomerInput): Promise<CustomerRecord> {
    const { data } = await api.put<ApiResponse<ApiCustomer>>(`/customers/${id}`, toBody(input));
    return toRecord(unwrap(data, 'Could not save the customer.'));
  },

  async remove(id: string): Promise<void> {
    const { data } = await api.delete<ApiResponse<null>>(`/customers/${id}`);
    unwrap(data, 'Could not delete the customer.');
  },

  async restore(id: string): Promise<CustomerRecord> {
    const { data } = await api.post<ApiResponse<ApiCustomer>>(`/customers/${id}/restore`);
    return toRecord(unwrap(data, 'Could not restore the customer.'));
  },
};
