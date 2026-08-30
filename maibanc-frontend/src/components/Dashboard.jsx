import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../api';
import { CHART_PALETTE, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';
import { formatCategory } from '../format';

const DISMISSED_ALERTS_KEY = 'maibanc:dismissedAlerts';

function useDismissedAlerts() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(DISMISSED_ALERTS_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...next]));
      } catch {
        // Dismissal just won't persist across reloads in this browser — not worth surfacing.
      }
      return next;
    });
  };

  return [dismissed, dismiss];
}

function money(n, opts = {}) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const maximumFractionDigits = opts.maximumFractionDigits ?? 2;
  const minimumFractionDigits = opts.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits })}`;
}

const SMALL_SLICE_THRESHOLD = 0.05;

// Labels only slices that can actually fit one — below the threshold the
// text would overlap its neighbors on a donut this size, so those get a
// legend entry (rendered separately, below) instead.
function renderPieSliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) {
  if (percent < SMALL_SLICE_THRESHOLD) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700}>
      <tspan x={x} dy="-0.3em">{formatCategory(name)}</tspan>
      <tspan x={x} dy="1.1em">{Math.round(percent * 100)}%</tspan>
    </text>
  );
}

const TYPE_LABELS = {
  depository: 'Banking',
  credit: 'Credit Cards',
  investment: 'Investments',
  loan: 'Loans',
};

export default function Dashboard() {
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/api/accounts')).data,
  });
  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ['forecast'],
    queryFn: async () => (await api.get('/api/forecast')).data,
  });
  const { data: netWorthHistory } = useQuery({
    queryKey: ['networth-history', 90],
    queryFn: async () => (await api.get('/api/networth/history?days=90')).data,
  });
  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => (await api.get('/api/alerts')).data?.alerts || [],
  });
  const [dismissed, dismissAlert] = useDismissedAlerts();

  if (accountsLoading || forecastLoading) {
    return <div className="p-10 font-body text-sm text-charcoal-soft">Loading dashboard…</div>;
  }

  const visibleAlerts = (alerts ?? []).filter((a) => !dismissed.has(a.id));

  const netWorth = accounts?.netWorth ?? 0;
  const bp = forecast?.balanceProjection;
  const categorySpend = (forecast?.categoryAverages ?? []).slice(0, 6);
  const trend = (netWorthHistory?.series ?? []).map((d) => ({ date: d.date, netWorth: d.netWorth }));

  const groupedAccounts = new Map();
  for (const a of accounts?.accounts ?? []) {
    const key = a.type;
    if (!groupedAccounts.has(key)) groupedAccounts.set(key, []);
    groupedAccounts.get(key).push(a);
  }

  return (
    <div className="p-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-charcoal">Dashboard</h1>
      <p className="mb-8 font-body text-[13.5px] text-charcoal-soft">
        Everything connected, at a glance.
      </p>

      {visibleAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {visibleAlerts.map((a) => (
            <div
              key={a.id}
              className={`flex items-center justify-between rounded-xl border p-4 font-body text-[13px] ${
                a.severity === 'critical'
                  ? 'border-negative/30 bg-coral-soft text-negative'
                  : 'border-gold/30 bg-gold-soft text-charcoal'
              }`}
            >
              <span>{a.message}</span>
              <button
                onClick={() => dismissAlert(a.id)}
                className="ml-4 shrink-0 font-body text-[12px] font-semibold opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Net Worth', value: netWorth, accent: netWorth < 0 ? 'text-negative' : 'text-green' },
          { label: 'Total Assets', value: accounts?.totalAssets, accent: 'text-charcoal' },
          { label: 'Total Liabilities', value: accounts?.totalLiabilities, accent: 'text-negative' },
          {
            label: 'Projected Month-End',
            value: bp?.projectedEndOfMonthBalance,
            accent: (bp?.projectedEndOfMonthBalance ?? 0) < 0 ? 'text-negative' : 'text-green',
          },
        ].map((stat) => (
          <div key={stat.label} className="mc-card p-5">
            <div className="font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
              {stat.label}
            </div>
            <div className={`mc-tnum mt-1 font-display text-[22px] font-bold ${stat.accent}`}>
              {money(stat.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="mc-card p-6 lg:col-span-2">
          <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">
            Net Worth, Last 90 Days
          </h2>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00bf63" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#00bf63" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_LINE} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }}
                  tickFormatter={(d) => d.slice(5)}
                  interval={Math.floor(trend.length / 5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }}
                  tickFormatter={(v) => money(v, { maximumFractionDigits: 0 })}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  formatter={(v) => money(v)}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }}
                />
                <Area type="monotone" dataKey="netWorth" stroke="#00bf63" strokeWidth={2.5} fill="url(#netWorthFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="font-body text-[13px] text-charcoal-soft">Not enough history yet.</p>
          )}
        </div>

        <div className="mc-card p-6">
          <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Spend by Category</h2>
          {categorySpend.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categorySpend}
                    dataKey="monthlyAverage"
                    nameKey="category"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                    isAnimationActive={false}
                    label={renderPieSliceLabel}
                    labelLine={false}
                  >
                    {categorySpend.map((entry, i) => (
                      <Cell key={entry.category} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [money(v), formatCategory(n)]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {(() => {
                const total = categorySpend.reduce((sum, c) => sum + c.monthlyAverage, 0);
                const smallSlices = categorySpend
                  .map((c, i) => ({ ...c, colorIndex: i, percent: total > 0 ? c.monthlyAverage / total : 0 }))
                  .filter((c) => c.percent < SMALL_SLICE_THRESHOLD);
                if (smallSlices.length === 0) return null;
                return (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                    {smallSlices.map((c) => (
                      <span key={c.category} className="flex items-center gap-1.5 font-body text-[10.5px] text-charcoal-soft">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: CHART_PALETTE[c.colorIndex % CHART_PALETTE.length] }}
                        />
                        {formatCategory(c.category)} · {Math.round(c.percent * 100)}%
                      </span>
                    ))}
                  </div>
                );
              })()}
            </>
          ) : (
            <p className="font-body text-[13px] text-charcoal-soft">No spending history yet.</p>
          )}
        </div>
      </div>

      <div className="mc-card p-6">
        <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Accounts</h2>
        <div className="space-y-6">
          {Array.from(groupedAccounts.entries()).map(([type, accts]) => (
            <div key={type}>
              <h3 className="mb-2 font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
                {TYPE_LABELS[type] ?? type}
              </h3>
              <table className="mc-table w-full">
                <tbody>
                  {accts.map((a) => (
                    <tr key={a.id}>
                      <td className="font-body text-[13.5px] text-charcoal">{a.nickname ?? a.name}</td>
                      <td
                        className={`mc-tnum text-right font-body text-[13.5px] font-semibold ${
                          (a.currentBalance ?? 0) < 0 ? 'text-negative' : 'text-charcoal'
                        }`}
                      >
                        {money(a.currentBalance ?? 0, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
