import type { OrderStatus } from '../types';
import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → Dashboard) ----

type ApiOrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

interface ApiMonthlySales {
  month: string;
  label: string;
  total_sales: string;
  order_count: number;
  is_current: boolean;
}

interface ApiOrderListItem {
  id: number;
  order_number: string;
  customer_name: string;
  order_date: string;
  total_amount: string;
  status: ApiOrderStatus;
}

// ---- App shapes ----

export interface MonthlySales {
  month: string;
  label: string;
  total: number;
  orderCount: number;
  isCurrent: boolean;
}

export interface RecentOrder {
  id: string;
  number: string;
  customerName: string;
  date: string;
  total: number;
  status: OrderStatus;
}

const ORDER_STATUS: Record<ApiOrderStatus, OrderStatus> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url, { params });
  return unwrap(data, 'Could not load dashboard data.');
}

export const dashboardApi = {
  employees: () => get<{ total: number; departments: number }>('/dashboard/employees'),

  openOrders: () => get<{ open: number; pending: number }>('/dashboard/open-orders'),

  async revenue(): Promise<{ monthLabel: string; amount: number; orderCount: number }> {
    const r = await get<{ month: string; month_label: string; amount: string; order_count: number }>('/dashboard/revenue');
    return { monthLabel: r.month_label, amount: Number(r.amount) || 0, orderCount: r.order_count };
  },

  customers: () => get<{ total: number }>('/dashboard/customers'),

  async salesByMonth(months = 6): Promise<MonthlySales[]> {
    const rows = await get<ApiMonthlySales[]>('/dashboard/sales-by-month', { months });
    return rows.map((r) => ({
      month: r.month,
      label: r.label,
      total: Number(r.total_sales) || 0,
      orderCount: r.order_count,
      isCurrent: r.is_current,
    }));
  },

  async ordersByStatus(): Promise<{ total: number; statuses: { status: OrderStatus; label: string; count: number }[] }> {
    const r = await get<{ total: number; statuses: { status: ApiOrderStatus; label: string; count: number }[] }>(
      '/dashboard/orders-by-status',
    );
    return { total: r.total, statuses: r.statuses.map((s) => ({ ...s, status: ORDER_STATUS[s.status] })) };
  },

  async recentOrders(limit = 5): Promise<RecentOrder[]> {
    const rows = await get<ApiOrderListItem[]>('/dashboard/recent-orders', { limit });
    return rows.map((o) => ({
      id: String(o.id),
      number: o.order_number,
      customerName: o.customer_name,
      date: o.order_date,
      total: Number(o.total_amount) || 0,
      status: ORDER_STATUS[o.status],
    }));
  },
};
