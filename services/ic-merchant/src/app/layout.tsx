import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Instacompay Merchant Portal',
  description: 'Collections and payouts over MTN, Airtel, Zamtel, Zed Mobile and Visa, in ZMW.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
