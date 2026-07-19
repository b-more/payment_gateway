'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Hero product visual: one real collection, shown the way the dashboard shows
 * it. The amount carries its ngwee value because that is what the gateway
 * stores, and it is the detail that tells a technical evaluator this is a real
 * payments system rather than a brochure.
 *
 * It settles from PROCESSING to SUCCESS once, shortly after mount. It does not
 * loop: a status that flickers forever reads as decoration, not product.
 */
export function PayCard(): ReactNode {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(true);
      return;
    }
    const t = window.setTimeout(() => setDone(true), 1600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="paycard">
      <div className="head">
        <span className="t">Collection</span>
        <span className="id">txn_01HQ8M4K2P</span>
      </div>

      <div className="amt">
        <span className="money">
          <span className="k">K50.00</span>
          <span className="ngwee">5000 ngwee</span>
        </span>
      </div>

      <div className="row">
        <span className="lbl">Rail</span>
        <span className="val">MTN Mobile Money</span>
      </div>
      <div className="row">
        <span className="lbl">Customer</span>
        <span className="val mono">260 97 000 0000</span>
      </div>
      <div className="row">
        <span className="lbl">Reference</span>
        <span className="val mono">INV-20481</span>
      </div>
      <div className="row">
        <span className="lbl">Status</span>
        <span
          className={done ? 'state success' : 'state processing'}
          role="status"
          aria-live="polite"
        >
          <span className="led" aria-hidden />
          {done ? 'Success' : 'Processing'}
        </span>
      </div>
    </div>
  );
}
