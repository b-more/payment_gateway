import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, I, MERCHANT, PHONE, PHONE_HREF, ADDRESS } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';

export const metadata: Metadata = {
  title: 'Contact — Instacom Payment Solutions',
  description:
    'Talk to Instacom Payment Solutions Limited, Lusaka. Apply to onboard your business — reviewed within 24–48 hours.',
};

const CHANNELS: Array<{ ic: string; t: string; b: string; cta: string; href: string }> = [
  { ic: I.bolt, t: 'Onboarding & sales', b: 'Apply to onboard your business and go live. Our team reviews every application within 24–48 hours.', cta: 'Apply now', href: `${MERCHANT}/getting-started` },
  { ic: I.code, t: 'Developer support', b: 'API keys, sandbox credentials, request signing and webhooks — everything to integrate in an afternoon.', cta: 'Read the docs', href: '/developers' },
  { ic: I.phone, t: 'General enquiries', b: 'Questions about Instacom, your account or a payment? Our Lusaka team is happy to help.', cta: PHONE, href: PHONE_HREF },
];

const COMPANY: string[] = [
  'Instacom Payment Solutions Limited',
  'Bank of Zambia licensed',
  'Settled 100% in Zambian Kwacha (ZMW)',
  ADDRESS,
];

export default function Contact(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> Contact</span>
          <h1>Let’s make payments simple.</h1>
          <p>Apply to onboard your business, or reach our team in Lusaka — we’re happy to help you go live.</p>
          <div className="tags">
            <span className="tag"><Icon d={I.pin} width={15} height={15} /> Lusaka, Zambia</span>
            <span className="tag"><Icon d={I.pulse} width={15} height={15} /> Reviewed in 24–48h</span>
            <span className="tag"><Icon d={I.shield} width={15} height={15} /> Bank of Zambia licensed</span>
          </div>
        </div>
      </div>

      {/* Apply + contact card */}
      <section>
        <div className="wrap">
          <div className="contact-grid">
            <div>
              <span className="eyebrow" style={{ color: 'var(--sky-light)' }}><span className="dot" /> Get started</span>
              <h2 style={{ marginTop: 14 }}>Ready to make payments simple?</h2>
              <p>Apply to onboard your business — our team reviews within 24–48 hours and helps you go live.</p>
              <div className="actions" style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <a className="btn btn-primary" href={`${MERCHANT}/getting-started`}>Apply now</a>
                <a className="btn btn-light" href={`${MERCHANT}/login`}>Merchant sign in</a>
              </div>
            </div>
            <div className="contact-card">
              <div className="line"><span className="ic"><Icon d={I.phone} /></span><span>Call us<br /><a href={PHONE_HREF}><b>{PHONE}</b></a></span></div>
              <div className="line"><span className="ic"><Icon d={I.mail} /></span><span>Email<br /><b>info@instacompayzm.com</b></span></div>
              <div className="line"><span className="ic"><Icon d={I.globe} /></span><span>Web<br /><b>instacompayzm.com</b></span></div>
              <div className="line"><span className="ic"><Icon d={I.pin} /></span><span>Visit<br /><b style={{ fontWeight: 500 }}>{ADDRESS}</b></span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Support channels */}
      <section className="tint">
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow"><span className="dot" /> How can we help?</span>
            <h2>The right team for every question.</h2>
          </div>
          <div className="features">
            {CHANNELS.map((c) => (
              <div className="feature" key={c.t}>
                <span className="ic"><Icon d={c.ic} /></span>
                <h3>{c.t} <span className="dot" /></h3>
                <p>{c.b}</p>
                <div style={{ marginTop: 16 }}>
                  {c.href.startsWith('/') ? (
                    <Link className="btn btn-ghost btn-sm" href={c.href}>{c.cta} <Icon d={I.arrow} width={16} height={16} /></Link>
                  ) : (
                    <a className="btn btn-ghost btn-sm" href={c.href}>{c.cta} <Icon d={I.arrow} width={16} height={16} /></a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Company / visit */}
      <section>
        <div className="wrap">
          <div className="split">
            <div className="figure">
              <img src="/campaign/10.jpg" alt="Instacom Payment Solutions — Lusaka office" loading="lazy" decoding="async" />
            </div>
            <div className="copy">
              <span className="eyebrow"><span className="dot" /> Our company</span>
              <h2>Built in Zambia, for Zambian business.</h2>
              <p>Instacom Payment Solutions Limited is a Bank of Zambia–licensed payment service provider, headquartered in Lusaka.</p>
              <ul className="checklist" style={{ gridTemplateColumns: '1fr', marginTop: 22 }}>
                {COMPANY.map((c) => (
                  <li key={c}><span className="tick"><Icon d={I.check} width={16} height={16} /></span>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <CtaBand title="Ready to onboard?" sub="Apply now — our team reviews within 24–48 hours and helps you go live in Kwacha." />
    </>
  );
}
