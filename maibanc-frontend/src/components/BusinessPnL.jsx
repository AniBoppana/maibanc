import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import api from '../api';
import { CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';

function money(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export default function BusinessPnL() {
  const { data, isLoading } = useQuery({
    queryKey: ['business-pnl'],
    queryFn: async () => (await api.get('/api/business/pnl?months=12')).data,
  });

  if (isLoading) return <div className="p-10 font-body text-sm text-charcoal-soft">Loading business P&amp;L…</div>;

  if (!data?.hasBusinessAccounts) {
    return (
      <div className="p-10">
        <h1 className="mb-6 font-display text-2xl font-bold text-charcoal">Business P&amp;L</h1>
        <div className="mc-card p-10 text-center">
          <h2 className="font-display text-lg font-bold text-charcoal">No business accounts flagged yet</h2>
          <p className="mx-auto mt-2 max-w-sm font-body text-[13.5px] text-charcoal-soft">
            Mark an account as business on the Connect Bank page to see income vs. expenses and
            quarterly estimated tax here.
          </p>
        </div>
      </div>
    );
  }

  const monthly = data.monthly ?? [];
  const est = data.estimatedTax;

  return (
    <div className="p-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-charcoal">Business P&amp;L</h1>
      <p className="mb-8 font-body text-[13.5px] text-charcoal-soft">
        Income vs. expenses across accounts flagged business, trailing 12 months.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="mc-card p-5">
          <div className="font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">Income</div>
          <div className="mc-tnum mt-1 font-display text-2xl font-bold text-green">{money(data.totalIncome)}</div>
        </div>
        <div className="mc-card p-5">
          <div className="font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">Expenses</div>
          <div className="mc-tnum mt-1 font-display text-2xl font-bold text-negative">{money(data.totalExpenses)}</div>
        </div>
        <div className="mc-card p-5">
          <div className="font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">Net Income</div>
          <div className={`mc-tnum mt-1 font-display text-2xl font-bold ${data.netIncome >= 0 ? 'text-green' : 'text-negative'}`}>
            {money(data.netIncome)}
          </div>
        </div>
      </div>

      {monthly.length > 0 && (
        <div className="mb-6 mc-card p-6">
          <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Monthly P&amp;L</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly}>
              <CartesianGrid stroke={CHART_LINE} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(v) => money(v)} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
              <Legend wrapperStyle={{ fontSize: 12.5 }} />
              <Bar dataKey="income" name="Income" fill="#00bf63" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="expenses" name="Expenses" fill="#d2503f" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {est && (
        <div className="mc-card p-6">
          <h2 className="mb-1 font-display text-[15px] font-bold text-charcoal">Quarterly Estimated Tax</h2>
          <p className="mb-4 font-body text-[12px] text-charcoal-soft">
            Federal + California, from this business's real trailing-12-month net income, annualized.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              ['Annualized Net Income', est.annualNetIncome],
              ['Self-Employment Tax', est.selfEmploymentTax],
              ['Federal Income Tax', est.federalIncomeTax],
              ['CA State Tax', est.stateIncomeTax],
              ['Est. Quarterly Payment', est.quarterlyPayment],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">{label}</div>
                <div className="mc-tnum mt-1 font-display text-base font-bold text-charcoal">{money(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
