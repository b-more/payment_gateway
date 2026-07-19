'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const hasData = useRef(false);
  const lastPath = useRef(path);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    // A *refetch* must not flip `loading` back on. Callers render
    // `loading ? <Spinner/> : <children/>`, so doing that swaps the whole
    // subtree for a spinner — unmounting children and destroying their state.
    // That silently ate the shown-once API key + secret after a regeneration
    // (reload() ran right after, remounting the panel that was displaying them).
    // Keep the existing data on screen while we refresh in the background.
    if (lastPath.current !== path) {
      hasData.current = false;
      lastPath.current = path;
    }
    if (!hasData.current) setLoading(true);
    apiGet<T>(path)
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
          hasData.current = true;
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof ApiError ? e.message : 'Failed to load');
          hasData.current = true; // don't spinner-flash on every retry either
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [path, tick]);

  return { data, error, loading, reload };
}
