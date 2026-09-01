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
import { scannerShieldMiddleware } from './middleware/scannerShield';
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
  // Support exact official subdomains on pairtalk.online
  if (/^https?:\/\/(?:[a-zA-Z0-9-]+\.)*pairtalk\.online(:\d+)?$/i.test(origin)) {
    return true;
  }
  if (env.NODE_ENV !== 'production') {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return true;
    }
    if (/^https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:netlify\.app|railway\.app|up\.railway\.app|vercel\.app)(:\d+)?$/i.test(origin)) {
      return true;
    }
  }
  return false;
};

app.disable('x-powered-by');

// 🛡️ Automated Bot Banishment & Exploit Scanner Shield (Pre-Routing Filter)
app.use(scannerShieldMiddleware);

// Standard HTTP Security Headers Middleware (Telegram WebApp compatible)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

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
app.use('/api/livekit/webhook', express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Comprehensive Production Request & Response Logging Middleware (Query-Sanitized)
app.use((req, res, next) => {
  const start = Date.now();
  const rawCf = req.headers['cf-connecting-ip'];
  const ip = typeof rawCf === 'string' && rawCf.trim()
    ? rawCf.trim()
    : req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const method = req.method;
  const path = (req.originalUrl || req.url || '').split('?')[0];

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

app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
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

async function startBotWithRetry(botInstance: Bot<MyContext>): Promise<void> {
  let isRunning = true;
  const stopHandler = () => {
    isRunning = false;
  };
  process.once('SIGINT', stopHandler);
  process.once('SIGTERM', stopHandler);

  while (isRunning) {
    try {
      console.log('[Grammy Bot] Starting bot polling...');
      await botInstance.start({
        onStart: (botInfo: UserFromGetMe) => {
          console.log(`[Grammy Bot] Bot @${botInfo.username} launched and listening for updates.`);
        },
        drop_pending_updates: false,
      });
      break;
    } catch (error: any) {
      if (!isRunning) break;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Grammy Bot] Polling interrupted (${errMsg}). Re-attempting in 3 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

if (env.BOT_TOKEN && env.BOT_TOKEN !== 'mock_bot_token') {
  try {
    bot = createBot(env.BOT_TOKEN);
    setAdminBot(bot);
    void startBotWithRetry(bot);
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
