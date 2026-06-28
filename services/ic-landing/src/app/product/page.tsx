import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Icon, I, MERCHANT, FEATURES } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';

export const metadata: Metadata = {
  title: 'Product — Instacom Payment Solutions',
  description:
    'Collections, disbursements, settlement and reconciliation — everything Zambian businesses need to move money, on one Bank of Zambia–licensed platform.',
};

const CAPS: string[] = [
  'Collections across MTN, Airtel, Zamtel, Zed Mobile & Visa',
  'Disbursements to any wallet or card from one balance',
  'Scheduled settlement to your bank — in Kwacha',
  'Daily reconciliation against processor reports',
  'Append-only, double-entry float ledger',
  'Dual-control approval on large float credits',
  'Per-account IP whitelisting for live keys',
  'Signed webhooks with automatic retries',
  'Real-time dashboard with CSV / Excel reports',
  'Role-based access control for your team',
  'Idempotency keys on every mutating request',
  'Full, immutable audit trail on every action',
];

const FIELD: Array<{ img: string; label: string }> = [
  { img: '/campaign/1.jpg', label: 'Corporates & enterprise' },
  { img: '/campaign/2.jpg', label: 'SMEs — free onboarding' },
  { img: '/campaign/4.jpg', label: 'Schools & campuses' },
  { img: '/campaign/9.jpg', label: 'Logistics & field sales' },
  { img: '/campaign/7.jpg', label: 'Seamless transactions' },
];

export default function Product(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> Product</span>
          <h1>Everything you need to move money.</h1>
          <p>One platform for the whole payment lifecycle — collections, disbursements, settlement and
            reconciliation — built for how Zambian businesses actually get paid.</p>
          <div className="tags">
            <span className="tag"><Icon d={I.swap} width={15} height={15} /> Collections</span>
            <span className="tag"><Icon d={I.swap} width={15} height={15} /> Disbursements</span>
            <span className="tag"><Icon d={I.check} width={15} height={15} /> Settlement</span>
            <span className="tag"><Icon d={I.pulse} width={15} height={15} /> Reconciliation</span>
          </div>
        </div>
      </div>

      {/* Features */}
      <section className="tint">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Capabilities</span>
            <h2>One platform, the whole lifecycle.</h2>
            <p>Everything from the first customer payment to reconciled settlement in your bank — no glue code, no second vendor.</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <span className="ic"><Icon d={f.icon} /></span>
                <h3>{f.title} <span className="dot" /></h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Everything included checklist */}
      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> What’s included</span>
            <h2>Built-in, not bolted on.</h2>
            <p>The controls a regulated payment platform needs — shipped as standard on every account.</p>
          </div>
          <ul className="checklist">
            {CAPS.map((c) => (
              <li key={c}><span className="tick"><Icon d={I.check} width={16} height={16} /></span>{c}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Photo band */}
      <section className="band">
        <img className="bg" src="/brand/band-collections.jpg" alt="" aria-hidden />
        <div className="scrim">
          <div className="wrap">
            <span className="eyebrow"><span className="dot" /> For Zambian businesses</span>
            <h2 style={{ marginTop: 14 }}>Streamline your collections, end to end.</h2>
            <p>
              From a customer’s first payment to the money landing in your bank, Instacom handles routing,
              settlement and reconciliation — so your team can focus on the business, not the plumbing.
            </p>
            <a className="btn btn-primary" href={`${MERCHANT}/getting-started`}>Start collecting <Icon d={I.arrow} width={18} height={18} /></a>
            <div className="stats">
              <div className="stat"><div className="n">5</div><div className="l">Payment rails unified</div></div>
              <div className="stat"><div className="n">1</div><div className="l">API to integrate</div></div>
              <div className="stat"><div className="n">ZMW</div><div className="l">Settled to your bank</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="tint">
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow"><span className="dot" /> In the field</span>
            <h2>Trusted by businesses across Zambia.</h2>
            <p>From warehouses to storefronts to campuses — Instacom keeps the money moving.</p>
          </div>
          <div className="gallery">
            {FIELD.map((f) => (
              <figure className="shot" key={f.img}>
                <img src={f.img} alt={f.label} loading="lazy" decoding="async" />
                <figcaption className="cap">{f.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
