import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, I, RAILS } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';

export const metadata: Metadata = {
  title: 'How it works — Instacom Payment Solutions',
  description:
    'From a customer’s payment to settlement in your bank — a clear, accountable path for every transaction, reconciled to the ngwee.',
};

const STEPS: Array<{ ic: string; t: string; b: string }> = [
  { ic: I.phone, t: 'Customer pays', b: 'Your customer pays over the mobile money wallet or card they already use — MTN, Airtel, Zamtel, Zed Mobile or Visa. No app to download, no friction.' },
  { ic: I.swap, t: 'Instacom routes', b: 'We authenticate, sign and route the request to the right processor — idempotently, so a retry never double-charges, and securely, with every step recorded.' },
  { ic: I.check, t: 'You get settled', b: 'Funds settle to your bank in Kwacha, reconciled against processor reports. Every figure is accountable to the ngwee in an append-only ledger.' },
];

const ACCOUNT: Array<{ ic: string; t: string; b: string }> = [
  { ic: I.swap, t: 'Idempotent by design', b: 'Every mutating request carries an Idempotency-Key — a retry returns the original result and never double-charges a customer.' },
  { ic: I.pulse, t: 'Append-only ledger', b: 'Each balance change is a double-entry row. Balances are derived from the ledger and reconcilable to the ngwee — never silently overwritten.' },
  { ic: I.shield, t: 'Row-locked float', b: 'Spend is guarded by database row locks inside a transaction, so concurrent payments can never overspend your float.' },
  { ic: I.bolt, t: 'Reconciled & signed', b: 'Transactions are matched against processor reports daily, and every webhook is HMAC-signed so you can trust each callback.' },
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'How long does settlement take?', a: 'Collections move in seconds. Settlement of cleared funds to your bank account runs on a scheduled cycle in Kwacha, fully reconciled against processor reports before payout.' },
  { q: 'Do I need an app or a new checkout?', a: 'No. Your customers pay with the MTN, Airtel, Zamtel, Zed Mobile or Visa account they already have. You integrate once via our API or use the merchant dashboard.' },
  { q: 'What happens if a payment is retried?', a: 'Every mutating request takes an Idempotency-Key. If the same key is seen again, we return the original result instead of processing a second time — so retries are always safe.' },
  { q: 'Is there a setup or integration fee?', a: 'No setup fee, no monthly minimum and no lock-in. Onboarding and integration are free — you only pay as you transact.' },
  { q: 'Is Instacom regulated?', a: 'Yes. Instacom Payment Solutions Limited is licensed by the Bank of Zambia and operates as a regulated payment service provider, with an append-only audit trail on every transaction.' },
];

export default function HowItWorks(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> How it works</span>
          <h1>A clear path for every transaction.</h1>
          <p>Three steps, fully accountable — from the first payment to the money in your bank account.</p>
          <div className="tags">
            <span className="tag"><Icon d={I.shield} width={15} height={15} /> Bank of Zambia licensed</span>
            <span className="tag"><Icon d={I.swap} width={15} height={15} /> Idempotent &amp; safe</span>
            <span className="tag"><Icon d={I.check} width={15} height={15} /> Settled in ZMW</span>
          </div>
        </div>
      </div>

      {/* rails */}
      <div className="rails">
        <div className="wrap">
          <span className="label">Works with every rail</span>
          <div className="set">
            {RAILS.map((r) => <span className="rail" key={r}>{r}</span>)}
          </div>
        </div>
      </div>

      {/* numbered flow */}
      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> The flow</span>
            <h2>From payment to payout, in three steps.</h2>
            <p>Each step is authenticated, recorded and reversible only through accountable, compensating entries.</p>
          </div>
          <div className="flow">
            {STEPS.map((s, i) => (
              <div className="howstep" key={s.t}>
                <span className="no">STEP {String(i + 1).padStart(2, '0')}</span>
                <span className="ic"><Icon d={s.ic} /></span>
                <h3>{s.t}</h3>
                <p>{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* accountability */}
      <section className="tint">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Accountable by design</span>
            <h2>What makes every transaction trustworthy.</h2>
            <p>The guarantees underneath every kwacha that moves through Instacom — not features bolted on, but how the engine is built.</p>
          </div>
          <div className="features">
            {ACCOUNT.map((f) => (
              <div className="feature" key={f.t}>
                <span className="ic"><Icon d={f.ic} /></span>
                <h3>{f.t} <span className="dot" /></h3>
                <p>{f.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* split — accountable to the ngwee */}
      <section>
        <div className="wrap">
          <div className="split">
            <div className="figure">
              <img src="/campaign/5.jpg" alt="Instacom merchant dashboard — every transaction accounted for in ZMW" loading="lazy" decoding="async" />
            </div>
            <div className="copy">
              <span className="eyebrow"><span className="dot" /> Accountable to the ngwee</span>
              <h2>Every figure ties back to the ledger.</h2>
              <p>
                Money is stored as integer ngwee — never a floating-point number — and every balance is
                derived from an append-only, double-entry ledger. Watch collections, settlements and
                float move in real time from your dashboard, with reconciliation against processor
                reports built in.
              </p>
              <div className="actions" style={{ marginTop: 26 }}>
                <Link className="btn btn-navy" href="/developers">See the developer API <Icon d={I.arrow} width={18} height={18} /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="tint">
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow"><span className="dot" /> Questions</span>
            <h2>Frequently asked.</h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="See it in your own dashboard." sub="Onboard for free and watch every transaction, settlement and balance update in real time." />
    </>
  );
}
