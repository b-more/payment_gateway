'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Gentle fade-up on section entry. The only scroll effect on the page.
 *
 * The `.rv` class is applied after mount, never in the server HTML, so content
 * is visible without JavaScript rather than stuck at opacity 0. Reduced-motion
 * users skip it entirely.
 */
export function Reveal({ children }: { children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    el.classList.add('rv');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref}>{children}</div>;
}
