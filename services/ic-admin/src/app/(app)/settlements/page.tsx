'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHead } from '@/components/shell';
import { Badge, Money, StatCard, Spinner, Empty } from '@/components/ui';
import { zmw } from '@/lib/format';

interface Settlement {
  id: string;
  account_id: string;
  amount: string;
  status: string;
  settled_at: string | null;
  created_at: string;
  account_number: string;
  operating_mode: string;
  merchant_name: string | null;
}

function bi(v: string | null): bigint {
  try {
    return BigInt(v || '0');
  } catch {
    return 0n;
  }
}

export default function SettlementsPage(): ReactNode {
  const { principal } = useAuth();
  const roles = principal.roles;
  // FINANCE is the role defined for "float credit/debit and settlements".
  const canAct = roles.includes('ADMIN') || roles.includes('FINANCE');

  const { data, loading, error, reload } = useData<Settlement[]>('/v1/admin/settlements');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [failId, setFailId] = useState('');
  const [failReason, setFailReason] = useState('');

  async function act(id: string, fn: () => Promise<void>): Promise<void> {
    setBusy(id);
    setMsg('');
    setOk('');
    try {
      await fn();
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const runSettlement = (): Promise<void> =>
    act('run', async () => {
      const r = await apiPost<{ created: number }>('/v1/admin/settlements/run');
      setOk(r.created > 0 ? `Created ${r.created} settlement(s).` : 'Nothing to settle right now.');
    });

  const confirm = (id: string): Promise<void> =>
    act(id, async () => {
      await apiPost(`/v1/admin/settlements/${id}/confirm`, bankRef.trim() ? { bankReference: bankRef.trim() } : {});
      setOk('Settlement confirmed — float debited and recorded in the ledger.');
      setConfirmId('');
      setBankRef('');
    });

  const fail = (id: string): Promise<void> =>
    act(id, async () => {
      await apiPost(`/v1/admin/settlements/${id}/fail`, { reason: failReason.trim() });
      setOk('Settlement marked failed — the funds return to settleable on the next run.');
      setFailId('');
      setFailReason('');
    });

  const list = data ?? [];
  const pending = list.filter((s) => s.status === 'PENDING');
  const pendingTotal = pending.reduce((n, s) => n + bi(s.amount), 0n);
  const settledTotal = list.filter((s) => s.status === 'SETTLED').reduce((n, s) => n + bi(s.amount), 0n);

  return (
    <>
      <PageHead
        title="Settlements"
        subtitle="Money owed to merchants from their successful collections. Confirm once the bank transfer is made."
        actions={
          canAct ? (
            <button className="btn" disabled={busy === 'run'} onClick={() => void runSettlement()}>
              {busy === 'run' ? 'Running…' : 'Run settlement now'}
            </button>
          ) : undefined
        }
      />

      <p className="muted" style={{ marginTop: -6, marginBottom: 14, maxWidth: '72ch' }}>
        A settlement is a <b>claim</b>, not a payment. The scheduled run (daily 02:00) creates a{' '}
        <b>Pending</b> settlement per account for{' '}
        <span className="mono">collections − charges − already settled</span>. Pay the merchant&apos;s bank,
        then <b>Confirm</b> here — that writes the payout to the float ledger. <b>Mark failed</b> returns the
        funds to settleable on the next run. You&apos;re signed in as <b>{roles.join(', ') || 'no role'}</b>
        {canAct ? '.' : ' — only Admin or Finance can confirm.'}
      </p>

      <div className="callout-warn">
        <span>⚠️</span>
        <p>
          <b>Confirm moves money in the ledger.</b> Only confirm once the bank transfer has actually left —
          it debits the merchant&apos;s float and is recorded as the payout. Settling is capped at what the
          merchant has <b>earned</b> from collections, so pre-funded working capital is never wired out.
        </p>
      </div>

      <div className="grid cols-3" style={{ margin: '16px 0' }}>
        <StatCard label="Pending settlements" value={String(pending.length)} />
        <StatCard label="Pending value" value={zmw(pendingTotal.toString())} />
        <StatCard label="Settled to date" value={zmw(settledTotal.toString())} />
      </div>

      {msg ? <div className="err">{msg}</div> : null}
      {ok ? <div className="devhint" style={{ color: 'var(--success)', background: '#e6f4ee', borderColor: '#cce8dc' }}>{ok}</div> : null}

      <div className="card">
        {loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : error ? (
          <Empty>Could not load settlements. {error}</Empty>
        ) : list.length === 0 ? (
          <Empty>No settlements yet. Use “Run settlement now”, or wait for the daily run.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Account</th>
                <th className="num">Amount</th>
                <th>Created</th>
                <th>Settled</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const isPending = s.status === 'PENDING';
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.merchant_name ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {s.account_number}
                      {s.operating_mode !== 'PRODUCTION' ? <span className="muted"> · sandbox</span> : null}
                    </td>
                    <td className="num"><Money ngwee={s.amount} plain /></td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.created_at}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.settled_at ?? '—'}</td>
                    <td><Badge value={s.status} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!isPending || !canAct ? (
                        <span className="muted" style={{ fontSize: 12 }}>—</span>
                      ) : confirmId === s.id ? (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <input
                            value={bankRef}
                            onChange={(e) => setBankRef(e.target.value)}
                            placeholder="Bank reference (optional)"
                            style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, width: 175 }}
                          />
                          <button className="btn sm primary" disabled={!!busy} onClick={() => void confirm(s.id)}>
                            {busy === s.id ? '…' : 'Confirm paid'}
                          </button>
                          <button className="btn sm" onClick={() => { setConfirmId(''); setBankRef(''); }}>Cancel</button>
                        </span>
                      ) : failId === s.id ? (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <input
                            value={failReason}
                            onChange={(e) => setFailReason(e.target.value)}
                            placeholder="Reason"
                            style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, width: 175 }}
                          />
                          <button className="btn sm danger" disabled={!!busy || !failReason.trim()} onClick={() => void fail(s.id)}>Confirm fail</button>
                          <button className="btn sm" onClick={() => { setFailId(''); setFailReason(''); }}>Cancel</button>
                        </span>
                      ) : (
                        <>
                          <button className="btn sm primary" disabled={!!busy} onClick={() => { setConfirmId(s.id); setFailId(''); setBankRef(''); }} style={{ marginRight: 8 }}>
                            Confirm paid
                          </button>
                          <button className="btn sm" disabled={!!busy} onClick={() => { setFailId(s.id); setConfirmId(''); setFailReason(''); }}>
                            Mark failed
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .callout-warn {
          display: flex; gap: 12px; align-items: flex-start;
          padding: 13px 16px; border-radius: 10px;
          background: #fbf0d8; border: 1px solid #ecd6a3;
        }
        .callout-warn p { margin: 0; font-size: 13.5px; color: #4a3c17; max-width: 78ch; }
      `}</style>
    </>
  );
}
