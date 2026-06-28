import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';

export const metadata: Metadata = {
  title: 'Developers — Instacom Payment Solutions',
  description: 'A versioned REST API with HMAC request signing, idempotency keys and signed webhooks. Money is integer ngwee — never a float.',
};

export default function Developers(): ReactNode {
  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /> Built for developers</span>
          <h1>Signed, idempotent, webhook-driven.</h1>
          <p>A versioned REST API your team can integrate in an afternoon — with the guarantees a payments
            platform demands.</p>
        </div>
      </div>

      <section className="tint">
        <div className="wrap api">
          <div>
            <h2 style={{ fontSize: 34 }}>Money is exact to the last ngwee.</h2>
            <p style={{ color: 'var(--muted)', fontSize: 18, marginTop: 14, maxWidth: '46ch' }}>
              Every amount is an integer in ngwee — never a floating-point number — so the books always
              balance. Requests are HMAC-signed, idempotency keys make retries safe, and webhooks are
              signed so you can trust every callback.
            </p>
            <div className="pills">
              <span className="pill">HMAC signing</span>
              <span className="pill">Idempotency-Key</span>
              <span className="pill">Signed webhooks</span>
              <span className="pill">OpenAPI 3</span>
              <span className="pill">Sandbox</span>
            </div>
          </div>
          <div className="code">
            <div className="win"><i /><i /><i /></div>
            <span className="c"># Initiate a collection</span>{'\n'}
            <span className="k">POST</span> /v1/collections{'\n'}
            X-Api-Key: ic_live_…{'\n'}
            X-Signature: hmac-sha256(key, body){'\n'}
            Idempotency-Key: 0f1c…{'\n\n'}
            {'{ '}<span className="k">&quot;processor&quot;</span>: <span className="s">&quot;MTN&quot;</span>,{' '}
            <span className="k">&quot;amount&quot;</span>: <span className="s">&quot;100000&quot;</span>,{' '}
            <span className="k">&quot;msisdn&quot;</span>: <span className="s">&quot;2609…&quot;</span> {'}'}
          </div>
        </div>
      </section>

      <CtaBand title="Get your API keys." sub="Create a merchant account, grab sandbox credentials and make your first signed request today." />
    </>
  );
}
