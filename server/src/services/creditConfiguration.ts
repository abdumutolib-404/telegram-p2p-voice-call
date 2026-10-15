import crypto from "node:crypto";
import { prisma } from "../config/database";
import {
  defaultCreditCosts,
  validateCreditCosts,
  creditRates,
  type CreditCatalog,
} from "../contracts/credits";

export async function readCreditConfiguration() {
  const latest = await prisma.auditLog.findFirst({
    where: { action: "CREDIT_COSTS_UPDATE", targetId: "credit_costs" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const costs = validateCreditCosts(
    latest?.afterState ? JSON.parse(latest.afterState) : defaultCreditCosts,
  );
  const revision = crypto
    .createHash("sha256")
    .update(JSON.stringify(costs))
    .digest("hex");
  const capacity=await prisma.$queryRaw<{remaining:number}[]>`SELECT pairtalk_recording_capacity_remaining() AS remaining`;
  const catalog: CreditCatalog = {
    version: 1,
    revision,
    checkedAt: new Date().toISOString(),
    minutes: 15,
    storageDays: 30,
    starterCalls: 3,
    markupPercent: 12,
    salesEnabled: costs.salesEnabled,
    recordingsAvailable:Math.min(1000,Math.max(0,Math.floor((capacity[0]?.remaining??0)/16))),
    rates: creditRates(costs),
    uzsPerUsd: costs.uzsPerUsd,
    usdPerStar: costs.usdPerStar,
  };
  return { costs, catalog };
}
export async function saveCreditConfiguration(value: unknown, adminId: string) {
  const costs = validateCreditCosts(value);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251010)::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251011)::text`;
    const previous = await tx.auditLog.findFirst({
      where: { action: "CREDIT_COSTS_UPDATE", targetId: "credit_costs" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    await tx.auditLog.create({
      data: {
        action: "CREDIT_COSTS_UPDATE",
        targetId: "credit_costs",
        adminId,
        beforeState: previous?.afterState ?? JSON.stringify(defaultCreditCosts),
        afterState: JSON.stringify(costs),
        reason: "Published cost-based credit rates with 12% markup",
      },
    });
  });
  return readCreditConfiguration();
}
