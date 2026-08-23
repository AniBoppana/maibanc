import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../api';
import { formatCategory } from '../format';

function money(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export default function TaxReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tax-summary', year],
    queryFn: async () => (await api.get(`/api/tax/summary?year=${year}`)).data,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/api/tax/export.csv?year=${year}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `maibanc-tax-${year}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <div className="p-10 font-body text-sm text-charcoal-soft">Loading tax report…</div>;

  const summary = data?.summary ?? [];
  const est = data?.estimatedTax;

  return (
    <div className="p-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Tax Report</h1>
          <p className="mt-1 font-body text-[13.5px] text-charcoal-soft">
            Tag transactions in Transactions, then review and export here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="mc-select">
            {[year, year - 1, year - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button onClick={handleExport} disabled={exporting || summary.length === 0} className="mc-btn-secondary">
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {summary.length > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summary.map((s) => (
            <div key={s.taxCategory} className="mc-card p-5">
              <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">
                {formatCategory(s.taxCategory)}
              </div>
              <div className="mc-tnum mt-1 font-display text-xl font-bold text-charcoal">{money(s.total)}</div>
              <div className="font-body text-[11.5px] text-charcoal-soft">{s.count} transactions</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mc-card mb-6 p-8 text-center">
          <p className="font-body text-[13.5px] text-charcoal-soft">
            No transactions tagged for {year} yet — tag some on the Transactions page.
          </p>
        </div>
      )}

      {est && (
        <div className="mc-card p-6">
          <h2 className="mb-1 font-display text-[15px] font-bold text-charcoal">Estimated Quarterly Tax</h2>
          <p className="mb-4 font-body text-[12px] text-charcoal-soft">
            Federal (2026 IRS brackets, single filer) + California (FTB, latest published thresholds),
            projected from this year's BUSINESS-tagged spend annualized. This is an estimate, not filing advice.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              ['Annualized Net Income', est.annualNetIncome],
              ['Self-Employment Tax', est.selfEmploymentTax],
              ['Federal Income Tax', est.federalIncomeTax],
              ['CA State Tax', est.stateIncomeTax],
              ['Est. Quarterly Payment', est.quarterlyPayment],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">{label}</div>
                <div className="mc-tnum mt-1 font-display text-base font-bold text-charcoal">{money(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
