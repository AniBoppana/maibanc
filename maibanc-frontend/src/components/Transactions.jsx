import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { Fragment, useEffect, useState } from 'react';
import { formatCategory } from '../format';

const TAX_CATEGORIES = [
  { value: '', label: 'No tax tag' },
  { value: 'DEDUCTIBLE', label: 'Deductible' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'CHARITABLE', label: 'Charitable' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'HOME_OFFICE', label: 'Home Office' },
  { value: 'MILEAGE_TRAVEL', label: 'Mileage/Travel' },
];

const COMMON_CATEGORIES = [
  'FOOD_AND_DRINK',
  'GROCERIES',
  'ENTERTAINMENT',
  'SHOPPING',
  'TRANSPORTATION',
  'TRAVEL',
  'BILLS_AND_UTILITIES',
  'RENT_AND_HOUSING',
  'INSURANCE',
  'HEALTH_AND_WELLNESS',
  'PERSONAL_CARE',
  'EDUCATION',
  'SUBSCRIPTIONS',
  'GIFTS_AND_DONATIONS',
  'INCOME',
  'TRANSFER',
  'OTHER',
];

function money(n) {
  const abs = Math.abs(n ?? 0);
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function accountLabel(a) {
  return a.nickname ?? a.name;
}

function EditableCategory({ txn, knownCategories, onSave }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState('select');
  const [value, setValue] = useState('');
  const [createRule, setCreateRule] = useState(false);
  const effective = txn.userCategory ?? txn.category;

  const options = Array.from(new Set([...COMMON_CATEGORIES, ...(knownCategories || [])])).sort((a, b) =>
    formatCategory(a).localeCompare(formatCategory(b))
  );

  if (txn.splits?.length > 0) {
    return <span className="font-body text-[12px] text-charcoal-soft">Split ({txn.splits.length})</span>;
  }

  const startEditing = () => {
    const current = effective ?? '';
    setMode(current && !options.includes(current) ? 'custom' : 'select');
    setValue(current);
    setCreateRule(false);
    setEditing(true);
  };

  const commit = () => {
    onSave(value.trim() || null, createRule);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={startEditing}
        className="font-body text-[12px] text-charcoal-soft hover:text-charcoal hover:underline"
      >
        {effective ? formatCategory(effective) : 'Uncategorized'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {mode === 'select' ? (
        <select
          autoFocus
          value={value}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setMode('custom');
              setValue('');
            } else {
              setValue(e.target.value);
            }
          }}
          className="mc-select w-full py-1 text-[12px]"
        >
          <option value="">Uncategorized</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {formatCategory(opt)}
            </option>
          ))}
          <option value="__custom__">Custom category…</option>
        </select>
      ) : (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="Custom category name"
            className="mc-input flex-1 py-1 text-[12px]"
          />
          <button
            type="button"
            onClick={() => {
              setMode('select');
              setValue(options.includes(effective) ? effective : '');
            }}
            className="whitespace-nowrap font-body text-[11px] text-charcoal-soft hover:underline"
          >
            Use list
          </button>
        </div>
      )}
      <label className="flex items-center gap-1.5 font-body text-[10.5px] text-charcoal-soft">
        <input type="checkbox" checked={createRule} onChange={(e) => setCreateRule(e.target.checked)} />
        Always categorize "{txn.merchantName ?? txn.name}" this way
      </label>
      <div className="flex gap-2">
        <button onClick={commit} className="font-body text-[11px] font-semibold text-green">
          Save
        </button>
        <button onClick={() => setEditing(false)} className="font-body text-[11px] text-charcoal-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SplitEditor({ txn, onSave, onCancel }) {
  const [rows, setRows] = useState(
    txn.splits?.length > 0
      ? txn.splits.map((s) => ({ category: s.category, amount: String(s.amount) }))
      : [
          { category: txn.userCategory ?? txn.category ?? '', amount: String(txn.amount) },
          { category: '', amount: '0' },
        ]
  );

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const diff = Math.round((total - txn.amount) * 100) / 100;

  const updateRow = (i, field, val) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  return (
    <div className="mc-card mt-2 space-y-2 border-line bg-cream p-4">
      <p className="font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
        Split {money(txn.amount)} across categories
      </p>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            list="known-categories"
            value={row.category}
            onChange={(e) => updateRow(i, 'category', e.target.value)}
            placeholder="Category"
            className="mc-input flex-1 py-1 text-[12px]"
          />
          <input
            type="number"
            step="0.01"
            value={row.amount}
            onChange={(e) => updateRow(i, 'amount', e.target.value)}
            className="mc-input w-28 py-1 text-[12px]"
          />
          <button
            onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
            disabled={rows.length <= 2}
            className="font-body text-[11px] text-negative disabled:opacity-30"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() => setRows((r) => [...r, { category: '', amount: '0' }])}
        className="font-body text-[11.5px] font-semibold text-charcoal hover:underline"
      >
        + Add category
      </button>
      <div className={`font-body text-[11.5px] ${diff === 0 ? 'text-charcoal-soft' : 'text-negative'}`}>
        {diff === 0 ? 'Splits match the transaction total.' : `Off by ${money(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'}.`}
      </div>
      <div className="flex gap-3">
        <button
          onClick={() =>
            onSave(rows.filter((r) => r.category.trim()).map((r) => ({ category: r.category.trim(), amount: parseFloat(r.amount) || 0 })))
          }
          disabled={diff !== 0 || rows.filter((r) => r.category.trim()).length < 2}
          className="mc-btn-primary py-1.5 text-[12px] disabled:opacity-40"
        >
          Save Split
        </button>
        <button onClick={onCancel} className="font-body text-[12px] text-charcoal-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}

function RulesPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rules } = useQuery({
    queryKey: ['category-rules'],
    queryFn: async () => (await api.get('/api/category-rules')).data?.rules || [],
  });

  const deleteRule = useMutation({
    mutationFn: async (id) => api.delete(`/api/category-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['category-rules'] }),
  });

  return (
    <div className="mc-card mb-6 p-5">
      <button onClick={() => setOpen((o) => !o)} className="font-body text-[12.5px] font-semibold text-charcoal">
        Auto-Categorization Rules {rules?.length > 0 ? `(${rules.length})` : ''} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {rules?.length > 0 ? (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between border-b border-line py-2 text-[12.5px]">
                <span className="font-body text-charcoal-soft">
                  "{rule.matchValue}" → <span className="font-semibold text-charcoal">{formatCategory(rule.category)}</span>
                </span>
                <button
                  onClick={() => deleteRule.mutate(rule.id)}
                  className="font-body text-[11.5px] font-semibold text-negative hover:underline"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="font-body text-[12.5px] text-charcoal-soft">
              No rules yet — check "Always categorize…" when editing a transaction's category to create one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Transactions({ params } = {}) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  // Arriving from a calendar day click (see Forecast.jsx) pre-fills a
  // single-day range; otherwise this page opens unfiltered as usual.
  const [fromDate, setFromDate] = useState(params?.date ?? '');
  const [toDate, setToDate] = useState(params?.date ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [splittingId, setSplittingId] = useState(null);
  const [error, setError] = useState(null);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/api/transactions/categories')).data?.categories || [],
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/api/accounts')).data,
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', category, fromDate, toDate, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (search) params.append('search', search);
      params.append('limit', '150');
      return (await api.get(`/api/transactions?${params.toString()}`)).data?.transactions || [];
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['forecast'] });
    queryClient.invalidateQueries({ queryKey: ['tax-summary'] });
    queryClient.invalidateQueries({ queryKey: ['business-pnl'] });
  };

  const tagMutation = useMutation({
    mutationFn: async ({ id, taxCategory }) => api.patch(`/api/transactions/${id}/tax-category`, { taxCategory: taxCategory || null }),
    onSettled: invalidateAll,
  });

  const categoryMutation = useMutation({
    mutationFn: async ({ id, category: cat, createRule }) =>
      api.patch(`/api/transactions/${id}/category`, { category: cat, createRule }),
    onSettled: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['category-rules'] });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ id, reassignedAccountId }) => api.patch(`/api/transactions/${id}/reassign`, { reassignedAccountId }),
    onSettled: invalidateAll,
  });

  const splitMutation = useMutation({
    mutationFn: async ({ id, splits }) => api.post(`/api/transactions/${id}/split`, { splits }),
    onSuccess: () => setSplittingId(null),
    onError: (err) => setError(err.response?.data?.error ?? 'Could not save split.'),
    onSettled: invalidateAll,
  });

  const unsplitMutation = useMutation({
    mutationFn: async (id) => api.delete(`/api/transactions/${id}/split`),
    onSettled: invalidateAll,
  });

  const syncMutation = useMutation({
    mutationFn: async () => api.post('/api/transactions/sync'),
    onSettled: invalidateAll,
  });

  return (
    <div className="p-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-charcoal">Transactions</h1>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="mc-btn-secondary text-[12.5px] disabled:opacity-50"
        >
          {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {syncMutation.isSuccess && (
        <p className="mb-4 font-body text-[12px] text-charcoal-soft">
          Synced. A freshly connected bank can take Plaid a few minutes to finish its first pull — if
          nothing new shows up yet, try again shortly.
        </p>
      )}

      <div className="mc-card mb-6 grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Search
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Merchant or description"
            className="mc-input w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Category
          </span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="mc-select w-full">
            <option value="">All categories</option>
            {categories?.map((cat) => (
              <option key={cat} value={cat}>
                {formatCategory(cat)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            From
          </span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mc-input w-full" />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            To
          </span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mc-input w-full" />
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-negative/30 bg-coral-soft p-3 font-body text-[12.5px] text-negative">
          {error}
        </div>
      )}

      <div className="mc-card p-6">
        <table className="mc-table">
          <colgroup>
            <col style={{ width: '11%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Tax Tag</th>
              <th>Attributed To</th>
              <th className="text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center font-body text-[13px] text-charcoal-soft">
                  Loading…
                </td>
              </tr>
            ) : transactions?.length > 0 ? (
              transactions.map((txn) => (
                <Fragment key={txn.id}>
                  <tr>
                    <td className="mc-tnum whitespace-nowrap align-top font-body text-[12.5px] text-charcoal-soft">
                      {/* Plaid's dates are date-only and always parse as UTC midnight — display
                          them the same way the backend's date filters read them, or a
                          transaction's shown date can disagree with which day it actually
                          filters under (see Forecast.jsx's calendar for the same convention). */}
                      {new Date(txn.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td className="align-top">
                      <div className="font-body text-[13px] text-charcoal">{txn.name}</div>
                      <div className="font-body text-[11px] text-charcoal-soft">{accountLabel(txn.account)}</div>
                    </td>
                    <td className="align-top">
                      <EditableCategory
                        txn={txn}
                        knownCategories={categories}
                        onSave={(cat, createRule) => categoryMutation.mutate({ id: txn.id, category: cat, createRule })}
                      />
                    </td>
                    <td className="align-top">
                      <select
                        value={txn.taxCategory ?? ''}
                        onChange={(e) => tagMutation.mutate({ id: txn.id, taxCategory: e.target.value })}
                        className="mc-select w-full py-1 text-[11.5px]"
                      >
                        {TAX_CATEGORIES.map((tc) => (
                          <option key={tc.value} value={tc.value}>
                            {tc.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="align-top">
                      <select
                        value={txn.reassignedAccountId ?? ''}
                        onChange={(e) => reassignMutation.mutate({ id: txn.id, reassignedAccountId: e.target.value || null })}
                        className="mc-select w-full py-1 text-[11.5px]"
                      >
                        <option value="">{accountLabel(txn.account)} (real)</option>
                        {accounts?.accounts
                          ?.filter((a) => a.id !== txn.accountId)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {accountLabel(a)}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td
                      className={`mc-tnum align-top text-right font-body text-[13.5px] font-semibold ${
                        txn.amount > 0 ? 'text-negative' : 'text-green'
                      }`}
                    >
                      {money(txn.amount)}
                    </td>
                    <td className="align-top text-right">
                      {txn.splits?.length > 0 ? (
                        <button
                          onClick={() => unsplitMutation.mutate(txn.id)}
                          className="font-body text-[11px] font-semibold text-negative hover:underline"
                        >
                          Unsplit
                        </button>
                      ) : (
                        <button
                          onClick={() => setSplittingId(splittingId === txn.id ? null : txn.id)}
                          className="font-body text-[11px] font-semibold text-charcoal hover:underline"
                        >
                          Split
                        </button>
                      )}
                    </td>
                  </tr>
                  {splittingId === txn.id && (
                    <tr>
                      <td colSpan={7}>
                        <SplitEditor
                          txn={txn}
                          onCancel={() => setSplittingId(null)}
                          onSave={(splits) => splitMutation.mutate({ id: txn.id, splits })}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center font-body text-[13px] text-charcoal-soft">
                  No transactions found for this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <RulesPanel />
      </div>

      <datalist id="known-categories">
        {categories?.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}
