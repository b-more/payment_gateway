'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Money, Spinner, Empty } from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

const DOC_LABELS: Record<string, string> = {
  CERTIFICATE_OF_INCORPORATION: 'Certificate of Incorporation (PACRA)',
  TAX_CLEARANCE: 'Tax Clearance / TPIN (ZRA)',
  DIRECTOR_ID: 'Director ID / Passport',
  PROOF_OF_ADDRESS: 'Proof of Address',
  BANK_CONFIRMATION: 'Bank Confirmation Letter',
};

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Account {
  id: string;
  account_number: string;
  account_type: string;
  operating_mode: string;
  status: string;
  float_balance: string;
  low_float_threshold: string;
  created_at: string;
}
interface DocItem {
  id: string;
  doc_type: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  status: string;
  uploaded_at: string;
}
interface Contact {
  name: string;
  email: string;
  phone: string | null;
}
interface MerchantDetail {
  merchant: {
    id: string;
    name: string;
    merchant_type: string;
    email: string;
    phone: string | null;
    status: string;
    kyc_status: string;
    registered_at: string;
    trading_name: string | null;
    registration_number: string | null;
    tpin: string | null;
    address: string | null;
    city: string | null;
    website: string | null;
    description: string | null;
    review_reason: string | null;
  };
  contact: Contact | null;
  documents: DocItem[];
  accounts: Account[];
}
interface CredentialPair {
  apiKey: string;
  secret: string;
  signingKey: string;
}

function Field({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div className="kv">
      <div className="kv-label">{label}</div>
      <div className="kv-value">{value ?? <span className="muted">—</span>}</div>
    </div>
  );
}

function CopyBtn({ value, label }: { value: string; label: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" className={`cred-copy${copied ? ' done' : ''}`} onClick={() => void copy()} aria-label={`Copy ${label}`}>
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4 10-11" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CredField({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="cred-row">
      <span className="cred-label">{label}</span>
      <code className="cred-value" title={value}>{value}</code>
      <CopyBtn value={value} label={label} />
    </div>
  );
}

export default function MerchantDetailPage(): ReactNode {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, loading, error, reload } = useData<MerchantDetail>(`/v1/admin/merchants/${id}`);
  const [busy, setBusy] = useState('');
  const [creds, setCreds] = useState<{ sandbox: CredentialPair; live: CredentialPair } | null>(null);
  const [actionError, setActionError] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  if (loading) return <Spinner />;
  if (error || !data) return <Empty>Could not load merchant. {error}</Empty>;
  const m = data.merchant;

  async function act(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label);
    setActionError('');
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const approve = () =>
    act('APPROVED', async () => {
      await apiPost(`/v1/admin/merchants/${id}/review`, { decision: 'APPROVED' });
      reload();
    });

  const decline = () =>
    act('REJECTED', async () => {
      await apiPost(`/v1/admin/merchants/${id}/review`, { decision: 'REJECTED', reason: reason.trim() });
      setDeclining(false);
      setReason('');
      reload();
    });

  const provision = () =>
    act('provision', async () => {
      const result = await apiPost<{ accountId: string; credentials: { sandbox: CredentialPair; live: CredentialPair } }>(
        `/v1/admin/merchants/${id}/accounts`,
        { accountType: 'COLLECTION' },
      );
      setCreds(result.credentials);
      reload();
    });

  const promote = (accountId: string) =>
    act(`promote-${accountId}`, async () => {
      await apiPost(`/v1/admin/accounts/${accountId}/promote`);
      reload();
    });

  return (
    <>
      <PageHead
        title={m.name}
        subtitle={`${m.merchant_type} · ${m.email}`}
        actions={
          m.status === 'PENDING' ? (
            <>
              <button className="btn primary" disabled={!!busy} onClick={() => void approve()}>
                {busy === 'APPROVED' ? 'Approving…' : '✓ Approve'}
              </button>
              <button className="btn danger" disabled={!!busy} onClick={() => setDeclining((v) => !v)}>
                Decline
              </button>
            </>
          ) : m.status === 'APPROVED' ? (
            <button className="btn primary" disabled={!!busy} onClick={() => void provision()}>
              {busy === 'provision' ? 'Provisioning…' : '+ Provision Account'}
            </button>
          ) : null
        }
      />

      {actionError ? <div className="err">{actionError}</div> : null}

      {declining ? (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: '#f0c9cc' }}>
          <div className="eyebrow" style={{ color: 'var(--redm)', marginBottom: 10 }}>Decline application</div>
          <div className="field">
            <label htmlFor="reason">Reason (shared in the audit trail; required)</label>
            <textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Certificate of Incorporation is illegible — please re-upload."
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14 }}
            />
          </div>
          <div className="row">
            <button className="btn danger" disabled={!!busy || reason.trim() === ''} onClick={() => void decline()}>
              {busy === 'REJECTED' ? 'Declining…' : 'Confirm decline'}
            </button>
            <button className="btn" onClick={() => { setDeclining(false); setReason(''); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="eyebrow">Status</div>
          <div style={{ marginTop: 8 }}><Badge value={m.status} /></div>
        </div>
        <div className="stat">
          <div className="eyebrow">KYC</div>
          <div style={{ marginTop: 8 }}><Badge value={m.kyc_status} /></div>
        </div>
        <div className="stat">
          <div className="eyebrow">Registered</div>
          <div className="value" style={{ fontSize: 16 }}>{m.registered_at}</div>
        </div>
      </div>

      {m.status === 'REJECTED' && m.review_reason ? (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: '#f0c9cc', background: '#fdf5f5' }}>
          <div className="eyebrow" style={{ color: 'var(--redm)', marginBottom: 6 }}>Decline reason</div>
          <div style={{ fontSize: 14 }}>{m.review_reason}</div>
        </div>
      ) : null}

      {/* Business details + contact */}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Business details</div>
          <Field label="Legal name" value={m.name} />
          <Field label="Trading name" value={m.trading_name} />
          <Field label="Type" value={m.merchant_type} />
          <Field label="Registration no. (PACRA)" value={m.registration_number ? <span className="mono">{m.registration_number}</span> : null} />
          <Field label="TPIN (ZRA)" value={m.tpin ? <span className="mono">{m.tpin}</span> : null} />
          <Field label="Address" value={[m.address, m.city].filter(Boolean).join(', ') || null} />
          <Field label="Website" value={m.website ? <a href={m.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky-deep)' }}>{m.website}</a> : null} />
          <Field label="Description" value={m.description} />
        </div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Primary contact</div>
          <Field label="Name" value={data.contact?.name} />
          <Field label="Email" value={data.contact?.email ?? m.email} />
          <Field label="Phone" value={data.contact?.phone ?? m.phone} />
          <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Business email</div>
          <Field label="Email" value={m.email} />
          <Field label="Phone" value={m.phone} />
        </div>
      </div>

      {/* KYC documents */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">KYC documents</span>
        </div>
        {data.documents.length === 0 ? (
          <Empty>No documents were uploaded with this application.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>File</th>
                <th className="num">Size</th>
                <th>Uploaded</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.documents.map((d) => (
                <tr key={d.id}>
                  <td>{DOC_LABELS[d.doc_type] ?? d.doc_type.replace(/_/g, ' ')}</td>
                  <td className="id">{d.file_name}</td>
                  <td className="num">{fileSize(d.byte_size)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{d.uploaded_at}</td>
                  <td><Badge value={d.status} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <a
                      className="btn sm"
                      href={`${API}/v1/admin/merchants/${id}/documents/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creds ? (
        <div className="card cred-card" style={{ marginBottom: 16 }}>
          <div className="cred-head">
            <div>
              <div className="cred-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 7a4 4 0 1 0-3.5 6L8 15.5 6.5 17 8 18.5 6.5 20 4 18l6.5-6.5A4 4 0 0 0 14 7Z" />
                  <circle cx="15.5" cy="7.5" r="1" />
                </svg>
                API credentials
              </div>
              <div className="cred-sub">
                Shown once — copy and store them securely now. The secret and signing keys can’t be retrieved again.
              </div>
            </div>
            <button className="btn sm" onClick={() => setCreds(null)}>Dismiss</button>
          </div>
          {(['sandbox', 'live'] as const).map((env) => (
            <div className="cred-env" key={env}>
              <div className="cred-env-head">
                <span className={`badge ${env === 'live' ? 'b-success' : 'b-pending'}`}>{env}</span>
              </div>
              <CredField label="API key" value={creds[env].apiKey} />
              <CredField label="Secret" value={creds[env].secret} />
              <CredField label="Signing key" value={creds[env].signingKey} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">Accounts</span>
        </div>
        {data.accounts.length === 0 ? (
          <Empty>No accounts yet. Approve and provision to issue credentials.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th>Mode</th>
                <th className="num">Float</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{a.account_number}</td>
                  <td>{a.account_type}</td>
                  <td><Badge value={a.operating_mode} /></td>
                  <td className="num"><Money ngwee={a.float_balance} plain /></td>
                  <td><Badge value={a.status} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Link className="btn sm" href={`/accounts/${a.id}`} style={{ marginRight: 8 }}>
                      Configure
                    </Link>
                    {a.operating_mode === 'SANDBOX' ? (
                      <button
                        className="btn sm"
                        disabled={busy === `promote-${a.id}`}
                        onClick={() => void promote(a.id)}
                      >
                        {busy === `promote-${a.id}` ? '…' : 'Promote'}
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>live</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
