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
  bicCode?: string;
  sortCode?: string;
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
  bank_reference: string | null;
  callback_status: string | null;
  failure_reason: string | null;
  wired_at: string | null;
  settled_at: string | null;
  created_at: string;
  account_number: string;
  merchant_name: string | null;
}

export default function ZampayPage(): ReactNode {
  const { principal } = useAuth();
  const canAct = principal.roles.includes('ADMIN') || principal.roles.includes('FINANCE');

  const { data, loading, error, reload } = useData<ZampaySettlement[]>('/v1/admin/zampay/settlements');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [wireId, setWireId] = useState('');
  const [wireRef, setWireRef] = useState('');

  if (loading) return <Spinner />;
  if (error || !data) return <Empty>Could not load ZamPay settlements. {error}</Empty>;

  const count = (s: string): number => data.filter((z) => z.status === s).length;

  async function confirmWire(id: string): Promise<void> {
    if (!wireRef.trim()) {
      setMsg('Enter the bank wire reference first.');
      return;
    }
    setBusy(id);
    setMsg('');
    setOk('');
    try {
      await apiPost(`/v1/admin/zampay/settlements/${id}/confirm-wire`, { bankReference: wireRef.trim() });
      setOk('Wire confirmed. The settlement callback will be sent to ZamPay on the next run.');
      setWireId('');
      setWireRef('');
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Could not confirm the wire.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHead
        title="ZamPay Settlements"
        subtitle="Government (GSB) collections awaiting settlement. Wire the funds to the destination account, enter the reference, and the callback is sent to ZamPay."
      />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Ready to wire" value={String(count('READY_TO_WIRE'))} sub="Awaiting the bank transfer" copper={count('READY_TO_WIRE') > 0} />
        <StatCard label="Wired" value={String(count('WIRED'))} sub="Callback pending" />
        <StatCard label="Settled" value={String(count('SETTLED'))} sub="Callback acknowledged" />
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
                <th className="num">Amount</th>
                <th className="num">Services</th>
                <th>Status</th>
                <th>Reference</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((z) => {
                const dest = z.destination;
                const isWireRow = wireId === z.id;
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
                    <td className="num"><Money ngwee={z.amount_ngwee} plain /></td>
                    <td className="num">{z.service_ids?.length ?? 0}</td>
                    <td>
                      <span title={z.failure_reason ?? z.callback_status ?? undefined}>
                        <Badge value={z.status} />
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{z.bank_reference ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canAct && z.status === 'READY_TO_WIRE' ? (
                        isWireRow ? (
                          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <input
                              className="mono"
                              style={{ width: 190 }}
                              placeholder="Bank wire reference"
                              value={wireRef}
                              onChange={(e) => setWireRef(e.target.value)}
                            />
                            <button className="btn sm primary" disabled={busy === z.id} onClick={() => void confirmWire(z.id)}>
                              {busy === z.id ? '…' : 'Confirm'}
                            </button>
                            <button className="btn sm" onClick={() => { setWireId(''); setWireRef(''); }}>Cancel</button>
                          </div>
                        ) : (
                          <button className="btn sm" onClick={() => { setWireId(z.id); setWireRef(''); setMsg(''); }}>
                            Confirm wire
                          </button>
                        )
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
