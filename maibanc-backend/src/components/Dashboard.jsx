import { useQuery } from 'react-query';
import api from '../api';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  // Fetch accounts (includes net worth)
  const { data: accounts, isLoading: accountsLoading, error: accountsError } = useQuery(
    'accounts',
    async () => {
      const res = await api.get('/api/accounts');
      return res.data;
    }
  );

  // Fetch forecast (includes balance projection)
  const { data: forecast, isLoading: forecastLoading, error: forecastError } = useQuery(
    'forecast',
    async () => {
      const res = await api.get('/api/forecast');
      return res.data;
    }
  );

  if (accountsLoading || forecastLoading) return <div className="p-8">Loading...</div>;
  if (accountsError || forecastError) return <div className="p-8 text-red-500">Error loading data</div>;

  const netWorth = accounts?.netWorth || 0;
  const totalAssets = accounts?.totalAssets || 0;
  const totalLiabilities = accounts?.totalLiabilities || 0;

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 p-4 rounded-lg">
          <div className="text-sm text-slate-400">Net Worth</div>
          <div className="text-2xl font-bold text-green-400">
            ${netWorth.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-lg">
          <div className="text-sm text-slate-400">Assets</div>
          <div className="text-2xl font-bold text-blue-400">
            ${totalAssets.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-lg">
          <div className="text-sm text-slate-400">Liabilities</div>
          <div className="text-2xl font-bold text-red-400">
            ${totalLiabilities.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Balance projection chart */}
      {forecast?.balanceProjection && forecast.balanceProjection.length > 0 && (
        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-lg font-bold mb-4">Balance Projection (Next 30 Days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={forecast.balanceProjection}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#E5E7EB' }}
              />
              <Area type="monotone" dataKey="projectedBalance" stroke="#10B981" fill="#10B98133" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent transactions */}
      <div className="bg-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-bold mb-4">Recent Transactions</h2>
        {accounts?.accounts && accounts.accounts.length > 0 ? (
          <div className="space-y-2 text-sm">
            {accounts.accounts.slice(0, 5).map((account) => (
              <div key={account.id} className="flex justify-between py-2 border-b border-slate-700">
                <span>{account.name}</span>
                <span className="text-green-400">${account.currentBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400">No accounts connected yet.</p>
        )}
      </div>
    </div>
  );
}