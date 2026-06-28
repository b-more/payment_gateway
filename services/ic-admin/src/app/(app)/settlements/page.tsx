'use client';

import type { ReactNode } from 'react';
import { useData } from '@/lib/useData';
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

export default function SettlementsPage(): ReactNode {
  const { data, loading, error } = useData<Settlement[]>('/v1/admin/settlements');

  return (
    <>
      <PageHead title="Settlements" subtitle="Settlement runs and bank payouts." />
      <div className="card">
        {loading ? (
          <div className="card-pad">
            <Spinner />
          </div>
        ) : error ? (
          <Empty>Could not load settlements. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No settlements yet. Run the settlement job to generate them.</Empty>
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
                  <td className="num">
                    <Money ngwee={s.amount} plain />
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.settled_at ?? '—'}</td>
                  <td>
                    <Badge value={s.status} />
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
