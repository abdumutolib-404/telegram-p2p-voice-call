import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { isPublicStats, type PublicStats } from '../../../server/src/contracts/publicStats';
export { isPublicStats, type PublicStats } from '../../../server/src/contracts/publicStats';
type StatsState = {
  data: PublicStats | null;
  loading: boolean;
  failed: boolean;
  retry: () => void;
};
const Context = createContext<StatsState>({
  data: null,
  loading: true,
  failed: false,
  retry: () => {},
});
export function StatsProvider({
  initial,
  enabled = true,
  children,
}: {
  initial?: PublicStats | null;
  enabled?: boolean;
  children: ReactNode;
}) {
  const [data, setData] = useState<PublicStats | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setLoading(true);
    setFailed(false);
    const url =
      import.meta.env.VITE_PUBLIC_STATS_URL ||
      "/api/public/stats";
    fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Statistics unavailable");
        const body: unknown = await response.json();
        if (!isPublicStats(body)) throw new Error("Invalid statistics");
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, enabled]);
  return (
    <Context.Provider
      value={{ data, loading, failed, retry: () => setAttempt((a) => a + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePublicStats = () => useContext(Context);
