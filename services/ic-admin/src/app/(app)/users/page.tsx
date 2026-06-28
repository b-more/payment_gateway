'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, apiDelete, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';

interface AdminUser {
  id: string;
  scope: string;
  name: string;
  email: string;
  status: string;
  email_verified: boolean;
  roles: string[];
}
interface Role {
  name: string;
  description: string | null;
  is_custom: boolean;
}

export default function UsersPage(): ReactNode {
  const users = useData<AdminUser[]>('/v1/admin/users?scope=SYSTEM');
  const roles = useData<Role[]>('/v1/admin/roles');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const roleNames = (roles.data ?? []).map((r) => r.name);

  function refresh(): void {
    users.reload();
    roles.reload();
  }

  return (
    <>
      <PageHead
        title="User Management"
        subtitle="System users, roles and permissions."
        actions={
          <button className="btn primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : '+ Add User'}
          </button>
        }
      />
      {err ? <div className="err">{err}</div> : null}

      {creating ? (
        <AddUser roleNames={roleNames} onDone={() => { setCreating(false); refresh(); }} onError={setErr} />
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        {users.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : !users.data || users.data.length === 0 ? (
          <Empty>No system users yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Verified</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Assign</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.email_verified ? 'yes' : 'no'}</td>
                  <td><Badge value={u.status} /></td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {u.roles.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>none</span> : null}
                      {u.roles.map((r) => (
                        <RoleChip key={r} userId={u.id} role={r} onChange={refresh} onError={setErr} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <AssignRole userId={u.id} roleNames={roleNames} current={u.roles} onChange={refresh} onError={setErr} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Roles roles={roles.data ?? []} loading={roles.loading} onChange={refresh} onError={setErr} />
    </>
  );
}

function RoleChip({ userId, role, onChange, onError }: { userId: string; role: string; onChange: () => void; onError: (m: string) => void }): ReactNode {
  const [busy, setBusy] = useState(false);
  async function remove(): Promise<void> {
    setBusy(true);
    try {
      await apiDelete(`/v1/admin/users/${userId}/roles/${role}`);
      onChange();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not remove role.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="badge b-neutral" style={{ gap: 6 }}>
      {role}
      <button onClick={() => void remove()} disabled={busy} title="Remove role"
        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontWeight: 700 }}>
        ×
      </button>
    </span>
  );
}

function AssignRole({ userId, roleNames, current, onChange, onError }: { userId: string; roleNames: string[]; current: string[]; onChange: () => void; onError: (m: string) => void }): ReactNode {
  const available = roleNames.filter((r) => !current.includes(r));
  const [role, setRole] = useState('');
  if (available.length === 0) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  async function add(value: string): Promise<void> {
    if (!value) return;
    try {
      await apiPost(`/v1/admin/users/${userId}/roles`, { role: value });
      setRole('');
      onChange();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not assign role.');
    }
  }
  return (
    <select value={role} onChange={(e) => { setRole(e.target.value); void add(e.target.value); }}
      style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12 }}>
      <option value="">+ role</option>
      {available.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

function AddUser({ roleNames, onDone, onError }: { roleNames: string[]; onDone: () => void; onError: (m: string) => void }): ReactNode {
  const [f, setF] = useState({ name: '', email: '', phone: '', role: roleNames[0] ?? 'AUDITOR', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost('/v1/admin/users', {
        name: f.name, email: f.email, phone: f.phone || undefined, scope: 'SYSTEM', role: f.role, password: f.password,
      });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not create user.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>New system user</div>
      <form onSubmit={(e) => void submit(e)}>
        <div className="grid cols-3">
          <div className="field"><label>Name</label><input value={f.name} onChange={set('name')} required /></div>
          <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set('email')} required /></div>
          <div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')} /></div>
          <div className="field">
            <label>Role</label>
            <select value={f.role} onChange={set('role')}>
              {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field"><label>Initial password</label><input type="password" value={f.password} onChange={set('password')} required minLength={8} /></div>
        </div>
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>The user signs in with this password (then email OTP) and should change it.</p>
      </form>
    </div>
  );
}

function Roles({ roles, loading, onChange, onError }: { roles: Role[]; loading: boolean; onChange: () => void; onError: (m: string) => void }): ReactNode {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function add(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost('/v1/admin/roles', { name: name.toUpperCase() });
      setName('');
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not add role.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 12 }}>Roles</div>
      {loading ? <Spinner /> : (
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          {roles.map((r) => (
            <span key={r.name} className={`badge ${r.is_custom ? 'b-pending' : 'b-success'}`}>{r.name}</span>
          ))}
        </div>
      )}
      <form onSubmit={(e) => void add(e)} className="row" style={{ gap: 10 }}>
        <input className="mono" value={name} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
          placeholder="CUSTOM_ROLE" style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 7 }} />
        <button className="btn" disabled={busy || !name}>{busy ? '…' : '+ Add custom role'}</button>
      </form>
    </div>
  );
}
