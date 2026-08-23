import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../api';
import { ALLOCATION_COLORS, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';

function money(n, opts = {}) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const maximumFractionDigits = opts.maximumFractionDigits ?? 2;
  const minimumFractionDigits = opts.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits })}`;
}

function gainColor(n) {
  if (n == null) return 'text-charcoal-soft';
  return n < 0 ? 'text-negative' : 'text-green';
}

export default function Investments() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['investments'],
    queryFn: async () => {
      const res = await api.get('/api/investments');
      return res.data;
    },
  });
  const { data: performance } = useQuery({
    queryKey: ['investments-performance'],
    queryFn: async () => (await api.get('/api/investments/performance')).data,
  });

  if (isLoading) {
    return <div className="p-10 font-body text-sm text-charcoal-soft">Loading investments…</div>;
  }

  if (error) {
    return (
      <div className="p-10 font-body text-sm text-negative">
        Couldn't load investment data — the service may be unreachable.
      </div>
    );
  }

  const totalValue = data?.totalValue ?? 0;
  const allocation = data?.allocation ?? [];
  const accounts = data?.accounts ?? [];
  const hasHoldings = accounts.length > 0;

  return (
    <div className="p-10">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Investments</h1>
          <p className="mt-1 font-body text-[13.5px] text-charcoal-soft">
            Holdings across every connected brokerage, retirement, and crypto account.
          </p>
        </div>
        <div className="text-right">
          <div className="font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Total Value
          </div>
          <div className="mc-tnum font-display text-3xl font-bold text-charcoal">
            {money(totalValue, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {!hasHoldings ? (
        <div className="mc-card p-10 text-center">
          <h2 className="font-display text-lg font-bold text-charcoal">No investment accounts yet</h2>
          <p className="mx-auto mt-2 max-w-sm font-body text-[13.5px] text-charcoal-soft">
            Connect a brokerage, 401(k), IRA, or crypto account from Connect Bank to see holdings,
            allocation, and performance here.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="mc-card p-6">
              <h2 className="mb-4 font-display text-[15px] font-bold text-charcoal">Asset Allocation</h2>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie
                      data={allocation}
                      dataKey="value"
                      nameKey="group"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {allocation.map((entry) => (
                        <Cell key={entry.group} fill={ALLOCATION_COLORS[entry.group] ?? CHART_CHARCOAL_SOFT} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [money(value, { maximumFractionDigits: 0 }), name]}
                      contentStyle={{ borderRadius: 10, border: `1px solid ${CHART_LINE}`, fontSize: 12.5 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {allocation.map((entry) => (
                    <div key={entry.group} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: ALLOCATION_COLORS[entry.group] ?? CHART_CHARCOAL_SOFT }}
                        />
                        <span className="font-body text-[13px] text-charcoal">{entry.group}</span>
                      </div>
                      <span className="mc-tnum font-body text-[13px] font-semibold text-charcoal-soft">
                        {entry.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mc-card p-6">
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="font-display text-[15px] font-bold text-charcoal">S&amp;P 500, Trailing 90 Days</h2>
                {performance?.sp500ReturnPercent != null && (
                  <span className={`mc-tnum font-body text-[13px] font-semibold ${performance.sp500ReturnPercent >= 0 ? 'text-green' : 'text-negative'}`}>
                    {performance.sp500ReturnPercent >= 0 ? '+' : ''}
                    {performance.sp500ReturnPercent}%
                  </span>
                )}
              </div>
              {performance?.sp500Series?.length > 1 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={performance.sp500Series}>
                      <defs>
                        <linearGradient id="spyFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2e56a8" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#2e56a8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={CHART_LINE} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(d) => d.slice(5)} interval={14} axisLine={false} tickLine={false} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: CHART_CHARCOAL_SOFT }} axisLine={false} tickLine={false} width={50} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12.5 }} />
                      <Area type="monotone" dataKey="close" stroke="#2e56a8" strokeWidth={2} fill="url(#spyFill)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  {performance.portfolioUnrealizedGainPercent != null ? (
                    <p className="mt-3 font-body text-[12px] text-charcoal-soft">
                      Your portfolio's overall unrealized gain since each position was opened:{' '}
                      <span className={`mc-tnum font-semibold ${performance.portfolioUnrealizedGainPercent >= 0 ? 'text-green' : 'text-negative'}`}>
                        {performance.portfolioUnrealizedGainPercent >= 0 ? '+' : ''}
                        {performance.portfolioUnrealizedGainPercent}%
                      </span>
                      . Not apples-to-apples with the 90-day S&amp;P line above — positions were opened on
                      different dates — but both figures are real.
                    </p>
                  ) : (
                    <p className="mt-3 font-body text-[12px] text-charcoal-soft">
                      No cost-basis data available yet to compute your portfolio's own return.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-line">
                  <span className="font-body text-[12.5px] text-charcoal-soft">
                    Add ALPHA_VANTAGE_API_KEY to the backend to see real S&amp;P 500 data here.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {accounts.map((account) => (
              <div key={account.accountId} className="mc-card p-6">
                <div className="mb-4 flex items-baseline justify-between">
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-charcoal">
                      {account.accountName}
                    </h2>
                    <p className="font-body text-[12px] text-charcoal-soft">
                      {account.institutionName}
                      {account.accountSubtype ? ` · ${account.accountSubtype.toUpperCase()}` : ''}
                    </p>
                  </div>
                  <span className="mc-tnum font-display text-lg font-bold text-charcoal">
                    {money(account.accountValue, { maximumFractionDigits: 0 })}
                  </span>
                </div>

                <table className="mc-table w-full">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Name</th>
                      <th className="text-right">Shares</th>
                      <th className="text-right">Cost Basis</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">Gain / Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.holdings.map((h) => (
                      <tr key={h.id}>
                        <td className="font-body text-[13px] font-semibold text-charcoal">
                          {h.symbol ?? '—'}
                        </td>
                        <td className="font-body text-[13px] text-charcoal-soft">{h.name ?? '—'}</td>
                        <td className="mc-tnum text-right font-body text-[13px] text-charcoal">
                          {h.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                        </td>
                        <td className="mc-tnum text-right font-body text-[13px] text-charcoal-soft">
                          {money(h.costBasis)}
                        </td>
                        <td className="mc-tnum text-right font-body text-[13px] font-semibold text-charcoal">
                          {money(h.currentValue)}
                        </td>
                        <td className={`mc-tnum text-right font-body text-[13px] font-semibold ${gainColor(h.gainDollar)}`}>
                          {h.gainDollar != null
                            ? `${money(h.gainDollar)} (${h.gainPercent > 0 ? '+' : ''}${h.gainPercent}%)`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
