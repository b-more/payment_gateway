'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Money, StatCard, Spinner, Empty } from '@/components/ui';
import { shortId, zmw } from '@/lib/format';

interface Txn {
  id: string;
  account_id: string;
  type: string;
  processor: string;
  msisdn: string | null;
  amount: string;
  charge: string;
  net_amount: string;
  status: string;
  failure_reason: string | null;
  environment: string;
  created_at: string;
}

function sumNgwee(rows: Txn[], key: 'amount' | 'charge'): string {
  let total = 0n;
  for (const r of rows) {
    try { total += BigInt(r[key] || '0'); } catch { /* skip non-integer */ }
  }
  return total.toString();
}

const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

export default function TransactionsPage(): ReactNode {
  const { data, loading, error, reload } = useData<Txn[]>('/v1/admin/transactions');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fProcessor, setFProcessor] = useState('');
  const [fType, setFType] = useState('');
  const [fEnv, setFEnv] = useState('PRODUCTION');
  const [q, setQ] = useState('');

  const rows = useMemo(() => data ?? [], [data]);
  const distinct = (key: keyof Txn): string[] =>
    Array.from(new Set(rows.map((r) => r[key]).filter(Boolean) as string[])).sort();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) =>
      (fStatus === '' || t.status === fStatus) &&
      (fProcessor === '' || t.processor === fProcessor) &&
      (fType === '' || t.type === fType) &&
      (fEnv === '' || t.environment === fEnv) &&
      (needle === '' || [t.msisdn, t.id, t.account_id].some((v) => (v ?? '').toLowerCase().includes(needle))),
    );
  }, [rows, fStatus, fProcessor, fType, fEnv, q]);

  const successCount = filtered.filter((t) => t.status === 'SUCCESS').length;
  const successRate = filtered.length ? Math.round((successCount / filtered.length) * 100) : 0;
  const hasFilter = !!(fStatus || fProcessor || fType || q) || fEnv !== 'PRODUCTION';

  async function reverse(id: string): Promise<void> {
    if (!window.confirm('Reverse this transaction? This posts a compensating ledger entry and cannot be undone.')) return;
    setBusy(id);
    setMsg('');
    try {
      await apiPost(`/v1/admin/transactions/${id}/reverse`);
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Reversal failed.');
    } finally {
      setBusy('');
    }
  }

  const clearFilters = (): void => { setFStatus(''); setFProcessor(''); setFType(''); setFEnv('PRODUCTION'); setQ(''); };

  return (
    <>
      <PageHead
        title="Transactions"
        subtitle="Global transaction ledger — the 100 most recent, with authorized reversal."
        actions={<button className="btn" onClick={reload} disabled={loading}>↻ Refresh</button>}
      />
      {msg ? <div className="err">{msg}</div> : null}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <StatCard label="Transactions" value={filtered.length.toLocaleString()} sub={hasFilter ? `of ${rows.length} loaded` : 'most recent'} />
        <StatCard label="Volume" value={zmw(sumNgwee(filtered, 'amount'))} sub="Sum of amounts shown" />
        <StatCard label="Success rate" value={`${successRate}%`} sub={`${successCount} successful`} copper={filtered.length > 0 && successRate < 90} />
      </div>

      <div className="tbar">
        <input className="search" placeholder="Search MSISDN, ID or account…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {distinct('status').map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {distinct('type').map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select value={fProcessor} onChange={(e) => setFProcessor(e.target.value)} aria-label="Processor">
          <option value="">All rails</option>
          {distinct('processor').map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fEnv} onChange={(e) => setFEnv(e.target.value)} aria-label="Environment">
          <option value="">All environments</option>
          {distinct('environment').map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        {hasFilter ? <button className="btn sm" onClick={clearFilters}>Clear</button> : null}
      </div>

      <div className="card">
        {loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : error ? (
          <Empty>Could not load transactions. {error}</Empty>
        ) : rows.length === 0 ? (
          <Empty>No transactions yet.</Empty>
        ) : filtered.length === 0 ? (
          <Empty>No transactions match these filters.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Rail</th>
                  <th>MSISDN</th>
                  <th>Env</th>
                  <th className="num">Amount</th>
                  <th className="num">Charge</th>
                  <th className="num">Net</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{t.created_at}</td>
                    <td className="id">{shortId(t.id)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{titleCase(t.type)}</td>
                    <td>{t.processor}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{t.msisdn ?? '—'}</td>
                    <td>
                      <span className={`envtag ${t.environment === 'PRODUCTION' ? 'live' : 'sandbox'}`}>
                        {t.environment === 'PRODUCTION' ? 'live' : 'sandbox'}
                      </span>
                    </td>
                    <td className="num"><Money ngwee={t.amount} plain /></td>
                    <td className="num"><Money ngwee={t.charge} plain /></td>
                    <td className="num"><Money ngwee={t.net_amount} plain /></td>
                    <td>
                      <span title={t.failure_reason ?? undefined}>
                        <Badge value={t.status} />
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {t.status === 'SUCCESS' ? (
                        <span className="tip">
                          <button
                            className="btn sm danger"
                            disabled={busy === t.id}
                            onClick={() => void reverse(t.id)}
                            title="Ledger correction only. Does not refund the customer. To refund, send a disbursement to their number."
                          >
                            {busy === t.id ? '…' : 'Reverse'}
                          </button>
                          <span className="tip-body" role="tooltip">
                            <b>Ledger correction only.</b> This adjusts the merchant&rsquo;s float and marks
                            the transaction reversed. It does <b>not</b> refund the customer&rsquo;s wallet.
                            To actually refund someone, send a disbursement to their number for what they paid.
                          </span>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
