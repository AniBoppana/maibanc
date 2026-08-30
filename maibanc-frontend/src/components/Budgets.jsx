import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { useState } from 'react';
import { formatCategory } from '../format';
import { useStamp } from '../useStamp';

function money(n) {
  return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SavingsGoals() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [editingAmountId, setEditingAmountId] = useState(null);
  const [amountDraft, setAmountDraft] = useState('');

  const { data: goals, isLoading } = useQuery({
    queryKey: ['savings-goals'],
    queryFn: async () => (await api.get('/api/savings-goals')).data?.goals || [],
  });
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/api/accounts')).data,
  });

  const createGoal = useMutation({
    mutationFn: async () =>
      api.post('/api/savings-goals', {
        name,
        targetAmount: parseFloat(targetAmount),
        targetDate: targetDate || undefined,
        linkedAccountId: linkedAccountId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savings-goals'] });
      setName('');
      setTargetAmount('');
      setTargetDate('');
      setLinkedAccountId('');
    },
  });

  const updateAmount = useMutation({
    mutationFn: async ({ id, currentAmount }) => api.patch(`/api/savings-goals/${id}`, { currentAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savings-goals'] });
      setEditingAmountId(null);
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (id) => api.delete(`/api/savings-goals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savings-goals'] }),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name || !targetAmount) return;
    createGoal.mutate();
  };

  return (
    <div className="mt-10">
      <h2 className="mb-6 font-display text-xl font-bold text-charcoal">Savings Goals</h2>

      <form onSubmit={handleCreate} className="mc-card mb-6 grid grid-cols-1 items-end gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Goal Name
          </span>
          <input
            type="text"
            placeholder="Vacation fund"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mc-input w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Target Amount
          </span>
          <input
            type="number"
            placeholder="5000"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className="mc-input w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Target Date
          </span>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mc-input w-full" />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Linked Account
          </span>
          <select value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)} className="mc-select w-full">
            <option value="">None (track manually)</option>
            {accountsData?.accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname ?? a.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={createGoal.isPending} className="mc-btn-primary">
          {createGoal.isPending ? 'Adding…' : 'Add Goal'}
        </button>
      </form>

      {isLoading ? (
        <p className="font-body text-[13px] text-charcoal-soft">Loading…</p>
      ) : goals?.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {goals.map((goal) => {
            const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
            const daysLeft = goal.targetDate
              ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;
            return (
              <div key={goal.id} className="mc-card p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="font-display text-[15px] font-bold text-charcoal">{goal.name}</div>
                    <div className="mc-tnum font-body text-[12.5px] text-charcoal-soft">
                      {money(goal.currentAmount)} of {money(goal.targetAmount)}
                      {goal.linkedAccount && ` — ${goal.linkedAccount.name}`}
                    </div>
                    {daysLeft != null && (
                      <div className="font-body text-[11px] text-charcoal-soft">
                        {daysLeft >= 0 ? `${daysLeft} days left` : 'Target date passed'}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteGoal.mutate(goal.id)}
                    disabled={deleteGoal.isPending}
                    className="font-body text-[12px] font-semibold text-negative hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-cream">
                  <div className="h-full rounded-full bg-blue" style={{ width: `${pct}%` }} />
                </div>
                {!goal.linkedAccount && (
                  <div className="mt-3">
                    {editingAmountId === goal.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          autoFocus
                          value={amountDraft}
                          onChange={(e) => setAmountDraft(e.target.value)}
                          className="mc-input w-28 py-1 text-[12px]"
                        />
                        <button
                          onClick={() => updateAmount.mutate({ id: goal.id, currentAmount: parseFloat(amountDraft) || 0 })}
                          className="font-body text-[11px] font-semibold text-green"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditingAmountId(null)} className="font-body text-[11px] text-charcoal-soft">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingAmountId(goal.id);
                          setAmountDraft(String(goal.currentAmount));
                        }}
                        className="font-body text-[11.5px] font-semibold text-charcoal hover:underline"
                      >
                        Update saved amount
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="font-body text-[13px] text-charcoal-soft">No savings goals yet — add one above.</p>
      )}
    </div>
  );
}

function CategoryGroups() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [pendingMembers, setPendingMembers] = useState([]);
  const [memberType, setMemberType] = useState('category');
  const [memberValue, setMemberValue] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => (await api.get('/api/groups')).data?.groups || [],
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/api/transactions/categories')).data?.categories || [],
  });
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/api/accounts')).data,
  });

  const createGroup = useMutation({
    mutationFn: async () => api.post('/api/groups', { name, members: pendingMembers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setName('');
      setPendingMembers([]);
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id) => api.delete(`/api/groups/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const addMember = () => {
    if (!memberValue) return;
    if (pendingMembers.some((m) => m.type === memberType && m.value === memberValue)) return;
    setPendingMembers((prev) => [...prev, { type: memberType, value: memberValue }]);
    setMemberValue('');
  };

  const removeMember = (idx) => setPendingMembers((prev) => prev.filter((_, i) => i !== idx));

  const memberLabel = (m) => {
    if (m.type === 'category') return formatCategory(m.value);
    const account = accountsData?.accounts?.find((a) => a.id === m.value);
    return account ? account.nickname ?? account.name : m.value;
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name || pendingMembers.length === 0) return;
    createGroup.mutate();
  };

  return (
    <div className="mt-10">
      <h2 className="mb-2 font-display text-xl font-bold text-charcoal">Category Groups</h2>
      <p className="mb-6 font-body text-[12.5px] text-charcoal-soft">
        Combine categories and/or accounts under one label — e.g. group "Travel" and "Leisure" together as
        "SoFi Savings" if that's really all one account to you.
      </p>

      <form onSubmit={handleCreate} className="mc-card mb-6 space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
            Group Name
          </span>
          <input
            type="text"
            placeholder="SoFi Savings"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mc-input w-full sm:w-64"
          />
        </label>

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[auto_1fr_auto]">
          <label className="block">
            <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
              Add
            </span>
            <select
              value={memberType}
              onChange={(e) => {
                setMemberType(e.target.value);
                setMemberValue('');
              }}
              className="mc-select"
            >
              <option value="category">Category</option>
              <option value="account">Account</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
              &nbsp;
            </span>
            <select value={memberValue} onChange={(e) => setMemberValue(e.target.value)} className="mc-select w-full">
              <option value="">Select {memberType}…</option>
              {memberType === 'category'
                ? categories?.map((c) => (
                    <option key={c} value={c}>
                      {formatCategory(c)}
                    </option>
                  ))
                : accountsData?.accounts?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nickname ?? a.name}
                    </option>
                  ))}
            </select>
          </label>
          <button type="button" onClick={addMember} className="mc-btn-secondary">
            Add to group
          </button>
        </div>

        {pendingMembers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingMembers.map((m, i) => (
              <span key={i} className="mc-chip bg-blue-soft text-blue">
                {memberLabel(m)}
                <button type="button" onClick={() => removeMember(i)} className="ml-1.5 font-semibold">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={createGroup.isPending || !name || pendingMembers.length === 0}
          className="mc-btn-primary disabled:opacity-40"
        >
          {createGroup.isPending ? 'Creating…' : 'Create Group'}
        </button>
      </form>

      {isLoading ? (
        <p className="font-body text-[13px] text-charcoal-soft">Loading…</p>
      ) : groups?.length > 0 ? (
        <div className="space-y-3">
          {groups.map((group) => {
            const expanded = expandedId === group.id;
            return (
              <div key={group.id} className="mc-card overflow-hidden p-0">
                <button
                  onClick={() => setExpandedId(expanded ? null : group.id)}
                  className="flex w-full items-center justify-between p-5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-body text-[11px] text-charcoal-soft">{expanded ? '▾' : '▸'}</span>
                    <span className="font-display text-[15px] font-bold text-charcoal">{group.name}</span>
                    <span className="font-body text-[11.5px] text-charcoal-soft">
                      ({group.items.length} item{group.items.length === 1 ? '' : 's'})
                    </span>
                  </div>
                  <span className="mc-tnum font-body text-[14px] font-semibold text-charcoal">{money(group.total)}</span>
                </button>
                {expanded && (
                  <div className="border-t border-line px-5 py-3">
                    {group.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2 text-[13px]">
                        <span className="flex items-center gap-2">
                          <span
                            className={`mc-chip font-mono text-[10px] uppercase ${
                              item.type === 'account' ? 'bg-blue-soft text-blue' : 'bg-green-soft text-green'
                            }`}
                          >
                            {item.type}
                          </span>
                          <span className="text-charcoal">{item.label}</span>
                        </span>
                        <span className="mc-tnum text-charcoal-soft">{money(item.amount)}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => deleteGroup.mutate(group.id)}
                      disabled={deleteGroup.isPending}
                      className="mt-2 font-body text-[12px] font-semibold text-negative hover:underline"
                    >
                      Remove group
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="font-body text-[13px] text-charcoal-soft">No category groups yet — create one above.</p>
      )}
    </div>
  );
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

      <SavingsGoals />
      <CategoryGroups />
    </div>
  );
}
