import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, I, MERCHANT, PHONE, PHONE_HREF, RAILS, FEATURES } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';

export default function Home(): ReactNode {
  return (
    <>
      {/* ── Hero ── */}
      <div className="hero" id="top">
        <div className="wrap">
          <div className="reveal">
            <span className="eyebrow"><span className="dot" /> Payment solutions · Zambia</span>
            <h1>
              Business payments,<br />made <span className="sky">simple.</span>
            </h1>
            <p className="lede">
              Instacom unifies MTN, Airtel, Zamtel, Zed Mobile and Visa into one integration — so your
              business can collect, disburse and settle in Kwacha. Fast. Secure. Reliable.
            </p>
            <div className="actions">
              <a className="btn btn-primary" href={`${MERCHANT}/getting-started`}>Get started — it’s free</a>
              <Link className="btn btn-ghost" href="/developers">Explore the API</Link>
            </div>
            <div className="reassure">
              <span><b>Free</b> onboarding</span>
              <span className="pipe" />
              <span><b>Zero</b> integration cost</span>
              <span className="pipe" />
              <a href={PHONE_HREF}><b>{PHONE}</b></a>
            </div>
          </div>

          <div className="hero-art" aria-hidden>
            <div className="frame a"><img src="/brand/showcase-payments.jpg" alt="" /></div>
            <div className="frame b"><img src="/brand/showcase-mobile.jpg" alt="" /></div>
            <div className="chip">
              <span className="ic"><Icon d={I.check} /></span>
              <span className="txt">
                <span className="k">Settled in ZMW</span>
                <span className="s">MTN · Airtel · Zamtel · Visa</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rails ── */}
      <div className="rails">
        <div className="wrap">
          <span className="label">One integration, every rail</span>
          <div className="set">
            {RAILS.map((r) => <span className="rail" key={r}>{r}</span>)}
          </div>
        </div>
      </div>

      {/* ── Why (teaser) ── */}
      <section className="tint">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Why Instacom</span>
            <h2>Everything you need to move money.</h2>
            <p>One platform for the whole payment lifecycle — built for how Zambian businesses actually get paid.</p>
          </div>
          <div className="features">
            {FEATURES.slice(0, 3).map((f) => (
              <div className="feature" key={f.title}>
                <span className="ic"><Icon d={f.icon} /></span>
                <h3>{f.title} <span className="dot" /></h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 30 }}>
            <Link className="btn btn-ghost" href="/product">See all features <Icon d={I.arrow} width={18} height={18} /></Link>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
