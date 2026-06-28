'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/useData';
import { PageHead } from '@/components/shell';
import { StatCard, Badge, Spinner, Empty } from '@/components/ui';
import { zmw } from '@/lib/format';

// Platform-level reference configuration. Per-account charge config, callback
// URLs and operating mode live on each Account → Config screen; this page is the
// system-wide view of the rails, money model and security policy (§6.1.2).

const TABS = ['Platform', 'Payment Rails', 'Charge Model', 'Security'] as const;
type Tab = (typeof TABS)[number];

const PROCESSORS: Array<{ key: string; label: string; kind: string }> = [
  { key: 'MTN', label: 'MTN MoMo', kind: 'Mobile money' },
  { key: 'AIRTEL', label: 'Airtel Money', kind: 'Mobile money' },
  { key: 'ZAMTEL', label: 'Zamtel Kwacha', kind: 'Mobile money' },
  { key: 'ZED_MOBILE', label: 'Zed Mobile', kind: 'Mobile money' },
  { key: 'VISA', label: 'Visa', kind: 'Card' },
];

interface Dashboard {
  totalVolume: number;
  byProcessor: Array<{ processor: string; count: number; amount: string }>;
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="kv">
      <div className="kv-label">{label}</div>
      <div className="kv-value">{children}</div>
    </div>
  );
}

export default function SettingsPage(): ReactNode {
  const [tab, setTab] = useState<Tab>('Platform');
  const dash = useData<Dashboard>('/v1/admin/dashboard');

  const byProc = new Map((dash.data?.byProcessor ?? []).map((p) => [p.processor, p]));
  const liveRails = PROCESSORS.filter((p) => (byProc.get(p.key)?.count ?? 0) > 0).length;

  return (
    <>
      <PageHead
        title="Settings"
        subtitle="Platform configuration — payment rails, money model and security policy."
        actions={
          <div className="seg" role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`seg-btn${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        }
      />

      {tab === 'Platform' ? (
        <>
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <StatCard label="Settlement Currency" value="ZMW" sub="Zambian Kwacha" />
            <StatCard label="Active Rails" value={`${liveRails} / ${PROCESSORS.length}`} sub="Processors with volume" />
            <StatCard
              label="Lifetime Volume"
              value={dash.loading ? '—' : (dash.data?.totalVolume ?? 0).toLocaleString()}
              sub="All transactions"
            />
          </div>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Organisation</div>
            <Row label="Legal entity">Instacom Payment Solutions Limited</Row>
            <Row label="Jurisdiction">Lusaka, Zambia</Row>
            <Row label="Settlement currency">ZMW — Zambian Kwacha</Row>
            <Row label="Money representation">
              <span className="mono">bigint</span> ngwee (integer minor units · no floating point)
            </Row>
            <Row label="Time zone">Africa/Lusaka (CAT, UTC+02:00)</Row>
          </div>
        </>
      ) : null}

      {tab === 'Payment Rails' ? (
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="eyebrow">Collection rails</span>
          </div>
          {dash.loading ? (
            <div className="card-pad"><Spinner /></div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Processor</th><th>Type</th><th>Status</th><th>Transactions</th><th style={{ textAlign: 'right' }}>Volume</th></tr>
              </thead>
              <tbody>
                {PROCESSORS.map((p) => {
                  const stats = byProc.get(p.key);
                  const live = (stats?.count ?? 0) > 0;
                  return (
                    <tr key={p.key}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.label}</div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--slate)' }}>{p.key}</div>
                      </td>
                      <td>{p.kind}</td>
                      <td><Badge value={live ? 'ACTIVE' : 'SANDBOX'} /></td>
                      <td className="mono">{stats?.count ?? 0}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{zmw(stats?.amount ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="card-pad" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Per-account charge config, callback URLs and IP whitelists are managed per merchant under{' '}
              <Link href="/merchants">Merchants → Account → Config</Link>.
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'Charge Model' ? (
        <div className="grid cols-2">
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Operating modes</div>
            <Row label="SANDBOX">Simulated processor; no real money movement. Default for new accounts.</Row>
            <Row label="PRODUCTION">Live rails. Set per account once KYC is approved and float is funded.</Row>
          </div>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Charge types</div>
            <Row label="FIXED">Flat fee in ngwee per transaction.</Row>
            <Row label="PERCENTAGE">Percent of transaction amount (integer-safe rounding).</Row>
            <Row label="TIERED">Banded fee by amount range.</Row>
          </div>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Charge fulfiller</div>
            <Row label="SOURCE">Fee deducted from the collected amount.</Row>
            <Row label="MERCHANT">Fee billed to the merchant; payer is charged the full amount.</Row>
          </div>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Float &amp; ledger</div>
            <Row label="Accounting">Double-entry float ledger with row-locked spend (TXN-1).</Row>
            <Row label="Float credits">Dual-control: requested, then approved by a second admin (FLOAT-3).</Row>
            <Row label="Reversals">Booked as compensating entries, never deletions (STATE-3).</Row>
          </div>
        </div>
      ) : null}

      {tab === 'Security' ? (
        <div className="grid cols-2">
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Session &amp; sign-in policy</div>
            <Row label="Access token TTL">15 minutes (rotating JWT)</Row>
            <Row label="Refresh token TTL">7 days · single-use, rotated on refresh</Row>
            <Row label="Two-factor">Email OTP on every sign-in · 6 digits</Row>
            <Row label="OTP validity">5 minutes · one-time use</Row>
            <Row label="Account lockout">After 5 failed attempts · 15-minute lock</Row>
            <Row label="Realm separation">Admin and merchant sessions are isolated (SEC-A4)</Row>
          </div>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Credentials &amp; data</div>
            <Row label="Passwords">Argon2id hashed, never reversible (NN-7)</Row>
            <Row label="API secret">Stored hashed; verified by argon2 (SEC-A2)</Row>
            <Row label="API signing key">AES-256-GCM encrypted at rest (SEC-API2)</Row>
            <Row label="Audit trail">Append-only — see <Link href="/security">Security</Link></Row>
            <Row label="Backups">AES-256 encrypted pg_dump with tested restore (SEC-B1)</Row>
          </div>
        </div>
      ) : null}

      {dash.error && tab !== 'Charge Model' && tab !== 'Security' ? (
        <Empty>Could not load live figures. {dash.error}</Empty>
      ) : null}
    </>
  );
}
