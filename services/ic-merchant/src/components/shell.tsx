'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const NAV: Array<[string, string]> = [
  ['Dashboard', '/dashboard'],
  ['Collect', '/collect'],
  ['Disburse', '/disburse'],
  ['Approvals', '/approvals'],
  ['Accounts', '/accounts'],
  ['Transactions', '/transactions'],
  ['Settlements', '/settlements'],
  ['Reports', '/reports'],
  ['User Management', '/users'],
  ['API Documentation', '/api-docs'],
];

export function Shell({ children }: { children: ReactNode }): ReactNode {
  const path = usePathname();
  const { principal, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="logo" src="/brand/instacom-logo.png" alt="Instacom" />
          <span className="portal-tag">Merchant Portal</span>
        </div>
        <div className="navlabel">Workspace</div>
        {NAV.map(([label, href]) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={`navlink${active ? ' active' : ''}`}>
              <span className="dot" />
              {label}
            </Link>
          );
        })}
        <div className="spacer" />
        <div className="navlabel">Account</div>
        <div className="mono" style={{ padding: '0 10px', fontSize: 12, color: '#8090b5' }}>
          {principal.merchantId ? principal.merchantId.slice(0, 8) : 'merchant'}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="eyebrow">Merchant Portal · ZMW</div>
          <div className="who">
            <span className="status-pill">
              <span className="live" />
              ZMW · rails live
            </span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {principal.roles.join(' · ') || 'member'}
            </span>
            <button className="btn sm" onClick={() => void logout()}>
              Log out
            </button>
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
