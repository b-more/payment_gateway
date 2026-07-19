'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MERCHANT, NAVLINKS } from '@/lib/site';

export function SiteNav(): ReactNode {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  // Route change closes the panel, otherwise it stays open over the new page.
  useEffect(() => {
    setOpen(false);
  }, [path]);

  // Escape closes and returns focus to the button that opened it. Locking the
  // body scroll stops the page sliding underneath the open sheet.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        burgerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !burgerRef.current?.contains(t)) setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    document.body.classList.add('nav-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      document.body.classList.remove('nav-open');
    };
  }, [open]);

  const isActive = (href: string): boolean => path === href;

  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" aria-label="Instacom Payment Solutions, home">
          <img
            className="logo"
            src="/brand/instacom-logo-2x.png"
            alt="Instacom Payment Solutions"
            width={235}
            height={64}
            fetchPriority="high"
          />
        </Link>

        <nav className="links" aria-label="Main">
          {NAVLINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={isActive(href) ? 'active' : undefined}
              aria-current={isActive(href) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="cta">
          <a className="signin" href={`${MERCHANT}/login`}>Sign in</a>
          <a className="btn btn-primary btn-sm" href={`${MERCHANT}/getting-started`}>Get started</a>
        </div>

        <button
          ref={burgerRef}
          type="button"
          className="burger"
          aria-expanded={open}
          aria-controls="nav-panel"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>

        {open ? <div className="scrim" aria-hidden /> : null}

        <div className={open ? 'panel open' : 'panel'} id="nav-panel" ref={panelRef} hidden={!open}>
          <nav aria-label="Mobile">
            {NAVLINKS.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={isActive(href) ? 'plink active' : 'plink'}
                aria-current={isActive(href) ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="pcta">
            <a className="btn btn-light" href={`${MERCHANT}/login`}>Sign in</a>
            <a className="btn btn-primary" href={`${MERCHANT}/getting-started`}>Get started</a>
          </div>
        </div>
      </div>
    </header>
  );
}
