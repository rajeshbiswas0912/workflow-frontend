import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → Reports) ----

export type ReportPeriod = 'last_6_months' | 'this_quarter' | 'last_12_months';

interface PeriodInfo {
  period: ReportPeriod;
  label: string;
  date_from: string;
  date_to: string;
}

interface ApiSalesByMonth extends PeriodInfo {
  months: { month: string; label: string; total_sales: string; order_count: number; is_current: boolean }[];
  total: string;
}
interface ApiTopCustomers extends PeriodInfo {
  items: { customer_id: number; name: string; total_spent: string; order_count: number }[];
}
interface ApiOrdersPerEmployee extends PeriodInfo {
  items: { employee_id: number; name: string; order_count: number; total_sales: string }[];
}
interface ApiDepartmentSummary {
  rows: { department_id: number; name: string; employee_count: number; average_salary: string; monthly_payroll: string }[];
  total_employees: number;
  total_payroll: string;
}

// ---- App shapes ----

export interface Period {
  label: string;
  from: string;
  to: string;
}

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const toPeriod = (p: PeriodInfo): Period => ({ label: p.label, from: p.date_from, to: p.date_to });

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url, { params });
  return unwrap(data, 'Could not load this report.');
}

export const reportApi = {
  async salesByMonth(period: ReportPeriod) {
    const r = await get<ApiSalesByMonth>('/reports/sales-by-month', { period });
    return {
      period: toPeriod(r),
      total: num(r.total),
      months: r.months.map((m) => ({ key: m.month, label: m.label, total: num(m.total_sales), orderCount: m.order_count, isCurrent: m.is_current })),
    };
  },

  async topCustomers(period: ReportPeriod, limit = 5) {
    const r = await get<ApiTopCustomers>('/reports/top-customers', { period, limit });
    return {
      period: toPeriod(r),
      items: r.items.map((c) => ({ id: String(c.customer_id), name: c.name, spent: num(c.total_spent), orderCount: c.order_count })),
    };
  },

  async ordersPerEmployee(period: ReportPeriod, limit = 5) {
    const r = await get<ApiOrdersPerEmployee>('/reports/orders-per-employee', { period, limit });
    return {
      period: toPeriod(r),
      items: r.items.map((e) => ({ id: String(e.employee_id), name: e.name, orderCount: e.order_count, sales: num(e.total_sales) })),
    };
  },

  async departmentSummary() {
    const r = await get<ApiDepartmentSummary>('/reports/department-summary');
    return {
      totalEmployees: r.total_employees,
      totalPayroll: num(r.total_payroll),
      rows: r.rows.map((d) => ({
        id: String(d.department_id),
        name: d.name,
        count: d.employee_count,
        avgSalary: num(d.average_salary),
        payroll: num(d.monthly_payroll),
      })),
    };
  },

  /** Downloads the server-built CSV (all four sections) and saves it in the browser. */
  async exportCsv(period: ReportPeriod): Promise<void> {
    let res;
    try {
      res = await api.get<Blob>('/reports/export', { params: { period }, responseType: 'blob' });
    } catch (err) {
      // With responseType 'blob' the error body is a Blob too; turn it back into JSON so its message can be shown.
      const data = (err as { response?: { data?: unknown } }).response?.data;
      if (data instanceof Blob) {
        try {
          (err as { response: { data: unknown } }).response.data = JSON.parse(await data.text());
        } catch {
          /* not JSON; keep the generic message */
        }
      }
      throw err;
    }
    const disposition = String(res.headers['content-disposition'] ?? '');
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : `workflow-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
