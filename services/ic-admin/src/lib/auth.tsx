'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { Spinner } from '@/components/ui';

export interface Principal {
  userId: string;
  scope: string;
  merchantId: string | null;
  roles: string[];
}

interface AuthCtx {
  principal: Principal;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth used outside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((p) => {
        if (active) {
          setPrincipal(p);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          router.replace('/login');
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setPrincipal(null);
    router.replace('/login');
  }, [router]);

  if (loading || !principal) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    );
  }
  return <Ctx.Provider value={{ principal, logout }}>{children}</Ctx.Provider>;
}
