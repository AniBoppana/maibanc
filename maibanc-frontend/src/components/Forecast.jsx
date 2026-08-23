import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import api from '../api';
import { CHART_PALETTE, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';
import { formatCategory } from '../format';

function money(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function Forecast() {
  const { data: forecast, isLoading } = useQuery({
    queryKey: ['forecast'],
    queryFn: async () => (await api.get('/api/forecast')).data,
  });

  if (isLoading) return <div className="p-10 font-body text-sm text-charcoal-soft">Loading forecast…</div>;

  const categoryAverages = forecast?.categoryAverages ?? [];
  const bp = forecast?.balanceProjection;

  return (
    <div className="p-10">
      <h1 className="mb-8 font-display text-2xl font-bold text-charcoal">Forecast</h1>

      {bp && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Current Balance', value: bp.currentBalance, accent: 'text-charcoal' },
            {
              label: 'Projected Month-End',
              value: bp.projectedEndOfMonthBalance,
              accent: bp.projectedEndOfMonthBalance < 0 ? 'text-negative' : 'text-green',
            },
            { label: 'Remaining Spend', value: bp.projectedRemainingSpend, accent: 'text-negative' },
            { label: 'Days Remaining', value: bp.daysRemainingInMonth, accent: 'text-charcoal', raw: true },
          ].map((s) => (
            <div key={s.label} className="mc-card p-5">
              <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">{s.label}</div>
              <div className={`mc-tnum mt-1 font-display text-xl font-bold ${s.accent}`}>
                {s.raw ? s.value : money(s.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {categoryAverages.length > 0 && (
        <div className="mb-6 mc-card p-6">
          <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">
            Average Monthly Spend, Trailing 3 Months
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={categoryAverages}>
              <CartesianGrid stroke={CHART_LINE} vertical={false} />
              <XAxis
                dataKey="category"
                tickFormatter={formatCategory}
                tick={{ fontSize: 10.5, fill: CHART_CHARCOAL_SOFT }}
                angle={-35}
                textAnchor="end"
                height={80}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(v) => money(v)} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => money(v)} labelFormatter={formatCategory} contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
              <Bar dataKey="monthlyAverage" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {categoryAverages.map((entry, i) => (
                  <Cell key={entry.category} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {forecast?.recurring && forecast.recurring.length > 0 && (
          <div className="mc-card p-6">
            <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Recurring Charges</h2>
            <table className="mc-table w-full">
              <tbody>
                {forecast.recurring.map((charge, idx) => (
                  <tr key={idx}>
                    <td className="font-body text-[13px] text-charcoal">{charge.merchant}</td>
                    <td className="font-body text-[12px] text-charcoal-soft">
                      {charge.category ? formatCategory(charge.category) : '—'}
                    </td>
                    <td className="mc-tnum text-right font-body text-[13px] font-semibold text-negative">
                      {money(charge.averageAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {forecast?.budgetPacing && forecast.budgetPacing.length > 0 && (
          <div className="mc-card p-6">
            <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Budget Pacing</h2>
            <div className="space-y-4">
              {forecast.budgetPacing.map((pacing) => (
                <div key={pacing.category}>
                  <div className="mb-1.5 flex items-baseline justify-between font-body text-[12.5px]">
                    <span className="text-charcoal">{formatCategory(pacing.category)}</span>
                    <span className={`mc-tnum font-semibold ${pacing.onTrack ? 'text-green' : 'text-negative'}`}>
                      {pacing.projectedPctOfBudget}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-cream">
                    <div
                      className={`h-full rounded-full ${pacing.onTrack ? 'bg-green' : 'bg-negative'}`}
                      style={{ width: `${Math.min(100, pacing.projectedPctOfBudget)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
