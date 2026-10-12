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
