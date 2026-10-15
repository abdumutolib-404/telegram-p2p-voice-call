import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { lockRow } from "../utils/transactionLock";
import {
  quoteCredits,
  type CreditBasket,
  CREDIT_MINUTES,
} from "../contracts/credits";
import { readCreditConfiguration } from "./creditConfiguration";
import { isAccountRestricted } from "./accountRestriction";
import { hasAcceptedCurrentTerms } from "./terms";

export async function createCreditOrder(
  userId: string,
  requestId: string,
  basket: CreditBasket,
  revision: string,
) {
  const { catalog } = await readCreditConfiguration();
  if (!catalog.salesEnabled)
    throw new Error(
      "Purchases are paused. Your existing purchases remain available.",
    );
  const quote = quoteCredits(catalog, basket);
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "User", userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || isAccountRestricted(user) || !hasAcceptedCurrentTerms(user))
      throw new Error("Complete registration before purchasing calls or recordings.");
    const existing = await tx.creditOrder.findUnique({ where: { requestId } });
    if (existing) {
      if (
        existing.userId !== userId ||
        existing.calls !== basket.calls ||
        existing.recordings !== basket.recordings ||
        existing.storage !== quote.storage ||
        existing.catalogRevision !== revision
      )
        throw new Error(
          "This checkout request was already used for a different basket.",
        );
      return existing;
    }
    if (revision !== catalog.revision)
      throw new Error(
        "Prices changed. Review the updated total before paying.",
      );
    if(basket.recordings>0){
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251011)::text`;
      const stock=await tx.$queryRaw<{remaining:number}[]>`SELECT pairtalk_recording_capacity_remaining() AS remaining`;
      if((stock[0]?.remaining??0)<basket.recordings*16)throw new Error('There is not enough recording capacity for this purchase. Reduce recordings or buy calls separately.');
    }
    return tx.creditOrder.create({
      data: {
        requestId,
        userId,
        calls: basket.calls,
        recordings: basket.recordings,
        storage: quote.storage,
        starsAmount: quote.stars,
        uzsAmount: quote.uzs,
        catalogRevision: catalog.revision,
        catalogSnapshot: JSON.stringify(catalog),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
  });
}
export async function authorizeCreditOrder(
  id: string,
  telegramId: bigint,
  amount: number,
  currency: string,
  checkoutId: string,
) {
  if (currency !== "XTR") throw new Error("Invalid payment currency.");
  return prisma.$transaction(async (tx) => {
    const initial = await tx.creditOrder.findUnique({ where: { id } });
    if (!initial) throw new Error("Checkout not found.");
    await lockRow(tx, "User", initial.userId);
    const user = await tx.user.findUnique({ where: { id: initial.userId } });
    if (
      !user ||
      user.telegramId !== telegramId ||
      isAccountRestricted(user) ||
      !hasAcceptedCurrentTerms(user)
    )
      throw new Error("This invoice is unavailable for your account.");
    const { catalog } = await readCreditConfiguration();
    if (!catalog.salesEnabled)
      throw new Error("New payments are paused.");
    await lockRow(tx, "CreditOrder", id);
    const order = (await tx.creditOrder.findUnique({ where: { id } }))!;
    if(order.recordings>0){
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251011)::text`;
      const stock=await tx.$queryRaw<{remaining:number}[]>`SELECT pairtalk_recording_capacity_remaining() AS remaining`;
      if((stock[0]?.remaining??-1)<0)throw new Error('Recording capacity changed. Please review your basket before paying.');
    }
    if (
      order.status !== "PENDING" ||
      order.expiresAt <= new Date() ||
      order.starsAmount !== amount ||
      (order.preCheckoutId && order.preCheckoutId !== checkoutId)
    )
      throw new Error(
        "This invoice is expired, already used, or has an incorrect amount.",
      );
    await tx.creditOrder.update({
      where: { id },
      data: { preCheckoutId: checkoutId, authorizedAt: new Date() },
    });
  });
}
export async function settleCreditOrder(
  id: string,
  telegramId: bigint,
  amount: number,
  currency: string,
  paymentId: string,
) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.creditOrder.findUnique({ where: { id } });
    if (!initial) throw new Error("Purchase not found.");
    await lockRow(tx, "User", initial.userId);
    await lockRow(tx, "CreditOrder", id);
    const [order, user] = await Promise.all([
      tx.creditOrder.findUnique({ where: { id } }),
      tx.user.findUnique({ where: { id: initial.userId } }),
    ]);
    if (
      !order ||
      !user ||
      user.telegramId !== telegramId ||
      currency !== "XTR" ||
      order.starsAmount !== amount ||
      !order.authorizedAt
    )
      throw new Error("Payment does not match the authorized purchase.");
    if (order.telegramPaymentId === paymentId)
      return { duplicate: true, order };
    if (
      order.status !== "PENDING" ||
      (await tx.creditOrder.findUnique({
        where: { telegramPaymentId: paymentId },
      }))
    )
      throw new Error("This payment was already applied.");
    // An authorized payment is honoured even if configuration/expiry changes in flight.
    const paid = await tx.creditOrder.update({
      where: { id },
      data: {
        status: "PAID",
        telegramPaymentId: paymentId,
        paidAt: new Date(),
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        callCredits: { increment: order.calls },
        recordingCredits: { increment: order.recordings },
        storageCredits: { increment: order.storage },
      },
    });
    return { duplicate: false, order: paid };
  });
}
export async function reserveCredit(
  tx: Prisma.TransactionClient,
  callId: string,
  userId: string,
  kind: "CALL" | "RECORDING" | "STORAGE",
) {
  const rows = await tx.$queryRaw<
    { reserved: boolean }[]
  >`SELECT pairtalk_reserve_credit(${callId},${userId},${kind}) AS reserved`;
  if (!rows[0]?.reserved)
    throw new Error(`No available ${kind.toLowerCase()} balance remains.`);
}
export async function reserveRecordingCredit(
  tx: Prisma.TransactionClient,
  callId: string,
  userId: string,
) {
  const call = await tx.callSession.findUnique({
    where: { id: callId },
    include: { userA: true, userB: true },
  });
  if (!call) throw new Error("Call is unavailable.");
  // A credit recording covers the full call, up to fifteen minutes. Existing
  // longer subscription recordings continue through their original allowance.
  const { calculateEffectiveCallDuration } = await import("./plan");
  if (calculateEffectiveCallDuration(call.userA, call.userB) > CREDIT_MINUTES)
    throw new Error(
      "Recordings cover calls up to 15 minutes. This longer call requires its legacy recording allowance.",
    );
  await reserveCredit(tx, callId, userId, "RECORDING");
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (user && user.storageCredits > 0)
    await reserveCredit(tx, callId, userId, "STORAGE");
}
// Run after provider recovery as well as webhooks. A usable downloaded file is a
// delivered service; failed exports restore the reservation once all are terminal.
export async function reconcileRecordingCredits() {
  const usages = await prisma.creditUsage.findMany({
    where: {
      kind: "RECORDING",
      status: "RESERVED",
      call: { status: { notIn: ["ACTIVE", "PENDING"] } },
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  for (const usage of usages)
    await prisma.$transaction(async (tx) => {
      await lockRow(tx, "User", usage.userId);
      const segments = await tx.recordingSegment.findMany({
        where: { callId: usage.callId, ownerIds: { has: usage.userId } },
      });
      if (segments.some((segment) => segment.status === "READY")) {
        await tx.creditUsage.updateMany({
          where: {
            callId: usage.callId,
            userId: usage.userId,
            status: "RESERVED",
            kind: { in: ["RECORDING", "STORAGE"] },
          },
          data: { status: "CONSUMED" },
        });
      } else if (
        Date.now()-usage.createdAt.getTime()>=86400000 ||
        !segments.length ||
        segments.every(
          (segment) =>
            segment.status === "FAILED" ||
            (segment.expiresAt && segment.expiresAt <= new Date()),
        )
      ) {
        await tx.$queryRaw`SELECT pairtalk_release_credit(${usage.callId},${usage.userId},'RECORDING')::text`;
        await tx.$queryRaw`SELECT pairtalk_release_credit(${usage.callId},${usage.userId},'STORAGE')::text`;
        await tx.recordingUsage.deleteMany({
          where: { callId: usage.callId, userId: usage.userId },
        });
      }
    });
}
export function creditReceipt(order: {
  calls: number;
  recordings: number;
  storage: number;
  starsAmount: number;
  uzsAmount: number;
}) {
  return `${order.calls} calls · ${order.recordings} recordings${order.storage ? ` · 30-day storage for ${order.storage} recordings` : ""}. Each call/recording covers up to 15 minutes. Purchased calls and recordings do not expire. ${order.starsAmount} Stars; UZS reference ${order.uzsAmount.toLocaleString("en-US")}.`;
}
export async function refundCreditOrder(
  id: string,
  telegramId: bigint,
  provider: {
    refundStarPayment: (userId: number, chargeId: string) => Promise<unknown>;
  },
) {
  const order = await prisma.$transaction(async (tx) => {
    const first = await tx.creditOrder.findUnique({ where: { id } });
    if (!first) throw new Error("Purchase not found.");
    await lockRow(tx, "User", first.userId);
    await lockRow(tx, "CreditOrder", id);
    const [purchase, user] = await Promise.all([
      tx.creditOrder.findUnique({ where: { id } }),
      tx.user.findUnique({ where: { id: first.userId } }),
    ]);
    if (
      !purchase ||
      !user ||
      user.telegramId !== telegramId ||
      !purchase.telegramPaymentId
    )
      throw new Error("Purchase not found.");
    if (purchase.status === "REFUNDED" || purchase.status === "REFUND_PENDING")
      return purchase;
    if (
      purchase.status !== "PAID" ||
      !purchase.paidAt ||
      Date.now() - purchase.paidAt.getTime() > 48 * 3600000
    )
      throw new Error(
        "This purchase is outside the 48-hour purchase refund period. Contact /paysupport.",
      );
    const changed = await tx.user.updateMany({
      where: {
        id: user.id,
        callCredits: { gte: purchase.calls },
        recordingCredits: { gte: purchase.recordings },
        storageCredits: { gte: purchase.storage },
      },
      data: {
        callCredits: { decrement: purchase.calls },
        recordingCredits: { decrement: purchase.recordings },
        storageCredits: { decrement: purchase.storage },
      },
    });
    if (changed.count !== 1)
      throw new Error(
        "The full purchased quantities must remain unused and unreserved for an automatic refund. Contact /paysupport.",
      );
    await tx.auditLog.create({
      data: {
        action: "CREDIT_REFUND_REQUESTED",
        targetId: id,
        adminId: String(telegramId),
        reason: "Full unused purchase refund",
      },
    });
    return tx.creditOrder.update({
      where: { id },
      data: { status: "REFUND_PENDING" },
    });
  });
  if (order.status === "REFUNDED") return;
  try {
    await provider.refundStarPayment(
      Number(telegramId),
      order.telegramPaymentId!,
    );
  } catch (error) {
    const description = (error as { description?: string })?.description ?? "";
    if (!/CHARGE_ALREADY_REFUNDED/.test(description))
      throw new Error(
        "Refund confirmation is pending. Reopen /refund to check or retry this same refund.",
      );
  }
  await prisma.$transaction(async (tx) => {
    await lockRow(tx, "CreditOrder", id);
    const changed = await tx.creditOrder.updateMany({
      where: { id, status: "REFUND_PENDING" },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    if (changed.count === 1)
      await tx.auditLog.create({
        data: {
          action: "CREDIT_REFUND_CONFIRMED",
          targetId: id,
          adminId: String(telegramId),
          reason: "Telegram confirmed the Stars refund",
        },
      });
  });
}
