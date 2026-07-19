'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiGet, apiPost, apiPut, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

const API_BASE = 'https://api.instacompayzm.com';
const POSTMAN_HREF = '/instacompay-gateway.postman_collection.json';

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

interface Endpoint {
  method: string;
  path: string;
  summary: string;
  body?: string;
}
const ENDPOINTS: Endpoint[] = [
  { method: 'POST', path: '/v1/collections', summary: 'Charge a customer', body: '{ "processor": "MTN", "amount": "5000", "msisdn": "260970000001", "collectionReference": "order-1001" }' },
  { method: 'POST', path: '/v1/disbursements', summary: 'Pay out to a customer', body: '{ "processor": "AIRTEL", "amount": "5000", "msisdn": "260970000001", "collectionReference": "payout-2001" }' },
  { method: 'GET', path: '/v1/transactions/{id}', summary: 'Check a transaction status' },
  { method: 'POST', path: '/v1/disbursements', summary: 'Refund a customer by sending back what they paid', body: '{ "processor": "AIRTEL", "amount": "103", "msisdn": "260970000001", "collectionReference": "refund-of-order-1001" }' },
  { method: 'GET', path: '/v1/accounts/{accountId}/balance', summary: 'Account balance enquiry' },
  { method: 'GET', path: '/v1/settlements', summary: 'List settlements' },
];

const SIMPLE_SNIPPET = `import crypto from 'node:crypto';

const API_BASE = '${API_BASE}';
const API_KEY = 'ic_live_...';     // from the Keys section on this page
const API_SECRET = 'sk_...';       // shown once when you regenerate a key

async function call(method, path, body) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': API_KEY,
    'X-Api-Secret': API_SECRET,
  };
  // Any unique string. Send the same value again to safely retry.
  if (method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();

  const res = await fetch(API_BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// K50.00 collection (amount is integer ngwee, as a string)
await call('POST', '/v1/collections', {
  processor: 'AIRTEL', amount: '5000', msisdn: '260970000001',
  collectionReference: 'order-1001',
});`;

const WEBHOOK_PAYLOAD = `POST <your callback url>
X-Instacompay-Event:     transaction.success
X-Instacompay-Signature: t=1752380000,v1=9f2c1b7a

{
  "id": "<event id>",
  "type": "transaction.success",
  "created_at": "2026-07-16T10:32:00.000Z",
  "data": {
    "id": "<transaction id>",
    "status": "SUCCESS",
    "amount": "5000",
    "charge": "125",
    "net_amount": "5000",
    "collection_reference": "order-1001"
  }
}`;

const VERIFY_SNIPPET = `import crypto from 'node:crypto';

const WEBHOOK_SECRET = 'whsec_...';   // reveal it for your account below

// IMPORTANT: verify against the RAW body bytes, before any JSON parsing.
function verify(rawBody, signatureHeader) {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=')),
  );
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest('hex');

  const a = Buffer.from(expected), b = Buffer.from(parts.v1 ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/webhooks/instacompay', (req, res) => {
  if (!verify(req.rawBody, req.get('X-Instacompay-Signature'))) {
    return res.sendStatus(400);           // signature invalid, reject
  }
  const event = JSON.parse(req.rawBody);
  // Mark the order paid. Do this idempotently, because we may retry.
  res.sendStatus(200);                    // acknowledge
});`;

const SIGNED_SNIPPET = `// Optional: sign each request instead of sending the secret.
// Adds replay protection and body integrity. Send X-Signature and the
// API switches to signed mode automatically.
const SIGNING_KEY = '...';   // shown once alongside the secret

const body = JSON.stringify({ processor: 'AIRTEL', amount: '5000', msisdn: '260970000001' });
const ts = Math.floor(Date.now() / 1000).toString();

// sign "timestamp.METHOD.path.rawBody"
const signature = crypto.createHmac('sha256', SIGNING_KEY)
  .update(\`\${ts}.POST./v1/collections.\${body}\`).digest('hex');

await fetch(API_BASE + '/v1/collections', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': API_KEY,
    'X-Timestamp': ts,          // must be within 5 minutes of server time
    'X-Signature': signature,
    'Idempotency-Key': crypto.randomUUID(),
  },
  body,
});`;

/**
 * Copy to clipboard. Only reports success once the write actually resolves.
 * navigator.clipboard needs a secure context and can be refused (denied
 * permission, document not focused, older browser), so there is a textarea
 * fallback and a visible failure state rather than a false "Copied".
 */
function Copy({ text, label }: { text: string; label?: string }): ReactNode {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copy(): Promise<void> {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = copyViaTextarea(text);
    setState(ok ? 'done' : 'failed');
    window.setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button
      type="button"
      className="btn sm"
      onClick={() => void copy()}
      title={state === 'failed' ? 'Copy failed. Select the text and copy manually.' : 'Copy to clipboard'}
    >
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : (label ?? 'Copy')}
    </button>
  );
}

/** Fallback for browsers without the async clipboard API. */
function copyViaTextarea(text: string): boolean {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export default function ApiDocsPage(): ReactNode {
  const creds = useData<Credential[]>('/v1/merchant/credentials');
  const accounts = useData<Account[]>('/v1/merchant/accounts');

  return (
    <>
      <PageHead
        title="API Documentation"
        subtitle="Keys, authentication, webhooks and endpoints for integrating collections and disbursements."
        actions={
          <a className="btn primary" href={POSTMAN_HREF} download>
            Download Postman collection
          </a>
        }
      />

      {/* Quickstart */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Quickstart</div>
        <ol style={{ margin: '0 0 4px 18px', padding: 0, fontSize: 14, lineHeight: 1.7 }}>
          <li>Get an <b>API key</b> and <b>secret</b> from the Keys section below. Regenerating reveals them once.</li>
          <li><a href={POSTMAN_HREF} download style={{ color: 'var(--sky-deep)' }}>Download the Postman collection</a>, open it, and paste your <span className="mono">apiKey</span> and <span className="mono">apiSecret</span> into the collection <b>Variables</b> tab.</li>
          <li>Press <b>Send</b>. Start with a sandbox key (<span className="mono">ic_sand_</span>). Sandbox simulates and settles immediately, so you can test the full <span className="mono">PROCESSING</span> to <span className="mono">SUCCESS</span> lifecycle without moving real money. Switch to your live key when you are ready.</li>
        </ol>
        <div className="row" style={{ marginTop: 12, gap: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}><span className="muted">Base URL</span>&nbsp; <span className="mono">{API_BASE}</span></span>
          <span style={{ fontSize: 13 }}><span className="muted">Interactive reference</span>&nbsp; <a className="mono" href={`${API_BASE}/docs`} target="_blank" rel="noreferrer" style={{ color: 'var(--sky-deep)' }}>{API_BASE}/docs</a></span>
        </div>
      </div>

      {/* Developer guides */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Developer guides</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Detailed guides you can share with your team or an integration partner.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <a className="btn primary" href="/developers" target="_blank" rel="noreferrer">Merchant Portal API guide</a>
          <a className="btn" href="/partners" target="_blank" rel="noreferrer">Public API guide (server-to-server)</a>
          <a className="btn" href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">Interactive reference (/docs)</a>
        </div>
      </div>

      {/* Authentication: key and secret */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="eyebrow" style={{ margin: 0 }}>Authentication: key and secret <span style={{ color: 'var(--success-deep)' }}>(recommended)</span></div>
          <Copy text={SIMPLE_SNIPPET} label="Copy example" />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Send your key and secret on every <span className="mono">/v1</span> call. There is no signing and no
          timestamp to manage. Write requests also take an <span className="mono">Idempotency-Key</span>, which can
          be any unique string. Sending the same value again safely returns the original result instead of
          creating a second transaction.
        </p>
        <table className="table" style={{ marginBottom: 14 }}>
          <tbody>
            <tr><td className="mono" style={{ width: 160 }}>X-Api-Key</td><td className="muted">Your key, for example <span className="mono">ic_live_...</span></td></tr>
            <tr><td className="mono">X-Api-Secret</td><td className="muted">Your secret, for example <span className="mono">sk_...</span>. You can send <span className="mono">Authorization: Bearer &lt;secret&gt;</span> instead.</td></tr>
            <tr><td className="mono">Idempotency-Key</td><td className="muted">Unique per write (POST). Safe to retry.</td></tr>
          </tbody>
        </table>
        <pre className="code-block" style={{ margin: 0, maxHeight: 320 }}><code>{SIMPLE_SNIPPET}</code></pre>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
          <b>All amounts are integer ngwee, sent as strings.</b> K1.50 is <span className="mono">&quot;150&quot;</span> and
          K50.00 is <span className="mono">&quot;5000&quot;</span>. Do not send decimals or JSON numbers.
        </p>
      </div>

      {/* Authentication: signed requests */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="eyebrow" style={{ margin: 0 }}>Authentication: signed requests (optional)</div>
          <Copy text={SIGNED_SNIPPET} label="Copy example" />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          If you would rather not send your secret on every call, sign the request instead. The signature is an
          HMAC-SHA256 of <span className="mono">{'`${timestamp}.${METHOD}.${path}.${rawBody}`'}</span> using your{' '}
          <b>signing key</b>. This adds replay protection and body integrity. Send an{' '}
          <span className="mono">X-Signature</span> header and the API uses signed mode automatically.
        </p>
        <table className="table" style={{ marginBottom: 14 }}>
          <tbody>
            <tr><td className="mono" style={{ width: 160 }}>X-Timestamp</td><td className="muted">Unix epoch seconds. Must be within 5 minutes of server time.</td></tr>
            <tr><td className="mono">X-Signature</td><td className="muted">HMAC-SHA256(signingKey, <span className="mono">ts.METHOD.path.body</span>), hex.</td></tr>
          </tbody>
        </table>
        <pre className="code-block" style={{ margin: 0, maxHeight: 320 }}><code>{SIGNED_SNIPPET}</code></pre>
      </div>

      {/* Webhooks */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="eyebrow" style={{ margin: 0 }}>Webhooks</div>
          <Copy text={VERIFY_SNIPPET} label="Copy verifier" />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          In production a collection returns <span className="mono">PROCESSING</span> and completes only after the
          customer approves it on their phone. We then POST the result to your callback URL, which you set per
          account below. We retry with backoff until your endpoint returns a <span className="mono">2xx</span>
          response.
        </p>
        <pre className="code-block" style={{ margin: '0 0 14px' }}><code>{WEBHOOK_PAYLOAD}</code></pre>
        <p className="muted" style={{ marginTop: 0 }}>
          <b>Always verify the signature.</b> Without it, anyone who discovers your callback URL could post a
          fake payment confirmation. Reveal your signing secret (<span className="mono">whsec_...</span>) for each
          account below.
        </p>
        <pre className="code-block" style={{ margin: 0, maxHeight: 300 }}><code>{VERIFY_SNIPPET}</code></pre>
      </div>

      {/* Endpoints */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">Endpoints</span>
        </div>
        <table className="table">
          <thead>
            <tr><th style={{ width: 70 }}>Method</th><th>Path</th><th>What it does</th></tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((e) => (
              <tr key={e.method + e.path}>
                <td><span className={`method-pill ${e.method === 'GET' ? 'get' : 'post'}`}>{e.method}</span></td>
                <td className="mono" style={{ fontSize: 12.5 }}>{e.path}</td>
                <td>
                  <div>{e.summary}</div>
                  {e.body ? <div className="mono" style={{ fontSize: 11, color: 'var(--slate)', marginTop: 3 }}>{e.body}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Keys */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">Your API keys</span>
        </div>
        {creds.loading ? (
          <div className="card-pad"><Spinner /></div>
        ) : !creds.data || creds.data.length === 0 ? (
          <Empty>No keys yet. They are issued when your account is provisioned.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Environment</th><th>API key</th><th>Rotated</th><th>Status</th></tr>
            </thead>
            <tbody>
              {creds.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.environment}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.api_key}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.last_rotated_at ?? 'Never'}</td>
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

      <style jsx>{`
        .method-pill { display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; }
        .method-pill.get { background: #e7f2ec; color: #1f7a4d; }
        .method-pill.post { background: #e6efff; color: #1c4fd6; }
        .code-block { background: #0e1726; color: #d7e2f2; padding: 14px 16px; border-radius: 10px; overflow: auto; font-family: var(--mono); font-size: 12.5px; line-height: 1.6; }
      `}</style>
    </>
  );
}

function AccountConfig({ account, onChange }: { account: Account; onChange: () => void }): ReactNode {
  const [callbackUrl, setCallbackUrl] = useState(account.callback_url ?? '');
  const [ipList, setIpList] = useState(account.ip_whitelist.join(', '));
  const [secret, setSecret] = useState<{ env: string; apiKey: string; secret: string; signingKey: string } | null>(null);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function revealWebhookSecret(rotate: boolean): Promise<void> {
    setBusy(rotate ? 'rotate' : 'reveal');
    setError('');
    setMsg('');
    try {
      const r = rotate
        ? await apiPost<{ webhookSecret: string }>(`/v1/merchant/accounts/${account.id}/webhook-secret/rotate`)
        : await apiGet<{ webhookSecret: string }>(`/v1/merchant/accounts/${account.id}/webhook-secret`);
      setWebhookSecret(r.webhookSecret);
      if (rotate) setMsg('Webhook secret rotated. Update your receiver now, because older signatures will no longer verify.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the webhook secret.');
    } finally {
      setBusy('');
    }
  }

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
    // Regenerating REVOKES the current key immediately, and the new secret is
    // shown exactly once, so make the consequence explicit before doing it.
    const warning =
      env === 'LIVE'
        ? 'This immediately revokes your current live key. Any integration using it will stop working.\n\nThe new secret is shown only once, so have somewhere ready to paste it.\n\nContinue?'
        : 'This revokes your current sandbox key. The new secret is shown only once.\n\nContinue?';
    if (!window.confirm(warning)) return;

    setBusy(env);
    setError('');
    try {
      const r = await apiPost<{ apiKey: string; secret: string; signingKey: string }>(
        `/v1/merchant/accounts/${account.id}/credentials/${env}/regenerate`,
      );
      setSecret({ env, ...r });
      // NOTE: deliberately not reloading the account list here. A reload used to
      // unmount this panel and destroy the credentials above before they could be
      // copied. Only the key table needs refreshing.
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
        Webhooks and keys for {account.account_type} account {shortId(account.id)}
      </div>
      {error ? <div className="err">{error}</div> : null}
      {msg ? <div className="devhint" style={{ color: 'var(--success)', background: '#e6f4ee', borderColor: '#cce8dc' }}>{msg}</div> : null}

      <form onSubmit={(e) => void saveSettings(e)}>
        <div className="field">
          <label>Callback / webhook URL</label>
          <input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://your-server.example/webhooks" />
        </div>
        <div className="field">
          <label>Allowed IP addresses for live keys (comma separated)</label>
          <input className="mono" value={ipList} onChange={(e) => setIpList(e.target.value)} placeholder="41.x.x.x, 102.x.x.x" />
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving' : 'Save settings'}</button>
          <button type="button" className="btn" disabled={busy === 'SANDBOX'} onClick={() => void regenerate('SANDBOX')}>
            Regenerate sandbox key
          </button>
          <button type="button" className="btn" disabled={busy === 'LIVE'} onClick={() => void regenerate('LIVE')}>
            Regenerate live key
          </button>
        </div>
      </form>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Webhook signing secret</div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Use this to verify the <span className="mono">X-Instacompay-Signature</span> header on webhooks we send you.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={busy === 'reveal'} onClick={() => void revealWebhookSecret(false)}>
            {busy === 'reveal' ? 'Loading' : 'Reveal secret'}
          </button>
          <button type="button" className="btn" disabled={busy === 'rotate'} onClick={() => void revealWebhookSecret(true)}>
            {busy === 'rotate' ? 'Rotating' : 'Rotate'}
          </button>
        </div>
        {webhookSecret ? (
          <div className="devhint mono" style={{ marginTop: 10, wordBreak: 'break-all', fontSize: 12 }}>
            {webhookSecret}
          </div>
        ) : null}
      </div>

      {secret ? (
        <div className="cred-reveal">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <b>Your new {secret.env} credentials. Shown once.</b>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                Copy them now. We store only a hash, so they cannot be shown again.
                Any previous {secret.env} key is now revoked.
              </div>
            </div>
            <Copy
              text={`apiKey=${secret.apiKey}\napiSecret=${secret.secret}\nsigningKey=${secret.signingKey}`}
              label="Copy all"
            />
          </div>
          <div className="cred-row"><span>apiKey</span><code>{secret.apiKey}</code><Copy text={secret.apiKey} label="Copy" /></div>
          <div className="cred-row"><span>apiSecret</span><code>{secret.secret}</code><Copy text={secret.secret} label="Copy" /></div>
          <div className="cred-row"><span>signingKey</span><code>{secret.signingKey}</code><Copy text={secret.signingKey} label="Copy" /></div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setSecret(null)}>
            I have saved them, hide
          </button>
        </div>
      ) : null}

      <style jsx>{`
        .cred-reveal {
          margin-top: 14px; padding: 16px; border-radius: 12px;
          background: #fbf0d8; border: 1px solid #ecd6a3; color: #4a3c17;
        }
        .cred-row {
          display: flex; align-items: center; gap: 10px; margin-top: 10px;
          flex-wrap: wrap;
        }
        .cred-row span {
          font-family: var(--mono); font-size: 11px; text-transform: uppercase;
          letter-spacing: .06em; opacity: .75; min-width: 82px;
        }
        .cred-row code {
          font-family: var(--mono); font-size: 12.5px; word-break: break-all;
          background: #fff; border: 1px solid #e3d3a8; border-radius: 6px;
          padding: 5px 8px; flex: 1; min-width: 220px;
        }
      `}</style>
    </div>
  );
}
