'use client';

import type { ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { StatCard, Spinner, Empty } from '@/components/ui';
import { zmw } from '@/lib/format';

interface Commission {
  allTime: string;
  thisMonth: string;
  collections: number;
  byRail: Array<{ processor: string; commission: string; collections: number }>;
  byMerchant: Array<{ merchant: string; commission: string; collections: number }>;
}

export default function CommissionPage(): ReactNode {
  const { data, loading, error } = useData<Commission>('/v1/admin/commission');

  if (loading) return <Spinner />;
  if (error || !data) return <Empty>Could not load commission. {error}</Empty>;

  const empty = data.collections === 0;

  return (
    <>
      <PageHead
        title="Commission"
        subtitle="The fee Instacom keeps on each successful live collection. Sandbox, failed and reversed transactions earn nothing."
      />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <StatCard label="Commission Earned" value={zmw(data.allTime)} sub="All time" />
        <StatCard label="This Month" value={zmw(data.thisMonth)} sub="Since the 1st" />
        <StatCard label="Earning Collections" value={data.collections.toLocaleString()} sub="Successful live collections" />
      </div>

      {empty ? (
        <Empty>No live commission earned yet.</Empty>
      ) : (
        <div className="grid cols-2">
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 4 }}>
              <div className="eyebrow">By rail</div>
            </div>
            <table className="table">
              <thead>
                <tr><th>Rail</th><th className="num">Collections</th><th className="num">Commission</th></tr>
              </thead>
              <tbody>
                {data.byRail.map((r) => (
                  <tr key={r.processor}>
                    <td>{r.processor}</td>
                    <td className="num">{r.collections.toLocaleString()}</td>
                    <td className="num">{zmw(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 4 }}>
              <div className="eyebrow">By merchant</div>
            </div>
            <table className="table">
              <thead>
                <tr><th>Merchant</th><th className="num">Collections</th><th className="num">Commission</th></tr>
              </thead>
              <tbody>
                {data.byMerchant.map((r) => (
                  <tr key={r.merchant}>
                    <td>{r.merchant}</td>
                    <td className="num">{r.collections.toLocaleString()}</td>
                    <td className="num">{zmw(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Need a dated statement?</div>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Go to <b>Reports</b> and create a <b>Commission</b> report for a date range. It downloads as CSV
          or a branded PDF with the per-rail breakdown.
        </p>
      </div>
    </>
  );
}
