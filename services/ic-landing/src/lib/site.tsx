import type { ReactNode, SVGProps } from 'react';

// External portal URL (build-time). Prod points at the merchant portal hostname.
export const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_URL ?? 'http://localhost:8020';
export const PHONE = '+260 765 121 134';
export const PHONE_HREF = 'tel:+260765121134';
export const ADDRESS = '6755 Elasah House, Along Chainama Road, Olympia Extension, Lusaka, Zambia';

export const NAVLINKS: Array<[string, string]> = [
  ['Product', '/product'],
  ['How it works', '/how-it-works'],
  ['Developers', '/developers'],
  ['Contact', '/contact'],
];

/* ── Line icons (stroke, currentColor) ── */
export function Icon({ d, ...p }: { d: string } & SVGProps<SVGSVGElement>): ReactNode {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d={d} />
    </svg>
  );
}
export const I = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  shield: 'M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Zm0 7v3',
  swap: 'M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3',
  zero: 'M4 10h16M4 14h16M7 7v10m10-10v10',
  pulse: 'M3 12h4l2 6 4-14 2 8h6',
  code: 'm8 9-3 3 3 3m8-6 3 3-3 3M13 7l-2 10',
  phone: 'M5 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  pin: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-3 3-3 15 0 18m0-18c3 3 3 15 0 18M3 12h18',
  check: 'm5 13 4 4 10-11',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
};

export const RAILS = ['MTN', 'Airtel', 'Zamtel', 'Zed Mobile', 'Visa'];

export const FEATURES: Array<{ icon: string; title: string; body: string }> = [
  { icon: I.bolt, title: 'Fast transactions', body: 'Collections and payouts move in seconds across every major Zambian rail — no waiting, no friction.' },
  { icon: I.shield, title: 'Secure payments', body: 'Bank-grade encryption, signed requests and an append-only audit trail behind every kwacha that moves.' },
  { icon: I.swap, title: 'Seamless transfers', body: 'Disburse to any wallet or card from one balance, with float controls and full reconciliation.' },
  { icon: I.zero, title: 'Zero integration cost', body: 'Onboard your business and go live for free. No setup fees, no lock-in — only pay as you transact.' },
  { icon: I.pulse, title: 'Real-time monitoring', body: 'Watch every transaction, settlement and balance update live from your merchant dashboard.' },
  { icon: I.code, title: 'Developer-ready API', body: 'A clean REST API with HMAC signing, idempotency keys and signed webhooks. Integrate in an afternoon.' },
];
