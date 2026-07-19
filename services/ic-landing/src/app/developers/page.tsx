import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';
import { Icon, I, MERCHANT, API } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Developers | Instacom Payment Solutions',
  description:
    'A versioned REST API with key and secret auth, optional HMAC request signing, idempotency keys and signed webhooks. Money is integer ngwee, never a float.',
};

// Where an evaluating developer goes next. This page is the pitch; these are the
// three places that actually let them integrate, so every one of them is a real
// public URL rather than another marketing page.
const RESOURCES: Array<{ ic: string; t: string; b: string; cta: string; href: string }> = [
  {
    ic: I.code,
    t: 'Integration guide',
    b: 'Authentication, collections, disbursements, webhooks and the sandbox, with a worked example for each call.',
    cta: 'Read the guide',
    href: `${MERCHANT}/developers`,
  },
  {
    ic: I.bolt,
    t: 'Postman collection',
    b: 'Every endpoint, ready to import. Fill in your key and secret and send your first request without writing any code.',
    cta: 'Download the collection',
    href: `${MERCHANT}/postman`,
  },
  {
    ic: I.globe,
    t: 'API reference',
    b: 'The full OpenAPI 3 specification, with every request field, response shape and error code.',
    cta: 'Open the reference',
    href: `${API}/docs`,
  },
];

export default function Developers(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> Built for developers</span>
          <h1>Signed, idempotent, webhook-driven.</h1>
          <p>A versioned REST API your team can integrate in an afternoon, with the guarantees a payments
            platform demands.</p>
        </div>
      </div>

      <section className="tint">
        <div className="wrap api">
          <div>
            <h2 style={{ fontSize: 34 }}>Money is exact to the last ngwee.</h2>
            <p style={{ color: 'var(--muted)', fontSize: 18, marginTop: 14, maxWidth: '46ch' }}>
              Every amount is an integer in ngwee, never a floating-point number, so the books always
              balance. Authenticate with your key and secret, add an idempotency key to make retries
              safe, and verify the signature on every webhook we send you.
            </p>
            <div className="pills">
              <span className="pill">Key and secret auth</span>
              <span className="pill">Optional HMAC signing</span>
              <span className="pill">Idempotency-Key</span>
              <span className="pill">Signed webhooks</span>
              <span className="pill">OpenAPI 3</span>
              <span className="pill">Sandbox</span>
            </div>
          </div>
          <div className="code">
            <div className="win"><i /><i /><i /></div>
            <span className="c"># Collect from a mobile money wallet</span>{'\n'}
            <span className="k">POST</span> /v1/collections{'\n'}
            X-Api-Key: ic_live_...{'\n'}
            X-Api-Secret: ...{'\n'}
            Idempotency-Key: 0f1c...{'\n\n'}
            {'{ '}<span className="k">&quot;processor&quot;</span>: <span className="s">&quot;MTN&quot;</span>,{' '}
            <span className="k">&quot;amount&quot;</span>: <span className="s">&quot;100000&quot;</span>,{' '}
            <span className="k">&quot;msisdn&quot;</span>: <span className="s">&quot;2609...&quot;</span> {'}'}{'\n\n'}
            <span className="c"># amount is ngwee, so 100000 is K1,000.00</span>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Start building</span>
            <h2>Everything you need to make your first call.</h2>
          </div>
          <div className="features">
            {RESOURCES.map((r) => (
              <div className="feature" key={r.t}>
                <span className="ic"><Icon d={r.ic} /></span>
                <h3>{r.t} <span className="dot" /></h3>
                <p>{r.b}</p>
                <div style={{ marginTop: 16 }}>
                  <a className="btn btn-ghost btn-sm" href={r.href}>
                    {r.cta} <Icon d={I.arrow} width={16} height={16} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Get your API keys." sub="Create a merchant account, grab sandbox credentials and make your first request today." />
    </>
  );
}
