import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { useState } from 'react';
import { formatCategory } from '../format';
import { useStamp } from '../useStamp';

function money(n) {
  return `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export default function Budgets() {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [stamp, showStamp] = useStamp();

  const { data: budgets, isLoading } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => (await api.get('/api/budgets')).data?.budgets || [],
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/api/transactions/categories')).data?.categories || [],
  });
  const { data: forecast } = useQuery({
    queryKey: ['forecast'],
    queryFn: async () => (await api.get('/api/forecast')).data,
  });

  const pacingByCategory = new Map((forecast?.budgetPacing ?? []).map((p) => [p.category, p]));

  const createBudget = useMutation({
    mutationFn: async () => api.post('/api/budgets', { category: newCategory, amount: parseFloat(newAmount) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      setNewCategory('');
      setNewAmount('');
      showStamp('Added');
    },
  });

  const deleteBudget = useMutation({
    mutationFn: async (id) => api.delete(`/api/budgets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      showStamp('Removed');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newCategory || !newAmount) return;
    createBudget.mutate();
  };

  return (
    <div className="p-10">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-charcoal">Budgets</h1>
        {stamp && <span className="mc-chip bg-green-soft text-green">{stamp}</span>}
      </div>

      <form onSubmit={handleCreate} className="mc-card mb-6 grid grid-cols-1 items-end gap-4 p-5 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Category
          </span>
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="mc-select w-full">
            <option value="">Select category</option>
            {categories?.map((cat) => (
              <option key={cat} value={cat}>
                {formatCategory(cat)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Monthly Amount
          </span>
          <input
            type="number"
            placeholder="0.00"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="mc-input w-full"
          />
        </label>
        <button type="submit" disabled={createBudget.isPending} className="mc-btn-primary">
          {createBudget.isPending ? 'Adding…' : 'Add Budget'}
        </button>
      </form>

      {isLoading ? (
        <p className="font-body text-[13px] text-charcoal-soft">Loading…</p>
      ) : budgets?.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {budgets.map((budget) => {
            const pacing = pacingByCategory.get(budget.category);
            const pct = pacing ? Math.min(100, (pacing.spentSoFar / budget.amount) * 100) : 0;
            const over = pacing ? pacing.spentSoFar > budget.amount : false;
            return (
              <div key={budget.id} className="mc-card p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="font-display text-[15px] font-bold text-charcoal">
                      {formatCategory(budget.category)}
                    </div>
                    <div className="mc-tnum font-body text-[12.5px] text-charcoal-soft">
                      {pacing ? money(pacing.spentSoFar) : '$0.00'} of {money(budget.amount)}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteBudget.mutate(budget.id)}
                    disabled={deleteBudget.isPending}
                    className="font-body text-[12px] font-semibold text-negative hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-cream">
                  <div
                    className={`h-full rounded-full ${over ? 'bg-negative' : 'bg-green'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="font-body text-[13px] text-charcoal-soft">No budgets yet — add one above.</p>
      )}
    </div>
  );
}
