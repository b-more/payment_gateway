import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, I, MERCHANT, RAILS, FEATURES, BOZ, STATS, BANDS } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';
import { StatNum } from '@/components/stat-counter';
import { SegmentCarousel } from '@/components/segment-carousel';

export default function Home(): ReactNode {
  return (
    <>
      {/* ── Hero — full-bleed campaign photo (campaign/7.jpg) ── */}
      <div className="hero" id="top">
        <img className="hero-photo" src="/campaign/7.jpg" alt="Instacom — seamless payments for Zambian business" />
        <div className="hero-scrim" aria-hidden />
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
              <Link className="btn btn-light" href="/developers">Explore the API</Link>
            </div>
            <div className="reassure">
              <span className="tag key"><Icon d={I.shield} width={15} height={15} /> Bank of Zambia licensed</span>
              <span className="tag"><Icon d={I.check} width={15} height={15} /> Free onboarding</span>
              <span className="tag"><Icon d={I.check} width={15} height={15} /> Zero integration cost</span>
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

      {/* ── Bank of Zambia trust section (LEGAL-1) ── */}
      <section className="trust tint">
        <div className="wrap">
          <div className="inner">
            <div className="figure">
              <img src="/campaign/6.jpg" alt="Instacom — Bank of Zambia licensed payment platform for Zambian businesses" loading="lazy" decoding="async" />
            </div>
            <div>
              <span className="eyebrow"><span className="dot" /> {BOZ.eyebrow}</span>
              <h2>{BOZ.title}</h2>
              <p className="lede-2">{BOZ.body}</p>
              <div className="lic">
                <span className="ic"><Icon d={I.shield} /></span>
                <span className="txt">
                  <span className="k">Bank of Zambia Licensed</span>
                </span>
              </div>
              <ul className="points">
                {BOZ.points.map((p) => (
                  <li key={p}><span className="tick"><Icon d={I.check} width={16} height={16} /></span>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats band ── */}
      <section className="band">
        <img className="bg" src="/campaign/8.jpg" alt="" loading="lazy" decoding="async" />
        <div className="scrim">
          <div className="wrap">
            <span className="eyebrow"><span className="dot" /> Built to move money at scale</span>
            <h2>Reliable, regulatory-compliant, always on.</h2>
            <div className="stats">
              {STATS.map((s) => (
                <div className="stat" key={s.label}>
                  <span className="n">
                    {typeof s.n === 'number'
                      ? <StatNum to={s.n} decimals={s.decimals ?? 0} suffix={s.suffix ?? ''} />
                      : s.text}
                  </span>
                  <span className="l">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Instacom — all features ── */}
      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Why Instacom</span>
            <h2>Everything you need to move money.</h2>
            <p>One platform for the whole payment lifecycle — built for how Zambian businesses actually get paid.</p>
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

      {/* ── Use-case band: Collections ── */}
      <UseCaseBand band={BANDS[0]} />

      {/* ── Segments showcase ── */}
      <section className="tint">
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow"><span className="dot" /> For every business</span>
            <h2>Built for every Zambian business.</h2>
            <p>From corporates and SMEs to schools, retailers and everyday earners — one platform, every payment.</p>
          </div>
          <SegmentCarousel />
        </div>
      </section>

      {/* ── Split: provider ── */}
      <section>
        <div className="wrap">
          <div className="split">
            <div className="figure">
              <img src={BANDS[2].img} alt={BANDS[2].title} loading="lazy" decoding="async" />
            </div>
            <div className="copy">
              <span className="eyebrow"><span className="dot" /> {BANDS[2].eyebrow}</span>
              <h2>{BANDS[2].title}</h2>
              <p>{BANDS[2].body}</p>
              <div className="actions" style={{ marginTop: 26 }}>
                <Link className="btn btn-navy" href={BANDS[2].href}>{BANDS[2].cta} <Icon d={I.arrow} width={18} height={18} /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Use-case band: Zero cost ── */}
      <UseCaseBand band={BANDS[1]} />

      <CtaBand />
    </>
  );
}

function UseCaseBand({ band }: { band: typeof BANDS[number] }): ReactNode {
  return (
    <section className="band">
      <img className="bg" src={band.img} alt="" loading="lazy" decoding="async" />
      <div className="scrim">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> {band.eyebrow}</span>
          <h2>{band.title}</h2>
          <p>{band.body}</p>
          <div className="actions">
            <a className="btn btn-primary" href={band.href}>{band.cta} <Icon d={I.arrow} width={18} height={18} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
