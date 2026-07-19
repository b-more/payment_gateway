import type { ReactNode } from 'react';
import Link from 'next/link';
import { MERCHANT, API, PHONE, PHONE_HREF } from '@/lib/site';

// LinkedIn is a placeholder until the company page is live. It points at the
// expected company URL rather than a dead '#', so swapping it later is a
// one-line change.
const LINKEDIN = 'https://www.linkedin.com/company/instacom-payment-solutions';
const FACEBOOK = 'https://www.facebook.com/profile.php?id=61587094851660';

export function SiteFooter(): ReactNode {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="top">
          <div>
            <img
              className="logo"
              src="/brand/instacom-logo-2x.png"
              alt="Instacom Payment Solutions"
              width={235}
              height={64}
              loading="lazy"
            />
            <p className="blurb">
              Instacom Payment Solutions Limited connects the payment rails of Zambia to one platform,
              so businesses can collect, pay out and settle in Kwacha.
            </p>
            <div className="social">
              <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" aria-label="Instacom on LinkedIn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M6.94 5a1.94 1.94 0 1 1-3.88 0 1.94 1.94 0 0 1 3.88 0ZM3.2 8.4h3.5V21H3.2V8.4Zm5.66 0h3.35v1.72h.05c.47-.85 1.6-1.75 3.3-1.75 3.53 0 4.18 2.2 4.18 5.07V21h-3.5v-6.05c0-1.44-.03-3.3-2.03-3.3-2.03 0-2.34 1.57-2.34 3.19V21h-3.5V8.4Z" />
                </svg>
              </a>
              <a href={FACEBOOK} target="_blank" rel="noopener noreferrer" aria-label="Instacom on Facebook">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5h1.65V4.6c-.8-.1-1.6-.16-2.4-.15-2.37 0-4 1.45-4 4.1v2.35H7.6V14h2.7v8h3.2Z" />
                </svg>
              </a>
            </div>
          </div>

          <nav className="col" aria-label="Product">
            <h3>Product</h3>
            <Link href="/product">Features</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/developers">Developers</Link>
            <a href={`${API}/docs`}>API reference</a>
          </nav>

          <nav className="col" aria-label="Company">
            <h3>Company</h3>
            <Link href="/contact">Contact</Link>
            <a href={PHONE_HREF}>{PHONE}</a>
            <a href={`${MERCHANT}/getting-started`}>Get started</a>
            <a href={`${MERCHANT}/login`}>Merchant sign in</a>
          </nav>

          <nav className="col" aria-label="Legal">
            <h3>Legal</h3>
            <Link href="/contact">Terms of service</Link>
            <Link href="/contact">Privacy policy</Link>
            <Link href="/contact">Complaints</Link>
          </nav>
        </div>

        <div className="bottom">
          <span>
            © 2026 Instacom Payment Solutions Limited. Lusaka, Zambia. A payment service provider
            licensed by the Bank of Zambia. All amounts in ZMW.
          </span>
          <span className="credit">
            <span className="sep" /> Powered by
            <img src="/brand/codesync-logo-2x.png" alt="Codesync Technologies" width={158} height={40} loading="lazy" />
          </span>
        </div>
      </div>
    </footer>
  );
}
