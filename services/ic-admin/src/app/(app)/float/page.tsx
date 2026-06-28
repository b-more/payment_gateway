'use client';

import { useState, type FormEvent, type ReactNode, type ChangeEvent } from 'react';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHead } from '@/components/shell';
import { Badge, Money, StatCard, Spinner, Empty } from '@/components/ui';
import { shortId, zmw } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const PROOF_MAX = 5 * 1024 * 1024;

interface FloatRequest {
  id: string;
  account_id: string;
  amount: string;
  status: string;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  requested_by: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
  approved_by: string | null;
  decided_by_name: string | null;
  merchant_name: string | null;
  account_type: string;
  operating_mode: string;
  proof_file_name: string | null;
  proof_byte_size: number | null;
  has_proof: boolean;
}
interface Account {
  id: string;
  account_number: string;
  merchant_name: string;
  account_type: string;
  operating_mode: string;
  status: string;
  float_balance: string;
  low_float_threshold: string;
}

const TABS: Array<[string, string]> = [
  ['PENDING_APPROVAL', 'Pending'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
];

function bi(v: string | null): bigint {
  try { return BigInt(v || '0'); } catch { return 0n; }
}
function isLow(a: Account): boolean {
  return bi(a.low_float_threshold) > 0n && bi(a.float_balance) <= bi(a.low_float_threshold);
}
const envTag = (mode: string): string => (mode === 'PRODUCTION' ? 'live' : 'sandbox');

export default function FloatPage(): ReactNode {
  const { principal } = useAuth();
  const roles = principal.roles;
  const canMake = roles.includes('FINANCE') || roles.includes('ADMIN');
  const canCheck = roles.includes('ADMIN');

  const [tab, setTab] = useState('PENDING_APPROVAL');
  const { data, loading, error, reload } = useData<FloatRequest[]>(`/v1/admin/float-requests?status=${tab}`);
  const { data: accountsData, reload: reloadAccounts } = useData<Account[]>('/v1/admin/accounts');
  const accounts = accountsData ?? [];
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [makerAccount, setMakerAccount] = useState('');

  const reloadAll = (): void => { reload(); reloadAccounts(); };
  const totalFloat = accounts.reduce((acc, a) => acc + bi(a.float_balance), 0n).toString();
  const lowCount = accounts.filter(isLow).length;

  async function approve(id: string): Promise<void> {
    setBusy(id); setMsg('');
    try {
      await apiPost(`/v1/admin/float-requests/${id}/approve`);
      reloadAll();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Approval failed.');
    } finally { setBusy(''); }
  }

  async function reject(id: string): Promise<void> {
    if (rejectReason.trim() === '') return;
    setBusy(id); setMsg('');
    try {
      await apiPost(`/v1/admin/float-requests/${id}/reject`, { reason: rejectReason.trim() });
      setRejectId(''); setRejectReason('');
      reloadAll();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Rejection failed.');
    } finally { setBusy(''); }
  }

  const rows = data ?? [];

  return (
    <>
      <PageHead title="Float Management" subtitle="Credit float under dual control — a maker requests, a checker approves." />

      <div className="note" style={{ marginBottom: 16 }}>
        <b>Maker–checker.</b> Adding float takes two people: a <b>maker</b> (Finance) attaches proof of payment and
        submits a request, and a different <b>checker</b> (Admin) approves or declines it — the approver can never be
        the requester. You’re signed in as <b>{roles.join(', ') || 'no role'}</b>:{' '}
        {canMake ? 'you can request credits' : 'you cannot request credits'}
        {canCheck ? ', and approve or decline them.' : ' (only an Admin can approve).'}
      </div>

      {msg ? <div className="err">{msg}</div> : null}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <StatCard label="Total float" value={zmw(totalFloat)} sub="Across all accounts" />
        <StatCard label="Accounts" value={String(accounts.length)} sub="Holding float" />
        <StatCard label="Low float" value={String(lowCount)} sub="At or below threshold" copper={lowCount > 0} />
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        {/* ── Checker ── */}
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span className="eyebrow">Float credit requests</span>
            <div className="seg">
              {TABS.map(([value, label]) => (
                <button key={value} className={`seg-btn${tab === value ? ' active' : ''}`} onClick={() => { setTab(value); setRejectId(''); }}>{label}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="card-pad"><Spinner /></div>
          ) : error ? (
            <Empty>Could not load requests. {error}</Empty>
          ) : rows.length === 0 ? (
            <Empty>{tab === 'PENDING_APPROVAL' ? 'No float credits awaiting approval.' : 'Nothing here.'}</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Amount</th>
                  <th>Requested by</th>
                  <th>{tab === 'PENDING_APPROVAL' ? 'When' : 'Decided'}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <FloatRow
                    key={r.id} r={r} tab={tab} canCheck={canCheck} busy={busy}
                    rejectId={rejectId} rejectReason={rejectReason}
                    onApprove={() => void approve(r.id)}
                    onStartReject={() => { setRejectId(r.id); setRejectReason(''); }}
                    onCancelReject={() => { setRejectId(''); setRejectReason(''); }}
                    onChangeReason={setRejectReason}
                    onConfirmReject={() => void reject(r.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Maker ── */}
        <CreditFloat canMake={canMake} accounts={accounts} account={makerAccount} setAccount={setMakerAccount} onDone={reloadAll} />
      </div>

      {/* ── Balances overview ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">Account float balances</span>
        </div>
        {accounts.length === 0 ? (
          <Empty>No accounts yet. Provision an account from a merchant’s page.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Account</th>
                <th>Mode</th>
                <th className="num">Float balance</th>
                <th className="num">Low-float threshold</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.merchant_name}</td>
                  <td>{a.account_type} <span className="id">{a.account_number}</span></td>
                  <td><span className={`envtag ${envTag(a.operating_mode)}`}>{envTag(a.operating_mode)}</span></td>
                  <td className="num"><Money ngwee={a.float_balance} plain /></td>
                  <td className="num muted"><Money ngwee={a.low_float_threshold} plain /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isLow(a) ? <span className="badge b-pending" style={{ marginRight: 8 }}>LOW</span> : null}
                    {canMake ? (
                      <button className="btn sm" onClick={() => { setMakerAccount(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                        Credit
                      </button>
                    ) : null}
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

function FloatRow({
  r, tab, canCheck, busy, rejectId, rejectReason,
  onApprove, onStartReject, onCancelReject, onChangeReason, onConfirmReject,
}: {
  r: FloatRequest; tab: string; canCheck: boolean; busy: string; rejectId: string; rejectReason: string;
  onApprove: () => void; onStartReject: () => void; onCancelReject: () => void;
  onChangeReason: (v: string) => void; onConfirmReject: () => void;
}): ReactNode {
  const pending = tab === 'PENDING_APPROVAL';
  const rejecting = rejectId === r.id;
  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 600 }}>{r.merchant_name ?? '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>{r.account_type} · <span className="id">{shortId(r.account_id)}</span></div>
          {r.has_proof ? (
            <a className="prooflink" href={`${API}/v1/admin/float-requests/${r.id}/proof`} target="_blank" rel="noopener noreferrer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5 12.5 20a4 4 0 0 1-5.7-5.7l8-8a2.5 2.5 0 0 1 3.5 3.5l-8 8a1 1 0 0 1-1.4-1.4l7.3-7.3" /></svg>
              View proof
            </a>
          ) : <div style={{ fontSize: 11, color: 'var(--redm)' }}>no proof attached</div>}
        </td>
        <td className="num"><Money ngwee={r.amount} plain /></td>
        <td>
          <div style={{ fontSize: 13 }}>{r.requested_by_name ?? '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>{r.requested_by_email ?? ''}</div>
        </td>
        <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {pending ? r.created_at : (<>{r.decided_at}{r.decided_by_name ? <div style={{ fontSize: 11 }}>by {r.decided_by_name}</div> : null}</>)}
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {pending && canCheck && !rejecting ? (
            <>
              <button className="btn sm primary" disabled={!!busy} onClick={onApprove} style={{ marginRight: 6 }}>{busy === r.id ? '…' : 'Approve'}</button>
              <button className="btn sm danger" disabled={!!busy} onClick={onStartReject}>Reject</button>
            </>
          ) : pending && !canCheck ? (
            <span className="muted" style={{ fontSize: 12 }}>Admin approval</span>
          ) : !pending ? (
            <Badge value={r.status === 'APPROVED' ? 'APPROVED' : 'REJECTED'} />
          ) : null}
        </td>
      </tr>
      {rejecting ? (
        <tr>
          <td colSpan={5} style={{ background: 'var(--surface-2)' }}>
            <div className="field" style={{ margin: '6px 0 10px' }}>
              <label htmlFor={`rej-${r.id}`}>Reason for declining (recorded in the audit log)</label>
              <textarea id={`rej-${r.id}`} rows={2} value={rejectReason} onChange={(e) => onChangeReason(e.target.value)} placeholder="e.g. Proof of payment doesn’t match the requested amount." />
            </div>
            <div className="row">
              <button className="btn sm danger" disabled={!!busy || rejectReason.trim() === ''} onClick={onConfirmReject}>{busy === r.id ? 'Declining…' : 'Confirm decline'}</button>
              <button className="btn sm" onClick={onCancelReject}>Cancel</button>
            </div>
          </td>
        </tr>
      ) : (!pending && r.reason) ? (
        <tr><td colSpan={5} className="muted" style={{ fontSize: 12, background: 'var(--surface-2)' }}>Reason: {r.reason}</td></tr>
      ) : null}
    </>
  );
}

interface Proof { fileName: string; contentType: string; dataBase64: string; size: number }

function CreditFloat({
  canMake, accounts, account, setAccount, onDone,
}: {
  canMake: boolean;
  accounts: Account[];
  account: string;
  setAccount: (v: string) => void;
  onDone: () => void;
}): ReactNode {
  const [amount, setAmount] = useState('');
  const [proof, setProof] = useState<Proof | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function onFile(e: ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (!f) { setProof(null); return; }
    if (!PROOF_TYPES.includes(f.type)) { setError(`${f.name}: only PDF, JPG, PNG or WEBP are accepted.`); e.target.value = ''; return; }
    if (f.size > PROOF_MAX) { setError(`${f.name}: file is larger than 5MB.`); e.target.value = ''; return; }
    setError('');
    const reader = new FileReader();
    reader.onload = () => setProof({ fileName: f.name, contentType: f.type, dataBase64: String(reader.result).split(',')[1] ?? '', size: f.size });
    reader.readAsDataURL(f);
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(''); setResult('');
    if (!proof) { setError('Attach a proof of payment.'); return; }
    setBusy(true);
    try {
      const r = await apiPost<
        { posted: true; balanceAfter: string } | { posted: false; requestId: string }
      >(`/v1/admin/accounts/${account}/float-credit`, {
        amount,
        proofFileName: proof.fileName,
        proofContentType: proof.contentType,
        proofDataBase64: proof.dataBase64,
      });
      setResult(
        r.posted
          ? `Posted directly. New balance ${zmw(r.balanceAfter)}.`
          : `Request submitted — ${zmw(amount)} is awaiting a checker’s approval (ref ${r.requestId.slice(0, 8)}…).`,
      );
      setAmount(''); setProof(null); setAccount('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed.');
    } finally { setBusy(false); }
  }

  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 6 }}>Request a float credit</div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>Maker step — attach proof and submit for a checker to approve.</p>
      {!canMake ? <div className="note">Your role can’t request float credits. A Finance or Admin operator submits requests.</div> : null}
      {error ? <div className="err">{error}</div> : null}
      {result ? <div className="note">{result}</div> : null}
      <form onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label>Account</label>
          <select value={account} onChange={(e) => setAccount(e.target.value)} required disabled={!canMake}>
            <option value="">Select an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number} · {a.merchant_name} — {a.account_type} · {envTag(a.operating_mode)} ({zmw(a.float_balance)})
              </option>
            ))}
          </select>
        </div>
        <div className="field mono">
          <label>Amount (ngwee)</label>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required placeholder="0" disabled={!canMake} />
          {amount ? <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>= {zmw(amount)}</div> : null}
        </div>
        <div className="field">
          <label>Proof of payment <span style={{ color: 'var(--redm)' }}>*</span></label>
          <label className="upload">
            <span>{proof ? `${proof.fileName} · ${(proof.size / 1024).toFixed(0)} KB` : 'Attach bank slip / transfer receipt (PDF, JPG, PNG)'}</span>
            <span className="filebtn">{proof ? 'Replace' : 'Choose file'}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={onFile} hidden disabled={!canMake} />
          </label>
        </div>
        <button className="btn primary" disabled={busy || !account || !amount || !proof || !canMake}>
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Every credit needs proof of payment and a second approver — the approver must be a different operator (FLOAT-3, SEC-Z4).
        </p>
      </form>
    </div>
  );
}
