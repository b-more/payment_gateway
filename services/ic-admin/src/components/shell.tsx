'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const NAV: Array<{ group: string; items: Array<[string, string]> }> = [
  { group: 'Overview', items: [['Dashboard', '/dashboard']] },
  {
    group: 'Money',
    items: [
      ['Merchants', '/merchants'],
      ['Transactions', '/transactions'],
      ['Settlements', '/settlements'],
      ['ZamPay Settlements', '/zampay'],
      ['Commission', '/commission'],
      ['Float Management', '/float'],
    ],
  },
  {
    group: 'Administration',
    items: [
      ['Reports', '/reports'],
      ['Security', '/security'],
      ['Notifications', '/notifications'],
      ['User Management', '/users'],
      ['Settings', '/settings'],
    ],
  },
];

export function Shell({ children }: { children: ReactNode }): ReactNode {
  const path = usePathname();
  const { principal, logout } = useAuth();
  const avatar = (principal.roles[0] ?? 'AD').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="logo" src="/brand/instacom-logo.png" alt="Instacom" />
          <span className="portal-tag">Admin Console</span>
        </div>
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="navlabel">{g.group}</div>
            {g.items.map(([label, href]) => {
              const active = path === href || path.startsWith(`${href}/`);
              return (
                <Link key={href} href={href} className={`navlink${active ? ' active' : ''}`}>
                  <span className="dot" />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="spacer" />
        <div className="navlabel">Roles</div>
        <div className="mono" style={{ padding: '0 10px', fontSize: 12, color: '#8aa597' }}>
          {principal.roles.join(' · ') || 'none'}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="eyebrow">Admin Console · ZMW</div>
          <div className="who">
            <span className="status-pill">
              <span className="live" />
              ZMW · rails live
            </span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {principal.scope}
            </span>
            <button className="btn sm" onClick={() => void logout()}>
              Log out
            </button>
            <div className="avatar">{avatar}</div>
          </div>
        </header>
        <main className="content">{children}</main>
        <footer className="app-footer">
          <span>© 2026 Instacom Payment Solutions Limited · Lusaka, Zambia</span>
          <span className="credit">
            <span className="sep" />
            Powered by <b>Codesync</b>
          </span>
        </footer>
      </div>
    </div>
  );
}

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}
