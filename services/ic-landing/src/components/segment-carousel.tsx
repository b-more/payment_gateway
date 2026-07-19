'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SEGMENTS } from '@/lib/site';

// Auto-advancing showcase for the "every business" segments: one campaign
// poster at a time, crossfading on a 10s cadence. Pauses on hover/focus and
// stops auto-play under prefers-reduced-motion (manual controls still work).
const INTERVAL_MS = 10_000;

export function SegmentCarousel(): ReactNode {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = SEGMENTS.length;

  const go = useCallback((to: number) => setIndex(((to % n) + n) % n), [n]);
  const next = useCallback(() => setIndex((p) => (p + 1) % n), [n]);
  const prev = useCallback(() => setIndex((p) => (p - 1 + n) % n), [n]);

  const reduced = useRef(false);
  useEffect(() => {
    reduced.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || reduced.current) return;
    const t = setInterval(next, INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, next, index]);

  return (
    <div
      className="seg-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Built for every Zambian business"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="seg-stage">
        {SEGMENTS.map((s, i) => (
          <figure
            className={`seg-slide${i === index ? ' active' : ''}`}
            key={s.img}
            aria-hidden={i !== index}
          >
            <img
              src={s.img}
              alt={s.label}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            <figcaption className="seg-cap">
              <span className="seg-count">
                {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
              </span>
              <span className="seg-label">{s.label}</span>
            </figcaption>
          </figure>
        ))}

        <button className="seg-nav prev" aria-label="Previous" onClick={prev}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="seg-nav next" aria-label="Next" onClick={next}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="seg-dots" role="tablist" aria-label="Choose a segment">
        {SEGMENTS.map((s, i) => (
          <button
            key={s.img}
            role="tab"
            aria-selected={i === index}
            aria-label={s.label}
            className={`seg-dot${i === index ? ' active' : ''}`}
            onClick={() => go(i)}
          >
            <span className="seg-dot-fill" />
          </button>
        ))}
      </div>
    </div>
  );
}
