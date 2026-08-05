'use client';

import type { ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { StatCard, BarList, Sparkline, Spinner, Empty } from '@/components/ui';
import { zmw } from '@/lib/format';

interface Dashboard {
  totalCollections: string;
  totalCommission: string;
  totalVolume: number;
  successRate: string;
  byProcessor: Array<{ processor: string; count: number; amount: string }>;
  byStatus: Array<{ status: string; count: number }>;
  trend: Array<{ day: string; amount: string }>;
}

export default function DashboardPage(): ReactNode {
  const { data, loading, error } = useData<Dashboard>('/v1/admin/dashboard');

  if (loading) return <Spinner />;
  if (error || !data) return <Empty>Could not load the dashboard. {error}</Empty>;

  return (
    <>
      <PageHead title="Dashboard" subtitle="Collections, volume and success across all merchants." />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Total Collections" value={zmw(data.totalCollections)} sub="Successful collections" />
        <StatCard label="Commission Earned" value={zmw(data.totalCommission)} sub="Charge on live collections" />
        <StatCard label="Total Volume" value={data.totalVolume.toLocaleString()} sub="All transactions" />
        <StatCard label="Success Rate" value={`${data.successRate}%`} sub="Across all statuses" copper={Number(data.successRate) < 90} />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Collections trend · last 30 days</div>
        <Sparkline points={data.trend.map((t) => Number(t.amount))} />
      </div>

      <div className="grid cols-2">
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Distribution by Processor</div>
          <BarList
            items={data.byProcessor.map((p) => ({
              key: p.processor,
              label: p.processor,
              value: p.count,
              caption: `${p.count} · ${zmw(p.amount)}`,
            }))}
          />
        </div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Distribution by Status</div>
          <BarList
            items={data.byStatus.map((s) => ({
              key: s.status,
              label: s.status,
              value: s.count,
              caption: String(s.count),
            }))}
          />
        </div>
      </div>
    </>
  );
}
