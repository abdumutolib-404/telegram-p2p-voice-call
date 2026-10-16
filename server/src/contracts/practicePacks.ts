// Pure, shared pack arithmetic. Runtime fulfillment must use the returned
// 15-minute units, not the number of selected 30-minute sessions.
export type PracticeMinutes = 15 | 30;
export interface PracticePack {
  calls: number;
  recordings: number;
  retention: boolean;
  minutes: PracticeMinutes;
}
export interface PracticePriceSettings {
  callUzs: number;
  recordingUzs: number;
  retentionUzs: number;
  starUzs: number;
  starMarkupPercent: number;
}
export const defaultPracticePrices: PracticePriceSettings = {
  callUzs: 3500, recordingUzs: 4200, retentionUzs: 3,
  starUzs: 255, starMarkupPercent: 25,
};
export interface PracticeCatalog {
  version: 2;
  revision: string;
  checkedAt: string;
  prices: PracticePriceSettings;
  durations: [15, 30];
  retentionDays: 30;
  starterCalls: 3;
  salesEnabled: boolean;
  recordingMinutesAvailable: number;
}
export function isPracticeCatalog(value: unknown): value is PracticeCatalog {
  if (!value || typeof value !== "object") return false;
  const c=value as PracticeCatalog;
  try { validatePracticePrices(c.prices); } catch { return false; }
  return c.version===2 && typeof c.revision==='string' && /^[a-f0-9]{64}$/.test(c.revision)
    && typeof c.checkedAt==='string' && Number.isFinite(Date.parse(c.checkedAt))
    && Array.isArray(c.durations) && c.durations.length===2 && c.durations[0]===15 && c.durations[1]===30
    && c.retentionDays===30 && c.starterCalls===3 && typeof c.salesEnabled==='boolean'
    && safeCount(c.recordingMinutesAvailable);
}
const safeCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function percentBasis(value: number): number {
  const basis = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - basis) > 1e-7) throw new Error("Percentages must be between 0% and 100%, with at most two decimals.");
  return basis;
}
const money = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("This amount cannot be represented safely.");
  return value;
};
export function validatePracticePack(value: unknown): PracticePack {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a practice pack.");
  const pack = value as PracticePack;
  if (Object.keys(pack).some(key => !["calls", "recordings", "retention", "minutes"].includes(key))) throw new Error("Unknown pack field.");
  if (!safeCount(pack.calls) || pack.calls < 1 || !safeCount(pack.recordings)) throw new Error("Choose a positive whole number of calls and a whole number of recordings.");
  if (pack.recordings > pack.calls) throw new Error("Recordings cannot exceed calls.");
  if (pack.minutes !== 15 && pack.minutes !== 30) throw new Error("Choose 15 or 30 minutes.");
  if (typeof pack.retention !== "boolean" || (pack.retention && pack.recordings === 0)) throw new Error("Retention requires recordings.");
  return {calls:pack.calls, recordings:pack.recordings, retention:pack.retention, minutes:pack.minutes};
}
export function validatePracticePrices(value: PracticePriceSettings): PracticePriceSettings {
  if (!value || [value.callUzs, value.recordingUzs, value.starUzs].some(n => !safeCount(n) || n < 1) || !safeCount(value.retentionUzs)) throw new Error("Service prices and the UZS per Star reference must be whole amounts.");
  percentBasis(value.starMarkupPercent);
  return value;
}
function ceilRatio(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
function asMoney(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < 0n) throw new Error("This amount cannot be represented safely.");
  return Number(n);
}
export function baseServiceStars(uzs: number, prices: PracticePriceSettings): number {
  validatePracticePrices(prices);
  if (!safeCount(uzs)) throw new Error("Invalid service amount.");
  const basis = BigInt(10000 + percentBasis(prices.starMarkupPercent));
  return asMoney(ceilRatio(BigInt(uzs) * basis, BigInt(prices.starUzs) * 10000n));
}
export function quotePracticePack(input: unknown, prices: PracticePriceSettings = defaultPracticePrices, discountPercent = 0) {
  const pack = validatePracticePack(input);
  validatePracticePrices(prices);
  const discountBasis = percentBasis(discountPercent);
  const factor = pack.minutes / 15;
  const callUnits = money(pack.calls * factor);
  const recordingUnits = money(pack.recordings * factor);
  const retentionCount = pack.retention ? pack.recordings : 0;
  const retentionUnits = pack.retention ? recordingUnits : 0;
  const callUzs = asMoney(BigInt(callUnits) * BigInt(prices.callUzs));
  const recordingUzs = asMoney(BigInt(recordingUnits) * BigInt(prices.recordingUzs));
  const retentionUzs = asMoney(BigInt(retentionUnits) * BigInt(prices.retentionUzs));
  const originalUzs = asMoney(BigInt(callUzs) + BigInt(recordingUzs) + BigInt(retentionUzs));
  // Round base 15-minute service rates first; a 30-minute session is exactly
  // twice the rounded 15-minute rate. Retention rounds with the whole basket.
  const serviceStars = BigInt(callUnits) * BigInt(baseServiceStars(prices.callUzs, prices)) + BigInt(recordingUnits) * BigInt(baseServiceStars(prices.recordingUzs, prices));
  const basis = BigInt(10000 + percentBasis(prices.starMarkupPercent));
  const denominator = BigInt(prices.starUzs) * 10000n;
  const starNumerator = serviceStars * denominator + BigInt(retentionUzs) * basis;
  const originalStars = asMoney(ceilRatio(starNumerator, denominator));
  const payableBasis = BigInt(10000 - discountBasis);
  const uzs = asMoney(ceilRatio(BigInt(originalUzs) * payableBasis, 10000n));
  const stars = asMoney(ceilRatio(BigInt(originalStars) * payableBasis, 10000n));
  return { pack, callUnits, recordingUnits, retentionCount, retentionUnits,
    lines: {callUzs, recordingUzs, retentionUzs}, originalUzs, originalStars,
    uzs, stars, discountPercent:discountBasis/100, free: payableBasis === 0n };
}
