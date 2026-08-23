import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import api from '../api';
import { CHART_PALETTE, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';

function money(n, opts = {}) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const maximumFractionDigits = opts.maximumFractionDigits ?? 0;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits })}`;
}

const BUCKET_LABELS = {
  checking: 'Checking',
  savings: 'Savings',
  'money market': 'Money Market',
  cd: 'CD',
  'cash management': 'Cash Management',
  'credit card': 'Credit Card',
  '401k': '401(k)',
  ira: 'IRA',
  hsa: 'HSA',
  student: 'Student Loan',
  mortgage: 'Mortgage',
};

export default function NetWorth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['networth-history', 365],
    queryFn: async () => (await api.get('/api/networth/history?days=365')).data,
  });

  if (isLoading) {
    return <div className="p-10 font-body text-sm text-charcoal-soft">Loading net worth history…</div>;
  }
  if (error) {
    return <div className="p-10 font-body text-sm text-negative">Couldn't load net worth history.</div>;
  }

  const series = data?.series ?? [];
  const breakdown = data?.breakdown ?? [];
  const latest = series[series.length - 1];
  const yearAgo = series[0];
  const change = latest && yearAgo ? latest.netWorth - yearAgo.netWorth : null;
  const changePercent =
    latest && yearAgo && yearAgo.netWorth !== 0
      ? Math.round((change / Math.abs(yearAgo.netWorth)) * 1000) / 10
      : null;

  const monthly = series.filter((_, i) => i % 7 === 0);
  const anyReconstructed = series.some((d) => d.reconstructed);

  return (
    <div className="p-10">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Net Worth</h1>
          <p className="mt-1 font-body text-[13.5px] text-charcoal-soft">
            The full picture, over the last 12 months.
          </p>
        </div>
        <div className="text-right">
          <div className="mc-tnum font-display text-3xl font-bold text-charcoal">
            {latest ? money(latest.netWorth) : '—'}
          </div>
          {change != null && (
            <div className={`mc-tnum font-body text-[13px] font-semibold ${change >= 0 ? 'text-green' : 'text-negative'}`}>
              {change >= 0 ? '+' : ''}
              {money(change)} ({changePercent}%) past year
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 mc-card p-6">
        <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Net Worth Over Time</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00bf63" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#00bf63" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_LINE} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }}
              tickFormatter={(d) => d.slice(0, 7)}
              interval={Math.floor(monthly.length / 6)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(v) => money(v)} axisLine={false} tickLine={false} width={75} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
            <Area type="monotone" dataKey="netWorth" stroke="#00bf63" strokeWidth={2.5} fill="url(#nwFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        {anyReconstructed && (
          <p className="mt-3 font-body text-[11.5px] text-charcoal-soft">
            Earlier dates are reconstructed from real transaction history rather than recorded snapshots;
            accuracy improves day by day as Maibanc keeps running.
          </p>
        )}
      </div>

      <div className="mb-6 mc-card p-6">
        <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Assets vs. Liabilities</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthly}>
            <CartesianGrid stroke={CHART_LINE} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }}
              tickFormatter={(d) => d.slice(0, 7)}
              interval={Math.floor(monthly.length / 6)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(v) => money(v)} axisLine={false} tickLine={false} width={75} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
            <Legend wrapperStyle={{ fontSize: 12.5 }} />
            <Area type="monotone" dataKey="totalAssets" name="Assets" stackId="1" stroke="#2e56a8" fill="#2e56a8" fillOpacity={0.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="totalLiabilities" name="Liabilities" stackId="2" stroke="#d2503f" fill="#d2503f" fillOpacity={0.35} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mc-card p-6">
        <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Breakdown by Account Type</h2>
        <ResponsiveContainer width="100%" height={Math.max(200, breakdown.length * 36)}>
          <BarChart data={breakdown} layout="vertical" margin={{ left: 12 }}>
            <CartesianGrid stroke={CHART_LINE} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(v) => money(v)} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="bucket"
              tickFormatter={(b) => BUCKET_LABELS[b] ?? b}
              tick={{ fontSize: 12, fill: '#23262b' }}
              width={110}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {breakdown.map((entry, i) => (
                <Cell key={entry.bucket} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
