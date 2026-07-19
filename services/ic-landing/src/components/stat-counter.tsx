'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Count-up that animates the first time it scrolls into view.
 *
 * The value rendered on the server is the REAL one, not zero. An earlier
 * version seeded state with 0, so the static HTML shipped "0.0%" and any
 * hydration failure left the page advertising zero uptime. Here the number is
 * correct with no JavaScript at all, and the animation only ever runs after
 * mount, when we know scripting works and motion is welcome.
 */
export function StatNum({
  to,
  decimals = 0,
  suffix = '',
}: {
  to: number;
  decimals?: number;
  suffix?: string;
}): ReactNode {
  const [val, setVal] = useState(to);
  const ref = useRef<HTMLSpanElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Only now, with JS confirmed, is it safe to drop to zero and count up.
    setVal(0);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || ran.current) continue;
          ran.current = true;
          io.disconnect();

          const start = performance.now();
          const dur = 1200;
          const step = (now: number): void => {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(p < 1 ? to * eased : to);
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);

    // If it is already on screen at mount, the observer fires immediately.
    // If anything goes wrong before that, restore the true value.
    const failsafe = window.setTimeout(() => {
      if (!ran.current) setVal(to);
    }, 2500);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [to]);

  return (
    <span ref={ref}>
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}
