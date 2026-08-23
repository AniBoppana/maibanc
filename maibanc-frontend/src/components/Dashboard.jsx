import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../api';
import { CHART_PALETTE, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';
import { formatCategory } from '../format';

function money(n, opts = {}) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const maximumFractionDigits = opts.maximumFractionDigits ?? 0;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits })}`;
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

  if (accountsLoading || forecastLoading) {
    return <div className="p-10 font-body text-sm text-charcoal-soft">Loading dashboard…</div>;
  }

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
                  tickFormatter={(v) => money(v)}
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
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categorySpend} dataKey="monthlyAverage" nameKey="category" innerRadius={45} outerRadius={80} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
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
