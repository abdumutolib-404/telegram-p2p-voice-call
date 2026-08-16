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
  // Support custom subdomains on railway, netlify, or vercel if matched
  if (/^https?:\/\/(.*\.netlify\.app|.*\.railway\.app|.*\.up\.railway\.app|.*\.vercel\.app)(:\d+)?$/i.test(origin)) {
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

app.get('/privacy', (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PairTalk Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #020617; color: #cbd5e1; margin: 0; padding: 24px; line-height: 1.6; }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { color: #ffffff; font-size: 24px; margin-bottom: 4px; }
    .date { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
    h2 { color: #f8fafc; font-size: 16px; margin-top: 0; }
    p, li { font-size: 14px; color: #94a3b8; }
    strong { color: #f1f5f9; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #a5b4fc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>PairTalk Privacy Policy</h1>
    <div class="date">Effective Date: August 16, 2026</div>
    <p>Welcome to <strong>PairTalk</strong>, the real-time peer-to-peer IELTS Speaking practice platform. We are committed to protecting your personal data, ensuring privacy, and maintaining transparency about how our platform operates.</p>
    <div class="card">
      <h2>1. Information We Collect</h2>
      <p><strong>• Telegram Profile Data:</strong> Numeric Telegram User ID for account authentication; a permanent randomized alias (e.g. <code>P2P-0284DB68</code>) ensuring complete anonymity without exposing real phone numbers or usernames; and self-reported target IELTS band score and sub-scores.</p>
      <p><strong>• Voice Call Metadata:</strong> Unique session IDs, start/end timestamps, connected durations, and call outcomes.</p>
      <p><strong>• Payment Records:</strong> Telegram Stars transaction IDs and manual UZS transfer receipt metadata for administrative verification.</p>
    </div>
    <div class="card">
      <h2>2. Voice Audio & Recording Policy</h2>
      <p><strong>• Real-Time Voice Calls:</strong> Active audio streams are routed through encrypted WebRTC Selective Forwarding Units (SFUs). Live audio is ephemeral and never listened to or recorded without user action.</p>
      <p><strong>• Cloud Recordings:</strong> Opt-in session recordings are stored in access-controlled AWS S3 storage with strict expiration windows:</p>
      <ul>
        <li><strong>Free Plan:</strong> 1 day retention (1 recording/month)</li>
        <li><strong>Plus Plan:</strong> 7 days retention (3 recordings/month)</li>
        <li><strong>Pro Plan:</strong> 30 days retention (7 recordings/month)</li>
        <li><strong>Boss Plan:</strong> 90 days retention (15 recordings/month)</li>
      </ul>
      <p>Only call participants may access their session recordings. Recordings are permanently purged when their retention window expires.</p>
    </div>
    <div class="card">
      <h2>3. Security & Contact</h2>
      <p>All WebRTC media connections use DTLS/SRTP encryption. Administrative endpoints are secured with multi-factor one-time passwords and strict Telegram ID whitelisting.</p>
      <p><strong>Telegram Support:</strong> @PairTalkSupport</p>
    </div>
  </div>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/guidelines', (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PairTalk Community Guidelines</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #020617; color: #cbd5e1; margin: 0; padding: 24px; line-height: 1.6; }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { color: #ffffff; font-size: 24px; margin-bottom: 4px; }
    .date { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
    h2 { color: #f8fafc; font-size: 16px; margin-top: 0; }
    p, li { font-size: 14px; color: #94a3b8; }
    strong { color: #f1f5f9; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #a5b4fc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>PairTalk Community Guidelines</h1>
    <div class="date">PairTalk Practice & Conduct Rules</div>
    <p>Our mission at <strong>PairTalk</strong> is to provide an encouraging, high-quality, and respectful environment for IELTS Speaking practice. All learners are expected to adhere to these community standards.</p>
    <div class="card">
      <h2>1. Core Principles</h2>
      <p><strong>• Respect & Courtesy:</strong> Treat every speaking partner with respect regardless of nationality, accent, gender, or background.</p>
      <p><strong>• Dedicated Practice:</strong> Focus on speaking English and practicing IELTS topics. Commercial promotions and unsolicited solicitation are strictly prohibited.</p>
      <p><strong>• Constructive Feedback:</strong> Provide constructive, helpful IELTS feedback across criteria (Fluency, Vocabulary, Grammar, Pronunciation) after each call.</p>
    </div>
    <div class="card">
      <h2>2. Prohibited Behavior</h2>
      <ul>
        <li><strong>Harassment, Bullying, or Hate Speech:</strong> Derogatory remarks or hostile conduct.</li>
        <li><strong>Explicit or Offensive Content:</strong> Sharing inappropriate language or materials during calls.</li>
        <li><strong>Spam & Exploitation:</strong> Rapid queue flooding or intentional matchmaking disruptions.</li>
        <li><strong>Impersonation & Fraud:</strong> Falsifying identity or payment receipts.</li>
      </ul>
    </div>
    <div class="card">
      <h2>3. Moderation & Appeals</h2>
      <p><strong>• Temporary Suspension:</strong> Repeated low ratings or harassment reports trigger an automated 24-hour timeout.</p>
      <p><strong>• Permanent Account Ban:</strong> Severe misconduct results in a permanent platform ban.</p>
      <p><strong>• Appeals:</strong> Permanently banned users may submit an unban appeal directly inside the Telegram Bot using <code>/appeal &lt;reason&gt;</code>.</p>
    </div>
  </div>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.use('/client', express.static(path.join(__dirname, '../public/client')));
app.get('/client', (_req, res) => res.sendFile(path.join(__dirname, '../public/client/index.html')));
app.get('/client/*', (_req, res) => res.sendFile(path.join(__dirname, '../public/client/index.html')));

app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/admin/*', (_req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', app: 'IELTS Speaking P2P Platform', endpoints: ['/client', '/admin', '/health'] });
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
