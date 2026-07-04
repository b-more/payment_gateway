'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Spinner, Empty } from '@/components/ui';
import { zmw } from '@/lib/format';

const ICON_CLOCK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const ICON_SEND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
);

interface Account {
  id: string;
  account_number: string;
  account_type: string;
  operating_mode: string;
  status: string;
}
interface Requested {
  id: string;
  status: string;
}

const PROCESSORS = ['AIRTEL', 'MTN', 'ZAMTEL', 'ZED_MOBILE', 'VISA'];

function friendlyError(err: ApiError): string {
  if (err.code === 'CONFIGURATION_ERROR') return "This account isn't set up for that rail yet. Ask your admin to configure charges.";
  if (err.code === 'RATE_LIMITED') return 'Too many requests — please wait and try again.';
  return err.message;
}

function kwachaToNgwee(input: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const ngwee = BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0');
  return ngwee > 0n ? ngwee.toString() : null;
}

export default function DisbursePage(): ReactNode {
  const accounts = useData<Account[]>('/v1/merchant/accounts');
  const [accountId, setAccountId] = useState('');
  const [processor, setProcessor] = useState('AIRTEL');
  const [amount, setAmount] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ amount: string; msisdn: string } | null>(null);

  const ngwee = kwachaToNgwee(amount);
  const canSubmit = !!accountId && !!processor && !!ngwee && msisdn.trim().length >= 9 && !busy;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit || !ngwee) return;
    setBusy(true);
    setError('');
    try {
      await apiPost<Requested>(`/v1/merchant/accounts/${accountId}/disburse`, {
        processor,
        amount: ngwee,
        msisdn: msisdn.trim(),
        reference: reference.trim() || undefined,
      });
      setDone({ amount: ngwee, msisdn: msisdn.trim() });
    } catch (err) {
      setError(err instanceof ApiError ? friendlyError(err) : 'Could not request the payout.');
    } finally {
      setBusy(false);
    }
  }

  function newPayout(): void {
    setDone(null);
    setError('');
    setAmount('');
    setReference('');
  }

  const list = accounts.data ?? [];

  return (
    <>
      <PageHead title="Disburse" subtitle="Request a payout — a second admin approves before it's sent." />

      {accounts.loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty>No accounts yet. Once your account is provisioned, you can request payouts here.</Empty>
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
                    <option key={a.id} value={a.id}>{a.account_number} · {a.account_type} · {a.operating_mode}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Payment rail</label>
                <select value={processor} onChange={(e) => setProcessor(e.target.value)} required>
                  {PROCESSORS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Amount</label>
                <div className="amount-wrap">
                  <span className="prefix">ZMW</span>
                  <input inputMode="decimal" placeholder="1.50" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                {amount && !ngwee ? <span className="muted" style={{ fontSize: 12, color: 'var(--redm)' }}>Enter a valid amount, e.g. 1.50</span> : null}
              </div>
              <div className="field">
                <label>Recipient mobile number</label>
                <input inputMode="tel" placeholder="260975020473" value={msisdn} onChange={(e) => setMsisdn(e.target.value)} required />
              </div>
              <div className="field">
                <label>Reference (optional)</label>
                <input placeholder="PAYOUT-000123" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <button className="btn primary" disabled={!canSubmit}>
                {busy ? 'Requesting…' : ngwee ? `Request ZMW ${amount}` : 'Request payout'}
              </button>
            </form>
          </div>

          <div className="card card-pad">
            {!done ? (
              <div className="result-state">
                <div className="result-icon" style={{ background: 'var(--surface-2)', color: 'var(--faint)' }}>{ICON_SEND}</div>
                <div className="result-sub" style={{ maxWidth: 260, margin: '0 auto' }}>
                  For security, payouts use <b>maker-checker</b>: you request it here, and a
                  <b> different admin</b> approves it under <b>Approvals</b> before any money is sent.
                </div>
              </div>
            ) : (
              <div className="result-state">
                <div className="result-icon pending">{ICON_CLOCK}</div>
                <div className="result-title">Payout requested</div>
                <div className="result-amount">{zmw(done.amount)}</div>
                <div className="result-sub">to {done.msisdn}</div>
                <div className="result-meta" style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
                    Pending approval — <b>another admin</b> must approve it under{' '}
                    <Link href="/approvals" style={{ color: 'var(--sky-deep)' }}>Approvals</Link> before it’s sent.
                  </p>
                </div>
                <button className="btn primary" onClick={newPayout}>Request another</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
