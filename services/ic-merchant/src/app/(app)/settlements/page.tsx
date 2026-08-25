'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { downloadFile } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Money, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface Settlement {
  id: string;
  account_id: string;
  amount: string;
  status: string;
  settled_at: string | null;
  created_at: string;
}

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

export default function SettlementsPage(): ReactNode {
  const { data, loading, error } = useData<Settlement[]>('/v1/merchant/settlements');

  // GSB (ZamPay) settlements — shown only for merchants that have them.
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const gsbPath = applied.trim()
    ? `/v1/merchant/zampay/settlements?search=${encodeURIComponent(applied.trim())}`
    : '/v1/merchant/zampay/settlements';
  const gsb = useData<ZampaySettlement[]>(gsbPath);
  const showGsb = (gsb.data != null && gsb.data.length > 0) || applied.trim().length > 0;

  return (
    <>
      <PageHead title="Settlements" subtitle="Your settlement history and payout status." />

      <div className="card">
        {loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : error ? (
          <Empty>Could not load settlements. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No settlements yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Settlement</th>
                <th>Account</th>
                <th className="num">Amount</th>
                <th>Settled</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td className="id">{shortId(s.id)}</td>
                  <td className="id">{shortId(s.account_id)}</td>
                  <td className="num"><Money ngwee={s.amount} plain /></td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.settled_at ?? '—'}</td>
                  <td><Badge value={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showGsb ? (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>GSB settlements</h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
            Government (GSB) settlements. Search by bank batch reference to see every settlement paid in one
            batch; each has its own InstacomPay reference (IBR).
          </p>

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
            <span style={{ flex: 1 }} />
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                const qs = applied.trim() ? `?search=${encodeURIComponent(applied.trim())}` : '';
                void downloadFile(`/v1/merchant/zampay/settlements/export${qs}`, 'gsb-settlements.csv');
              }}
            >
              Export CSV
            </button>
          </form>

          <div className="card">
            {gsb.loading ? (
              <div className="card-pad"><Spinner /></div>
            ) : gsb.error ? (
              <Empty>Could not load GSB settlements. {gsb.error}</Empty>
            ) : !gsb.data || gsb.data.length === 0 ? (
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
                  {gsb.data.map((z) => (
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
        </section>
      ) : null}
    </>
  );
}
