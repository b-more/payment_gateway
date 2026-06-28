'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/useData';
import { apiPost, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface Merchant {
  id: string;
  name: string;
  merchant_type: string;
  status: string;
  kyc_status: string;
  registered_at: string;
}

export default function MerchantsPage(): ReactNode {
  const { data, loading, error, reload } = useData<Merchant[]>('/v1/admin/merchants');
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHead
        title="Merchants"
        subtitle="Onboard, review and manage merchant accounts."
        actions={
          <button className="btn primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : '+ Create Merchant'}
          </button>
        }
      />

      {creating ? (
        <CreateMerchant
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}

      <div className="card">
        {loading ? (
          <div className="card-pad">
            <Spinner />
          </div>
        ) : error ? (
          <Empty>Could not load merchants. {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No merchants yet. Create one to get started.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>KYC</th>
                <th>Registered</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/merchants/${m.id}`} style={{ fontWeight: 600 }}>
                      {m.name}
                    </Link>
                    <div className="id">{shortId(m.id)}</div>
                  </td>
                  <td>{m.merchant_type}</td>
                  <td>
                    <Badge value={m.kyc_status} />
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{m.registered_at}</td>
                  <td>
                    <Badge value={m.status} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn sm" href={`/merchants/${m.id}`}>
                      Manage
                    </Link>
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

function CreateMerchant({ onDone }: { onDone: () => void }): ReactNode {
  const [form, setForm] = useState({
    name: '',
    merchantType: 'PRIVATE',
    email: '',
    phone: '',
    adminName: '',
    adminEmail: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiPost('/v1/admin/merchants', {
        merchant: {
          name: form.name,
          merchantType: form.merchantType,
          email: form.email,
          phone: form.phone || undefined,
        },
        admin: { name: form.adminName, email: form.adminEmail },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create merchant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>New merchant application</div>
      {error ? <div className="err">{error}</div> : null}
      <form onSubmit={(e) => void submit(e)}>
        <div className="grid cols-2">
          <div className="field">
            <label>Business name</label>
            <input value={form.name} onChange={set('name')} required />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.merchantType} onChange={set('merchantType')}>
              <option value="PRIVATE">PRIVATE</option>
              <option value="PUBLIC">PUBLIC</option>
            </select>
          </div>
          <div className="field">
            <label>Contact email</label>
            <input type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field">
            <label>Contact phone</label>
            <input value={form.phone} onChange={set('phone')} />
          </div>
          <div className="field">
            <label>Admin super-user name</label>
            <input value={form.adminName} onChange={set('adminName')} required />
          </div>
          <div className="field">
            <label>Admin email</label>
            <input type="email" value={form.adminEmail} onChange={set('adminEmail')} required />
          </div>
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create merchant'}
        </button>
      </form>
    </div>
  );
}
