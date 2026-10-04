import { Router } from "express";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";

const router = Router();
const TTL = 15 * 60 * 1000;
interface Snapshot {
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
let cached: Snapshot | null = null;
let expiresAt = 0;
let retryAfter = 0;
let pending: Promise<Snapshot> | null = null;
const numeric = (v: bigint | number | string | null): number => {
  const result = Number(v ?? 0);
  if (
    !Number.isFinite(result) ||
    result < 0 ||
    result > Number.MAX_SAFE_INTEGER
  )
    throw new Error("Invalid public aggregate");
  return result;
};

export async function readPublicStats(): Promise<Snapshot> {
  const now = Date.now();
  if (cached && now < expiresAt) return cached;
  if (pending) return pending;
  if (now < retryAfter)
    throw new Error("Public statistics temporarily unavailable");
  pending = prisma
    .$transaction(
      async (tx) => {
        // Aggregation happens in PostgreSQL. Account IDs and private records never leave the database.
        await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
        const [totals] = await tx.$queryRaw<
          Array<{
            calls: bigint;
            seconds: bigint;
            learners: bigint;
            topics: bigint;
          }>
        >`
      WITH completed AS (
        SELECT "userAId", "userBId", duration FROM "CallSession" WHERE status = 'COMPLETED' AND duration > 0
      ), learners AS (
        SELECT "userAId" AS id FROM completed UNION SELECT "userBId" AS id FROM completed
      )
      SELECT (SELECT COUNT(*) FROM completed) AS calls,
        (SELECT COALESCE(SUM(duration), 0) FROM completed) AS seconds,
        (SELECT COUNT(*) FROM learners) AS learners,
        (SELECT COUNT(*) FROM "IeltsTopic" t WHERE t."isActive" = TRUE AND EXISTS (
          SELECT 1 FROM "IeltsQuestion" q WHERE q."topicId" = t.id AND q."isActive" = TRUE
        )) AS topics
    `;
        const distribution = await tx.$queryRaw<
          Array<{ stars: number; count: bigint }>
        >`
      WITH valid_ratings AS (
        SELECT DISTINCT ON (r."callId", r."raterId") r.stars
        FROM "CallRating" r JOIN "CallSession" c ON c.id = r."callId"
        WHERE c.status = 'COMPLETED' AND c.duration > 0 AND r.stars BETWEEN 1 AND 5
          AND ((r."raterId" = c."userAId" AND r."ratedId" = c."userBId")
            OR (r."raterId" = c."userBId" AND r."ratedId" = c."userAId"))
        ORDER BY r."callId", r."raterId", r."createdAt" DESC, r.id DESC
      ) SELECT stars, COUNT(*) AS count FROM valid_ratings GROUP BY stars ORDER BY stars
    `;
        const monthlyRows = await tx.$queryRaw<
          Array<{ month: string; calls: bigint; seconds: bigint }>
        >`
      SELECT TO_CHAR(DATE_TRUNC('month', COALESCE("endedAt", "createdAt")), 'YYYY-MM') AS month,
        COUNT(*) AS calls, COALESCE(SUM(duration), 0) AS seconds
      FROM "CallSession" WHERE status = 'COMPLETED' AND duration > 0
        AND COALESCE("endedAt", "createdAt") >= DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '5 months'
      GROUP BY 1 ORDER BY 1
    `;
        const stamp = new Date();
        const monthly = Array.from({ length: 6 }, (_, index) => {
          const month = new Date(
            Date.UTC(
              stamp.getUTCFullYear(),
              stamp.getUTCMonth() - 5 + index,
              1,
            ),
          )
            .toISOString()
            .slice(0, 7);
          const row = monthlyRows.find((r) => r.month === month);
          return {
            month,
            calls: numeric(row?.calls ?? 0),
            hours: Math.round(numeric(row?.seconds ?? 0) / 36) / 100,
          };
        });
        const safeDistribution = distribution.map((r) => ({
          stars: r.stars,
          count: numeric(r.count),
        }));
        const ratingCount = safeDistribution.reduce(
          (sum, r) => sum + r.count,
          0,
        );
        return {
          updatedAt: stamp.toISOString(),
          completedCalls: numeric(totals.calls),
          practiceHours: Math.round(numeric(totals.seconds) / 36) / 100,
          practicingLearners: numeric(totals.learners),
          activeTopics: numeric(totals.topics),
          ratings: {
            average:
              ratingCount >= 5
                ? Math.round(
                    (safeDistribution.reduce(
                      (sum, r) => sum + r.stars * r.count,
                      0,
                    ) /
                      ratingCount) *
                      100,
                  ) / 100
                : null,
            count: ratingCount,
            distribution: ratingCount >= 5 ? safeDistribution : [],
          },
          monthly,
        };
      },
      { timeout: 10000, isolationLevel: "RepeatableRead" },
    )
    .then((snapshot) => {
      cached = snapshot;
      expiresAt = Date.now() + TTL;
      retryAfter = 0;
      return snapshot;
    })
    .catch((error: unknown) => {
      retryAfter = Date.now() + 30000;
      logger.warn(
        "Public statistics unavailable",
        { service: "public_stats" },
        error,
      );
      // No synthetic data and no successful response with an undated stale aggregate.
      throw error;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

router.get("/stats", async (_req, res): Promise<void> => {
  try {
    const snapshot = await readPublicStats();
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.json(snapshot);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "30");
    res
      .status(503)
      .json({ error: "Community statistics are temporarily unavailable." });
  }
});
export default router;
