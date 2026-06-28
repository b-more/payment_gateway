import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';

export const metadata: Metadata = {
  title: 'How it works — Instacom Payment Solutions',
  description: 'From a customer’s payment to settlement in your bank — a clear, accountable path for every transaction.',
};

const STEPS: Array<{ t: string; b: string }> = [
  { t: 'Customer pays', b: 'Your customer pays over the mobile money wallet or card they already use — MTN, Airtel, Zamtel, Zed Mobile or Visa. No app to download, no friction.' },
  { t: 'Instacom routes', b: 'We authenticate, sign and route the request to the right processor — idempotently, so a retry never double-charges, and securely, with every step recorded.' },
  { t: 'You get settled', b: 'Funds settle to your bank in Kwacha, reconciled against processor reports. Every figure is accountable to the ngwee in an append-only ledger.' },
];

export default function HowItWorks(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> How it works</span>
          <h1>A clear path for every transaction.</h1>
          <p>Three steps, fully accountable — from the first payment to the money in your bank account.</p>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className="flow">
            {STEPS.map((s) => (
              <div className="step" key={s.t}>
                <span className="mark" />
                <h3>{s.t}</h3>
                <p>{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="See it in your own dashboard." sub="Onboard for free and watch every transaction, settlement and balance update in real time." />
    </>
  );
}
