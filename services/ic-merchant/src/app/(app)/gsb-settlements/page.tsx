'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { Badge, Money, Spinner, Empty } from '@/components/ui';

interface Destination {
  bankAccountNumber?: string;
  accountName?: string;
  bankName?: string;
}
interface ZampaySettlement {
  id: string;
  instacom_bank_ref: string;
  bank_batch_reference: string | null;
  invoice_number: string | null;
  destination: Destination | null;
  amount_ngwee: string;
  currency: string;
  status: string;
  settled_at: string | null;
  created_at: string;
}

export default function GsbSettlementsPage(): ReactNode {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const path = applied.trim()
    ? `/v1/merchant/zampay/settlements?search=${encodeURIComponent(applied.trim())}`
    : '/v1/merchant/zampay/settlements';
  const { data, loading, error } = useData<ZampaySettlement[]>(path);

  return (
    <>
      <PageHead
        title="GSB Settlements"
        subtitle="Your government (GSB) settlements. Search by bank batch reference to see every settlement paid in one batch; each has its own InstacomPay reference (IBR)."
      />

      <form
        onSubmit={(e) => { e.preventDefault(); setApplied(q); }}
        style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by bank batch reference, IBR or invoice…"
          style={{ flex: '0 1 400px', padding: '8px 11px', border: '1px solid var(--line, #ccc)', borderRadius: 6, fontSize: 13 }}
        />
        <button className="btn primary" type="submit">Search</button>
        {applied ? (
          <button className="btn ghost" type="button" onClick={() => { setQ(''); setApplied(''); }}>Clear</button>
        ) : null}
        {applied ? <span className="muted" style={{ fontSize: 12 }}>Showing matches for “{applied}”</span> : null}
      </form>

      <div className="card">
        {loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : error ? (
          <Empty>Could not load GSB settlements. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>{applied ? `No settlements match “${applied}”.` : 'No GSB settlements yet.'}</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Instacom ref</th>
                <th>Bank batch ref</th>
                <th>Invoice</th>
                <th>Destination</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Settled</th>
              </tr>
            </thead>
            <tbody>
              {data.map((z) => (
                <tr key={z.id}>
                  <td className="mono" style={{ fontWeight: 600, fontSize: 12 }}>{z.instacom_bank_ref}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{z.bank_batch_reference ?? '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{z.invoice_number ?? '—'}</td>
                  <td>
                    {z.destination?.accountName ?? '—'}
                    <div className="mono muted" style={{ fontSize: 12 }}>
                      {z.destination?.bankAccountNumber ?? '—'} · {z.destination?.bankName ?? ''}
                    </div>
                  </td>
                  <td className="num"><Money ngwee={z.amount_ngwee} plain /></td>
                  <td><Badge value={z.status} /></td>
                  <td className="mono" style={{ fontSize: 12 }}>{z.settled_at ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
