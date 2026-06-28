'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useData } from '@/lib/useData';
import { apiPost, apiPut, ApiError } from '@/lib/api';
import { PageHead } from '@/components/shell';
import { Badge, Money, Spinner, Empty } from '@/components/ui';
import { shortId } from '@/lib/format';

interface ChargeConfig {
  processor: string;
  charge_fulfiller: string;
  charge_type: string;
  fixed_value: string | null;
  percent_value: string | null;
  ova_account_ref: string | null;
}
interface AccountConfig {
  account: {
    id: string;
    account_type: string;
    operating_mode: 'SANDBOX' | 'PRODUCTION';
    status: string;
    float_balance: string;
  };
  settings: { callback_url: string | null; ip_whitelist: string[] };
  chargeConfigs: ChargeConfig[];
}

const PROCESSORS = ['MTN', 'AIRTEL', 'ZAMTEL', 'ZED_MOBILE', 'VISA'];

export default function AccountConfigPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useData<AccountConfig>(`/v1/admin/accounts/${id}/config`);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (loading) return <Spinner />;
  if (error || !data) return <Empty>Could not load account. {error}</Empty>;
  const a = data.account;

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label);
    setErr('');
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const toggleMode = () => {
    const next = a.operating_mode === 'PRODUCTION' ? 'SANDBOX' : 'PRODUCTION';
    return run('mode', async () => {
      await apiPost(`/v1/admin/accounts/${id}/mode`, { mode: next });
      setMsg(`Operating mode set to ${next}.`);
      reload();
    });
  };

  return (
    <>
      <PageHead
        title="Manage Account"
        subtitle={`${a.account_type} · ${shortId(a.id)}`}
        actions={
          <button className="btn primary" disabled={!!busy} onClick={() => void toggleMode()}>
            {busy === 'mode' ? '…' : `Switch to ${a.operating_mode === 'PRODUCTION' ? 'Sandbox' : 'Production'}`}
          </button>
        }
      />

      {err ? <div className="err">{err}</div> : null}
      {msg ? <div className="devhint" style={{ color: 'var(--emerald)', background: '#e7f2ec', borderColor: '#cfe6da' }}>{msg}</div> : null}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="eyebrow">Operating mode</div>
          <div style={{ marginTop: 8 }}><Badge value={a.operating_mode} /></div>
        </div>
        <div className="stat">
          <div className="eyebrow">Status</div>
          <div style={{ marginTop: 8 }}><Badge value={a.status} /></div>
        </div>
        <div className="stat">
          <div className="eyebrow">Float balance</div>
          <div className="value" style={{ fontSize: 20 }}><Money ngwee={a.float_balance} /></div>
        </div>
      </div>

      <ChargeConfigForm accountId={id} onSaved={(m) => { setMsg(m); reload(); }} onError={setErr} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">Configured charges</span>
        </div>
        {data.chargeConfigs.length === 0 ? (
          <Empty>No charge configuration yet. Add a processor above.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Processor</th>
                <th>Fulfiller</th>
                <th>Type</th>
                <th className="num">Fixed</th>
                <th className="num">Percent</th>
                <th>OVA ref</th>
              </tr>
            </thead>
            <tbody>
              {data.chargeConfigs.map((c) => (
                <tr key={c.processor}>
                  <td>{c.processor}</td>
                  <td>{c.charge_fulfiller}</td>
                  <td>{c.charge_type}</td>
                  <td className="num">{c.fixed_value ? <Money ngwee={c.fixed_value} plain /> : '—'}</td>
                  <td className="num">{c.percent_value ? `${c.percent_value}%` : '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.ova_account_ref ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SettingsForm
        accountId={id}
        initial={data.settings}
        onSaved={(m) => { setMsg(m); reload(); }}
        onError={setErr}
      />
    </>
  );
}

function ChargeConfigForm({
  accountId,
  onSaved,
  onError,
}: {
  accountId: string;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}): ReactNode {
  const [f, setF] = useState({
    processor: 'MTN',
    chargeFulfiller: 'SOURCE',
    chargeType: 'FIXED',
    fixedValue: '',
    percentValue: '',
    ovaAccountRef: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const needsFixed = f.chargeType === 'FIXED' || f.chargeType === 'TIERED';
  const needsPercent = f.chargeType === 'PERCENTAGE' || f.chargeType === 'TIERED';

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPut(`/v1/admin/accounts/${accountId}/charge-config`, {
        processor: f.processor,
        chargeFulfiller: f.chargeFulfiller,
        chargeType: f.chargeType,
        ...(needsFixed && f.fixedValue ? { fixedValue: f.fixedValue } : {}),
        ...(needsPercent && f.percentValue ? { percentValue: f.percentValue } : {}),
        ...(f.ovaAccountRef ? { ovaAccountRef: f.ovaAccountRef } : {}),
      });
      onSaved(`Charge config saved for ${f.processor}.`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save charge config.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>Charge configuration · add a payment processor</div>
      <form onSubmit={(e) => void submit(e)}>
        <div className="grid cols-3">
          <div className="field">
            <label>Processor</label>
            <select value={f.processor} onChange={set('processor')}>
              {PROCESSORS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Charge fulfiller</label>
            <select value={f.chargeFulfiller} onChange={set('chargeFulfiller')}>
              <option value="SOURCE">SOURCE (customer pays)</option>
              <option value="MERCHANT">MERCHANT (merchant pays)</option>
            </select>
          </div>
          <div className="field">
            <label>Charge type</label>
            <select value={f.chargeType} onChange={set('chargeType')}>
              <option value="FIXED">FIXED</option>
              <option value="PERCENTAGE">PERCENTAGE</option>
              <option value="TIERED">TIERED</option>
            </select>
          </div>
          {needsFixed ? (
            <div className="field mono">
              <label>Fixed charge (ngwee)</label>
              <input inputMode="numeric" value={f.fixedValue} onChange={(e) => setF((p) => ({ ...p, fixedValue: e.target.value.replace(/\D/g, '') }))} placeholder="0" />
            </div>
          ) : null}
          {needsPercent ? (
            <div className="field mono">
              <label>Percent (e.g. 2.50)</label>
              <input value={f.percentValue} onChange={(e) => setF((p) => ({ ...p, percentValue: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="0.00" />
            </div>
          ) : null}
          <div className="field">
            <label>OVA reference (optional)</label>
            <input value={f.ovaAccountRef} onChange={set('ovaAccountRef')} />
          </div>
        </div>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save charge config'}</button>
      </form>
    </div>
  );
}

function SettingsForm({
  accountId,
  initial,
  onSaved,
  onError,
}: {
  accountId: string;
  initial: { callback_url: string | null; ip_whitelist: string[] };
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}): ReactNode {
  const [callbackUrl, setCallbackUrl] = useState(initial.callback_url ?? '');
  const [ipList, setIpList] = useState(initial.ip_whitelist.join(', '));
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPut(`/v1/admin/accounts/${accountId}/settings`, {
        callbackUrl: callbackUrl || undefined,
        ipWhitelist: ipList ? ipList.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      });
      onSaved('Settings saved.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 14 }}>Callback URL &amp; IP whitelist</div>
      <form onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label>Callback / webhook URL</label>
          <input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field mono">
          <label>IP whitelist (comma-separated, for live keys)</label>
          <input value={ipList} onChange={(e) => setIpList(e.target.value)} placeholder="41.x.x.x, 102.x.x.x" />
        </div>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </form>
    </div>
  );
}
