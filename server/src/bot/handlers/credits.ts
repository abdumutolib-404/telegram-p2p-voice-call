import { Bot, InlineKeyboard } from "grammy";
import type { MyContext } from "../types";
import { env } from "../../config/env";
import { prisma } from "../../config/database";
import { readCreditConfiguration } from "../../services/creditConfiguration";
import {
  authorizeCreditOrder,
  settleCreditOrder,
  creditReceipt,
  refundCreditOrder,
} from "../../services/credits";
import { logger } from "../../utils/logger";
import type { CreditBasket } from "../../contracts/credits";

export async function renderCreditOverview(
  ctx: MyContext,
  basket?: CreditBasket,
) {
  const { catalog } = await readCreditConfiguration();
  const money = (value: number) =>
    value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const user = ctx.from
    ? await prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      })
    : null;
  const url = new URL(env.MINI_APP_URL);
  url.searchParams.set("view", "upgrade");
  if (basket) {
    url.searchParams.set("creditCalls", String(basket.calls));
    url.searchParams.set("creditRecordings", String(basket.recordings));
    url.searchParams.set("creditStorage", basket.storage ? "1" : "0");
  }
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  await ctx.reply(
    `Practice credits\n\nCall · ${money(catalog.rates.CALL.uzs)} UZS per credit\nRecording · ${money(catalog.rates.RECORDING.uzs)} UZS per credit\nOptional 30-day storage · ${money(catalog.rates.STORAGE.uzs)} UZS per recording\n\nOne credit covers up to 15 minutes. Choose any number of calls and recordings separately. Purchased credits do not expire.\n\n${user ? `Your credit balance: ${user.callCredits ?? 0} calls · ${user.recordingCredits ?? 0} recordings · ${user.storageCredits ?? 0} storage credits.\n\n` : ""}New accounts receive three free starter calls once. Existing allowances stay available. UZS amounts are cost references; checkout charges Telegram Stars and rounds the basket once. ${catalog.salesEnabled ? "" : "New credit sales are currently paused."}`,
    {
      reply_markup: new InlineKeyboard().webApp(
        "Choose credits",
        url.toString(),
      ),
    },
  );
}
export async function renderCreditRefunds(ctx: MyContext) {
  const user = ctx.from
    ? await prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      })
    : null;
  if (!user) return false;
  const orders = await prisma.creditOrder.findMany({
    where: { userId: user.id, status: { in: ["PAID", "REFUND_PENDING"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  if (!orders.length) return false;
  const keyboard = new InlineKeyboard();
  for (const order of orders)
    keyboard
      .text(
        `${order.starsAmount} Stars · ${order.id.slice(0, 8)}`,
        `credit_refund:${order.id}`,
      )
      .row();
  keyboard.text("Legacy subscription refunds", "legacy_refunds");
  await ctx.reply(
    "Credit purchase refunds\n\nA full credit refund is available within 48 hours when the complete purchased quantities are still in your available balance. Credits reserved for a call or recording cannot be refunded. Select a purchase to confirm its refund. For legacy subscription refunds, contact /paysupport.",
    { reply_markup: keyboard },
  );
  return true;
}
const pattern = /^credits:([a-f0-9-]{36})$/;
export function setupCreditHandlers(bot: Bot<MyContext>) {
  bot.command("credits", (ctx) => renderCreditOverview(ctx));
  bot.callbackQuery(/^credit_refund:([a-f0-9-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "Refund this credit purchase? Its full quantities will be removed from your available balance and the original Stars payment returned.",
      {
        reply_markup: new InlineKeyboard().text(
          "Confirm refund",
          `credit_refund_confirm:${ctx.match[1]}`,
        ),
      },
    );
  });
  bot.callbackQuery(/^credit_refund_confirm:([a-f0-9-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      await refundCreditOrder(ctx.match[1], BigInt(ctx.from.id), bot.api);
      await ctx.reply("Refund confirmed. Your Stars have been returned.");
    } catch (error) {
      await ctx.reply(
        error instanceof Error
          ? error.message
          : "Refund confirmation is pending. Contact /paysupport.",
      );
    }
  });
  bot.on("pre_checkout_query", async (ctx, next) => {
    const q = ctx.preCheckoutQuery;
    if (!q.invoice_payload.startsWith("credits:")) return next();
    try {
      const match = pattern.exec(q.invoice_payload);
      if (!match) throw new Error("Invalid credit invoice.");
      await authorizeCreditOrder(
        match[1],
        BigInt(ctx.from.id),
        q.total_amount,
        q.currency,
        q.id,
      );
      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message:
          error instanceof Error
            ? error.message
            : "Credit checkout is unavailable.",
      });
    }
  });
  bot.on("message:successful_payment", async (ctx, next) => {
    const p = ctx.message.successful_payment;
    if (!p.invoice_payload.startsWith("credits:")) return next();
    const match = pattern.exec(p.invoice_payload);
    if (!match) throw new Error("Invalid credit payment.");
    try {
      const result = await settleCreditOrder(
        match[1],
        BigInt(ctx.from.id),
        p.total_amount,
        p.currency,
        p.telegram_payment_charge_id,
      );
      if (!result.duplicate)
        await ctx.reply(
          `Credits added. ${creditReceipt(result.order)} Use /credits to check your balance or /refund for payment help.`,
        );
    } catch (error) {
      logger.error(
        "Credit settlement failed; Telegram update must retry",
        { service: "credits", orderId: match[1] },
        error,
      );
      throw error;
    }
  });
}
