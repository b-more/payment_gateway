import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, I, MERCHANT } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';

export const metadata: Metadata = {
  title: 'Pricing | Instacom Payment Solutions',
  description:
    'Free onboarding, zero integration cost, no monthly minimum and no lock-in. You pay only when you transact. Transaction rates depend on the rail and your volume.',
};

const INCLUDED: string[] = [
  'Onboarding and account setup',
  'Sandbox and live API keys',
  'Collections from MTN, Airtel, Zamtel, Zed Mobile and Visa',
  'Disbursements to any supported wallet or card',
  'Merchant dashboard for your whole team',
  'Signed webhooks and the full API reference',
  'Settlement and reconciliation reports',
  'Support from our team in Lusaka',
];

const TERMS: Array<{ t: string; b: string }> = [
  { t: 'No setup fee', b: 'Onboarding, integration and your API keys cost nothing.' },
  { t: 'No monthly minimum', b: 'A quiet month costs you nothing. There is no floor to meet.' },
  { t: 'No lock-in', b: 'No fixed term. You can stop using the platform whenever you choose.' },
  { t: 'One rate per rail', b: 'You are quoted a rate per processor before you go live, with no hidden charges on top.' },
];

export default function Pricing(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> Pricing</span>
          <h1>You pay when you get paid.</h1>
          <p>
            Getting onto Instacom is free. There is no setup fee, no monthly minimum and no lock-in.
            You are charged only on transactions that succeed.
          </p>
          <div className="tags">
            <span className="tag"><Icon d={I.check} width={15} height={15} /> Free onboarding</span>
            <span className="tag"><Icon d={I.check} width={15} height={15} /> Zero integration cost</span>
            <span className="tag"><Icon d={I.check} width={15} height={15} /> No monthly minimum</span>
          </div>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className="split">
            <div className="copy">
              <span className="eyebrow"><span className="dot" /> What it costs</span>
              <h2>One transaction rate, agreed up front.</h2>
              <p>
                Rates depend on which rail the money moves over and how much you process, because each
                mobile money operator and card scheme charges us differently. Tell us the rails you need
                and your expected monthly volume, and we will quote you a rate before you sign anything.
              </p>
              <ul className="checklist" style={{ marginTop: 18 }}>
                {TERMS.map((t) => (
                  <li key={t.t}>
                    <span className="tick"><Icon d={I.check} width={16} height={16} /></span>
                    <span><b style={{ color: 'var(--ink-900)' }}>{t.t}.</b> {t.b}</span>
                  </li>
                ))}
              </ul>
              <div className="actions" style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn btn-primary" href="/contact">
                  Talk to our team <Icon d={I.arrow} width={18} height={18} />
                </Link>
                <a className="btn btn-light" href={`${MERCHANT}/getting-started`}>Apply to onboard</a>
              </div>
            </div>

            <div>
              <div className="contact-card">
                <h3 style={{ marginBottom: 6 }}>Included on every account</h3>
                <p style={{ fontSize: '0.9375rem', color: 'var(--ink-600)', marginBottom: 10 }}>
                  Every merchant gets the whole platform. There is no higher tier to buy.
                </p>
                <ul className="checklist">
                  {INCLUDED.map((f) => (
                    <li key={f}>
                      <span className="tick"><Icon d={I.check} width={16} height={16} /></span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tint">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Common questions</span>
            <h2>Questions about cost.</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Do I pay for failed or expired payments?</summary>
              <p>No. You are charged only when a transaction succeeds.</p>
            </details>
            <details>
              <summary>Is there a charge for the sandbox?</summary>
              <p>
                No. The sandbox is free and unlimited. You can build and test your whole integration
                before you talk to us about going live.
              </p>
            </details>
            <details>
              <summary>What does settlement cost?</summary>
              <p>
                Settlement to your Zambian bank account is included in your transaction rate. You choose
                the schedule that suits your business.
              </p>
            </details>
            <details>
              <summary>Why are rates not published?</summary>
              <p>
                The mobile money operators and card schemes charge different amounts, and those costs
                change with volume. Publishing one number would mean quoting every business the highest
                one. Tell us your rails and volume and we will give you a real figure.
              </p>
            </details>
          </div>
        </div>
      </section>

      <CtaBand
        title="Ready to see your rate?"
        sub="Tell us the rails you need and your expected volume. Our team reviews every application within 24 to 48 hours."
      />
    </>
  );
}
