import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../api';
import { formatCategory } from '../format';
import { CHART_PALETTE, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';

function money(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const REPORT_TABS = [
  { id: 'cash-flow', label: 'Cash Flow' },
  { id: 'income-expense', label: 'Income & Expense' },
  { id: 'spending-by-category', label: 'Spending by Category' },
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'transaction-detail', label: 'Transaction Detail' },
  { id: 'tax-summary', label: 'Tax Summary' },
  { id: 'business-pnl', label: 'Business P&L' },
  { id: 'budget-vs-actual', label: 'Budget vs. Actual' },
];

const PRESETS = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-90-days', label: 'Last 90 Days' },
  { id: 'ytd', label: 'YTD' },
  { id: 'last-year', label: 'Last Year' },
  { id: 'all-time', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

function presetRange(preset) {
  const now = new Date();
  const today = toDateStr(now);
  switch (preset) {
    case 'this-month':
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'last-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateStr(start), to: toDateStr(end) };
    }
    case 'last-90-days':
      return { from: toDateStr(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)), to: today };
    case 'ytd':
      return { from: `${now.getFullYear()}-01-01`, to: today };
    case 'last-year':
      return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
    case 'all-time':
      return { from: '', to: '' };
    default:
      return { from: `${now.getFullYear()}-01-01`, to: today };
  }
}

function AccountFilter({ accounts, selected, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const label = selected.length === 0 ? 'All accounts' : `${selected.length} account${selected.length === 1 ? '' : 's'}`;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="mc-select flex min-w-[160px] items-center justify-between gap-2">
        <span>{label}</span>
        <span className="text-charcoal-soft">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-card p-2 shadow-lg">
            <button
              type="button"
              onClick={onClear}
              className="mb-1 w-full rounded-lg px-2 py-1.5 text-left font-body text-[12px] font-semibold text-green hover:bg-cream"
            >
              All accounts
            </button>
            {accounts.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-cream">
                <input type="checkbox" checked={selected.includes(a.id)} onChange={() => onToggle(a.id)} />
                <span className="font-body text-[12.5px] text-charcoal">{a.nickname ?? a.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ children }) {
  return <p className="font-body text-[13px] text-charcoal-soft">{children}</p>;
}

function CashFlowView({ data }) {
  if (!data?.monthly?.length) return <EmptyState>No transactions in this range.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="mc-card p-5">
          <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Total Income</div>
          <div className="mc-tnum mt-1 font-display text-xl font-bold text-green">{money(data.totalIncome)}</div>
        </div>
        <div className="mc-card p-5">
          <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Total Expenses</div>
          <div className="mc-tnum mt-1 font-display text-xl font-bold text-negative">{money(data.totalExpenses)}</div>
        </div>
        <div className="mc-card p-5">
          <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Net Cash Flow</div>
          <div className={`mc-tnum mt-1 font-display text-xl font-bold ${data.netCashFlow >= 0 ? 'text-green' : 'text-negative'}`}>
            {money(data.netCashFlow)}
          </div>
        </div>
      </div>
      <div className="mc-card p-6">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.monthly}>
            <CartesianGrid stroke={CHART_LINE} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(v) => money(v).split('.')[0]} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
            <Bar dataKey="income" name="Income" fill="#00bf63" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="expenses" name="Expenses" fill="#d2503f" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CategoryTable({ rows, labelKey, totalLabel }) {
  if (!rows?.length) return <EmptyState>Nothing in this range.</EmptyState>;
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <table className="mc-table w-full">
      <thead>
        <tr>
          <th>Category</th>
          <th className="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[labelKey]}>
            <td className="font-body text-[13px] text-charcoal">{formatCategory(r[labelKey])}</td>
            <td className="mc-tnum text-right font-body text-[13px] font-semibold text-charcoal">{money(r.total)}</td>
          </tr>
        ))}
        <tr>
          <td className="font-body text-[13px] font-bold text-charcoal">{totalLabel}</td>
          <td className="mc-tnum text-right font-body text-[13px] font-bold text-charcoal">{money(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function IncomeExpenseView({ data }) {
  if (!data?.expenses?.length && !data?.income?.length) return <EmptyState>No transactions in this range.</EmptyState>;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="mc-card p-6">
        <h3 className="mb-4 font-display text-[15px] font-bold text-charcoal">Income</h3>
        <CategoryTable rows={data.income} labelKey="category" totalLabel="Total Income" />
      </div>
      <div className="mc-card p-6">
        <h3 className="mb-4 font-display text-[15px] font-bold text-charcoal">Expenses</h3>
        <CategoryTable rows={data.expenses} labelKey="category" totalLabel="Total Expenses" />
      </div>
    </div>
  );
}

function SpendingByCategoryView({ data }) {
  if (!data?.categories?.length) return <EmptyState>No spending in this range.</EmptyState>;
  return (
    <div className="mc-card p-6">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data.categories} dataKey="amount" nameKey="category" innerRadius={55} outerRadius={95} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
            {data.categories.map((c, i) => (
              <Cell key={c.category} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v, n) => [money(v), formatCategory(n)]} contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.categories.map((c, i) => (
          <span key={c.category} className="flex items-center gap-1.5 font-body text-[11.5px] text-charcoal-soft">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
            {formatCategory(c.category)} · {c.percent}% · {money(c.amount)}
          </span>
        ))}
      </div>
    </div>
  );
}

function BalanceSheetView({ data }) {
  if (!data) return null;
  const Section = ({ title, rows, total }) => (
    <div className="mc-card p-6">
      <h3 className="mb-4 font-display text-[15px] font-bold text-charcoal">{title}</h3>
      {rows.length === 0 ? (
        <EmptyState>None.</EmptyState>
      ) : (
        <table className="mc-table w-full">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-body text-[13px] text-charcoal">{r.name}</td>
                <td className="mc-tnum text-right font-body text-[13px] font-semibold text-charcoal">{money(r.balance)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-body text-[13px] font-bold text-charcoal">Total</td>
              <td className="mc-tnum text-right font-body text-[13px] font-bold text-charcoal">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
  return (
    <div className="space-y-6">
      <p className="font-body text-[12px] text-charcoal-soft">
        As of {data.asOf} — balances reflect the current point in time, not the selected date range (a full
        historical balance sheet isn't reconstructable beyond recorded daily snapshots).
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Assets" rows={data.assets} total={data.totalAssets} />
        <Section title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} />
      </div>
      <div className="mc-card p-5">
        <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Net Worth</div>
        <div className={`mc-tnum mt-1 font-display text-xl font-bold ${data.netWorth >= 0 ? 'text-green' : 'text-negative'}`}>
          {money(data.netWorth)}
        </div>
      </div>
    </div>
  );
}

function TransactionDetailView({ data }) {
  if (!data?.transactions?.length) return <EmptyState>No transactions in this range.</EmptyState>;
  return (
    <div className="mc-card overflow-x-auto p-6">
      <table className="mc-table" style={{ minWidth: '640px' }}>
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Description</th>
            <th>Category</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.transactions.map((t) => (
            <tr key={t.id}>
              <td className="mc-tnum whitespace-nowrap font-body text-[12px] text-charcoal-soft">
                {new Date(t.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' })}
              </td>
              <td className="font-body text-[12px] text-charcoal-soft">{t.account}</td>
              <td className="font-body text-[12.5px] text-charcoal">{t.name}</td>
              <td className="font-body text-[12px] text-charcoal-soft">{t.category ? formatCategory(t.category) : '—'}</td>
              <td className={`mc-tnum text-right font-body text-[12.5px] font-semibold ${t.amount > 0 ? 'text-negative' : 'text-green'}`}>
                {money(t.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstimatedTaxCard({ estimatedTax }) {
  if (!estimatedTax) return null;
  return (
    <div className="mc-card p-6">
      <h3 className="mb-4 font-display text-[15px] font-bold text-charcoal">Estimated Tax (annualized)</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Annualized Net Income', estimatedTax.annualNetIncome],
          ['Self-Employment Tax', estimatedTax.selfEmploymentTax],
          ['Federal Income Tax', estimatedTax.federalIncomeTax],
          ['CA State Tax', estimatedTax.stateIncomeTax],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="font-body text-[10.5px] font-semibold uppercase tracking-wide text-charcoal-soft">{label}</div>
            <div className="mc-tnum mt-0.5 font-body text-[14px] font-semibold text-charcoal">{money(value)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Est. Quarterly Payment</div>
        <div className="mc-tnum mt-0.5 font-display text-lg font-bold text-charcoal">{money(estimatedTax.quarterlyPayment)}</div>
      </div>
    </div>
  );
}

function TaxSummaryView({ data }) {
  if (!data?.summary?.length) return <EmptyState>No tax-tagged transactions in this range — tag transactions from the Transactions page.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="mc-card p-6">
        <table className="mc-table w-full">
          <thead>
            <tr>
              <th>Tax Category</th>
              <th className="text-right">Count</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.summary.map((s) => (
              <tr key={s.taxCategory}>
                <td className="font-body text-[13px] text-charcoal">{formatCategory(s.taxCategory)}</td>
                <td className="mc-tnum text-right font-body text-[13px] text-charcoal-soft">{s.count}</td>
                <td className="mc-tnum text-right font-body text-[13px] font-semibold text-charcoal">{money(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EstimatedTaxCard estimatedTax={data.estimatedTax} />
    </div>
  );
}

function BusinessPnlView({ data }) {
  if (!data?.monthly?.length) return <EmptyState>No business-attributed transactions in this range.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="mc-card p-5">
          <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Income</div>
          <div className="mc-tnum mt-1 font-display text-xl font-bold text-green">{money(data.totalIncome)}</div>
        </div>
        <div className="mc-card p-5">
          <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Expenses</div>
          <div className="mc-tnum mt-1 font-display text-xl font-bold text-negative">{money(data.totalExpenses)}</div>
        </div>
        <div className="mc-card p-5">
          <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Net Income</div>
          <div className={`mc-tnum mt-1 font-display text-xl font-bold ${data.netIncome >= 0 ? 'text-green' : 'text-negative'}`}>
            {money(data.netIncome)}
          </div>
        </div>
      </div>
      <div className="mc-card p-6">
        <table className="mc-table w-full">
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Income</th>
              <th className="text-right">Expenses</th>
              <th className="text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.map((m) => (
              <tr key={m.month}>
                <td className="font-body text-[13px] text-charcoal">{m.month}</td>
                <td className="mc-tnum text-right font-body text-[13px] text-green">{money(m.income)}</td>
                <td className="mc-tnum text-right font-body text-[13px] text-negative">{money(m.expenses)}</td>
                <td className="mc-tnum text-right font-body text-[13px] font-semibold text-charcoal">{money(m.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EstimatedTaxCard estimatedTax={data.estimatedTax} />
    </div>
  );
}

function BudgetVsActualView({ data }) {
  if (!data?.items?.length) return <EmptyState>No budgets set yet — add some on the Budgets page.</EmptyState>;
  return (
    <div className="mc-card p-6">
      <div className="space-y-4">
        {data.items.map((item) => {
          const pct = item.budget > 0 ? Math.min(100, (item.actual / item.budget) * 100) : 0;
          return (
            <div key={item.category}>
              <div className="mb-1.5 flex items-baseline justify-between font-body text-[12.5px]">
                <span className="text-charcoal">{formatCategory(item.category)}</span>
                <span className={`mc-tnum font-semibold ${item.overBudget ? 'text-negative' : 'text-green'}`}>
                  {money(item.actual)} of {money(item.budget)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-cream">
                <div className={`h-full rounded-full ${item.overBudget ? 'bg-negative' : 'bg-green'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportBody({ type, data }) {
  switch (type) {
    case 'cash-flow':
      return <CashFlowView data={data} />;
    case 'income-expense':
      return <IncomeExpenseView data={data} />;
    case 'spending-by-category':
      return <SpendingByCategoryView data={data} />;
    case 'balance-sheet':
      return <BalanceSheetView data={data} />;
    case 'transaction-detail':
      return <TransactionDetailView data={data} />;
    case 'tax-summary':
      return <TaxSummaryView data={data} />;
    case 'business-pnl':
      return <BusinessPnlView data={data} />;
    case 'budget-vs-actual':
      return <BudgetVsActualView data={data} />;
    default:
      return null;
  }
}

export default function Reports() {
  const [reportType, setReportType] = useState('cash-flow');
  const [preset, setPreset] = useState('ytd');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/api/accounts')).data,
  });

  const range = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset);

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', reportType, range.from, range.to, selectedAccountIds.join(',')],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.from) params.append('from', range.from);
      if (range.to) params.append('to', range.to);
      if (selectedAccountIds.length > 0) params.append('accountIds', selectedAccountIds.join(','));
      return (await api.get(`/api/reports/${reportType}?${params.toString()}`)).data?.result;
    },
  });

  const toggleAccount = (id) => {
    setSelectedAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="p-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-charcoal">Reports</h1>
      <p className="mb-6 font-body text-[13.5px] text-charcoal-soft">
        Cash flow, income &amp; expense, and tax-ready reports — filtered by date range and account.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {REPORT_TABS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReportType(r.id)}
            className={`rounded-full px-4 py-2 font-body text-[12.5px] font-semibold transition-colors ${
              reportType === r.id ? 'bg-charcoal text-white' : 'border border-line bg-card text-charcoal-soft hover:text-charcoal'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mc-card mb-6 flex flex-wrap items-end gap-4 p-5">
        <label className="block">
          <span className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Date Range
          </span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="mc-select">
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label className="block">
              <span className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mc-input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mc-input" />
            </label>
          </>
        )}
        <label className="block">
          <span className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Accounts</span>
          <AccountFilter
            accounts={accountsData?.accounts ?? []}
            selected={selectedAccountIds}
            onToggle={toggleAccount}
            onClear={() => setSelectedAccountIds([])}
          />
        </label>
      </div>

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : error ? (
        <p className="font-body text-[13px] text-negative">Couldn't load this report.</p>
      ) : (
        <ReportBody type={reportType} data={data} />
      )}
    </div>
  );
}
