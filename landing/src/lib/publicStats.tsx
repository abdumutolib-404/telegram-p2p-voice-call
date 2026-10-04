import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface PublicStats {
  updatedAt: string;
  completedCalls: number;
  practiceHours: number;
  practicingLearners: number;
  activeTopics: number;
  ratings: {
    average: number | null;
    count: number;
    distribution: { stars: number; count: number }[];
  };
  monthly: { month: string; calls: number; hours: number }[];
}
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
export function isPublicStats(value: unknown): value is PublicStats {
  if (!value || typeof value !== "object") return false;
  const s = value as PublicStats;
  return (
    typeof s.updatedAt === "string" &&
    Number.isFinite(Date.parse(s.updatedAt)) &&
    [
      s.completedCalls,
      s.practiceHours,
      s.practicingLearners,
      s.activeTopics,
    ].every(finite) &&
    Boolean(s.ratings) &&
    finite(s.ratings.count) &&
    (s.ratings.average === null ||
      (finite(s.ratings.average) &&
        s.ratings.average >= 1 &&
        s.ratings.average <= 5)) &&
    Array.isArray(s.ratings.distribution) &&
    s.ratings.distribution.length <= 5 &&
    s.ratings.distribution.every(
      (r) =>
        r !== null &&
        typeof r === "object" &&
        finite(r.count) &&
        Number.isInteger(r.stars) &&
        r.stars >= 1 &&
        r.stars <= 5,
    ) &&
    Array.isArray(s.monthly) &&
    s.monthly.length <= 6 &&
    s.monthly.every(
      (m) =>
        m !== null &&
        typeof m === "object" &&
        /^\d{4}-\d{2}$/.test(m.month) &&
        finite(m.calls) &&
        finite(m.hours),
    )
  );
}
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
      "https://api.pairtalk.online/api/public/stats";
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
