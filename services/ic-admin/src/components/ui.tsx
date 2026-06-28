'use client';

import type { ReactNode } from 'react';
import { zmw } from '../lib/format';

export function Money({ ngwee, plain }: { ngwee: string | number | null; plain?: boolean }): ReactNode {
  return <span className="mono">{plain ? zmw(ngwee).replace('ZMW ', '') : zmw(ngwee)}</span>;
}

const STATUS_CLASS: Record<string, string> = {
  SUCCESS: 'b-success',
  SETTLED: 'b-success',
  APPROVED: 'b-success',
  ACTIVE: 'b-success',
  PRODUCTION: 'b-success',
  PENDING: 'b-pending',
  PENDING_APPROVAL: 'b-pending',
  PROCESSING: 'b-pending',
  SANDBOX: 'b-pending',
  FAILED: 'b-failed',
  REJECTED: 'b-failed',
  GIVEN_UP: 'b-failed',
  REVERSED: 'b-neutral',
  EXPIRED: 'b-neutral',
};

export function Badge({ value }: { value: string }): ReactNode {
  return <span className={`badge ${STATUS_CLASS[value] ?? 'b-neutral'}`}>{value.replace(/_/g, ' ')}</span>;
}

export function StatCard({
  label,
  value,
  sub,
  copper,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  copper?: boolean;
}): ReactNode {
  return (
    <div className={`stat${copper ? ' copper' : ''}`}>
      <div className="eyebrow">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Spinner(): ReactNode {
  return <div className="spinner" aria-label="Loading" role="status" />;
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <div className="empty">{children}</div>;
}

export function BarList({
  items,
  render,
}: {
  items: Array<{ key: string; label: string; value: number; caption: string }>;
  render?: (item: { key: string; label: string; value: number; caption: string }) => ReactNode;
}): ReactNode {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <Empty>No data yet</Empty>;
  return (
    <div className="barlist">
      {items.map((item) => (
        <div className="bar-row" key={item.key}>
          <span>{item.label}</span>
          <span className="track">
            <span className="fill" style={{ width: `${Math.round((item.value / max) * 100)}%` }} />
          </span>
          <span className="bv">{render ? render(item) : item.caption}</span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ points }: { points: number[] }): ReactNode {
  if (points.length < 2) return <Empty>Not enough data for a trend</Empty>;
  const w = 560;
  const h = 90;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - ((p - min) / span) * (h - 12) - 6).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Collections trend">
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="rgba(14,92,67,0.08)" stroke="none" />
      <path d={path} fill="none" stroke="#0e5c43" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
