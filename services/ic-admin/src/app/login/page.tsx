'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, ApiError } from '@/lib/api';

const RAILS = ['MTN', 'Airtel', 'Zamtel', 'Zed Mobile', 'Visa'];
const POINTS = [
  'Oversee every merchant, account & transaction',
  'Manage float, settlements & reconciliation',
  'Full audit trail, RBAC & security controls',
];
const REMEMBER_KEY = 'ic.merchant.email';
type Stage = 'login' | 'otp' | 'forgot' | 'reset' | 'reset-done';

const EyeIcon = ({ off }: { off: boolean }): ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {off ? (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
        <path d="M9.9 5.1A10 10 0 0 1 22 12c-.5 1-1.3 2.2-2.4 3.2M6.1 6.1A10.6 10.6 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.3-.6" />
      </>
    ) : (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

function PasswordInput({
  id, value, placeholder, autoComplete, onChange, onCaps,
}: {
  id: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  onChange: (v: string) => void;
  onCaps?: (on: boolean) => void;
}): ReactNode {
  const [show, setShow] = useState(false);
  const caps = (e: KeyboardEvent<HTMLInputElement>) => onCaps?.(e.getModifierState('CapsLock'));
  return (
    <div className="pw-wrap">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onKeyUp={caps}
        onKeyDown={caps}
        required
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  );
}

// Mask the local part of an email: nelson@host → ne•••n@host
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return email;
  if (local.length <= 2) return `${local[0] ?? ''}•@${domain}`;
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(3, local.length - 3))}${local.slice(-1)}@${domain}`;
}

// Segmented OTP input — one box per digit, with auto-advance, backspace, paste
// and auto-submit when full.
function OtpBoxes({
  value, onChange, onComplete, length = 6, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
}): ReactNode {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    if (value === '') setDigits(Array(length).fill(''));
  }, [value, length]);
  const focus = (i: number): void => { refs.current[i]?.focus(); };
  const emit = (arr: string[]): void => {
    setDigits(arr);
    const joined = arr.join('');
    onChange(joined);
    if (joined.length === length && !arr.includes('')) onComplete?.(joined);
  };
  const onCh = (i: number, raw: string): void => {
    const d = raw.replace(/\D/g, '');
    if (!d) return;
    const arr = [...digits];
    if (d.length > 1) {
      let idx = i;
      for (const ch of d) { if (idx < length) arr[idx++] = ch; }
      emit(arr); focus(Math.min(idx, length - 1));
    } else {
      arr[i] = d; emit(arr); if (i < length - 1) focus(i + 1);
    }
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = [...digits];
      if (arr[i]) { arr[i] = ''; emit(arr); }
      else if (i > 0) { arr[i - 1] = ''; emit(arr); focus(i - 1); }
    } else if (e.key === 'ArrowLeft' && i > 0) focus(i - 1);
    else if (e.key === 'ArrowRight' && i < length - 1) focus(i + 1);
  };
  return (
    <div className="otp-boxes">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="otp-box"
          inputMode="numeric"
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          value={d}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => onCh(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (!t) return;
            const arr = Array<string>(length).fill('');
            for (let k = 0; k < t.length; k++) arr[k] = t[k];
            emit(arr); focus(Math.min(t.length, length - 1));
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export default function LoginPage(): ReactNode {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Prefill a remembered email.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(REMEMBER_KEY) : null;
    if (saved) { setEmail(saved); setRemember(true); }
  }, []);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function rememberEmail(): void {
    if (typeof window === 'undefined') return;
    if (remember) window.localStorage.setItem(REMEMBER_KEY, email);
    else window.localStorage.removeItem(REMEMBER_KEY);
  }

  async function submitLogin(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await authApi.login(email, password);
      rememberEmail();
      setChallengeId(r.challengeId);
      setDevCode(r.devCode);
      setStage('otp');
      setResendIn(30);
    } catch (err) {
      setError(err instanceof ApiError ? 'Invalid email or password.' : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function resend(): Promise<void> {
    if (resendIn > 0 || busy) return;
    setError(''); setInfo('');
    try {
      const r = await authApi.login(email, password);
      setChallengeId(r.challengeId);
      setDevCode(r.devCode);
      setCode('');
      setInfo('A new code is on its way.');
      setResendIn(30);
    } catch {
      setError('Could not resend the code. Try signing in again.');
    }
  }

  async function verifyCode(c?: string): Promise<void> {
    const otp = (c ?? code).replace(/\D/g, '');
    if (busy || otp.length !== 6) return;
    setError(''); setBusy(true);
    try {
      await authApi.verifyOtp(challengeId, otp);
      router.replace('/dashboard');
    } catch {
      setError('That code is invalid or expired.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await authApi.forgotPassword(email);
      setChallengeId(r.challengeId);
      setDevCode(r.devCode);
      setCode(''); setNewPassword(''); setConfirm('');
      setInfo(`If ${email} is registered, we’ve sent a 6-digit reset code.`);
      setStage('reset');
    } catch {
      setError('Could not start a reset. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setError('Passwords don’t match.'); return; }
    setBusy(true);
    try {
      await authApi.resetPassword(challengeId, code, newPassword);
      setInfo(''); setStage('reset-done');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That code is invalid or expired.' : 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  }

  const goLogin = (): void => {
    setStage('login'); setError(''); setInfo(''); setPassword(''); setCode('');
  };

  function renderForm(): ReactNode {
    if (stage === 'login') {
      return (
        <>
          <h1>Welcome back</h1>
          <p className="hint">Sign in to the Instacom admin console.</p>
          {error ? <div className="err">{error}</div> : null}
          <form onSubmit={(e) => void submitLogin(e)}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" placeholder="you@business.co.zm" autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="pw">Password</label>
              <PasswordInput id="pw" value={password} placeholder="••••••••" autoComplete="current-password"
                onChange={setPassword} onCaps={setCaps} />
              {caps ? <div className="caps">⇪ Caps Lock is on</div> : null}
            </div>
            <div className="form-row">
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </label>
              <button type="button" className="linkbtn" onClick={() => { setStage('forgot'); setError(''); setInfo(''); }}>
                Forgot password?
              </button>
            </div>
            <button className="btn primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          </form>
        </>
      );
    }
    if (stage === 'otp') {
      return (
        <>
          <h1>Verify it&apos;s you</h1>
          <p className="hint">Enter the 6-digit code sent to {maskEmail(email)}.</p>
          {devCode ? <div className="devhint">dev code · {devCode}</div> : null}
          {info ? <div className="note">{info}</div> : null}
          {error ? <div className="err">{error}</div> : null}
          <form onSubmit={(e) => { e.preventDefault(); void verifyCode(); }}>
            <div className="field">
              <label>One-time code</label>
              <OtpBoxes value={code} onChange={setCode} onComplete={(v) => void verifyCode(v)} autoFocus />
            </div>
            <button className="btn primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify & enter'}</button>
          </form>
          <div className="form-row" style={{ marginTop: 14 }}>
            <button type="button" className="linkbtn" onClick={goLogin}>← Use a different email</button>
            <button type="button" className="linkbtn" onClick={() => void resend()} disabled={resendIn > 0}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </>
      );
    }
    if (stage === 'forgot') {
      return (
        <>
          <h1>Reset your password</h1>
          <p className="hint">Enter your account email and we’ll send a reset code.</p>
          {error ? <div className="err">{error}</div> : null}
          <form onSubmit={(e) => void submitForgot(e)}>
            <div className="field">
              <label htmlFor="femail">Email</label>
              <input id="femail" type="email" placeholder="you@business.co.zm" autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset code'}</button>
          </form>
          <p className="auth-alt"><button type="button" className="linkbtn" onClick={goLogin}>← Back to sign in</button></p>
        </>
      );
    }
    if (stage === 'reset') {
      return (
        <>
          <h1>Set a new password</h1>
          <p className="hint">Enter the code we emailed and choose a new password.</p>
          {devCode ? <div className="devhint">dev code · {devCode}</div> : null}
          {info ? <div className="note">{info}</div> : null}
          {error ? <div className="err">{error}</div> : null}
          <form onSubmit={(e) => void submitReset(e)}>
            <div className="field mono">
              <label htmlFor="rcode">Reset code</label>
              <input id="rcode" inputMode="numeric" maxLength={6} placeholder="••••••"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="np">New password</label>
              <PasswordInput id="np" value={newPassword} placeholder="At least 8 characters" autoComplete="new-password"
                onChange={setNewPassword} onCaps={setCaps} />
              {caps ? <div className="caps">⇪ Caps Lock is on</div> : null}
            </div>
            <div className="field">
              <label htmlFor="cp">Confirm new password</label>
              <PasswordInput id="cp" value={confirm} placeholder="Re-enter password" autoComplete="new-password"
                onChange={setConfirm} />
            </div>
            <button className="btn primary" disabled={busy || code.length !== 6}>{busy ? 'Resetting…' : 'Reset password'}</button>
          </form>
          <p className="auth-alt"><button type="button" className="linkbtn" onClick={goLogin}>← Back to sign in</button></p>
        </>
      );
    }
    // reset-done
    return (
      <>
        <h1>Password updated</h1>
        <div className="note">Your password has been reset and other sessions signed out. Sign in with your new password.</div>
        <button className="btn primary" style={{ width: '100%', marginTop: 6 }} onClick={goLogin}>Back to sign in</button>
      </>
    );
  }

  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <div className="aside-head">
          <img className="logo" src="/brand/instacom-logo.png" alt="Instacom Payment Solutions" />
          <span className="portal-tag">Admin Console</span>
        </div>
        <div className="aside-body">
          <span className="eyebrow">Admin console</span>
          <h2>Run the whole platform from one console.</h2>
          <ul className="aside-points">
            {POINTS.map((p) => (
              <li key={p}><span className="tick" aria-hidden>✓</span>{p}</li>
            ))}
          </ul>
        </div>
        <div className="aside-foot">
          <div className="aside-rails">{RAILS.map((r) => <span key={r}>{r}</span>)}</div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-form">
          <img className="logo-mini" src="/brand/instacom-logo.png" alt="Instacom" />
          {renderForm()}
          <div className="auth-credit"><span className="sep" />Powered by Codesync</div>
        </div>
      </main>
    </div>
  );
}
