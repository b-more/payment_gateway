import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, I, MERCHANT, FEATURES, BOZ, STATS, BANDS, FLOW, PROOF_LOGOS, TESTIMONIALS } from '@/lib/site';
import { CtaBand } from '@/components/cta-band';
import { StatNum } from '@/components/stat-counter';
import { SegmentCarousel } from '@/components/segment-carousel';
import { RailLogos } from '@/components/rail-logos';
import { CodePanel } from '@/components/code-panel';
import { PayCard } from '@/components/pay-card';
import { Reveal } from '@/components/reveal';

export default function Home(): ReactNode {
  return (
    <>
      {/* ── Hero: copy paired with one real transaction, not a stock photo ── */}
      <div className="hero" id="top">
        <div className="wrap">
          <div className="hero-grid">
            <div className="reveal">
              <span className="eyebrow"><span className="dot" /> Payment solutions, Zambia</span>
              <h1>
                Business payments,<br />made <span className="sky">simple.</span>
              </h1>
              <p className="lede">
                Instacom connects MTN, Airtel, Zamtel, Zed Mobile and Visa to one integration, so your
                business can collect, pay out and settle in Kwacha.
              </p>
              <div className="actions">
                <a className="btn btn-primary" href={`${MERCHANT}/getting-started`}>Get started for free</a>
                <Link className="btn btn-light" href="/developers">Explore the API</Link>
              </div>
              <div className="reassure">
                <span className="tag key"><Icon d={I.shield} width={15} height={15} /> Bank of Zambia licensed</span>
                <span className="tag"><Icon d={I.check} width={15} height={15} /> Free onboarding</span>
                <span className="tag"><Icon d={I.check} width={15} height={15} /> Zero integration cost</span>
              </div>
            </div>
            <PayCard />
          </div>
        </div>
      </div>

      {/* ── Processor row ── */}
      <div className="rails">
        <div className="wrap">
          <span className="label">One integration, every rail</span>
          <RailLogos />
        </div>
      </div>

      {/* ── Stats. Real values ship in the HTML, then count up on view. ── */}
      <section>
        <div className="wrap">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow"><span className="dot" /> Built to move money at scale</span>
              <h2>Reliable, regulated, always on.</h2>
            </div>
            <div className="stats">
              {STATS.map((s) => (
                <div className="stat" key={s.label}>
                  <span className={typeof s.n === 'number' ? 'n' : 'n txt'}>
                    {typeof s.n === 'number'
                      ? <StatNum to={s.n} decimals={s.decimals ?? 0} suffix={s.suffix ?? ''} />
                      : s.text}
                  </span>
                  <span className="l">{s.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── How money moves. Numbered because it is a real sequence. ── */}
      <section className="tint">
        <div className="wrap">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow"><span className="dot" /> How money moves</span>
              <h2>From your customer to your bank, in four steps.</h2>
              <p>Every payment follows the same path, and you can see where it is at each stage.</p>
            </div>
            <ol className="flow">
              {FLOW.map((s, i) => (
                <li className="step" key={s.t}>
                  <span className="mark" aria-hidden>{i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ── Features ── */}
      <section>
        <div className="wrap">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow"><span className="dot" /> Why Instacom</span>
              <h2>Everything you need to move money.</h2>
              <p>One platform for the whole payment lifecycle, built for how Zambian businesses actually get paid.</p>
            </div>
            <div className="features">
              {FEATURES.map((f) => (
                <div className="feature" key={f.title}>
                  <span className="ic"><Icon d={f.icon} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Bank of Zambia ── */}
      <section className="trust tint">
        <div className="wrap">
          <Reveal>
            <div className="inner">
              <div className="figure">
                <img
                  src="/campaign/6.jpg"
                  alt="Instacom, a Bank of Zambia licensed payment platform for Zambian businesses"
                  width={1200}
                  height={800}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div>
                <span className="eyebrow"><span className="dot" /> {BOZ.eyebrow}</span>
                <h2>{BOZ.title}</h2>
                <p className="lede-2">{BOZ.body}</p>
                <div className="lic">
                  <span className="ic"><Icon d={I.shield} /></span>
                  <span className="txt">
                    <span className="k">Bank of Zambia licensed</span>
                  </span>
                </div>
                <ul className="points">
                  {BOZ.points.map((p) => (
                    <li key={p}><span className="tick"><Icon d={I.check} width={16} height={16} /></span>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Developers: the one dark block on the page ── */}
      <section>
        <div className="wrap">
          <Reveal>
            <div className="api">
              <div>
                <span className="eyebrow"><span className="dot" /> For developers</span>
                <h2>An API your team can read.</h2>
                <p className="dev-lede">
                  Authenticate with a key and secret, send an idempotency key so retries are safe, and
                  verify the signature on every webhook. Amounts are integer ngwee, so the books always
                  balance.
                </p>
                <div className="pills">
                  <span className="pill">REST</span>
                  <span className="pill">Idempotency-Key</span>
                  <span className="pill">Signed webhooks</span>
                  <span className="pill">OpenAPI 3</span>
                  <span className="pill">Sandbox</span>
                </div>
                <div className="actions dev-actions">
                  <Link className="btn btn-primary" href="/developers">
                    Read the docs <Icon d={I.arrow} width={18} height={18} />
                  </Link>
                </div>
              </div>
              <CodePanel />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Social proof. Slots are sized so real content cannot shift them. ── */}
      <section className="tint">
        <div className="wrap">
          <Reveal>
            <div className="section-head center">
              <span className="eyebrow"><span className="dot" /> Customers</span>
              <h2>Trusted by businesses across Zambia.</h2>
              <p>Retailers, schools, logistics firms and billers collect and pay out on Instacom every day.</p>
            </div>
            <div className="proof-logos">
              {PROOF_LOGOS.map((p) => (
                <div className="proof-logo" key={p}>{p}</div>
              ))}
            </div>
            <div className="quotes">
              {TESTIMONIALS.map((t) => (
                <figure className="quote" key={t.who + t.role}>
                  <blockquote>{t.quote}</blockquote>
                  <figcaption>
                    <span className="who">{t.who}</span>
                    <span className="role">{t.role}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Segments ── */}
      <section>
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow"><span className="dot" /> For every business</span>
            <h2>Built for every Zambian business.</h2>
            <p>From corporates and SMEs to schools, retailers and everyday earners. One platform, every payment.</p>
          </div>
          <SegmentCarousel />
        </div>
      </section>

      {/* ── Collections use case ── */}
      <UseCaseBand band={BANDS[0]} />

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
