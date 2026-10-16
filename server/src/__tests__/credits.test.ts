import { describe, it, expect } from "vitest";
import {
  creditRates,
  sellingCreditRates,
  defaultCreditCosts,
  quoteCredits,
  validateCreditCosts,
  isCreditCatalog,
} from "../contracts/credits";
import { recordingDeadline } from "../utils/recordingAccess";
import {
  getEffectiveEntitlement,
  calculateEffectiveCallDuration,
} from "../services/plan";

describe("independent cost-based credits", () => {
  const rates = creditRates(defaultCreditCosts);
  const catalog = {
    rates,
    uzsPerUsd: defaultCreditCosts.uzsPerUsd,
    usdPerStar: defaultCreditCosts.usdPerStar,
  };
  it("allocates the total budget once, then adds 12%, at the selected paid volumes", () => {
    const allocated =
      (rates.CALL.costMicros * defaultCreditCosts.paidCalls + rates.RECORDING.costMicros * defaultCreditCosts.paidRecordings) / 1e6;
    const revenue =
      (rates.CALL.priceMicros * defaultCreditCosts.paidCalls + rates.RECORDING.priceMicros * defaultCreditCosts.paidRecordings) / 1e6;
    expect(allocated).toBeGreaterThanOrEqual(25);
    expect(allocated).toBeLessThan(25.00015);
    expect(revenue).toBeGreaterThanOrEqual(28);
    expect(revenue).toBeLessThan(28.0003);
    expect(rates.RECORDING.uzs).toBeGreaterThan(rates.CALL.uzs);
  });
  it("supports independent call-only and recording-only purchases and matched storage", () => {
    expect(
      quoteCredits(catalog, { calls: 5, recordings: 0, storage: false })
        .storage,
    ).toBe(0);
    const a = quoteCredits(catalog, { calls: 0, recordings: 3, storage: true });
    const b = quoteCredits(catalog, {
      calls: 0,
      recordings: 3,
      storage: false,
    });
    expect(a.storage).toBe(3);
    expect(a.uzs).toBe(Math.ceil(rates.RECORDING.uzs * 3 + rates.STORAGE.uzs * 3));
    expect(a.stars).toBeGreaterThanOrEqual(b.stars);
  });
  it("rounds the basket once rather than multiplying rounded single-credit Stars", () => {
    const one = quoteCredits(catalog, {
      calls: 1,
      recordings: 0,
      storage: false,
    });
    const ten = quoteCredits(catalog, {
      calls: 10,
      recordings: 0,
      storage: false,
    });
    expect(ten.stars).toBe(
      Math.ceil(
        (rates.CALL.priceMicros * 10) / 1e6 / defaultCreditCosts.usdPerStar,
      ),
    );
    expect(ten.stars).toBeLessThan(one.stars * 10);
  });
  it.each([
    { calls: 0, recordings: 0, storage: false },
    { calls: 1, recordings: 0, storage: true },
    { calls: 1.1, recordings: 0, storage: false },
    { calls: -1, recordings: 1, storage: false },
    { calls: Infinity, recordings: 0, storage: false },
    { calls: 1001, recordings: 0, storage: false },
  ])("rejects an invalid basket %#", (basket) =>
    expect(() => quoteCredits(catalog, basket)).toThrow(),
  );
  it.each([
    {callPriceUzs:0},
    {callPriceStars:22.5},
    {recordingPriceStars:-1},
    {storagePriceUzs:0},
    { paidCalls: 0 },
    { paidRecordings: 0 },
    { callSharePercent: 100 },
    { monthlyBudgetUsd: 0.1 },
    { recordingAllowanceMinutes:15 },
    { recordingAllowanceMinutes:60.5 },
    { recordingExternalUsedMinutes:-1 },
    { paidRecordings:4 },
    { uzsPerUsd: 0 },
    { usdPerStar: NaN },
    { salesEnabled: undefined },
    { unknown: 1 },
  ])("rejects incomplete or impossible cost assumptions %#", (patch) =>
    expect(() =>
      validateCreditCosts({ ...defaultCreditCosts, ...patch }),
    ).toThrow(),
  );
  it("requires the full public credit contract", () => {
    expect(isCreditCatalog({})).toBe(false);
    expect(isCreditCatalog(null)).toBe(false);
  });
  it("charges the independently published UZS and Stars prices for every selected unit", () => {
    const published={...catalog,rates:sellingCreditRates(defaultCreditCosts)};
    expect(quoteCredits(published,{calls:1,recordings:0,storage:false})).toMatchObject({uzs:3500,stars:18});
    expect(quoteCredits(published,{calls:0,recordings:1,storage:false})).toMatchObject({uzs:4200,stars:21});
    expect(quoteCredits(published,{calls:10,recordings:2,storage:false})).toMatchObject({uzs:43400,stars:222});
    expect(quoteCredits(published,{calls:10,recordings:2,storage:true})).toMatchObject({uzs:43406,stars:223,storage:2});
    expect(sellingCreditRates({...defaultCreditCosts,monthlyBudgetUsd:30}).CALL.uzs).toBe(3500);
  });
  it("gives a credit account its actual balance without inventing a monthly renewal", () => {
    const ent = getEffectiveEntitlement({
      plan: "FREE",
      creditBilling: true,
      callCredits: 2,
      recordingCredits: 4,
    });
    expect(ent.baseCallLimit).toBe(0);
    expect(ent.callLimit).toBe(2);
    expect(ent.recordingLimit).toBe(4);
    expect(
      calculateEffectiveCallDuration(
        { plan: "FREE", creditBilling: true },
        { plan: "BOSS" },
      ),
    ).toBe(15);
  });
  it("does not turn a large prepaid balance into an unlimited entitlement", () => {
    expect(
      getEffectiveEntitlement({
        plan: "FREE",
        creditBilling: true,
        callCredits: 1000,
      }).isUnlimited,
    ).toBe(false);
  });
  it("preserves legacy allowances and caps a reserved credit call to its purchased duration", () => {
    const legacy = getEffectiveEntitlement({ plan: "PLUS", callCredits: 2 });
    expect(legacy.baseCallLimit).toBe(10);
    expect(legacy.callLimit).toBe(12);
    expect(
      calculateEffectiveCallDuration(
        { plan: "PLUS", creditCallActive: true },
        { plan: "BOSS" },
      ),
    ).toBe(15);
  });
  it("enforces each credit owner’s deadline even when a shared file has longer storage", () => {
    const createdAt = new Date("2026-10-15T10:00:00Z");
    const segment = {
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 30 * 86400000),
      creditOwnerIds: ["a", "b"],
      storedOwnerIds: ["b"],
    };
    expect(recordingDeadline(segment, "a")).toBe(
      createdAt.getTime() + 86400000,
    );
    expect(recordingDeadline(segment, "b")).toBe(
      createdAt.getTime() + 30 * 86400000,
    );
  });
});
