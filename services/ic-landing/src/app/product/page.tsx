import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Icon, MERCHANT, FEATURES } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';

export const metadata: Metadata = {
  title: 'Product — Instacom Payment Solutions',
  description: 'Collections, disbursements, settlement and reconciliation — everything Zambian businesses need to move money, on one platform.',
};

export default function Product(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> Product</span>
          <h1>Everything you need to move money.</h1>
          <p>One platform for the whole payment lifecycle — collections, disbursements, settlement and
            reconciliation — built for how Zambian businesses actually get paid.</p>
        </div>
      </div>

      <section className="tint">
        <div className="wrap">
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

      {/* Photo band */}
      <section className="band">
        <img className="bg" src="/brand/band-collections.jpg" alt="" aria-hidden />
        <div className="scrim">
          <div className="wrap">
            <span className="eyebrow" style={{ color: 'var(--sky-light)' }}><span className="dot" /> For Zambian businesses</span>
            <h2 style={{ marginTop: 14 }}>Streamline your collections, end to end.</h2>
            <p>
              From a customer’s first payment to the money landing in your bank, Instacom handles routing,
              settlement and reconciliation — so your team can focus on the business, not the plumbing.
            </p>
            <a className="btn btn-light" href={`${MERCHANT}/getting-started`}>Start collecting</a>
            <div className="stats">
              <div className="stat"><div className="n">5</div><div className="l">Payment rails unified</div></div>
              <div className="stat"><div className="n">1</div><div className="l">API to integrate</div></div>
              <div className="stat"><div className="n">ZMW</div><div className="l">Settled to your bank</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section>
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow" style={{ justifyContent: 'center' }}><span className="dot" /> In the field</span>
            <h2>Trusted by businesses across Zambia.</h2>
            <p>From warehouses to storefronts to campuses — Instacom keeps the money moving.</p>
          </div>
          <div className="gallery">
            <div className="shot"><img src="/brand/campaign-onboarding.jpg" alt="A merchant onboarding with Instacom" /></div>
            <div className="shot"><img src="/brand/campaign-students.jpg" alt="Instacom makes payments easy for everyone" /></div>
            <div className="shot"><img src="/brand/campaign-seamless.jpg" alt="Seamless transactions with Instacom" /></div>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
