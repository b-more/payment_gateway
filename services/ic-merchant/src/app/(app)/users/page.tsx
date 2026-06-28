'use client';

import type { ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';

interface MerchantUser {
  id: string;
  name: string;
  email: string;
  status: string;
  email_verified: boolean;
}

export default function UsersPage(): ReactNode {
  const { data, loading, error } = useData<MerchantUser[]>('/v1/merchant/users');

  return (
    <>
      <PageHead title="User Management" subtitle="Sub-users under your merchant account." />
      <div className="card">
        {loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : error ? (
          <Empty>Could not load users. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No users yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Verified</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.email_verified ? 'yes' : 'no'}</td>
                  <td>
                    <Badge value={u.status} />
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
