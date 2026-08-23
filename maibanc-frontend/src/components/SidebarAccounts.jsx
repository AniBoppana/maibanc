import { useQuery } from '@tanstack/react-query';
import api from '../api';

const TYPE_LABELS = {
  depository: 'Banking',
  credit: 'Credit Cards',
  investment: 'Investments',
  loan: 'Loans',
};

function money(n) {
  const abs = Math.abs(n ?? 0);
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function SidebarAccounts() {
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/api/accounts')).data,
  });

  const grouped = new Map();
  for (const a of data?.accounts ?? []) {
    if (!grouped.has(a.type)) grouped.set(a.type, []);
    grouped.get(a.type).push(a);
  }

  if (grouped.size === 0) return null;

  return (
    <div className="mt-6 space-y-4 border-t border-line pt-4">
      {Array.from(grouped.entries()).map(([type, accounts]) => (
        <div key={type}>
          <div className="mb-1 px-2 font-body text-[10.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            {TYPE_LABELS[type] ?? type}
          </div>
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-2 py-1">
              <span className="truncate font-body text-[12px] text-charcoal-soft">{a.nickname ?? a.name}</span>
              <span
                className={`mc-tnum shrink-0 pl-2 font-body text-[12px] font-semibold ${
                  (a.currentBalance ?? 0) < 0 ? 'text-negative' : 'text-charcoal'
                }`}
              >
                {money(a.currentBalance ?? 0)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
