'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, apiPut, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface Credential {
  id: string;
  account_id: string;
  environment: string;
  api_key: string;
  status: string;
  last_rotated_at: string | null;
}
interface Account {
  id: string;
  account_type: string;
  callback_url: string | null;
  ip_whitelist: string[];
}

export default function ApiDocsPage(): ReactNode {
  const creds = useData<Credential[]>('/v1/merchant/credentials');
  const accounts = useData<Account[]>('/v1/merchant/accounts');

  return (
    <>
      <PageHead title="API Documentation" subtitle="Keys, webhooks and integration." />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Request signing</div>
        <p className="muted" style={{ margin: 0 }}>
          Authenticate each <span className="mono">/v1</span> request with{' '}
          <span className="mono">X-Api-Key</span>, <span className="mono">X-Timestamp</span> and{' '}
          <span className="mono">X-Signature = HMAC-SHA256(signingKey, “ts.METHOD.path.body”)</span>.
          Mutating calls require an <span className="mono">Idempotency-Key</span>. Webhooks are signed
          with your account’s webhook secret.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">API keys</span>
        </div>
        {creds.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : !creds.data || creds.data.length === 0 ? (
          <Empty>No keys yet. They are issued when your account is provisioned.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Environment</th>
                <th>API key</th>
                <th>Rotated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {creds.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.environment}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.api_key}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.last_rotated_at ?? '—'}</td>
                  <td><Badge value={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {accounts.loading ? (
        <Spinner />
      ) : accounts.data && accounts.data.length > 0 ? (
        accounts.data.map((a) => (
          <AccountConfig key={a.id} account={a} onChange={() => { creds.reload(); accounts.reload(); }} />
        ))
      ) : null}
    </>
  );
}

function AccountConfig({ account, onChange }: { account: Account; onChange: () => void }): ReactNode {
  const [callbackUrl, setCallbackUrl] = useState(account.callback_url ?? '');
  const [ipList, setIpList] = useState(account.ip_whitelist.join(', '));
  const [secret, setSecret] = useState<{ env: string; apiKey: string; secret: string; signingKey: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function saveSettings(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy('save');
    setError('');
    setMsg('');
    try {
      await apiPut(`/v1/merchant/accounts/${account.id}/settings`, {
        callbackUrl: callbackUrl || undefined,
        ipWhitelist: ipList ? ipList.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      });
      setMsg('Settings saved.');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy('');
    }
  }

  async function regenerate(env: 'SANDBOX' | 'LIVE'): Promise<void> {
    setBusy(env);
    setError('');
    try {
      const r = await apiPost<{ apiKey: string; secret: string; signingKey: string }>(
        `/v1/merchant/accounts/${account.id}/credentials/${env}/regenerate`,
      );
      setSecret({ env, ...r });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not regenerate.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {account.account_type} · {shortId(account.id)}
      </div>
      {error ? <div className="err">{error}</div> : null}
      {msg ? <div className="devhint" style={{ color: 'var(--success)', background: '#e6f4ee', borderColor: '#cce8dc' }}>{msg}</div> : null}

      <form onSubmit={(e) => void saveSettings(e)}>
        <div className="field">
          <label>Callback / webhook URL</label>
          <input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label>IP whitelist (comma-separated, live keys)</label>
          <input className="mono" value={ipList} onChange={(e) => setIpList(e.target.value)} placeholder="41.x.x.x, 102.x.x.x" />
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save settings'}</button>
          <button type="button" className="btn" disabled={busy === 'SANDBOX'} onClick={() => void regenerate('SANDBOX')}>
            Regenerate sandbox key
          </button>
          <button type="button" className="btn" disabled={busy === 'LIVE'} onClick={() => void regenerate('LIVE')}>
            Regenerate live key
          </button>
        </div>
      </form>

      {secret ? (
        <div className="devhint" style={{ marginTop: 14, wordBreak: 'break-all' }}>
          {secret.env} key {secret.apiKey} · secret {secret.secret} · signing {secret.signingKey}
          <br />
          Shown once — store it now. Previous {secret.env} keys are revoked.
        </div>
      ) : null}
    </div>
  );
}
