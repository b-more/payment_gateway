'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, downloadFile, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';

interface Report {
  id: string;
  report_type: string;
  name: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
}

export default function ReportsPage(): ReactNode {
  const { data, loading, error, reload } = useData<Report[]>('/v1/admin/reports');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function download(r: Report, format: 'pdf' | 'csv'): Promise<void> {
    setErr(''); setBusy(`${r.id}-${format}`);
    try {
      const path = format === 'pdf' ? `/v1/admin/reports/${r.id}/pdf` : `/v1/admin/reports/${r.id}/export`;
      await downloadFile(path, `${r.name}.${format}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Download failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHead
        title="Reports"
        subtitle="Generate operational reports and export them as branded PDF or CSV."
        actions={
          <button className="btn primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : '+ New report'}
          </button>
        }
      />
      {err ? <div className="err">{err}</div> : null}
      {creating ? <CreateReport onDone={() => { setCreating(false); reload(); }} onError={setErr} /> : null}

      <div className="card">
        {loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : error ? (
          <Empty>Could not load reports. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No reports yet. Create one to export your data as a PDF or CSV.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Period</th><th>Status</th><th>Created</th><th /></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.report_type}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.period_start} → {r.period_end}</td>
                  <td><Badge value={r.status} /></td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.created_at}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn sm primary" disabled={busy === `${r.id}-pdf`} onClick={() => void download(r, 'pdf')} style={{ marginRight: 6 }}>
                      {busy === `${r.id}-pdf` ? '…' : '⬇ PDF'}
                    </button>
                    <button className="btn sm" disabled={busy === `${r.id}-csv`} onClick={() => void download(r, 'csv')}>
                      {busy === `${r.id}-csv` ? '…' : 'CSV'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function CreateReport({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }): ReactNode {
  const [f, setF] = useState({ name: '', reportType: 'TRANSACTIONS', from: '', to: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  function preset(kind: 'month' | '30d' | 'quarter' | 'year'): void {
    const now = new Date();
    const to = isoDate(now);
    let from: string;
    if (kind === 'month') from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    else if (kind === '30d') from = isoDate(new Date(now.getTime() - 29 * 86400000));
    else if (kind === 'quarter') from = isoDate(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
    else from = isoDate(new Date(now.getFullYear(), 0, 1));
    setF((p) => ({ ...p, from, to }));
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost('/v1/admin/reports', { name: f.name, reportType: f.reportType, from: f.from, to: f.to });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not create report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>New report</div>
      <form onSubmit={(e) => void submit(e)}>
        <div className="grid cols-2">
          <div className="field"><label>Name</label><input value={f.name} onChange={set('name')} required placeholder="e.g. June collections" /></div>
          <div className="field">
            <label>Type</label>
            <select value={f.reportType} onChange={set('reportType')}>
              <option value="TRANSACTIONS">Transactions</option>
              <option value="SETTLEMENTS">Settlements</option>
            </select>
          </div>
          <div className="field"><label>From</label><input type="date" value={f.from} onChange={set('from')} required /></div>
          <div className="field"><label>To</label><input type="date" value={f.to} onChange={set('to')} required /></div>
        </div>
        <div className="tbar" style={{ marginBottom: 16 }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 2 }}>Quick range:</span>
          <button type="button" className="btn sm" onClick={() => preset('month')}>This month</button>
          <button type="button" className="btn sm" onClick={() => preset('30d')}>Last 30 days</button>
          <button type="button" className="btn sm" onClick={() => preset('quarter')}>This quarter</button>
          <button type="button" className="btn sm" onClick={() => preset('year')}>This year</button>
        </div>
        <button className="btn primary" disabled={busy || !f.from || !f.to}>{busy ? 'Creating…' : 'Create report'}</button>
      </form>
    </div>
  );
}
