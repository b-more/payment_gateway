'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHead } from '@/components/shell';
import { Spinner, Empty, Money } from '@/components/ui';

interface PayoutRequest {
  id: string;
  processor: string;
  amount: string;
  msisdn: string;
  reference: string | null;
  status: string;
  requested_by: string;
  requested_by_name: string | null;
  account_number: string;
  created_at: string;
}

export default function ApprovalsPage(): ReactNode {
  const { principal } = useAuth();
  const pending = useData<PayoutRequest[]>('/v1/merchant/payout-requests?status=pending');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [rejecting, setRejecting] = useState('');
  const [reason, setReason] = useState('');

  async function act(id: string, fn: () => Promise<void>): Promise<void> {
    setBusy(id);
    setErr('');
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const approve = (id: string): Promise<void> =>
    act(id, async () => {
      const t = await apiPost<{ status: string }>(`/v1/merchant/payout-requests/${id}/approve`);
      setMsg(t.status === 'SUCCESS' ? 'Approved — payout sent.' : `Approved — payout ${t.status.toLowerCase()}.`);
      pending.reload();
    });

  const reject = (id: string): Promise<void> =>
    act(id, async () => {
      await apiPost(`/v1/merchant/payout-requests/${id}/reject`, { reason: reason.trim() });
      setRejecting('');
      setReason('');
      setMsg('Payout rejected.');
      pending.reload();
    });

  const list = pending.data ?? [];

  return (
    <>
      <PageHead title="Approvals" subtitle="Payouts awaiting a second admin's approval (maker-checker)." />
      {err ? <div className="err">{err}</div> : null}
      {msg ? (
        <div className="devhint" style={{ color: 'var(--success-deep)', background: '#e7f2ec', borderColor: '#cfe6da' }}>{msg}</div>
      ) : null}

      <div className="card">
        {pending.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : list.length === 0 ? (
          <Empty>No payouts awaiting approval.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Requested by</th><th>Recipient</th><th>Rail</th><th className="num">Amount</th><th>When</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const mine = r.requested_by === principal.userId;
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.requested_by_name ?? '—'}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--slate)' }}>{r.account_number}{r.reference ? ` · ${r.reference}` : ''}</div>
                    </td>
                    <td className="mono">{r.msisdn}</td>
                    <td>{r.processor.replace('_', ' ')}</td>
                    <td className="num"><Money ngwee={r.amount} plain /></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.created_at}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {rejecting === r.id ? (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason"
                            style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, width: 150 }}
                          />
                          <button className="btn sm danger" disabled={busy === r.id || !reason.trim()} onClick={() => void reject(r.id)}>Confirm</button>
                          <button className="btn sm" onClick={() => { setRejecting(''); setReason(''); }}>Cancel</button>
                        </span>
                      ) : mine ? (
                        <span className="muted" style={{ fontSize: 12 }}>You requested this — needs another admin</span>
                      ) : (
                        <>
                          <button className="btn sm primary" disabled={!!busy} onClick={() => void approve(r.id)} style={{ marginRight: 8 }}>
                            {busy === r.id ? '…' : 'Approve'}
                          </button>
                          <button className="btn sm" disabled={!!busy} onClick={() => { setRejecting(r.id); setReason(''); }}>Reject</button>
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
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        For security, a payout must be approved by a different admin than the one who requested it (SEC-Z4).
      </p>
    </>
  );
}
