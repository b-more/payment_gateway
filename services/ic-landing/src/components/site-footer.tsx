import type { ReactNode } from 'react';
import Link from 'next/link';
import { MERCHANT, PHONE, PHONE_HREF } from '@/lib/site';

export function SiteFooter(): ReactNode {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="top">
          <div>
            <img className="logo" src="/brand/instacom-logo.png" alt="Instacom Payment Solutions" />
            <p className="blurb">
              Instacom Payment Solutions Limited — unifying Zambia’s payment rails into one secure,
              developer-friendly platform. Every kwacha, accounted for.
            </p>
            <div className="social">
              <a
                href="https://www.facebook.com/profile.php?id=61587094851660"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instacom on Facebook"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5h1.65V4.6c-.8-.1-1.6-.16-2.4-.15-2.37 0-4 1.45-4 4.1v2.35H7.6V14h2.7v8h3.2Z" />
                </svg>
                Facebook
              </a>
            </div>
          </div>
          <div className="col">
            <h4>Product</h4>
            <Link href="/product">Features</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/developers">Developers</Link>
            <a href={`${MERCHANT}/getting-started`}>Get started</a>
          </div>
          <div className="col">
            <h4>Company</h4>
            <Link href="/contact">Contact</Link>
            <a href={PHONE_HREF}>{PHONE}</a>
            <a href={`${MERCHANT}/login`}>Merchant sign in</a>
          </div>
        </div>
        <div className="bottom">
          <span>© 2026 Instacom Payment Solutions Limited · Lusaka, Zambia · Currency: ZMW</span>
          <span className="credit">
            <span className="sep" /> Powered by
            <img src="/brand/codesync-logo.png" alt="Codesync Technologies" />
          </span>
        </div>
      </div>
    </footer>
  );
}
