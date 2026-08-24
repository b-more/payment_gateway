'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHead } from '@/components/shell';
import { Badge, Money, StatCard, Spinner, Empty } from '@/components/ui';

interface Destination {
  bankAccountNumber?: string;
  accountName?: string;
  bankName?: string;
}
interface ZampaySettlement {
  id: string;
  transaction_id: string;
  zampay_reference: string;
  invoice_number: string | null;
  service_ids: string[];
  destination: Destination | null;
  amount_ngwee: string;
  currency: string;
  status: string;
  payment_reference: string | null;
  bank_batch_reference: string | null;
  callback_status: string | null;
  callback_attempts: number;
  failure_reason: string | null;
  settled_at: string | null;
  created_at: string;
  account_number: string;
  merchant_name: string | null;
  environment: string;
}

export default function ZampayPage(): ReactNode {
  const { principal } = useAuth();
  const canAct = principal.roles.includes('ADMIN') || principal.roles.includes('FINANCE');

  const { data, loading, error, reload } = useData<ZampaySettlement[]>('/v1/admin/zampay/settlements');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');

  if (loading) return <Spinner />;
  if (error || !data) return <Empty>Could not load ZamPay settlements. {error}</Empty>;

  const count = (s: string): number => data.filter((z) => z.status === s).length;

  async function retry(id: string): Promise<void> {
    setBusy(id);
    setMsg('');
    setOk('');
    try {
      await apiPost(`/v1/admin/zampay/settlements/${id}/retry`, {});
      setOk('Re-armed. The reconcile job will retry on its next run.');
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Could not retry.');
    } finally {
      setBusy('');
    }
  }

  async function saveBatchRef(id: string): Promise<void> {
    setBusy(id);
    setMsg('');
    setOk('');
    try {
      await apiPost(`/v1/admin/zampay/settlements/${id}/batch-reference`, { bankBatchReference: draft.trim() });
      setOk('Bank batch reference saved.');
      setEditing('');
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHead
        title="ZamPay Settlements"
        subtitle="Government (GSB) collections. Once collected, we confirm the payment to ZamPay automatically with our payment reference — no manual step. This is a monitor of that activity."
      />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Resolved" value={String(count('RESOLVED'))} sub="Callback pending" />
        <StatCard label="Settled" value={String(count('SETTLED'))} sub="Confirmed to GSB" />
        <StatCard label="Already paid" value={String(count('INVOICE_PAID'))} sub="Paid, nothing to settle" />
        <StatCard label="Failed" value={String(count('FAILED'))} sub="Need attention" copper={count('FAILED') > 0} />
      </div>

      {msg ? <div className="err" style={{ marginBottom: 12 }}>{msg}</div> : null}
      {ok ? <div className="devhint" style={{ marginBottom: 12, color: 'var(--success)', background: '#e6f4ee', borderColor: '#cce8dc' }}>{ok}</div> : null}

      <div className="card">
        {data.length === 0 ? (
          <Empty>No ZamPay settlements yet. They appear once a GSB collection succeeds and its invoice is read.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Destination</th>
                <th>Invoice</th>
                <th className="num">Amount</th>
                <th className="num">Services</th>
                <th>Status</th>
                <th>Our reference</th>
                <th>Bank batch ref</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((z) => {
                const dest = z.destination;
                return (
                  <tr key={z.id}>
                    <td style={{ fontWeight: 600 }}>
                      {z.merchant_name ?? '—'}
                      <div className="muted" style={{ fontSize: 12 }}>{z.account_number}</div>
                    </td>
                    <td>
                      {dest?.accountName ?? '—'}
                      <div className="mono muted" style={{ fontSize: 12 }}>
                        {dest?.bankAccountNumber ?? '—'} · {dest?.bankName ?? ''}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{z.invoice_number ?? '—'}</td>
                    <td className="num"><Money ngwee={z.amount_ngwee} plain /></td>
                    <td className="num">{z.service_ids?.length ?? 0}</td>
                    <td>
                      <span title={z.failure_reason ?? z.callback_status ?? undefined}>
                        <Badge value={z.status} />
                      </span>
                      {z.environment !== 'PRODUCTION' ? (
                        <span
                          title="Settled against the ZamPay sandbox (TEST), not live"
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            color: 'var(--copper, #b5651d)',
                            border: '1px solid currentColor',
                            borderRadius: 4,
                            padding: '1px 5px',
                            verticalAlign: 'middle',
                          }}
                        >
                          SANDBOX
                        </span>
                      ) : null}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{z.payment_reference ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {editing === z.id ? (
                        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Batch reference"
                            autoFocus
                            style={{ width: 140, padding: '3px 6px', border: '1px solid var(--line, #ccc)', borderRadius: 4, fontSize: 12 }}
                          />
                          <button className="btn sm" disabled={busy === z.id} onClick={() => void saveBatchRef(z.id)}>
                            {busy === z.id ? '…' : 'Save'}
                          </button>
                          <button className="btn sm" onClick={() => setEditing('')}>✕</button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className="mono">{z.bank_batch_reference ?? '—'}</span>
                          {canAct ? (
                            <button
                              className="btn sm"
                              onClick={() => { setEditing(z.id); setDraft(z.bank_batch_reference ?? ''); }}
                            >
                              {z.bank_batch_reference ? 'Edit' : 'Set'}
                            </button>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {canAct && z.status === 'FAILED' ? (
                        <button className="btn sm" disabled={busy === z.id} onClick={() => void retry(z.id)}>
                          {busy === z.id ? '…' : 'Retry'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
