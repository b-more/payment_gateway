'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { StatCard, Money, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface Notifications {
  counts: {
    lowFloat: number;
    givenUpWebhooks: number;
    disputes: number;
    pendingApprovals: number;
    failedSettlements: number;
    lockouts: number;
  };
  lowFloat: Array<{ account_id: string; merchant: string; float_balance: string; low_float_threshold: string }>;
  givenUpWebhooks: Array<{ id: string; transaction_id: string; url: string; attempt: number; created_at: string }>;
  disputes: Array<{ id: string; transaction_id: string; internal_status: string; processor_status: string; created_at: string }>;
  pendingApprovals: Array<{ id: string; account_id: string; amount: string; created_at: string }>;
  failedSettlements: Array<{ id: string; account_id: string; amount: string; created_at: string }>;
  lockouts: Array<{ id: string; email: string; locked_until: string }>;
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }): ReactNode {
  if (count === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="eyebrow">{title} · {count}</span>
      </div>
      {children}
    </div>
  );
}

export default function NotificationsPage(): ReactNode {
  const { data, loading, error } = useData<Notifications>('/v1/admin/notifications');
  if (loading) return <Spinner />;
  if (error || !data) return <Empty>Could not load notifications. {error}</Empty>;
  const c = data.counts;
  const total = Object.values(c).reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHead title="Notifications" subtitle="System alerts that need attention." />

      {total === 0 ? (
        <div className="card card-pad"><Empty>All clear — no active alerts.</Empty></div>
      ) : null}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <StatCard label="Pending approvals" value={c.pendingApprovals} copper={c.pendingApprovals > 0} />
        <StatCard label="Low float accounts" value={c.lowFloat} copper={c.lowFloat > 0} />
        <StatCard label="Webhooks given up" value={c.givenUpWebhooks} copper={c.givenUpWebhooks > 0} />
        <StatCard label="Reconciliation disputes" value={c.disputes} copper={c.disputes > 0} />
        <StatCard label="Failed settlements" value={c.failedSettlements} copper={c.failedSettlements > 0} />
        <StatCard label="Account lockouts" value={c.lockouts} copper={c.lockouts > 0} />
      </div>

      <Section title="Pending float approvals (dual control)" count={c.pendingApprovals}>
        <table className="table">
          <thead><tr><th>Account</th><th className="num">Amount</th><th>Requested</th><th /></tr></thead>
          <tbody>
            {data.pendingApprovals.map((x) => (
              <tr key={x.id}>
                <td className="id">{shortId(x.account_id)}</td>
                <td className="num"><Money ngwee={x.amount} plain /></td>
                <td className="mono" style={{ fontSize: 12 }}>{x.created_at}</td>
                <td style={{ textAlign: 'right' }}><Link className="btn sm" href="/float">Review</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Low float accounts" count={c.lowFloat}>
        <table className="table">
          <thead><tr><th>Merchant</th><th>Account</th><th className="num">Balance</th><th className="num">Threshold</th><th /></tr></thead>
          <tbody>
            {data.lowFloat.map((x) => (
              <tr key={x.account_id}>
                <td style={{ fontWeight: 600 }}>{x.merchant}</td>
                <td className="id">{shortId(x.account_id)}</td>
                <td className="num"><Money ngwee={x.float_balance} plain /></td>
                <td className="num"><Money ngwee={x.low_float_threshold} plain /></td>
                <td style={{ textAlign: 'right' }}><Link className="btn sm" href={`/accounts/${x.account_id}`}>Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Webhooks given up" count={c.givenUpWebhooks}>
        <table className="table">
          <thead><tr><th>Transaction</th><th>URL</th><th className="num">Attempts</th><th>When</th></tr></thead>
          <tbody>
            {data.givenUpWebhooks.map((x) => (
              <tr key={x.id}>
                <td className="id">{shortId(x.transaction_id)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{x.url}</td>
                <td className="num">{x.attempt}</td>
                <td className="mono" style={{ fontSize: 12 }}>{x.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Reconciliation disputes" count={c.disputes}>
        <table className="table">
          <thead><tr><th>Transaction</th><th>Internal</th><th>Processor</th><th>When</th></tr></thead>
          <tbody>
            {data.disputes.map((x) => (
              <tr key={x.id}>
                <td className="id">{shortId(x.transaction_id)}</td>
                <td>{x.internal_status}</td>
                <td>{x.processor_status}</td>
                <td className="mono" style={{ fontSize: 12 }}>{x.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Failed settlements" count={c.failedSettlements}>
        <table className="table">
          <thead><tr><th>Settlement</th><th>Account</th><th className="num">Amount</th><th>When</th></tr></thead>
          <tbody>
            {data.failedSettlements.map((x) => (
              <tr key={x.id}>
                <td className="id">{shortId(x.id)}</td>
                <td className="id">{shortId(x.account_id)}</td>
                <td className="num"><Money ngwee={x.amount} plain /></td>
                <td className="mono" style={{ fontSize: 12 }}>{x.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Account lockouts" count={c.lockouts}>
        <table className="table">
          <thead><tr><th>User</th><th>Locked until</th></tr></thead>
          <tbody>
            {data.lockouts.map((x) => (
              <tr key={x.id}>
                <td className="mono" style={{ fontSize: 12 }}>{x.email}</td>
                <td className="mono" style={{ fontSize: 12 }}>{x.locked_until}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
