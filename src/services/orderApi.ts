import type { OrderStatus } from '../types';
import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → Orders) ----

export type ApiOrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

interface ApiOrderListItem {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name: string;
  handled_by_id: number;
  handled_by_name: string;
  order_date: string;
  total_amount: string;
  status: ApiOrderStatus;
  item_count: number;
  deleted_at?: string | null;
}

interface ApiOrderPage {
  items: ApiOrderListItem[];
  total: number;
  limit: number;
  offset: number;
  status_counts: Record<string, number>;
}

interface ApiOrderDetail {
  id: number;
  order_number: string;
  status: ApiOrderStatus;
  order_date: string;
  notes: string | null;
  customer: { id: number; name: string; email: string; city: string | null };
  handled_by: { id: number; name: string; job_title: string | null };
  items: {
    id: number;
    product_id: number;
    product_name: string;
    product_sku: string | null;
    quantity: number;
    unit_price: string;
    subtotal: string;
  }[];
  item_count: number;
  subtotal: string;
  gst_rate_percent: string;
  gst_amount: string;
  total_amount: string;
  allowed_next_statuses: ApiOrderStatus[];
  activity: { event: string; by: string; at: string }[];
  deleted_at: string | null;
}

// ---- App shapes ----

export interface OrderRow {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  handlerId: string;
  handlerName: string;
  date: string;
  total: number;
  status: OrderStatus;
  itemCount: number;
  deletedAt: string | null;
}

export interface OrderLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderDetail {
  id: string;
  number: string;
  status: OrderStatus;
  date: string;
  notes: string;
  customer: { id: string; name: string; email: string; city: string };
  handler: { id: string; name: string; title: string };
  items: OrderLine[];
  subtotal: number;
  gstRate: number;
  gst: number;
  total: number;
  /** Statuses the backend allows this order to move to next (may include Cancelled). */
  allowedNext: OrderStatus[];
  activity: { event: string; by: string; at: string }[];
  deletedAt: string | null;
}

export interface OrderQuery {
  search?: string;
  customerId?: string;
  handlerId?: string;
  status?: OrderStatus | '';
  dateFrom?: string;
  dateTo?: string;
  includeDeleted?: boolean;
  limit: number;
  offset: number;
}

// ---- Mapping ----

export const STATUS_FROM_API: Record<ApiOrderStatus, OrderStatus> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const STATUS_TO_API = Object.fromEntries(Object.entries(STATUS_FROM_API).map(([k, v]) => [v, k])) as Record<OrderStatus, ApiOrderStatus>;

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

const toRow = (o: ApiOrderListItem): OrderRow => ({
  id: String(o.id),
  number: o.order_number,
  customerId: String(o.customer_id),
  customerName: o.customer_name,
  handlerId: String(o.handled_by_id),
  handlerName: o.handled_by_name,
  date: o.order_date,
  total: num(o.total_amount),
  status: STATUS_FROM_API[o.status],
  itemCount: o.item_count,
  deletedAt: o.deleted_at ?? null,
});

const toDetail = (o: ApiOrderDetail): OrderDetail => ({
  id: String(o.id),
  number: o.order_number,
  status: STATUS_FROM_API[o.status],
  date: o.order_date,
  notes: o.notes ?? '',
  customer: { id: String(o.customer.id), name: o.customer.name, email: o.customer.email, city: o.customer.city ?? '' },
  handler: { id: String(o.handled_by.id), name: o.handled_by.name, title: o.handled_by.job_title ?? '' },
  items: o.items.map((i) => ({
    id: String(i.id),
    productId: String(i.product_id),
    productName: i.product_name,
    sku: i.product_sku ?? '',
    qty: i.quantity,
    unitPrice: num(i.unit_price),
    lineTotal: num(i.subtotal),
  })),
  subtotal: num(o.subtotal),
  gstRate: num(o.gst_rate_percent),
  gst: num(o.gst_amount),
  total: num(o.total_amount),
  allowedNext: o.allowed_next_statuses.map((s) => STATUS_FROM_API[s]).filter(Boolean),
  activity: o.activity ?? [],
  deletedAt: o.deleted_at ?? null,
});

async function detail(req: Promise<{ data: ApiResponse<ApiOrderDetail> }>, fallback: string): Promise<OrderDetail> {
  const { data } = await req;
  return toDetail(unwrap(data, fallback));
}

export const orderApi = {
  /** A page of orders, plus per-status counts for the filter chips (keyed by app status). */
  async list(q: OrderQuery): Promise<{ items: OrderRow[]; total: number; statusCounts: Partial<Record<OrderStatus, number>> }> {
    const { data } = await api.get<ApiResponse<ApiOrderPage>>('/orders', {
      params: {
        search: q.search || undefined,
        customer_id: q.customerId || undefined,
        handled_by_id: q.handlerId || undefined,
        status: q.status ? STATUS_TO_API[q.status] : undefined,
        date_from: q.dateFrom || undefined,
        date_to: q.dateTo || undefined,
        include_deleted: q.includeDeleted || undefined,
        limit: q.limit,
        offset: q.offset,
      },
    });
    const page = unwrap(data, 'Could not load orders.');
    const statusCounts: Partial<Record<OrderStatus, number>> = {};
    for (const [k, v] of Object.entries(page.status_counts ?? {})) {
      const s = STATUS_FROM_API[k.toLowerCase() as ApiOrderStatus];
      if (s) statusCounts[s] = v;
    }
    return { items: page.items.map(toRow), total: page.total, statusCounts };
  },

  get: (id: string) => detail(api.get(`/orders/${id}`), 'Could not load this order.'),

  create: (input: { customerId: string; handlerId: string; date: string; notes?: string }) =>
    detail(
      api.post('/orders', {
        customer_id: Number(input.customerId),
        handled_by_id: input.handlerId ? Number(input.handlerId) : null,
        order_date: input.date || null,
        notes: input.notes || null,
      }),
      'Could not create the order.',
    ),

  /** Pending orders only: change customer, handler, date or notes. */
  update: (id: string, input: { customerId?: string; handlerId?: string; date?: string; notes?: string }) =>
    detail(
      api.put(`/orders/${id}`, {
        ...(input.customerId ? { customer_id: Number(input.customerId) } : {}),
        ...(input.handlerId ? { handled_by_id: Number(input.handlerId) } : {}),
        ...(input.date ? { order_date: input.date } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      }),
      'Could not save the order.',
    ),

  setStatus: (id: string, status: OrderStatus) =>
    detail(api.patch(`/orders/${id}/status`, { status: STATUS_TO_API[status] }), 'Could not change the status.'),

  addItem: (id: string, productId: string, qty: number) =>
    detail(api.post(`/orders/${id}/items`, { product_id: Number(productId), quantity: qty }), 'Could not add the item.'),

  updateItem: (id: string, itemId: string, qty: number) =>
    detail(api.put(`/orders/${id}/items/${itemId}`, { quantity: qty }), 'Could not change the quantity.'),

  removeItem: (id: string, itemId: string) =>
    detail(api.delete(`/orders/${id}/items/${itemId}`), 'Could not remove the item.'),

  /** Only pending or cancelled orders can be deleted. */
  async remove(id: string): Promise<void> {
    const { data } = await api.delete<ApiResponse<null>>(`/orders/${id}`);
    unwrap(data, 'Could not delete the order.');
  },

  restore: (id: string) => detail(api.post(`/orders/${id}/restore`), 'Could not restore the order.'),
};
