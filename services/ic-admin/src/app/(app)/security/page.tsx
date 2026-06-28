'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_scope: string | null;
  action: string;
  target: string | null;
  ip_address: string | null;
  created_at: string;
}
interface Session {
  id: string;
  user_id: string;
  email: string;
  name: string;
  scope: string;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
}

export default function SecurityPage(): ReactNode {
  const [action, setAction] = useState('');
  const [applied, setApplied] = useState('');
  const logs = useData<AuditLog[]>(`/v1/admin/audit-logs${applied ? `?action=${encodeURIComponent(applied)}` : ''}`);
  const sessions = useData<Session[]>('/v1/admin/sessions');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function revoke(id: string): Promise<void> {
    setBusy(id);
    setErr('');
    try {
      await apiPost(`/v1/admin/sessions/${id}/revoke`);
      sessions.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not revoke session.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHead title="Security" subtitle="Audit trail, active sessions and access controls." />
      {err ? <div className="err">{err}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow">Active sessions</span>
        </div>
        {sessions.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : !sessions.data || sessions.data.length === 0 ? (
          <Empty>No active sessions.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>User</th><th>Realm</th><th>IP</th><th>Started</th><th>Expires</th><th /></tr>
            </thead>
            <tbody>
              {sessions.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--slate)' }}>{s.email}</div>
                  </td>
                  <td>{s.scope}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.ip_address ?? '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.created_at}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.expires_at}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sm danger" disabled={busy === s.id} onClick={() => void revoke(s.id)}>
                      {busy === s.id ? '…' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span className="eyebrow">Audit log · append-only</span>
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => { e.preventDefault(); setApplied(action.trim().toUpperCase()); }}
          >
            <input
              className="mono"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="filter action e.g. FLOAT_CREDIT"
              style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, width: 220 }}
            />
            <button className="btn sm">Filter</button>
            {applied ? (
              <button type="button" className="btn sm" onClick={() => { setAction(''); setApplied(''); }}>Reset</button>
            ) : null}
          </form>
        </div>
        {logs.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : !logs.data || logs.data.length === 0 ? (
          <Empty>No audit entries{applied ? ` for ${applied}` : ''}.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th></tr>
            </thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{l.created_at}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{l.actor_scope ?? '—'} {l.actor_id ? shortId(l.actor_id) : ''}</td>
                  <td><Badge value={l.action} /></td>
                  <td className="id">{l.target ? shortId(l.target) : '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{l.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
