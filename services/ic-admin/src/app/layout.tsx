import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Instacompay — Admin Console',
  description: 'Operator control console for the Instacompay payment gateway.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
