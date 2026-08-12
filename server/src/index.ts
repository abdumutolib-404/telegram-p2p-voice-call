import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'node:path';
import { Server as SocketIOServer } from 'socket.io';
import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { env } from './config/env';
import { connectDB } from './config/database';
import authRoutes from './routes/auth';
import callRoutes from './routes/calls';
import adminRoutes from './routes/admin';
import { setupSocketSignaling } from './socket/signaling';
import { createBot } from './bot/bot';
import { startStoragePurgeCron } from './services/storage';
import type { MyContext } from './bot/types';

const app = express();
const server = http.createServer(app);

const allowedOrigins = new Set([
  env.MINI_APP_URL,
  env.ADMIN_PANEL_URL,
  'https://web.telegram.org',
].filter((origin): origin is string => Boolean(origin)));

const isAllowedOrigin = (origin: string | undefined): boolean => !origin || allowedOrigins.has(origin);

app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '256kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

export { app, server, io, bot };
