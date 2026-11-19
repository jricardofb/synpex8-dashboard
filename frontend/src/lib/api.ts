import { useCallback, useEffect, useRef, useState } from "react";
export const REFRESH_EVENT = "app:refresh";

export function refreshAll() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

export type Robot = {
  id: string | number;
  name: string;
  externalId: string;
  status: string;
  configuredVolume: number | string;
};

export type DashboardSummary = {
  robots: { total: number; on: number; off: number };
  signals: { total: number; pending: number };
  positions: { open: number };
};

export type Account = {
  id: string;
  broker: string;
  active: boolean;
  freeMargin: number;
  reservedMargin: number;
  usableMargin: number;
};

export function useApi<T>(path: string, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const ctrl = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    ctrl.current?.abort(); // cancela requisição anterior
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);

    try {
      const res = await fetch(path, { signal: c.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const json = (
        raw && typeof raw === "object" && "data" in raw ? raw.data : raw
      ) as T;

      setData(json);
      setError(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e as Error);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
  refetch();
  const timer = intervalMs > 0 ? setInterval(refetch, intervalMs) : undefined;
  window.addEventListener(REFRESH_EVENT, refetch);

  return () => {
    if (timer) clearInterval(timer);
    window.removeEventListener(REFRESH_EVENT, refetch);
    ctrl.current?.abort();
  };
}, [refetch, intervalMs]);


  return { data, error, loading, refetch };
}
