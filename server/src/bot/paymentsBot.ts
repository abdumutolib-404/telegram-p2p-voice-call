import { Bot, InputFile } from 'grammy';
import { env } from '../config/env';

export interface AdminPaymentNotificationParams {
  orderNumber: string;
  userAlias: string;
  telegramId: string | bigint | number;
  plan: string;
  uzsAmount: number;
  paymentMethod: string;
  receiptBuffer?: Buffer | null;
  receiptFileName?: string | null;
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
 * Downloads a file buffer from Telegram servers using Main Bot (Bot A) credentials.
 */
export async function downloadTelegramReceiptFile(
  mainBotApi: any,
  fileId: string,
  botToken: string = env.BOT_TOKEN
): Promise<{ buffer: Buffer; filePath: string } | null> {
  if (!fileId) return null;
  try {
    const fileInfo = await mainBotApi.getFile(fileId);
    if (!fileInfo || !fileInfo.file_path) {
      throw new Error('Telegram getFile returned empty file_path');
    }

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} downloading file from Telegram`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      filePath: fileInfo.file_path,
    };
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = rawMsg.replace(/bot\d+:[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
    console.error('[PaymentsBot] downloadTelegramReceiptFile failed:', sanitizedMsg);
    return null;
  }
}

/**
 * Dispatches an outbound admin notification strictly to configured ADMIN_TELEGRAM_IDS.
 * When Bot B is configured with its own token, it uploads the downloaded file bytes directly
 * via InputFile to avoid cross-bot file_id invalidation (Telegram Error 400).
 */
export async function sendAdminPaymentNotification(
  fallbackBot: Bot | null,
  params: AdminPaymentNotificationParams
): Promise<void> {
  const adminIds = env.ADMIN_TELEGRAM_IDS;
  if (!adminIds || adminIds.length === 0) {
    throw new Error('No ADMIN_TELEGRAM_IDS configured for alert delivery');
  }

  const botToUse = getPaymentsBot() || fallbackBot;
  if (!botToUse) {
    throw new Error('No bot instance available to dispatch payment notification');
  }

  const formattedAmount = params.uzsAmount.toLocaleString('en-US');
  const dateStr = params.createdAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const adminUrl = env.ADMIN_PANEL_URL.replace(/\/+$/, '');

  const caption =
    `🧾 <b>NEW MANUAL PAYMENT RECEIPT</b>\n\n` +
    `<b>Order</b>: <code>${params.orderNumber}</code>\n` +
    `<b>User</b>: ${params.userAlias} (<code>${params.telegramId.toString()}</code>)\n` +
    `<b>Plan</b>: <b>${params.plan}</b>\n` +
    `<b>Amount</b>: <b>${formattedAmount} UZS</b>\n` +
    `<b>Method</b>: ${params.paymentMethod}\n` +
    `<b>Status</b>: <code>${params.status}</code>\n` +
    `<b>Created</b>: ${dateStr}\n\n` +
    `🔗 <a href="${adminUrl}">Open Admin Panel</a>`;

  const errors: string[] = [];

  for (const adminId of adminIds) {
    try {
      if (params.receiptBuffer && params.receiptBuffer.length > 0) {
        const inputFile = new InputFile(params.receiptBuffer, params.receiptFileName || 'receipt');
        if (params.receiptMimeType?.startsWith('image/')) {
          await botToUse.api.sendPhoto(adminId, inputFile, {
            caption,
            parse_mode: 'HTML',
          });
        } else {
          await botToUse.api.sendDocument(adminId, inputFile, {
            caption,
            parse_mode: 'HTML',
          });
        }
      } else {
        await botToUse.api.sendMessage(adminId, caption, {
          parse_mode: 'HTML',
        });
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitized = rawMsg.replace(/bot\d+:[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
      errors.push(`Admin ${adminId}: ${sanitized}`);
    }
  }

  if (errors.length > 0 && errors.length === adminIds.length) {
    throw new Error(`Failed to deliver admin notification to all admins: ${errors.join(', ')}`);
  }
}
