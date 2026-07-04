'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, apiDelete, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';

interface MerchantUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  email_verified: boolean;
  roles: string[];
}
interface RoleDef {
  name: string;
  description: string;
}

const ROLE_LABEL: Record<string, string> = {
  MERCHANT_ADMIN: 'Admin',
  MERCHANT_INITIATOR: 'Initiator',
  MERCHANT_APPROVER: 'Approver',
  MERCHANT_VIEWER: 'Viewer',
};

function roleTag(role: string): ReactNode {
  const cls =
    role === 'MERCHANT_ADMIN' ? 'primary' : role === 'MERCHANT_APPROVER' ? 'ok' : role === 'MERCHANT_INITIATOR' ? 'info' : 'muted';
  return (
    <span key={role} className={`role-tag ${cls}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

export default function UsersPage(): ReactNode {
  const { principal } = useAuth();
  const users = useData<MerchantUser[]>('/v1/merchant/users');
  const roles = useData<RoleDef[]>('/v1/merchant/roles');

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // new-user form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [picked, setPicked] = useState<string[]>(['MERCHANT_INITIATOR']);

  const roleDefs = roles.data ?? [];

  function toggle(role: string): void {
    setPicked((cur) => (cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role]));
  }

  async function run(id: string, fn: () => Promise<void>): Promise<void> {
    setBusy(id);
    setErr('');
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const createUser = (): Promise<void> =>
    run('new', async () => {
      if (picked.length === 0) throw new ApiError(400, 'ERROR', 'Pick at least one role.');
      await apiPost('/v1/merchant/users', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        roles: picked,
      });
      setMsg(`Invited ${email.trim()} — a temporary password was emailed to them.`);
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setPicked(['MERCHANT_INITIATOR']);
      setOpen(false);
      users.reload();
    });

  const grant = (u: MerchantUser, role: string): Promise<void> =>
    run(u.id, async () => {
      await apiPost(`/v1/merchant/users/${u.id}/roles`, { role });
      users.reload();
    });

  const revoke = (u: MerchantUser, role: string): Promise<void> =>
    run(u.id, async () => {
      await apiDelete(`/v1/merchant/users/${u.id}/roles/${role}`);
      users.reload();
    });

  const setStatus = (u: MerchantUser, status: string): Promise<void> =>
    run(u.id, async () => {
      await apiPost(`/v1/merchant/users/${u.id}/status`, { status });
      users.reload();
    });

  const list = users.data ?? [];
  const canCreate = !!name.trim() && email.trim().includes('@') && password.length >= 8 && picked.length > 0;

  return (
    <>
      <PageHead
        title="User Management"
        subtitle="Add team members and assign roles — including who initiates and who approves payouts."
        actions={
          <button className="btn primary" onClick={() => { setOpen((o) => !o); setErr(''); setMsg(''); }}>
            {open ? 'Close' : 'Add user'}
          </button>
        }
      />

      {err ? <div className="err">{err}</div> : null}
      {msg ? (
        <div className="devhint" style={{ color: 'var(--success-deep)', background: '#e7f2ec', borderColor: '#cfe6da' }}>{msg}</div>
      ) : null}

      {open ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="grid cols-2" style={{ gap: 14 }}>
            <div className="field">
              <label>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grace Banda" />
            </div>
            <div className="field">
              <label>Email (their login)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="grace@business.co.zm" />
            </div>
            <div className="field">
              <label>Phone (optional)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="260975020473" />
            </div>
            <div className="field">
              <label>Temporary password</label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 4 }}>
            <label>Roles</label>
            <div className="role-picker">
              {roleDefs.map((r) => (
                <label key={r.name} className={`role-opt${picked.includes(r.name) ? ' on' : ''}`}>
                  <input type="checkbox" checked={picked.includes(r.name)} onChange={() => toggle(r.name)} />
                  <span>
                    <b>{ROLE_LABEL[r.name] ?? r.name}</b>
                    <span className="role-desc">{r.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button className="btn primary" disabled={!canCreate || busy === 'new'} onClick={() => void createUser()}>
            {busy === 'new' ? 'Inviting…' : 'Create user & send invite'}
          </button>
        </div>
      ) : null}

      <div className="card">
        {users.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : list.length === 0 ? (
          <Empty>No users yet. Use “Add user” to invite your team.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const self = u.id === principal.userId;
                const disabled = u.status === 'DISABLED';
                return (
                  <tr key={u.id} style={disabled ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 600 }}>{u.name}{self ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · you</span> : null}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                    <td>
                      <div className="role-cell">
                        {u.roles.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>none</span> : u.roles.map((r) => (
                          <span key={r} className="role-chip">
                            {roleTag(r)}
                            <button
                              className="role-x"
                              title="Remove role"
                              disabled={!!busy || (self && r === 'MERCHANT_ADMIN')}
                              onClick={() => void revoke(u, r)}
                            >×</button>
                          </span>
                        ))}
                        <RoleAdder
                          have={u.roles}
                          roles={roleDefs}
                          disabled={!!busy}
                          onAdd={(role) => void grant(u, role)}
                        />
                      </div>
                    </td>
                    <td><Badge value={u.status} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {self ? (
                        <span className="muted" style={{ fontSize: 12 }}>—</span>
                      ) : disabled ? (
                        <button className="btn sm" disabled={!!busy} onClick={() => void setStatus(u, 'ACTIVE')}>Activate</button>
                      ) : (
                        <button className="btn sm danger" disabled={!!busy} onClick={() => void setStatus(u, 'DISABLED')}>Disable</button>
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
        Payouts use maker-checker (SEC-Z4): an <b>Initiator</b> requests, a different <b>Approver</b> releases. An admin can do both,
        but never approves their own request.
      </p>

      <style jsx>{`
        .role-tag { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .role-tag.primary { background: #e6efff; color: #1c4fd6; }
        .role-tag.ok { background: #e7f2ec; color: #1f7a4d; }
        .role-tag.info { background: #eef0f6; color: #45507a; }
        .role-tag.muted { background: #f0f1f4; color: #6b7280; }
        .role-cell { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .role-chip { display: inline-flex; align-items: center; gap: 2px; }
        .role-x { border: none; background: none; cursor: pointer; color: #9aa2b5; font-size: 14px; line-height: 1; padding: 0 2px; }
        .role-x:disabled { opacity: 0.3; cursor: default; }
        .role-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .role-opt { display: flex; gap: 8px; align-items: flex-start; padding: 10px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
        .role-opt.on { border-color: var(--sky-deep); background: #f3f8ff; }
        .role-opt span { display: flex; flex-direction: column; font-size: 13px; }
        .role-desc { color: var(--slate); font-size: 12px; font-weight: 400; }
      `}</style>
    </>
  );
}

function RoleAdder({
  have,
  roles,
  disabled,
  onAdd,
}: {
  have: string[];
  roles: RoleDef[];
  disabled: boolean;
  onAdd: (role: string) => void;
}): ReactNode {
  const available = roles.filter((r) => !have.includes(r.name));
  if (available.length === 0) return null;
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => { if (e.target.value) onAdd(e.target.value); }}
      style={{ fontSize: 12, padding: '2px 6px', border: '1px dashed var(--line)', borderRadius: 6, color: 'var(--slate)' }}
    >
      <option value="">+ role</option>
      {available.map((r) => (
        <option key={r.name} value={r.name}>{ROLE_LABEL[r.name] ?? r.name}</option>
      ))}
    </select>
  );
}
