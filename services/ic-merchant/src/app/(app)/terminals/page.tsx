'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';

interface Device {
  id: string;
  account_id: string;
  account_number: string;
  label: string;
  serial_number: string | null;
  environment: string;
  status: string;
  last_seen_at: string | null;
  activated_at: string | null;
  created_at: string;
}
interface Account {
  id: string;
  account_number: string;
  account_type: string;
  operating_mode: string;
}
interface RegisterResult {
  device_id: string;
  label: string;
  activation_code: string;
  activation_expires_at: string;
}

function SandboxTag(): ReactNode {
  return (
    <span
      title="Terminal transacts against the sandbox (TEST), not live"
      style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: 'var(--copper, #b5651d)', border: '1px solid currentColor', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' }}
    >
      SANDBOX
    </span>
  );
}

export default function TerminalsPage(): ReactNode {
  const { principal } = useAuth();
  const canManage = principal.roles.includes('MERCHANT_ADMIN');

  const devices = useData<Device[]>('/v1/merchant/devices');
  const accounts = useData<Account[]>('/v1/merchant/accounts');

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState<RegisterResult | null>(null);
  const [copied, setCopied] = useState(false);

  const collectionAccounts = (accounts.data ?? []).filter((a) => a.account_type === 'COLLECTION');
  const list = devices.data ?? [];

  async function run(id: string, fn: () => Promise<void>): Promise<void> {
    setBusy(id);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const register = (): Promise<void> =>
    run('new', async () => {
      const res = await apiPost<RegisterResult>('/v1/merchant/devices', { accountId, label: label.trim() });
      setIssued(res);
      setCopied(false);
      setLabel('');
      setOpen(false);
      devices.reload();
    });

  const revoke = (d: Device): Promise<void> =>
    run(d.id, async () => {
      await apiPost(`/v1/merchant/devices/${d.id}/revoke`, {});
      devices.reload();
    });

  const canRegister = !!accountId && label.trim().length > 0;

  return (
    <>
      <PageHead
        title="Terminals"
        subtitle="Register and manage your Z100 SmartPOS terminals. Each terminal is activated once with a one-time code and can be revoked at any time."
        actions={
          canManage ? (
            <button className="btn primary" onClick={() => { setOpen((o) => !o); setErr(''); setIssued(null); }}>
              {open ? 'Close' : 'Register terminal'}
            </button>
          ) : undefined
        }
      />

      {err ? <div className="err">{err}</div> : null}

      {/* One-time activation code — shown once, right after registering. */}
      {issued ? (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--sky-deep, #1c4fd6)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Terminal “{issued.label}” registered</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Enter this one-time activation code on the terminal to link it. It is shown <b>once</b> and expires{' '}
            {new Date(issued.activation_expires_at).toLocaleString()}.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, padding: '10px 16px', background: 'var(--panel, #f3f8ff)', borderRadius: 8, border: '1px solid var(--line)' }}>
              {issued.activation_code}
            </code>
            <button
              className="btn sm"
              onClick={() => { void navigator.clipboard?.writeText(issued.activation_code); setCopied(true); }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn sm" onClick={() => setIssued(null)}>Done</button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          {collectionAccounts.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>You need a COLLECTION account before you can register a terminal.</p>
          ) : (
            <div className="grid cols-2" style={{ gap: 14 }}>
              <div className="field">
                <label>Collection account</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Select an account…</option>
                  {collectionAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_number} · {a.operating_mode}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Terminal label</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Till 3 - Kabwata" maxLength={80} />
              </div>
            </div>
          )}
          <button className="btn primary" disabled={!canRegister || busy === 'new'} onClick={() => void register()}>
            {busy === 'new' ? 'Registering…' : 'Register & get code'}
          </button>
        </div>
      ) : null}

      <div className="card">
        {devices.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : list.length === 0 ? (
          <Empty>No terminals yet. Use “Register terminal” to add your first Z100.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Terminal</th><th>Account</th><th>Serial</th><th>Status</th><th>Last seen</th><th /></tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const revoked = d.status === 'REVOKED';
                return (
                  <tr key={d.id} style={revoked ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 600 }}>
                      {d.label}
                      {d.environment !== 'LIVE' ? <SandboxTag /> : null}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{d.account_number}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{d.serial_number ?? '—'}</td>
                    <td><Badge value={d.status} /></td>
                    <td className="muted" style={{ fontSize: 12 }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage && !revoked ? (
                        <button className="btn sm danger" disabled={busy === d.id} onClick={() => void revoke(d)}>
                          {busy === d.id ? '…' : 'Revoke'}
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        A <b>PENDING</b> terminal is registered but not yet activated. Activate it by entering its one-time code on the Z100.
        Revoking a terminal disables its credentials immediately.
      </p>
    </>
  );
}
