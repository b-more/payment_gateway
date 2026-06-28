'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { Badge, Money, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface Txn {
  id: string;
  processor: string;
  msisdn: string | null;
  amount: string;
  charge: string;
  status: string;
  collection_reference: string | null;
  created_at: string;
}

export default function TransactionsPage(): ReactNode {
  const [msisdn, setMsisdn] = useState('');
  const [query, setQuery] = useState('');
  const path = `/v1/merchant/transactions${query ? `?msisdn=${encodeURIComponent(query)}` : ''}`;
  const { data, loading, error } = useData<Txn[]>(path);

  return (
    <>
      <PageHead
        title="Transactions"
        subtitle="Your collection history. Search by customer MSISDN."
        actions={
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(msisdn.trim());
            }}
          >
            <input
              className="mono"
              placeholder="260970000000"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 7 }}
            />
            <button className="btn sm">Search</button>
            {query ? (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setMsisdn('');
                  setQuery('');
                }}
              >
                Reset
              </button>
            ) : null}
          </form>
        }
      />
      <div className="card">
        {loading ? (
          <div className="card-pad">
            <Spinner />
          </div>
        ) : error ? (
          <Empty>Could not load transactions. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No transactions match.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Reference</th>
                <th>Processor</th>
                <th className="num">Amount</th>
                <th className="num">Charge</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td className="id">{shortId(t.id)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{t.collection_reference ?? '—'}</td>
                  <td>{t.processor}</td>
                  <td className="num">
                    <Money ngwee={t.amount} plain />
                  </td>
                  <td className="num">
                    <Money ngwee={t.charge} plain />
                  </td>
                  <td>
                    <Badge value={t.status} />
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
