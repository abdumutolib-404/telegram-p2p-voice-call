import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../config/database", () => ({
  prisma: { $transaction: transaction },
}));
vi.mock("../utils/logger", () => ({ logger: { warn: vi.fn() } }));

async function setup(
  ratingCounts: Array<{ stars: number; count: bigint }> = [
    { stars: 1, count: 1n },
    { stars: 5, count: 4n },
  ],
) {
  vi.resetModules();
  const aggregates = [
    [{ calls: 10n, seconds: 3600n, learners: 8n, topics: 12n }],
    ratingCounts,
    [{ month: "2026-10", calls: 2n, seconds: 1800n }],
  ];
  let queryIndex = 0;
  const query = vi
    .fn()
    .mockImplementation(async () => aggregates[queryIndex++ % 3]);
  transaction.mockImplementation(async (callback) =>
    callback({ $executeRaw: vi.fn(), $queryRaw: query }),
  );
  const { default: router } = await import("../routes/publicStats");
  const app = express();
  app.use("/api/public", router);
  return { app, query };
}
describe("Public community statistics", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    transaction.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("publishes only numeric aggregates with dated, zero-filled monthly activity", async () => {
    const { app } = await setup();
    const response = await request(app).get("/api/public/stats");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      updatedAt: "2026-10-01T12:00:00.000Z",
      completedCalls: 10,
      practiceHours: 1,
      practicingLearners: 8,
      activeTopics: 12,
      ratings: {
        average: 4.2,
        count: 5,
        distribution: [
          { stars: 1, count: 1 },
          { stars: 5, count: 4 },
        ],
      },
      monthly: [
        { month: "2026-05", calls: 0, hours: 0 },
        { month: "2026-06", calls: 0, hours: 0 },
        { month: "2026-07", calls: 0, hours: 0 },
        { month: "2026-08", calls: 0, hours: 0 },
        { month: "2026-09", calls: 0, hours: 0 },
        { month: "2026-10", calls: 2, hours: 0.5 },
      ],
    });
    expect(response.headers["cache-control"]).toContain("public");
  });
  it("hides averages and breakdowns when fewer than five ratings exist", async () => {
    const { app } = await setup([{ stars: 5, count: 4n }]);
    const response = await request(app).get("/api/public/stats");
    expect(response.body.ratings).toEqual({
      average: null,
      count: 4,
      distribution: [],
    });
  });
  it("shares refresh work between concurrent requests and caches the result", async () => {
    const { app } = await setup();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => request(app).get("/api/public/stats")),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    await request(app).get("/api/public/stats");
    expect(transaction).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-01T12:16:00Z"));
    const refreshed = await request(app).get("/api/public/stats");
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.updatedAt).toBe("2026-10-01T12:16:00.000Z");
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it("fails closed without publishing database errors or hammering a failing database", async () => {
    const { app } = await setup();
    transaction.mockRejectedValue(
      new Error("Private database connection string"),
    );
    const response = await request(app).get("/api/public/stats");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Community statistics are temporarily unavailable.",
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["retry-after"]).toBe("30");
    await request(app).get("/api/public/stats");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
