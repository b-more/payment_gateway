'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { Shell } from '@/components/shell';

export default function AppLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
