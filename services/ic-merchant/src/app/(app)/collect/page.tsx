'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useData } from '@/lib/useData';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Spinner, Empty } from '@/components/ui';
import { zmw } from '@/lib/format';

const ICON_CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
);
const ICON_X = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
);
const ICON_PHONE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
);

interface Account {
  id: string;
  account_number: string;
  account_type: string;
  operating_mode: string;
  status: string;
}
interface TxnResult {
  id: string;
  status: string;
  amount: string;
  msisdn: string | null;
  processor: string;
  failure_reason?: string | null;
}

const PROCESSORS = ['AIRTEL', 'MTN', 'ZAMTEL', 'ZED_MOBILE', 'VISA'];

// Turn engine error codes into something a merchant can act on.
function friendlyError(err: ApiError, processor: string): string {
  switch (err.code) {
    case 'CONFIGURATION_ERROR':
      return `This account isn't set up for ${processor.replace('_', ' ')} yet. Ask your Instacompay admin to configure charges for this rail.`;
    case 'ACCOUNT_NOT_LIVE':
      return 'This account is not live yet, or has no float. Contact your Instacompay admin.';
    case 'RATE_LIMITED':
      return 'Too many requests — please wait a moment and try again.';
    default:
      return err.message;
  }
}

function failureText(reason: string | null | undefined): string {
  if (reason === 'INSUFFICIENT_FLOAT') return 'Insufficient float — please fund this account before collecting.';
  if (reason === 'SIMULATED_DECLINE') return 'Declined (sandbox simulation).';
  return reason ? `This collection did not complete (${reason}).` : 'This collection did not complete.';
}

// Kwacha input (e.g. "1.50") -> integer ngwee string, without floating point.
function kwachaToNgwee(input: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? '').padEnd(2, '0') || '0');
  const ngwee = whole * 100n + frac;
  return ngwee > 0n ? ngwee.toString() : null;
}

export default function CollectPage(): ReactNode {
  const accounts = useData<Account[]>('/v1/merchant/accounts');
  const [accountId, setAccountId] = useState('');
  const [processor, setProcessor] = useState('AIRTEL');
  const [amount, setAmount] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TxnResult | null>(null);

  const ngwee = kwachaToNgwee(amount);
  const canSubmit = !!accountId && !!processor && !!ngwee && msisdn.trim().length >= 9 && !busy;

  // While a collection is PROCESSING, poll its status (the endpoint re-enquires
  // the rail on read) so the panel updates to SUCCESS/FAILED in real time.
  useEffect(() => {
    if (!result || result.status !== 'PROCESSING' || !accountId) return;
    let cancelled = false;
    let tries = 0;
    const poll = async (): Promise<void> => {
      tries += 1;
      try {
        const r = await apiGet<TxnResult>(`/v1/merchant/accounts/${accountId}/transactions/${result.id}/status`);
        if (cancelled) return;
        if (r.status !== 'PROCESSING') {
          setResult(r);
          return;
        }
      } catch {
        // transient — keep polling
      }
      if (!cancelled && tries < 25) window.setTimeout(() => void poll(), 3000);
    };
    const t = window.setTimeout(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [result, accountId]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit || !ngwee) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await apiPost<TxnResult>(`/v1/merchant/accounts/${accountId}/collect`, {
        processor,
        amount: ngwee,
        msisdn: msisdn.trim(),
        reference: reference.trim() || undefined,
      });
      setResult(r);
    } catch (err) {
      setError(err instanceof ApiError ? friendlyError(err, processor) : 'Could not start the collection.');
    } finally {
      setBusy(false);
    }
  }

  function tryAgain(): void {
    setResult(null);
    setError('');
  }
  function newCollection(): void {
    setResult(null);
    setError('');
    setAmount('');
    setReference('');
  }

  const list = accounts.data ?? [];

  return (
    <>
      <PageHead title="Collect" subtitle="Request a payment from a customer's mobile money." />

      {accounts.loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty>No accounts yet. Once your account is provisioned, you can collect here.</Empty>
      ) : (
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad">
            {error ? <div className="err">{error}</div> : null}
            <form onSubmit={(e) => void submit(e)}>
              <div className="field">
                <label>Account</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                  <option value="">Select an account…</option>
                  {list.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_number} · {a.account_type} · {a.operating_mode}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Payment rail</label>
                <select value={processor} onChange={(e) => setProcessor(e.target.value)} required>
                  {PROCESSORS.map((p) => (
                    <option key={p} value={p}>{p.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Amount</label>
                <div className="amount-wrap">
                  <span className="prefix">ZMW</span>
                  <input
                    inputMode="decimal"
                    placeholder="1.50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                {amount && !ngwee ? (
                  <span className="muted" style={{ fontSize: 12, color: 'var(--redm)' }}>Enter a valid amount, e.g. 1.50</span>
                ) : null}
              </div>

              <div className="field">
                <label>Customer mobile number</label>
                <input
                  inputMode="tel"
                  placeholder="260975020473"
                  value={msisdn}
                  onChange={(e) => setMsisdn(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Reference (optional)</label>
                <input placeholder="INV-000123" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>

              <button className="btn primary" disabled={!canSubmit}>
                {busy ? 'Requesting…' : ngwee ? `Collect ZMW ${amount}` : 'Collect'}
              </button>
            </form>
          </div>

          <div className="card card-pad">
            {!result ? (
              <div className="result-state">
                <div className="result-icon" style={{ background: 'var(--surface-2)', color: 'var(--faint)' }}>{ICON_PHONE}</div>
                <div className="result-sub" style={{ maxWidth: 250, margin: '0 auto' }}>
                  Fill in the details and hit <b>Collect</b>. The customer approves a prompt on their phone —
                  the result appears here and under <b>Transactions</b>.
                </div>
              </div>
            ) : result.status === 'SUCCESS' ? (
              <div className="result-state">
                <div className="result-icon ok">{ICON_CHECK}</div>
                <div className="result-title">Payment collected</div>
                <div className="result-amount">{zmw(result.amount)}</div>
                <div className="result-sub">from {result.msisdn ?? '—'} · {result.processor.replace('_', ' ')}</div>
                <div className="result-meta">
                  <div className="kv"><div className="kv-label">Transaction</div><div className="kv-value mono" style={{ fontSize: 12 }}>{result.id}</div></div>
                </div>
                <button className="btn primary" onClick={newCollection}>Collect another</button>
              </div>
            ) : result.status === 'PROCESSING' ? (
              <div className="result-state">
                <div className="result-icon pending">{ICON_PHONE}</div>
                <div className="result-title">Waiting for approval</div>
                <div className="result-amount">{zmw(result.amount)}</div>
                <div className="result-sub">Prompt sent to {result.msisdn ?? '—'}</div>
                <div style={{ marginTop: 18 }}>
                  <span className="muted" style={{ fontSize: 12 }}><span className="live-dot" />Updating automatically…</span>
                </div>
              </div>
            ) : (
              <div className="result-state">
                <div className="result-icon fail">{ICON_X}</div>
                <div className="result-title">Not completed</div>
                <div className="result-amount" style={{ color: 'var(--muted)' }}>{zmw(result.amount)}</div>
                <div className="result-sub">{result.processor.replace('_', ' ')} · {result.msisdn ?? '—'}</div>
                <div className="result-meta">
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>{failureText(result.failure_reason)}</p>
                </div>
                <button className="btn primary" onClick={tryAgain}>Try again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
