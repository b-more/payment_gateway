'use client';

import type { ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { Badge, Money, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface Account {
  id: string;
  account_type: string;
  operating_mode: string;
  status: string;
  float_balance: string;
  callback_url: string | null;
  created_at: string;
}

export default function AccountsPage(): ReactNode {
  const { data, loading, error } = useData<Account[]>('/v1/merchant/accounts');

  return (
    <>
      <PageHead title="Accounts" subtitle="Your collection, disbursement and bank accounts." />
      <div className="card">
        {loading ? (
          <div className="card-pad">
            <Spinner />
          </div>
        ) : error ? (
          <Empty>Could not load accounts. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No accounts yet. Once approved, your accounts appear here.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Type</th>
                <th>Mode</th>
                <th className="num">Float</th>
                <th>Webhook</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="id">{shortId(a.id)}</td>
                  <td>{a.account_type}</td>
                  <td>
                    <Badge value={a.operating_mode} />
                  </td>
                  <td className="num">
                    <Money ngwee={a.float_balance} plain />
                  </td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--slate)' }}>
                    {a.callback_url ? 'configured' : '—'}
                  </td>
                  <td>
                    <Badge value={a.status} />
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
