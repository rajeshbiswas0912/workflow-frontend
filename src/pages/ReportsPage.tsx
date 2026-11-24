import { useEffect, useState, type ReactNode } from 'react';
import { useAppSelector } from '../app/hooks';
import { selCurrency } from '../app/selectors';
import { BarChart, MeterList, PageHeader } from '../components/ui';
import { getErrorMessage } from '../services/apiClient';
import { reportApi, type ReportPeriod } from '../services/reportApi';
import { formatDate, formatLakh, formatMoney } from '../utils/format';

const PERIODS: { label: string; value: ReportPeriod }[] = [
  { label: 'Last 6 months', value: 'last_6_months' },
  { label: 'This quarter', value: 'this_quarter' },
  { label: 'Last 12 months', value: 'last_12_months' },
];

type Slot<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: string };

/** Loads one report section; reloads when its deps change. Each section fails on its own. */
function useReport<T>(fetcher: () => Promise<T>, deps: unknown[]): Slot<T> {
  const [slot, setSlot] = useState<Slot<T>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setSlot({ status: 'loading' });
    fetcher()
      .then((data) => !cancelled && setSlot({ status: 'ok', data }))
      .catch((err) => !cancelled && setSlot({ status: 'error', error: getErrorMessage(err, 'Could not load this report.') }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return slot;
}

/** Shows the section's content, or a loading / error / empty message in its place. */
function Body<T>({ slot, empty, children }: { slot: Slot<T>; empty: (d: T) => boolean; children: (d: T) => ReactNode }) {
  if (slot.status === 'loading') return <p className="py-10 text-center text-sm text-slate-600">Loading…</p>;
  if (slot.status === 'error') return <p className="py-10 text-center text-sm text-red-700">{slot.error}</p>;
  if (empty(slot.data)) return <p className="py-10 text-center text-sm text-slate-600">No data for this period.</p>;
  return <>{children(slot.data)}</>;
}

export default function ReportsPage() {
  const currency = useAppSelector(selCurrency);
  const money = (v: number) => formatMoney(v, currency);
  const [period, setPeriod] = useState<ReportPeriod>('last_6_months');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const sales = useReport(() => reportApi.salesByMonth(period), [period]);
  const customers = useReport(() => reportApi.topCustomers(period, 5), [period]);
  const staff = useReport(() => reportApi.ordersPerEmployee(period, 5), [period]);
  // Department figures are a current snapshot, not tied to the period.
  const depts = useReport(() => reportApi.departmentSummary(), []);

  const range = sales.status === 'ok' ? `${formatDate(sales.data.period.from)} – ${formatDate(sales.data.period.to)}` : '';

  const exportCsv = async () => {
    setExporting(true);
    setExportError('');
    try {
      await reportApi.exportCsv(period);
    } catch (err) {
      setExportError(getErrorMessage(err, 'Could not export the report.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={range ? `Sales, customers and workforce summaries · ${range}` : 'Sales, customers and workforce summaries'}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="rp" className="label-muted">Period</label>
              <select id="rp" className="input px-3" value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}>
                {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <button type="button" className="btn-secondary px-5" onClick={exportCsv} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        }
      />
      {exportError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{exportError}</p>}

      <div className="flex flex-wrap items-start gap-4">
        <section className="card flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Sales by month</h2>
            <span className="text-[13px] text-slate-600">
              {sales.status === 'ok' ? `${money(sales.data.total)} total · ` : ''}₹ lakh
            </span>
          </div>
          <Body slot={sales} empty={(d) => d.months.length === 0}>
            {(d) => <BarChart data={d.months.map((m) => ({ label: m.label, value: m.total }))} format={formatLakh} />}
          </Body>
        </section>
        <section className="card flex min-w-0 flex-[1_1_360px] flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Top customers by spend</h2>
          <Body slot={customers} empty={(d) => d.items.length === 0}>
            {(d) => (
              <MeterList
                rows={d.items.map((c) => ({
                  key: c.id,
                  label: c.name,
                  display: `${money(c.spent)} · ${c.orderCount} order${c.orderCount === 1 ? '' : 's'}`,
                  value: c.spent,
                }))}
              />
            )}
          </Body>
        </section>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="card flex min-w-0 flex-[1_1_360px] flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Orders handled per employee</h2>
          <Body slot={staff} empty={(d) => d.items.length === 0}>
            {(d) => (
              <MeterList
                rows={d.items.map((s) => ({
                  key: s.id,
                  label: s.name,
                  display: `${s.orderCount} · ${money(s.sales)}`,
                  value: s.orderCount,
                }))}
              />
            )}
          </Body>
        </section>
        <section className="card min-w-0 flex-[2_1_520px] overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-5 py-4">
            <h2 className="text-base font-semibold">Headcount and salary by department</h2>
            <span className="text-[13px] text-slate-600">Current snapshot</span>
          </div>
          <Body slot={depts} empty={(d) => d.rows.length === 0}>
            {(d) => (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead>
                    <tr>{['Department', 'Employees', 'Average salary', 'Monthly payroll'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="td font-semibold">{r.name}</td>
                        <td className="td">{r.count}</td>
                        <td className="td">{money(r.avgSalary)}</td>
                        <td className="td">{money(r.payroll)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td className="td">Total</td>
                      <td className="td">{d.totalEmployees}</td>
                      <td className="td" />
                      <td className="td">{money(d.totalPayroll)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Body>
        </section>
      </div>
    </>
  );
}
