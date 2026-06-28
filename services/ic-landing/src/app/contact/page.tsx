import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Icon, I, MERCHANT, PHONE, PHONE_HREF, ADDRESS } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact — Instacom Payment Solutions',
  description: 'Talk to Instacom Payment Solutions Limited, Lusaka. Apply to onboard your business — reviewed within 24–48 hours.',
};

export default function Contact(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> Contact</span>
          <h1>Let’s make payments simple.</h1>
          <p>Apply to onboard your business, or reach our team in Lusaka — we’re happy to help you go live.</p>
        </div>
      </div>

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
    </>
  );
}
