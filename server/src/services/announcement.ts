import { prisma } from '../config/database';

export type AnnouncementType = 'text' | 'photo' | 'video' | 'animation';

export interface AnnouncementPayload {
  type: AnnouncementType;
  text?: string;
  fileId?: string;
  caption?: string;
  entities?: any[];
  captionEntities?: any[];
}

export interface BroadcastStats {
  jobId: string;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs: number;
}

let activeBroadcastJob: string | null = null;

export function isBroadcastActive(): boolean {
  return activeBroadcastJob !== null;
}

export function getCurrentBroadcastJobId(): string | null {
  return activeBroadcastJob;
}

/**
 * Executes a resilient, rate-limited broadcast to all eligible platform users.
 * - Bounded concurrency (batches of 25)
 * - Automatic 429 rate limit backoff
 * - Partial failure isolation (individual failures never abort the broadcast)
 * - Single in-flight job deduplication lock
 */
export async function executeAnnouncementBroadcast(
  botApi: any,
  payload: AnnouncementPayload,
  initiatorAdminId: string
): Promise<BroadcastStats> {
  if (activeBroadcastJob !== null) {
    throw new Error(`Another announcement broadcast (${activeBroadcastJob}) is currently in progress.`);
  }

  const jobId = `ANN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  activeBroadcastJob = jobId;
  const startTime = Date.now();

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // 1. Fetch eligible recipients (active, non-permanently-banned, unexpired temporary bans)
    const eligibleUsers = await prisma.user.findMany({
      where: {
        isPermanentlyBanned: false,
        isBanned: false,
        OR: [{ bannedUntil: null }, { bannedUntil: { lte: new Date() } }],
      },
      select: {
        id: true,
        telegramId: true,
      },
    });

    const recipientIds: number[] = [];
    for (const user of eligibleUsers) {
      const numId = Number(user.telegramId);
      if (Number.isSafeInteger(numId) && numId > 0) {
        recipientIds.push(numId);
      } else {
        skipped++;
      }
    }

    const total = recipientIds.length + skipped;

    if (recipientIds.length === 0) {
      return {
        jobId,
        sent: 0,
        failed: 0,
        skipped,
        total,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Process in bounded batches of 25 (Telegram broadcast limit: ~30 msg/sec)
    const BATCH_SIZE = 25;
    const INTER_BATCH_DELAY_MS = 50;

    for (let i = 0; i < recipientIds.length; i += BATCH_SIZE) {
      const batch = recipientIds.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (recipientId) => {
          let attempts = 0;
          const maxAttempts = 2;

          while (attempts < maxAttempts) {
            attempts++;
            try {
              if (payload.type === 'text') {
                await botApi.sendMessage(recipientId, payload.text || '', {
                  entities: payload.entities && payload.entities.length > 0 ? payload.entities : undefined,
                  parse_mode: !payload.entities || payload.entities.length === 0 ? 'HTML' : undefined,
                });
              } else if (payload.type === 'photo' && payload.fileId) {
                await botApi.sendPhoto(recipientId, payload.fileId, {
                  caption: payload.caption,
                  caption_entities: payload.captionEntities && payload.captionEntities.length > 0 ? payload.captionEntities : undefined,
                  parse_mode: !payload.captionEntities || payload.captionEntities.length === 0 ? 'HTML' : undefined,
                });
              } else if (payload.type === 'video' && payload.fileId) {
                await botApi.sendVideo(recipientId, payload.fileId, {
                  caption: payload.caption,
                  caption_entities: payload.captionEntities && payload.captionEntities.length > 0 ? payload.captionEntities : undefined,
                  parse_mode: !payload.captionEntities || payload.captionEntities.length === 0 ? 'HTML' : undefined,
                });
              } else if (payload.type === 'animation' && payload.fileId) {
                await botApi.sendAnimation(recipientId, payload.fileId, {
                  caption: payload.caption,
                  caption_entities: payload.captionEntities && payload.captionEntities.length > 0 ? payload.captionEntities : undefined,
                  parse_mode: !payload.captionEntities || payload.captionEntities.length === 0 ? 'HTML' : undefined,
                });
              } else {
                throw new Error(`Unsupported announcement payload: ${payload.type}`);
              }

              sent++;
              return;
            } catch (err: any) {
              // Check for Telegram 429 rate limit
              const retryAfter = err?.error_code === 429 ? err?.parameters?.retry_after : 0;
              if (Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 30 && attempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, (retryAfter + 0.5) * 1000));
                continue;
              }

              // Permanent delivery failures (bot blocked, chat not found, user deactivated, etc.)
              failed++;
              return;
            }
          }
        })
      );

      // Brief delay between batches to respect rate limits
      if (i + BATCH_SIZE < recipientIds.length) {
        await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
      }
    }

    return {
      jobId,
      sent,
      failed,
      skipped,
      total,
      durationMs: Date.now() - startTime,
    };
  } finally {
    activeBroadcastJob = null;
  }
}
