'use client';

import { useState, type FormEvent, type ReactNode, type ChangeEvent } from 'react';
import Link from 'next/link';
import { apiPost, ApiError } from '@/lib/api';

const DOCS: Array<{ type: string; label: string; hint: string }> = [
  { type: 'CERTIFICATE_OF_INCORPORATION', label: 'Certificate of Incorporation', hint: 'PACRA certificate' },
  { type: 'TAX_CLEARANCE', label: 'Tax Clearance / TPIN', hint: 'ZRA certificate' },
  { type: 'DIRECTOR_ID', label: 'Director ID / Passport', hint: 'National ID or passport' },
  { type: 'PROOF_OF_ADDRESS', label: 'Proof of Address', hint: 'Utility bill or lease' },
  { type: 'BANK_CONFIRMATION', label: 'Bank Confirmation Letter', hint: 'Optional' },
];
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

interface UploadedDoc {
  type: string;
  fileName: string;
  contentType: string;
  dataBase64: string;
}

export default function GettingStarted(): ReactNode {
  const [form, setForm] = useState({
    name: '', tradingName: '', merchantType: 'PRIVATE', email: '', phone: '',
    registrationNumber: '', tpin: '', address: '', city: '', website: '', description: '',
    adminName: '', adminEmail: '', adminPhone: '',
  });
  const [docs, setDocs] = useState<Record<string, UploadedDoc>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function onFile(type: string) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        setDocs((d) => { const n = { ...d }; delete n[type]; return n; });
        return;
      }
      if (!ALLOWED.includes(file.type)) {
        setError(`${file.name}: only PDF, JPG, PNG or WEBP files are accepted.`);
        e.target.value = '';
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name}: file is larger than 5MB.`);
        e.target.value = '';
        return;
      }
      setError('');
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).split(',')[1] ?? '';
        setDocs((d) => ({ ...d, [type]: { type, fileName: file.name, contentType: file.type, dataBase64: base64 } }));
      };
      reader.readAsDataURL(file);
    };
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await apiPost<{ message: string }>('/onboarding/applications', {
        merchant: {
          name: form.name,
          merchantType: form.merchantType,
          email: form.email,
          phone: form.phone || undefined,
          tradingName: form.tradingName || undefined,
          registrationNumber: form.registrationNumber || undefined,
          tpin: form.tpin || undefined,
          address: form.address || undefined,
          city: form.city || undefined,
          website: form.website || undefined,
          description: form.description || undefined,
        },
        admin: { name: form.adminName, email: form.adminEmail, phone: form.adminPhone || undefined },
        documents: Object.values(docs),
      });
      setMessage(r.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" style={{ justifyContent: 'flex-start', paddingTop: 48, paddingBottom: 48 }}>
      <div className="auth-card" style={{ maxWidth: 640 }}>
        <div className="brand">
          <img className="logo" src="/brand/instacom-logo.png" alt="Instacom" />
          <span>merchant</span>
        </div>

        {message ? (
          <>
            <h1>Application received</h1>
            <div className="devhint" style={{ color: 'var(--success)', background: '#e6f4ee', borderColor: '#cce8dc' }}>
              {message}
            </div>
            <Link className="btn primary" href="/" style={{ marginTop: 4 }}>Back to home</Link>
          </>
        ) : (
          <>
            <h1>Apply to onboard your business</h1>
            <p className="hint">Tell us about your business and upload your KYC documents. Our compliance team reviews within 24–48 hours.</p>
            {error ? <div className="err">{error}</div> : null}
            <form onSubmit={(e) => void submit(e)}>
              <div className="form-section">Business details</div>
              <div className="field">
                <label>Registered business name</label>
                <input value={form.name} onChange={set('name')} required placeholder="Acme Traders Ltd" />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Trading name <span className="opt">(optional)</span></label>
                  <input value={form.tradingName} onChange={set('tradingName')} placeholder="Acme" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Type</label>
                  <select value={form.merchantType} onChange={set('merchantType')}>
                    <option value="PRIVATE">PRIVATE</option>
                    <option value="PUBLIC">PUBLIC</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Registration no. (PACRA)</label>
                  <input value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="120240098765" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>TPIN (ZRA)</label>
                  <input value={form.tpin} onChange={set('tpin')} placeholder="1002345678" />
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Physical address</label>
                  <input value={form.address} onChange={set('address')} placeholder="Plot 12, Cairo Road" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>City</label>
                  <input value={form.city} onChange={set('city')} placeholder="Lusaka" />
                </div>
              </div>
              <div className="field">
                <label>Website <span className="opt">(optional)</span></label>
                <input value={form.website} onChange={set('website')} placeholder="https://…" />
              </div>
              <div className="field">
                <label>What does your business do?</label>
                <textarea rows={2} value={form.description} onChange={set('description')} placeholder="Briefly describe your business and how you’ll use Instacom." />
              </div>

              <div className="form-section">Primary contact</div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Full name</label>
                  <input value={form.adminName} onChange={set('adminName')} required placeholder="Jane Banda" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Email</label>
                  <input type="email" value={form.adminEmail} onChange={set('adminEmail')} required placeholder="jane@acme.co.zm" />
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Business email</label>
                  <input type="email" value={form.email} onChange={set('email')} required placeholder="ops@acme.co.zm" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Phone</label>
                  <input value={form.adminPhone} onChange={set('adminPhone')} placeholder="+260…" />
                </div>
              </div>

              <div className="form-section">KYC documents <span className="opt">(PDF/JPG/PNG, max 5MB each)</span></div>
              {DOCS.map((d) => (
                <div className="docrow" key={d.type}>
                  <div className="docmeta">
                    <div className="docname">{d.label}</div>
                    <div className="dochint">{docs[d.type] ? docs[d.type].fileName : d.hint}</div>
                  </div>
                  <label className="filebtn">
                    {docs[d.type] ? 'Replace' : 'Upload'}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={onFile(d.type)} hidden />
                  </label>
                  {docs[d.type] ? <span className="ok" aria-label="uploaded">✓</span> : null}
                </div>
              ))}

              <button className="btn primary" style={{ width: '100%', marginTop: 16 }} disabled={busy}>
                {busy ? 'Submitting…' : 'Submit application'}
              </button>
              <p className="auth-alt" style={{ textAlign: 'center' }}>
                Already onboarded? <Link href="/login">Sign in</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
