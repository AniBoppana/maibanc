import { QueryClient, QueryClientProvider } from 'react-query';
import Dashboard from './components/Dashboard';
import './App.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="bg-slate-900 text-white min-h-screen">
        <Dashboard />
      </div>
    </QueryClientProvider>
  );
}

export default App;