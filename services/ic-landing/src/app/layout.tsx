import type { ReactNode } from 'react';
import type { Metadata } from 'next';
// Self-hosted fonts (served from 'self', CSP-safe; no build-time CDN fetch).
// Display: Plus Jakarta Sans. Rounded, confident, echoes the Instacom wordmark.
// Body: Inter. Neutral, legible. A deliberate, non-default fintech pairing.
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/inter';
import './globals.css';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';

const TITLE = 'Instacom Payment Solutions | Business payments, made simple';
const DESC =
  'Instacom connects MTN, Airtel, Zamtel, Zed Mobile and Visa into one integration: collections, disbursements and settlement for Zambian businesses, in Kwacha. Fast. Secure. Reliable.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: ['payment gateway', 'Zambia', 'ZMW', 'mobile money', 'MTN', 'Airtel', 'Zamtel', 'Visa', 'Instacom'],
  openGraph: {
    title: TITLE,
    description: DESC,
    siteName: 'Instacom Payment Solutions',
    locale: 'en_ZM',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
