import { usePlaidLink } from 'react-plaid-link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '../api';
import { useStamp } from '../useStamp';

function EditableAccountName({ account, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(account.nickname ?? '');

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(account.nickname ?? '');
          setEditing(true);
        }}
        className="group flex items-center gap-1.5 text-left font-body text-[13px] text-charcoal"
      >
        {account.nickname ?? account.name}
        <span className="text-[11px] text-charcoal-soft opacity-0 group-hover:opacity-100">Rename</span>
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed !== (account.nickname ?? '')) onSave(trimmed || null);
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(account.nickname ?? '');
          setEditing(false);
        }
      }}
      placeholder={account.name}
      className="mc-input py-1 text-[13px]"
    />
  );
}

// Plaid's OAuth institutions (Fidelity, many large brokerages) navigate the
// whole tab away to the bank's real login page, then back to our
// PLAID_REDIRECT_URI with ?oauth_state_id=... appended. Resuming that flow
// requires the SAME link token used to start it (a fresh one won't work),
// so it's persisted across the navigation in sessionStorage.
const LINK_TOKEN_KEY = 'maibanc_plaid_link_token';

export default function ConnectBank() {
  const queryClient = useQueryClient();
  const [stamp, showStamp] = useStamp();
  const isOAuthReturn = window.location.search.includes('oauth_state_id');
  const [linkToken, setLinkToken] = useState(() =>
    isOAuthReturn ? sessionStorage.getItem(LINK_TOKEN_KEY) : null
  );

  const { data: fetchedToken } = useQuery({
    queryKey: ['linkToken'],
    queryFn: async () => (await api.post('/api/plaid/link-token')).data.linkToken,
    enabled: !isOAuthReturn,
  });

  useEffect(() => {
    if (fetchedToken) {
      sessionStorage.setItem(LINK_TOKEN_KEY, fetchedToken);
      setLinkToken(fetchedToken);
    }
  }, [fetchedToken]);

  const { data: items, isLoading } = useQuery({
    queryKey: ['plaidItems'],
    queryFn: async () => (await api.get('/api/plaid/items')).data?.items || [],
  });

  const exchangeToken = useMutation({
    mutationFn: async (publicToken) => api.post('/api/plaid/exchange-public-token', { publicToken }),
    onSuccess: () => {
      sessionStorage.removeItem(LINK_TOKEN_KEY);
      queryClient.invalidateQueries({ queryKey: ['plaidItems'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showStamp('Connected');
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId) => api.delete(`/api/plaid/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaidItems'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showStamp('Disconnected');
    },
  });

  const businessToggle = useMutation({
    mutationFn: async ({ id, isBusiness }) => api.patch(`/api/accounts/${id}/business`, { isBusiness }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plaidItems'] }),
  });

  const renameAccount = useMutation({
    mutationFn: async ({ id, nickname }) => api.patch(`/api/accounts/${id}/nickname`, { nickname }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaidItems'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showStamp('Renamed');
    },
  });

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => exchangeToken.mutate(publicToken),
    receivedRedirectUri: isOAuthReturn ? window.location.href : undefined,
  });

  // Auto-resume: Plaid Link reopens itself once `ready` with the OAuth
  // return context, no click needed. Clean the ?oauth_state_id= param
  // afterward so a refresh doesn't try to resume a spent flow.
  useEffect(() => {
    if (isOAuthReturn && ready) {
      open();
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [isOAuthReturn, ready, open]);

  return (
    <div className="p-10">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-charcoal">Connect Bank</h1>
        {stamp && <span className="mc-chip bg-green-soft text-green">{stamp}</span>}
      </div>
      <p className="mb-6 max-w-md font-body text-[13.5px] text-charcoal-soft">
        Link a bank, credit card, brokerage, retirement, or business account via Plaid.
      </p>

      {isOAuthReturn && !linkToken && (
        <div className="mb-6 max-w-md rounded-xl border border-negative/30 bg-coral-soft p-4 font-body text-[13px] text-negative">
          Lost track of that connection after returning from your bank's login page (the browser
          session storage was cleared). Please click "Link an Account" and try again.
        </div>
      )}

      <button onClick={() => open()} disabled={!ready || exchangeToken.isPending} className="mc-btn-primary mb-10">
        {exchangeToken.isPending ? 'Connecting…' : 'Link an Account'}
      </button>

      <h2 className="mb-3 font-body text-[11.5px] font-semibold uppercase tracking-wide text-charcoal-soft">
        Connected Institutions
      </h2>
      {isLoading ? (
        <p className="font-body text-[13px] text-charcoal-soft">Loading…</p>
      ) : items?.length > 0 ? (
        <div className="mb-10 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="mc-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-display text-[15px] font-bold text-charcoal">{item.institutionName}</div>
                <button
                  onClick={() => deleteItem.mutate(item.id)}
                  disabled={deleteItem.isPending}
                  className="font-body text-[12px] font-semibold text-negative hover:underline"
                >
                  Disconnect
                </button>
              </div>
              <table className="mc-table w-full">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Balance</th>
                    <th className="text-right">Business</th>
                  </tr>
                </thead>
                <tbody>
                  {item.accounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <EditableAccountName
                          account={a}
                          onSave={(nickname) => renameAccount.mutate({ id: a.id, nickname })}
                        />
                      </td>
                      <td className="mc-tnum font-body text-[13px] text-charcoal-soft">
                        ${(a.currentBalance ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-right">
                        <button
                          className="mc-toggle"
                          data-on={String(!!a.isBusiness)}
                          onClick={() => businessToggle.mutate({ id: a.id, isBusiness: !a.isBusiness })}
                          aria-label={`Mark ${a.name} as business account`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-10 font-body text-[13px] text-charcoal-soft">No accounts connected yet.</p>
      )}
    </div>
  );
}
