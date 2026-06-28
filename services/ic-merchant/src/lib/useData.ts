'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, ApiError } from '@/lib/api';

export interface DataState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useData<T>(path: string | null): DataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    apiGet<T>(path)
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof ApiError ? e.message : 'Failed to load');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [path, tick]);

  return { data, error, loading, reload };
}
