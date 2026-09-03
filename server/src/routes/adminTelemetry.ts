import { Router } from 'express';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { roomServiceClient } from '../config/livekit';
import { env } from '../config/env';
import { logger, getRecentErrors } from '../utils/logger';
import { getAdminBot } from './admin';

export interface TelemetryHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  api: {
    uptime: number;
    memoryMb: number;
  };
  database: {
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
  };
  redis: {
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
  };
  livekit: {
    status: 'healthy' | 'degraded' | 'down';
    activeRooms: number;
  };
  bot: {
    status: 'healthy' | 'degraded' | 'down';
    polling: boolean;
    lastUpdateTs: string;
  };
}

export interface TelemetryQueueResponse {
  waitingCount: number;
  buckets: {
    '5': number;
    '6': number;
    '7': number;
    '8': number;
    '9': number;
    [key: string]: number;
  };
  oldestWaitingSec: number;
}

export interface ActiveCallRoomTelemetry {
  roomName: string;
  durationSec: number;
  userA: string;
  userB: string;
  recording: boolean;
  createdAt?: string;
}

export interface TelemetryActiveCallsResponse {
  activeCallsCount: number;
  rooms: ActiveCallRoomTelemetry[];
}

const router = Router();

// GET /health - Real-time probe of platform infrastructure
router.get('/health', async (_req, res) => {
  try {
    const memoryMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024));
    const uptime = Math.floor(process.uptime());

    // 1. Probe Database Latency & Status
    let dbStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    let dbLatencyMs = 0;
    const tDbStart = Date.now();
    try {
      await prisma.user.findFirst({ select: { id: true } });
      dbLatencyMs = Math.max(1, Date.now() - tDbStart);
      if (dbLatencyMs > 500) dbStatus = 'degraded';
    } catch {
      dbStatus = 'down';
      dbLatencyMs = Math.max(1, Date.now() - tDbStart);
    }

    // 2. Probe Redis Latency & Status
    let redisStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    let redisLatencyMs = 0;
    const tRedisStart = Date.now();
    try {
      const redis = getRedis();
      await redis.set('telemetry:ping', '1', 'EX', 10);
      redisLatencyMs = Math.max(1, Date.now() - tRedisStart);
      if (redisLatencyMs > 200) redisStatus = 'degraded';
    } catch {
      redisStatus = 'down';
      redisLatencyMs = Math.max(1, Date.now() - tRedisStart);
    }

    // 3. Probe LiveKit Status & Active Rooms
    let livekitStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    let activeRooms = 0;
    try {
      if (roomServiceClient) {
        const rooms = await roomServiceClient.listRooms();
        activeRooms = Array.isArray(rooms) ? rooms.length : 0;
      } else {
        activeRooms = await prisma.callSession.count({ where: { status: 'ACTIVE' } });
      }
    } catch {
      livekitStatus = 'degraded';
      activeRooms = await prisma.callSession.count({ where: { status: 'ACTIVE' } }).catch(() => 0);
    }

    // 4. Probe Telegram Bot Polling Status
    const botInstance = getAdminBot();
    const isMock = !env.BOT_TOKEN || env.BOT_TOKEN === 'mock_bot_token';
    const isPolling = Boolean(botInstance && (botInstance.isInited() || botInstance.botInfo));
    const botStatus: 'healthy' | 'degraded' | 'down' = isPolling || isMock ? 'healthy' : 'degraded';

    // 5. Composite System Status
    let compositeStatus: 'ok' | 'degraded' | 'error' = 'ok';
    if (dbStatus === 'down' || redisStatus === 'down') {
      compositeStatus = 'error';
    } else if (dbStatus === 'degraded' || redisStatus === 'degraded' || livekitStatus === 'degraded' || botStatus === 'degraded') {
      compositeStatus = 'degraded';
    }

    const responseData: TelemetryHealthResponse = {
      status: compositeStatus,
      api: {
        uptime,
        memoryMb,
      },
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      redis: {
        status: redisStatus,
        latencyMs: redisLatencyMs,
      },
      livekit: {
        status: livekitStatus,
        activeRooms,
      },
      bot: {
        status: botStatus,
        polling: isPolling,
        lastUpdateTs: new Date().toISOString(),
      },
    };

    res.json(responseData);
  } catch (err: unknown) {
    logger.error('Failed to probe telemetry health', {
      service: 'telemetry',
      event: 'telemetry_health_failed',
    }, err);
    res.status(500).json({ error: 'Failed to probe telemetry health.' });
  }
});

// GET /queue - Real-time candidate counts per whole-band bucket (5-9)
router.get('/queue', async (_req, res) => {
  try {
    const redis = getRedis();
    const buckets: TelemetryQueueResponse['buckets'] = {
      '5': 0,
      '6': 0,
      '7': 0,
      '8': 0,
      '9': 0,
    };

    const bands = [5, 6, 7, 8, 9];
    const allUserIds = new Set<string>();

    for (const b of bands) {
      const keyDec = `match_queue:band:${b}.0`;
      const keyInt = `match_queue:band:${b}`;

      let membersDec: string[] = [];
      let membersInt: string[] = [];

      try {
        membersDec = await redis.smembers(keyDec);
      } catch {
        membersDec = [];
      }

      try {
        membersInt = await redis.smembers(keyInt);
      } catch {
        membersInt = [];
      }

      const combinedBandMembers = new Set([...membersDec, ...membersInt]);
      buckets[String(b)] = combinedBandMembers.size;

      for (const userId of combinedBandMembers) {
        allUserIds.add(userId);
      }
    }

    // Compute oldest waiting duration
    let oldestWaitingSec = 0;
    const QUEUE_TTL_SECONDS = 900; // 15 minutes default TTL

    for (const userId of allUserIds) {
      try {
        const ttl = await redis.ttl(`user_queue:${userId}`);
        if (ttl > 0 && ttl <= QUEUE_TTL_SECONDS) {
          const waitedSec = QUEUE_TTL_SECONDS - ttl;
          if (waitedSec > oldestWaitingSec) {
            oldestWaitingSec = waitedSec;
          }
        }
      } catch {
        // Continue calculating for other candidates
      }
    }

    const response: TelemetryQueueResponse = {
      waitingCount: allUserIds.size,
      buckets,
      oldestWaitingSec,
    };

    res.json(response);
  } catch (err: unknown) {
    logger.error('Failed to probe matchmaking queue telemetry', {
      service: 'telemetry',
      event: 'telemetry_queue_failed',
    }, err);
    res.status(500).json({ error: 'Failed to probe queue telemetry.' });
  }
});

// GET /active-calls - Real-time active call sessions with duration & recording status
router.get('/active-calls', async (_req, res) => {
  try {
    const activeSessions = await prisma.callSession.findMany({
      where: { status: 'ACTIVE' },
      include: {
        userA: { select: { id: true, alias: true, band: true } },
        userB: { select: { id: true, alias: true, band: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const nowMs = Date.now();
    const rooms: ActiveCallRoomTelemetry[] = activeSessions.map((s) => {
      const durationSec = Math.max(0, Math.floor((nowMs - new Date(s.createdAt).getTime()) / 1000));
      return {
        roomName: s.roomName,
        durationSec,
        userA: s.userA ? `${s.userA.alias} (Band ${s.userA.band})` : (s.userAId || 'Unknown'),
        userB: s.userB ? `${s.userB.alias} (Band ${s.userB.band})` : (s.userBId || 'Unknown'),
        recording: Boolean(s.egressId || s.recordedByUserId),
        createdAt: s.createdAt.toISOString(),
      };
    });

    const response: TelemetryActiveCallsResponse = {
      activeCallsCount: rooms.length,
      rooms,
    };

    res.json(response);
  } catch (err: unknown) {
    logger.error('Failed to probe active calls telemetry', {
      service: 'telemetry',
      event: 'telemetry_active_calls_failed',
    }, err);
    res.status(500).json({ error: 'Failed to probe active calls telemetry.' });
  }
});

// GET /errors - Recent structured errors from logger error ring buffer
router.get('/errors', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const recentErrors = getRecentErrors(limit);
    res.json({
      success: true,
      count: recentErrors.length,
      recentErrors,
      errors: recentErrors,
    });
  } catch (err: unknown) {
    logger.error('Failed to retrieve telemetry error buffer', {
      service: 'telemetry',
      event: 'telemetry_errors_fetch_failed',
    }, err);
    res.status(500).json({ error: 'Failed to retrieve telemetry error records.' });
  }
});

export default router;
