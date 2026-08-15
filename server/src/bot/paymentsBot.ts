import { Bot } from 'grammy';
import { env } from '../config/env';

export interface AdminPaymentNotificationParams {
  orderNumber: string;
  userAlias: string;
  telegramId: string | bigint | number;
  plan: string;
  uzsAmount: number;
  paymentMethod: string;
  receiptFileId?: string | null;
  receiptMimeType?: string | null;
  createdAt: Date;
  status: string;
}

let paymentsBotInstance: Bot | null = null;

export function getPaymentsBot(): Bot | null {
  if (!paymentsBotInstance && env.PAYMENTS_BOT_TOKEN) {
    paymentsBotInstance = new Bot(env.PAYMENTS_BOT_TOKEN);
    // BOT B INBOUND BEHAVIOR: Completely DEAD to public users
    // If anyone sends Bot B a message or command: DO NOTHING.
    paymentsBotInstance.on('message', () => {});
    paymentsBotInstance.on('callback_query', () => {});
    paymentsBotInstance.catch(() => {});
  }
  return paymentsBotInstance;
}

/**
 * Dispatches an outbound admin notification strictly to configured ADMIN_TELEGRAM_IDS
 */
export async function sendAdminPaymentNotification(
  fallbackBot: Bot | null,
  params: AdminPaymentNotificationParams
): Promise<void> {
  const adminIds = env.ADMIN_TELEGRAM_IDS;
  if (!adminIds || adminIds.length === 0) return;

  const botToUse = getPaymentsBot() || fallbackBot;
  if (!botToUse) return;

  const formattedAmount = params.uzsAmount.toLocaleString('en-US');
  const dateStr = params.createdAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const adminUrl = env.ADMIN_PANEL_URL.replace(/\/+$/, '');

  const text =
    `🧾 <b>NEW MANUAL PAYMENT RECEIPT</b>\n\n` +
    `<b>Order</b>: <code>${params.orderNumber}</code>\n` +
    `<b>User</b>: ${params.userAlias} (<code>${params.telegramId.toString()}</code>)\n` +
    `<b>Plan</b>: <b>${params.plan}</b>\n` +
    `<b>Amount</b>: <b>${formattedAmount} UZS</b>\n` +
    `<b>Method</b>: ${params.paymentMethod}\n` +
    `<b>Status</b>: <code>${params.status}</code>\n` +
    `<b>Created</b>: ${dateStr}\n\n` +
    `🔗 <a href="${adminUrl}">Open Admin Panel</a>`;

  for (const adminId of adminIds) {
    try {
      if (params.receiptFileId) {
        if (params.receiptMimeType?.startsWith('image/')) {
          await botToUse.api.sendPhoto(adminId, params.receiptFileId, {
            caption: text,
            parse_mode: 'HTML',
          });
        } else {
          await botToUse.api.sendDocument(adminId, params.receiptFileId, {
            caption: text,
            parse_mode: 'HTML',
          });
        }
      } else {
        await botToUse.api.sendMessage(adminId, text, {
          parse_mode: 'HTML',
        });
      }
    } catch (err) {
      console.warn('[PaymentsBot] Failed to dispatch admin payment alert:', err instanceof Error ? err.message : err);
    }
  }
}
