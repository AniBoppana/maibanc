import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import api from '../api';
import { useNavigate } from '../App';
import { CHART_PALETTE, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';
import { formatCategory } from '../format';

function money(n, opts = {}) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const maximumFractionDigits = opts.maximumFractionDigits ?? 2;
  const minimumFractionDigits = opts.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits })}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local getters on purpose, matching how the rest of the app already
// displays these dates (e.g. Transactions.jsx's toLocaleDateString) — using
// UTC getters here instead would make this calendar disagree by a day with
// every other date shown in the app for viewers west of UTC.
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const next = new Date(cells[cells.length - 1].date);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

// Recurring charges only carry a single predicted nextExpected date from
// the backend. Projects that forward/backward by the detected cadence
// (nextExpected − lastSeen) to cover whatever month is currently in view.
function projectRecurringOccurrences(recurring, monthStart, monthEnd) {
  const occurrences = [];
  for (const r of recurring) {
    const last = new Date(r.lastSeen);
    const next = new Date(r.nextExpected);
    const intervalMs = next.getTime() - last.getTime();
    if (!(intervalMs > 0)) continue;

    let occ = next;
    let guard = 0;
    while (occ > monthStart && guard < 60) {
      occ = new Date(occ.getTime() - intervalMs);
      guard++;
    }
    guard = 0;
    while (occ <= monthEnd && guard < 60) {
      if (occ >= monthStart) {
        occurrences.push({ date: occ, merchant: r.merchant, amount: r.averageAmount, category: r.category });
      }
      occ = new Date(occ.getTime() + intervalMs);
      guard++;
    }
  }
  return occurrences;
}

function MonthCalendar({ recurring }) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

  const { data: transactions } = useQuery({
    queryKey: ['transactions-calendar', year, month],
    queryFn: async () => {
      const from = monthStart.toISOString().slice(0, 10);
      const to = monthEnd.toISOString().slice(0, 10);
      return (await api.get(`/api/transactions?from=${from}&to=${to}&limit=500`)).data?.transactions || [];
    },
  });

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const transactionsByDay = useMemo(() => {
    const map = new Map();
    for (const t of transactions ?? []) {
      const key = dateKey(new Date(t.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return map;
  }, [transactions]);

  const recurringByDay = useMemo(() => {
    const map = new Map();
    for (const occ of projectRecurringOccurrences(recurring ?? [], monthStart, monthEnd)) {
      const key = dateKey(occ.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(occ);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurring, year, month]);

  const todayKey = dateKey(new Date());

  return (
    <div className="mc-card mb-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-bold text-charcoal">
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="mc-btn-secondary px-3 py-1.5 text-[12px]"
          >
            ‹
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            className="mc-btn-secondary px-3 py-1.5 text-[12px]"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="mc-btn-secondary px-3 py-1.5 text-[12px]"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="bg-cream p-2 text-center font-body text-[10.5px] font-semibold uppercase tracking-wide text-charcoal-soft"
          >
            {w}
          </div>
        ))}
        {cells.map((cell, i) => {
          const key = dateKey(cell.date);
          const dayTxns = transactionsByDay.get(key) || [];
          const dayRecurring = recurringByDay.get(key) || [];
          const net = dayTxns.reduce((s, t) => s - t.amount, 0);
          return (
            <div
              key={i}
              className={`min-h-[92px] bg-card p-1.5 ${cell.inMonth ? '' : 'opacity-40'} ${
                key === todayKey ? 'ring-2 ring-inset ring-green' : ''
              }`}
            >
              <div className="font-body text-[11px] text-charcoal-soft">{cell.date.getDate()}</div>
              {dayTxns.length > 0 && (
                <button
                  onClick={() => navigate('transactions', { date: key })}
                  title={`View ${dayTxns.length} transaction${dayTxns.length === 1 ? '' : 's'} from this day`}
                  className={`mt-0.5 block font-body text-[11px] font-semibold hover:underline ${
                    net < 0 ? 'text-negative' : 'text-green'
                  }`}
                >
                  {net < 0 ? '−' : '+'}${Math.abs(net).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </button>
              )}
              {dayRecurring.slice(0, 2).map((r, idx) => (
                <div
                  key={idx}
                  title={`${r.merchant} — ~${money(r.amount)}`}
                  className="mt-0.5 truncate rounded bg-gold-soft px-1 py-0.5 font-body text-[9.5px] text-charcoal"
                >
                  ⟳ {r.merchant}
                </div>
              ))}
              {dayRecurring.length > 2 && (
                <div className="mt-0.5 font-body text-[9.5px] text-charcoal-soft">+{dayRecurring.length - 2} more</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 font-body text-[11px] text-charcoal-soft">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gold-soft" />
          Predicted recurring charge
        </span>
        <span>Daily totals reflect actual transactions for that day.</span>
      </div>
    </div>
  );
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
      <h1 className="mb-8 font-display text-2xl font-bold text-charcoal">Calendar / Forecast</h1>

      <MonthCalendar recurring={forecast?.recurring} />

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
              <YAxis tick={{ fontSize: 11, fill: CHART_CHARCOAL_SOFT }} tickFormatter={(v) => money(v, { maximumFractionDigits: 0 })} axisLine={false} tickLine={false} />
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
