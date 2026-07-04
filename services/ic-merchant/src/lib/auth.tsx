'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { Spinner } from '@/components/ui';

// Auto sign-out after 10 minutes of inactivity, warning with a countdown when
// 3 minutes remain (SEC-A: idle session limit).
const IDLE_LIMIT_MS = 10 * 60 * 1000;
const WARN_BEFORE_MS = 3 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

function IdleGuard({ onTimeout }: { onTimeout: () => void }): ReactNode {
  const [remaining, setRemaining] = useState<number | null>(null); // seconds left; null = no warning
  const lastActivity = useRef(Date.now());
  const warning = useRef(false);

  useEffect(() => {
    const bump = (): void => {
      if (!warning.current) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LIMIT_MS) {
        onTimeout();
        return;
      }
      if (idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS) {
        warning.current = true;
        setRemaining(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      } else if (warning.current) {
        warning.current = false;
        setRemaining(null);
      }
    }, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(iv);
    };
  }, [onTimeout]);

  function stay(): void {
    lastActivity.current = Date.now();
    warning.current = false;
    setRemaining(null);
  }

  if (remaining === null) return null;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  return (
    <div className="idle-overlay" role="alertdialog" aria-live="assertive">
      <div className="idle-modal">
        <div className="idle-title">Still there?</div>
        <p className="idle-text">You’ll be signed out due to inactivity in</p>
        <div className="idle-countdown">{mm}:{ss}</div>
        <div className="idle-actions">
          <button className="btn primary" onClick={stay}>Stay signed in</button>
          <button className="btn" onClick={onTimeout}>Sign out now</button>
        </div>
      </div>
    </div>
  );
}

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
  return (
    <Ctx.Provider value={{ principal, logout }}>
      <IdleGuard onTimeout={() => void logout()} />
      {children}
    </Ctx.Provider>
  );
}
