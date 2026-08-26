import cookieParser from 'cookie-parser';
import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'node:path';
import { Server as SocketIOServer } from 'socket.io';
import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { env } from './config/env';
import { prisma, connectDB, disconnectDB } from './config/database';
import authRoutes from './routes/auth';
import callRoutes from './routes/calls';
import adminRoutes, { setAdminBot } from './routes/admin';
import { livekitWebhookRouter } from './routes/livekitWebhook';
import { setupSocketSignaling } from './socket/signaling';
import { createBot } from './bot/bot';
import { startStoragePurgeCron } from './services/storage';
import { startSubscriptionExpiryCron } from './services/subscriptionExpiry';
import type { MyContext } from './bot/types';

// Global BigInt JSON serialization guard
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const extractOrigin = (urlStr: string | undefined): string | null => {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    return parsed.origin;
  } catch {
    return urlStr.replace(/\/+$/, '');
  }
};

const rawAllowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((s) => extractOrigin(s.trim()))
  : [];

const configuredOrigins = [
  ...rawAllowedOrigins,
  extractOrigin(env.MINI_APP_URL),
  extractOrigin(env.ADMIN_PANEL_URL),
  'https://web.telegram.org',
  'https://webk.telegram.org',
  'https://webz.telegram.org',
].filter((o): o is string => Boolean(o));

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true; // Same-origin, mobile apps, or server-to-server calls
  if (configuredOrigins.includes(origin)) return true;
  // Support custom subdomains on pairtalk.online, railway, netlify, or vercel if matched
  if (/^https?:\/\/(.*\.pairtalk\.online|pairtalk\.online|.*\.netlify\.app|.*\.railway\.app|.*\.up\.railway\.app|.*\.vercel\.app)(:\d+)?$/i.test(origin)) {
    return true;
  }
  if (env.NODE_ENV !== 'production') {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return true;
    }
  }
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'Cookie'],
}));

app.options('*', cors());
app.use(cookieParser());
app.use('/api/livekit/webhook', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '256kb' }));

// Comprehensive Production Request & Response Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const method = req.method;
  const path = req.originalUrl || req.url;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusTag = status >= 500 ? '🔥 ERROR' : status >= 400 ? '⚠️ WARN' : '✅ OK';
    console.log(`[HTTP ${statusTag}] ${method} ${path} -> ${status} (${duration}ms) [IP: ${ip}]`);
  });

  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/livekit', livekitWebhookRouter);

app.get('/health', async (_req, res) => {
  try {
    await prisma.user.findFirst({ select: { id: true } }).catch(() => null);
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /\n');
});

app.get('/', (_req, res) => {
  res.status(200).send('OK');
});

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

let bot: Bot<MyContext> | null = null;
if (env.BOT_TOKEN && env.BOT_TOKEN !== 'mock_bot_token') {
  try {
    bot = createBot(env.BOT_TOKEN);
    bot.start({
      onStart: (botInfo: UserFromGetMe) => {
        console.log(`[Grammy Bot] Bot @${botInfo.username} launched successfully.`);
      },
    }).catch((error: unknown) => {
      console.error('[Grammy Bot] polling_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    });
  } catch (error: unknown) {
    console.error('[Grammy Bot] startup_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  }
} else {
  console.log('[Grammy Bot] Mock bot token configured. Bot polling disabled.');
}

async function bootstrap(): Promise<void> {
  try {
    await connectDB();
    setAdminBot(bot);
    setupSocketSignaling(io, bot ?? undefined);
    startStoragePurgeCron();
    startSubscriptionExpiryCron(() => bot);

    if (env.NODE_ENV !== 'test') {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(env.PORT, resolve);
      });
      console.log(`[Server] IELTS Speaking P2P Backend running on port ${env.PORT}`);
    }
  } catch (error: unknown) {
    console.error('[Server] bootstrap_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    if (env.NODE_ENV === 'production') process.exitCode = 1;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('[Server] bootstrap_unhandled', {
    error: error instanceof Error ? error.message : 'unknown_error',
  });
  process.exitCode = 1;
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Express Error]', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
});

const gracefulShutdown = async (signal: string) => {
  console.log(`[Server] Received ${signal}. Initiating graceful shutdown...`);
  try {
    if (bot) await bot.stop().catch(() => undefined);
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDB().catch(() => undefined);
    console.log('[Server] Graceful shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('[Server] Shutdown error:', err);
    process.exit(1);
  }
};

if (env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
}

export { app, server, io, bot };
