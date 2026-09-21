import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';

const TAX_CATEGORIES = [
  { value: '', label: 'Leave untagged' },
  { value: 'DEDUCTIBLE', label: 'Deductible' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'CHARITABLE', label: 'Charitable' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'HOME_OFFICE', label: 'Home Office' },
  { value: 'MILEAGE_TRAVEL', label: 'Mileage/Travel' },
];

function money(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  return `${v < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Client-side mirror of the backend's applyMapping — used only to show a
// live preview as the user adjusts column mapping, before committing.
function previewFromMapping(rows, mapping, flipSign) {
  return rows
    .slice(0, 8)
    .map((row) => {
      const date = mapping.date ? row[mapping.date] : null;
      const name = mapping.name ? row[mapping.name] : null;
      let amount = null;
      if (mapping.amount) {
        const v = parseFloat(String(row[mapping.amount] ?? '').replace(/[$,]/g, ''));
        if (!Number.isNaN(v)) amount = flipSign ? -v : v;
      } else if (mapping.debit || mapping.credit) {
        const debit = mapping.debit ? parseFloat(String(row[mapping.debit] ?? '0').replace(/[$,]/g, '')) || 0 : 0;
        const credit = mapping.credit ? parseFloat(String(row[mapping.credit] ?? '0').replace(/[$,]/g, '')) || 0 : 0;
        amount = debit - credit;
      }
      return { date, name, amount };
    })
    .filter((r) => r.date && r.name != null && r.amount != null);
}

export default function ImportPanel({ accounts }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null); // raw response from /preview
  const [mapping, setMapping] = useState(null); // for CSV/XLSX
  const [amountMode, setAmountMode] = useState('single'); // 'single' | 'debit-credit'
  const [flipSign, setFlipSign] = useState(false);
  const [targetMode, setTargetMode] = useState('existing'); // 'existing' | 'new'
  const [targetAccountId, setTargetAccountId] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('depository');
  const [newAccountBusiness, setNewAccountBusiness] = useState(false);
  const [taxCategory, setTaxCategory] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      // api's axios instance sets a default Content-Type: application/json
      // header, which otherwise overrides FormData's automatic multipart
      // boundary and leaves multer unable to parse the body at all (verified
      // directly — this exact call 400s as "No file uploaded" without this
      // override). Explicitly clearing it here lets the browser set the
      // correct multipart/form-data header with boundary itself.
      return (await api.post('/api/imports/preview', formData, { headers: { 'Content-Type': undefined } })).data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setError(null);
      setResult(null);
      if (data.needsMapping) {
        setMapping(data.suggestedMapping);
        setAmountMode(data.suggestedMapping.amount ? 'single' : 'debit-credit');
      }
    },
    onError: (err) => setError(err.response?.data?.error ?? 'Could not read that file.'),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const body = {
        applyTaxCategory: taxCategory || null,
        ...(targetMode === 'new'
          ? { newAccount: { name: newAccountName, type: newAccountType, isBusiness: newAccountBusiness } }
          : { accountId: targetAccountId }),
        ...(preview.needsMapping
          ? { rows: preview.rows, mapping, flipSign: amountMode === 'single' ? flipSign : false }
          : { transactions: preview.transactions }),
      };
      return (await api.post('/api/imports/commit', body)).data;
    },
    onSuccess: (data) => {
      setResult(data);
      setPreview(null);
      setMapping(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['plaidItems'] });
      queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
    onError: (err) => setError(err.response?.data?.error ?? 'Import failed.'),
  });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const rowCount = preview?.needsMapping ? preview.rows.length : preview?.transactions?.length ?? 0;
  const mappingComplete = preview?.needsMapping
    ? Boolean(mapping?.date && mapping?.name && (amountMode === 'single' ? mapping?.amount : mapping?.debit || mapping?.credit))
    : true;
  const targetComplete = targetMode === 'new' ? Boolean(newAccountName.trim()) : Boolean(targetAccountId);

  const livePreviewRows = preview?.needsMapping
    ? previewFromMapping(
        preview.rows,
        {
          date: mapping?.date ?? null,
          name: mapping?.name ?? null,
          amount: amountMode === 'single' ? mapping?.amount ?? null : null,
          debit: amountMode === 'debit-credit' ? mapping?.debit ?? null : null,
          credit: amountMode === 'debit-credit' ? mapping?.credit ?? null : null,
        },
        amountMode === 'single' ? flipSign : false
      )
    : (preview?.transactions ?? []).slice(0, 8);

  return (
    <div className="mc-card p-5">
      <h3 className="mb-1 font-display text-[15px] font-bold text-charcoal">Import Historical Data</h3>
      <p className="mb-4 font-body text-[12.5px] text-charcoal-soft">
        Bring in prior years' transactions, business records, or tax data from a file — CSV, Excel (.xlsx),
        or a Quicken/bank export (.ofx, .qfx, .qif). Imported transactions show up everywhere real ones do:
        Transactions, Reports, Tax Summary, Business P&amp;L.
      </p>

      {!preview && !result && (
        <label className="mc-btn-secondary inline-block cursor-pointer">
          Choose File
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.ofx,.qfx,.qif"
            onChange={handleFile}
            className="hidden"
          />
        </label>
      )}
      {uploadMutation.isPending && <p className="mt-3 font-body text-[12.5px] text-charcoal-soft">Reading file…</p>}

      {error && (
        <div className="mt-3 rounded-lg border border-negative/30 bg-coral-soft p-3 font-body text-[12.5px] text-negative">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-green/30 bg-green-soft p-3 font-body text-[12.5px] text-charcoal">
          Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}.{' '}
          <button
            onClick={() => setResult(null)}
            className="font-semibold text-green hover:underline"
          >
            Import another file
          </button>
        </div>
      )}

      {preview && (
        <div className="mt-4 space-y-5">
          <p className="font-body text-[12px] text-charcoal-soft">
            Found {rowCount} row{rowCount === 1 ? '' : 's'} in a {preview.format.toUpperCase()} file.
          </p>

          {preview.needsMapping && (
            <div className="space-y-3">
              <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">
                Match Columns
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block font-body text-[11px] text-charcoal-soft">Date column</span>
                  <select
                    value={mapping.date ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, date: e.target.value || null }))}
                    className="mc-select w-full"
                  >
                    <option value="">Select…</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-body text-[11px] text-charcoal-soft">Description column</span>
                  <select
                    value={mapping.name ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value || null }))}
                    className="mc-select w-full"
                  >
                    <option value="">Select…</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-body text-[11px] text-charcoal-soft">Amount format</span>
                  <select value={amountMode} onChange={(e) => setAmountMode(e.target.value)} className="mc-select w-full">
                    <option value="single">One signed column</option>
                    <option value="debit-credit">Separate debit/credit</option>
                  </select>
                </label>
              </div>

              {amountMode === 'single' ? (
                <label className="block max-w-xs">
                  <span className="mb-1 block font-body text-[11px] text-charcoal-soft">Amount column</span>
                  <select
                    value={mapping.amount ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, amount: e.target.value || null }))}
                    className="mc-select w-full"
                  >
                    <option value="">Select…</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="mt-1 block font-body text-[10.5px] text-charcoal-soft">
                    By default, positive = money out, negative = money in. Banks vary — check the
                    preview below: an everyday purchase should show red (money out).
                  </span>
                  <label className="mt-2 flex items-center gap-2 font-body text-[12px] text-charcoal">
                    <input type="checkbox" checked={flipSign} onChange={(e) => setFlipSign(e.target.checked)} />
                    This file has it backwards (flip the sign)
                  </label>
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <label className="block">
                    <span className="mb-1 block font-body text-[11px] text-charcoal-soft">Debit column</span>
                    <select
                      value={mapping.debit ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, debit: e.target.value || null }))}
                      className="mc-select w-full"
                    >
                      <option value="">Select…</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-body text-[11px] text-charcoal-soft">Credit column</span>
                    <select
                      value={mapping.credit ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, credit: e.target.value || null }))}
                      className="mc-select w-full"
                    >
                      <option value="">Select…</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {livePreviewRows.length > 0 && (
            <div>
              <p className="mb-2 font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">
                Preview
              </p>
              <table className="mc-table w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {livePreviewRows.map((r, i) => (
                    <tr key={i}>
                      <td className="font-body text-[12px] text-charcoal-soft">{r.date}</td>
                      <td className="font-body text-[12.5px] text-charcoal">{r.name}</td>
                      <td className={`mc-tnum text-right font-body text-[12.5px] font-semibold ${r.amount > 0 ? 'text-negative' : 'text-green'}`}>
                        {money(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-3 border-t border-line pt-4">
            <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">
              Import Into
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTargetMode('existing')}
                className={`rounded-full px-3 py-1.5 font-body text-[12px] font-semibold ${targetMode === 'existing' ? 'bg-charcoal text-white' : 'border border-line text-charcoal-soft'}`}
              >
                Existing Account
              </button>
              <button
                onClick={() => setTargetMode('new')}
                className={`rounded-full px-3 py-1.5 font-body text-[12px] font-semibold ${targetMode === 'new' ? 'bg-charcoal text-white' : 'border border-line text-charcoal-soft'}`}
              >
                New Account
              </button>
            </div>

            {targetMode === 'existing' ? (
              <select value={targetAccountId} onChange={(e) => setTargetAccountId(e.target.value)} className="mc-select w-full max-w-sm">
                <option value="">Select an account…</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>{a.nickname ?? a.name}</option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  placeholder="e.g. Business Checking 2023"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="mc-input w-full"
                />
                <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value)} className="mc-select w-full">
                  <option value="depository">Bank Account</option>
                  <option value="credit">Credit Card</option>
                </select>
                <label className="flex items-center gap-2 font-body text-[12.5px] text-charcoal">
                  <input type="checkbox" checked={newAccountBusiness} onChange={(e) => setNewAccountBusiness(e.target.checked)} />
                  Business account
                </label>
              </div>
            )}

            <label className="block max-w-xs">
              <span className="mb-1 block font-body text-[11px] text-charcoal-soft">Tag all imported rows as</span>
              <select value={taxCategory} onChange={(e) => setTaxCategory(e.target.value)} className="mc-select w-full">
                {TAX_CATEGORIES.map((tc) => (
                  <option key={tc.value} value={tc.value}>{tc.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => commitMutation.mutate()}
              disabled={!mappingComplete || !targetComplete || commitMutation.isPending}
              className="mc-btn-primary disabled:opacity-40"
            >
              {commitMutation.isPending ? 'Importing…' : `Import ${rowCount} Transaction${rowCount === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={() => {
                setPreview(null);
                setMapping(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="font-body text-[12.5px] text-charcoal-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
