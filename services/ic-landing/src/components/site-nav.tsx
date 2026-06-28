'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MERCHANT, NAVLINKS } from '@/lib/site';

export function SiteNav(): ReactNode {
  const path = usePathname();
  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" aria-label="Instacom Payment Solutions — home">
          <img className="logo" src="/brand/instacom-logo.png" alt="Instacom Payment Solutions" />
        </Link>
        <nav className="links">
          {NAVLINKS.map(([label, href]) => {
            const active = path === href;
            return (
              <Link key={href} href={href} className={active ? 'active' : undefined}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="cta">
          <a className="btn btn-ghost btn-sm" href={`${MERCHANT}/login`}>Sign in</a>
          <a className="btn btn-primary btn-sm" href={`${MERCHANT}/getting-started`}>Get started</a>
        </div>
      </div>
    </header>
  );
}
