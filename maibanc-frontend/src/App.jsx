import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react';
import Dashboard from './components/Dashboard';
import NetWorth from './components/NetWorth';
import Transactions from './components/Transactions';
import Budgets from './components/Budgets';
import Investments from './components/Investments';
import Forecast from './components/Forecast';
import TaxReport from './components/TaxReport';
import BusinessPnL from './components/BusinessPnL';
import Insights from './components/Insights';
import ConnectBank from './components/ConnectBank';
import SidebarAccounts from './components/SidebarAccounts';
import { setClerkTokenGetter } from './api';
import {
  IconGrid,
  IconTrendUp,
  IconList,
  IconTarget,
  IconBarChart,
  IconCalendar,
  IconFile,
  IconBriefcase,
  IconSpark,
  IconBank,
} from './Icons';
import './App.css';
import './monarch.css';

const queryClient = new QueryClient();

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: IconGrid, component: Dashboard },
  { id: 'networth', label: 'Net Worth', icon: IconTrendUp, component: NetWorth },
  { id: 'transactions', label: 'Transactions', icon: IconList, component: Transactions },
  { id: 'budgets', label: 'Budgets', icon: IconTarget, component: Budgets },
  { id: 'investments', label: 'Investments', icon: IconBarChart, component: Investments },
  { id: 'forecast', label: 'Forecast', icon: IconCalendar, component: Forecast },
  { id: 'tax', label: 'Tax Report', icon: IconFile, component: TaxReport },
  { id: 'business', label: 'Business P&L', icon: IconBriefcase, component: BusinessPnL },
  { id: 'insights', label: 'Insights', icon: IconSpark, component: Insights },
  { id: 'connect', label: 'Connect Bank', icon: IconBank, component: ConnectBank },
];

const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: '#00bf63',
    colorText: '#23262b',
    colorTextSecondary: '#7c8289',
    colorBackground: '#ffffff',
    borderRadius: '11px',
    fontFamily: 'Public Sans, -apple-system, sans-serif',
  },
};

// Registers Clerk's token getter with the shared axios instance so every
// existing api.get/post call across every page picks up real auth with no
// per-component changes.
function AuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setClerkTokenGetter(getToken);
    return () => setClerkTokenGetter(null);
  }, [getToken]);
  return null;
}

function AppShell() {
  // Plaid OAuth institutions (Fidelity, etc.) navigate the whole tab away
  // and back to this URL with ?oauth_state_id=... — land on Connect Bank so
  // ConnectBank's resume logic actually mounts and runs.
  const [currentPage, setCurrentPage] = useState(() =>
    window.location.search.includes('oauth_state_id') ? 'connect' : 'dashboard'
  );
  const ActivePage = PAGES.find((p) => p.id === currentPage)?.component ?? Dashboard;

  return (
    <div className="mc-shell flex">
      <aside className="mc-sidebar flex w-64 shrink-0 flex-col overflow-y-auto px-4 py-6">
        <div className="mb-8 flex items-center justify-between px-2">
          <img src="/logo.svg" alt="Maibanc" className="h-7 w-auto" />
          <UserButton appearance={CLERK_APPEARANCE} />
        </div>
        <nav className="flex flex-col gap-1">
          {PAGES.map((page) => {
            const Icon = page.icon;
            return (
              <button
                key={page.id}
                data-active={currentPage === page.id}
                onClick={() => setCurrentPage(page.id)}
                className="mc-nav-item"
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {page.label}
              </button>
            );
          })}
        </nav>
        <SidebarAccounts />
      </aside>

      <main className="min-h-screen flex-1 overflow-y-auto">
        <ActivePage />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SignedOut>
        <div className="mc-shell flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <img src="/logo.svg" alt="Maibanc" className="mx-auto mb-8 h-8 w-auto" />
            <SignIn appearance={CLERK_APPEARANCE} />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <AuthBridge />
        <AppShell />
      </SignedIn>
    </QueryClientProvider>
  );
}

export default App;
