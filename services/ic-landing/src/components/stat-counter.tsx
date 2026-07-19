'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Count-up that animates from 0 → `to` the first time it scrolls into view.
// Respects prefers-reduced-motion (renders the final value immediately).
export function StatNum({
  to,
  decimals = 0,
  suffix = '',
}: {
  to: number;
  decimals?: number;
  suffix?: string;
}): ReactNode {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setVal(to);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !ran.current) {
            ran.current = true;
            const start = performance.now();
            const dur = 1400;
            const step = (now: number): void => {
              const p = Math.min(1, (now - start) / dur);
              const eased = 1 - Math.pow(1 - p, 3);
              setVal(to * eased);
              if (p < 1) requestAnimationFrame(step);
              else setVal(to);
            };
            requestAnimationFrame(step);
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return (
    <span ref={ref}>
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}
