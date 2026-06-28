import type { ReactNode } from 'react';
import { MERCHANT } from '@/lib/site';

export function CtaBand({
  title = 'Ready to make payments simple?',
  sub = 'Onboard your business for free — our team reviews within 24–48 hours and helps you go live.',
}: {
  title?: string;
  sub?: string;
}): ReactNode {
  return (
    <section>
      <div className="wrap">
        <div className="cta-band">
          <h2>{title}</h2>
          <p>{sub}</p>
          <div className="actions">
            <a className="btn btn-primary" href={`${MERCHANT}/getting-started`}>Get started — it’s free</a>
            <a className="btn btn-light" href={`${MERCHANT}/login`}>Merchant sign in</a>
          </div>
        </div>
      </div>
    </section>
  );
}
