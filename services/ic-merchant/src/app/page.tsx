import type { ReactNode } from 'react';
import Link from 'next/link';

const PROCESSORS = ['MTN', 'Airtel', 'Zamtel', 'Zed Mobile', 'Visa'];
const ADDRESS = '6755 Elasah House, Along Chainama Road, Olympia Extension, Lusaka, Zambia';

export default function Landing(): ReactNode {
  return (
    <>
      <div className="lp-hero">
        <nav className="lp-nav">
          <a href="#home" aria-label="Instacom Payment Solutions">
            <img className="logo" src="/brand/instacom-logo.png" alt="Instacom Payment Solutions" />
          </a>
          <div className="links">
            <a href="#home">Home</a>
            <a href="#contact">Contact</a>
            <Link href="/api-docs">Documentation</Link>
          </div>
          <div className="row">
            <Link className="btn ghost sm" href="/login">
              Sign in
            </Link>
            <Link className="btn primary sm" href="/getting-started">
              Getting Started
            </Link>
          </div>
        </nav>

        <div className="inner" id="home">
          <span className="eyebrow">Payments infrastructure · Zambia</span>
          <h1>Seamless payment solutions for Zambian merchants.</h1>
          <p>
            Collect and disburse over mobile money and card — MTN, Airtel, Zamtel, Zed Mobile and
            Visa — with one integration, settled in Zambian Kwacha.
          </p>
          <div className="lp-cta">
            <Link className="btn primary lg" href="/getting-started">
              Get started
            </Link>
            <Link className="btn ghost lg" href="/login">
              Sign in
            </Link>
          </div>
        </div>

        <div className="lp-rails">
          <div className="inner">
            <span className="eyebrow" style={{ color: 'var(--sky-bright)' }}>Supported rails</span>
            {PROCESSORS.map((p) => (
              <span className="lp-chip" key={p}>
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="lp-contact" id="contact">
        <div className="lp-section">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Contact</div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Instacom Payment Solutions Limited</h2>
          <p className="muted" style={{ maxWidth: '40ch' }}>{ADDRESS}</p>
          <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
            Currency: ZMW · Operating in Zambia.
          </p>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="inner">
          <span>© 2026 Instacom Payment Solutions Limited · ZMW</span>
          <span className="credit">
            <span className="sep" />
            Powered by Codesync
          </span>
        </div>
      </footer>
    </>
  );
}
