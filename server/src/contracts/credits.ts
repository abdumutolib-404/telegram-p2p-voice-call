// Shared, credential-free pricing arithmetic. Amounts are millionths of a USD.
export const CREDIT_MINUTES = 15;
export const CREDIT_MARKUP_PERCENT = 12;
export const CREDIT_TERMS_VERSION = "credits-2026-10-15";
export interface CreditCostInputs {
  monthlyBudgetUsd: number;
  paidCalls: number;
  paidRecordings: number;
  callSharePercent: number;
  participantMinuteUsd: number;
  recordingMinuteUsd: number;
  recordingDeliveryUsd: number;
  storagePerRecordingUsd: number;
  uzsPerUsd: number;
  usdPerStar: number;
  salesEnabled: boolean;
  recordingAllowanceMinutes: number;
  recordingExternalUsedMinutes: number;
}
export const defaultCreditCosts: CreditCostInputs = {
  monthlyBudgetUsd: 25,
  paidCalls: 100,
  paidRecordings: 3,
  callSharePercent: 97.0874,
  participantMinuteUsd: 0.0005,
  recordingMinuteUsd: 0.005,
  recordingDeliveryUsd: 0.001,
  storagePerRecordingUsd: 0.000216,
  uzsPerUsd: 11963.16,
  usdPerStar: 0.013,
  salesEnabled: true,
  recordingAllowanceMinutes: 60,
  recordingExternalUsedMinutes: 0,
};
export type CreditKind = "CALL" | "RECORDING" | "STORAGE";
export interface CreditRate {
  kind: CreditKind;
  costMicros: number;
  priceMicros: number;
  uzs: number;
  stars: number;
}
export interface CreditCatalog {
  version: 1;
  revision: string;
  checkedAt: string;
  minutes: 15;
  storageDays: 30;
  starterCalls: 3;
  markupPercent: 12;
  salesEnabled: boolean;
  recordingsAvailable: number;
  rates: Record<CreditKind, CreditRate>;
  uzsPerUsd: number;
  usdPerStar: number;
}
export interface CreditBasket {
  calls: number;
  recordings: number;
  storage: boolean;
}
export function isCreditCatalog(value: unknown): value is CreditCatalog {
  if (!value || typeof value !== "object") return false;
  const c = value as CreditCatalog;
  return (
    c.version === 1 &&
    typeof c.revision === "string" &&
    /^[a-f0-9]{64}$/.test(c.revision) &&
    typeof c.checkedAt === "string" &&
    Number.isFinite(Date.parse(c.checkedAt)) &&
    c.minutes === 15 &&
    c.storageDays === 30 &&
    c.starterCalls === 3 &&
    c.markupPercent === 12 &&
    typeof c.salesEnabled === "boolean" &&
    Number.isInteger(c.recordingsAvailable) && c.recordingsAvailable>=0 && c.recordingsAvailable<=1000 &&
    Number.isFinite(c.uzsPerUsd) &&
    c.uzsPerUsd > 0 &&
    Number.isFinite(c.usdPerStar) &&
    c.usdPerStar > 0 &&
    (["CALL", "RECORDING", "STORAGE"] as const).every((kind) => {
      const r = c.rates?.[kind];
      return (
        r?.kind === kind &&
        Number.isSafeInteger(r.costMicros) &&
        r.costMicros >= 0 &&
        Number.isSafeInteger(r.priceMicros) &&
        r.priceMicros >= r.costMicros &&
        [r.uzs, r.stars].every((n) => Number.isFinite(n) && n >= 0)
      );
    })
  );
}
export function validateCreditCosts(value: unknown): CreditCostInputs {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Cost inputs are required.");
  const input = value as CreditCostInputs;
  if (Object.keys(input).some((key) => !(key in defaultCreditCosts)))
    throw new Error("Unknown cost input.");
  for (const key of Object.keys(
    defaultCreditCosts,
  ) as (keyof CreditCostInputs)[]) {
    const n = input[key];
    if (key === "salesEnabled") {
      if (typeof n !== "boolean") throw new Error("Choose sales availability.");
      continue;
    }
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1_000_000)
      throw new Error("Every cost must be a finite, non-negative number.");
  }
  if (
    !Number.isInteger(input.paidCalls) ||
    input.paidCalls < 1 ||
    !Number.isInteger(input.paidRecordings) ||
    input.paidRecordings < 1
  )
    throw new Error("Paid usage forecasts must be positive whole numbers.");
  if(!Number.isInteger(input.recordingAllowanceMinutes)||input.recordingAllowanceMinutes<16||!Number.isInteger(input.recordingExternalUsedMinutes))throw new Error('Recording capacity and reserved usage must be whole minutes; capacity must cover at least one 16-minute reservation.');
  if(input.paidRecordings>Math.floor(input.recordingAllowanceMinutes/16))throw new Error('The recording forecast exceeds the configured monthly capacity, including the provider safety buffer.');
  if (
    input.callSharePercent <= 0 ||
    input.callSharePercent >= 100 ||
    input.uzsPerUsd <= 0 ||
    input.usdPerStar <= 0
  )
    throw new Error(
      "Allocation and currency references must be positive; call allocation must be below 100%.",
    );
  const direct =
    input.paidCalls * CREDIT_MINUTES * input.participantMinuteUsd +
    input.paidRecordings *
      (CREDIT_MINUTES * input.recordingMinuteUsd + input.recordingDeliveryUsd);
  if (input.monthlyBudgetUsd < direct)
    throw new Error(
      "The monthly budget must cover the forecast direct call and recording costs.",
    );
  return { ...input };
}
export function creditRates(
  input: CreditCostInputs,
): Record<CreditKind, CreditRate> {
  validateCreditCosts(input);
  const direct =
    input.paidCalls * CREDIT_MINUTES * input.participantMinuteUsd +
    input.paidRecordings *
      (CREDIT_MINUTES * input.recordingMinuteUsd + input.recordingDeliveryUsd);
  const sharedBudget = input.monthlyBudgetUsd - direct;
  const sharedCalls =
    (sharedBudget * input.callSharePercent) / 100 / input.paidCalls;
  const sharedRecordings =
    (sharedBudget * (100 - input.callSharePercent)) /
    100 /
    input.paidRecordings;
  const cost: Record<CreditKind, number> = {
    CALL: sharedCalls + CREDIT_MINUTES * input.participantMinuteUsd,
    RECORDING:
      sharedRecordings +
      CREDIT_MINUTES * input.recordingMinuteUsd +
      input.recordingDeliveryUsd,
    STORAGE: input.storagePerRecordingUsd,
  };
  return Object.fromEntries(
    (Object.keys(cost) as CreditKind[]).map((kind) => {
      const costMicros = Math.ceil(cost[kind] * 1_000_000);
      const priceMicros = Math.ceil((costMicros * 112) / 100);
      return [
        kind,
        {
          kind,
          costMicros,
          priceMicros,
          uzs: (priceMicros / 1_000_000) * input.uzsPerUsd,
          stars: priceMicros / 1_000_000 / input.usdPerStar,
        },
      ];
    }),
  ) as Record<CreditKind, CreditRate>;
}
export function quoteCredits(
  catalog: Pick<CreditCatalog, "rates" | "uzsPerUsd" | "usdPerStar">,
  basket: CreditBasket,
) {
  if (
    !basket ||
    Object.keys(basket).some(
      (key) => !["calls", "recordings", "storage"].includes(key),
    ) ||
    typeof basket.storage !== "boolean" ||
    ![basket.calls, basket.recordings].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 1000,
    ) ||
    basket.calls + basket.recordings === 0 ||
    (basket.storage && basket.recordings === 0)
  )
    throw new Error(
      "Choose 0–1,000 calls and recordings, with at least one credit. Storage requires recordings.",
    );
  const micros =
    catalog.rates.CALL.priceMicros * basket.calls +
    catalog.rates.RECORDING.priceMicros * basket.recordings +
    (basket.storage
      ? catalog.rates.STORAGE.priceMicros * basket.recordings
      : 0);
  const uzs = Math.ceil((micros / 1_000_000) * catalog.uzsPerUsd);
  const stars = Math.ceil(micros / 1_000_000 / catalog.usdPerStar);
  if (
    !Number.isSafeInteger(micros) ||
    stars < 1 ||
    stars > 1_000_000 ||
    uzs > 2_147_483_647
  )
    throw new Error("This basket exceeds payment limits.");
  return {
    micros,
    uzs,
    stars,
    storage: basket.storage ? basket.recordings : 0,
  };
}
