import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env';
import { connectDB } from './config/database';
import authRoutes from './routes/auth';
import callRoutes from './routes/calls';
import adminRoutes from './routes/admin';
import { setupSocketSignaling } from './socket/signaling';
import { createBot } from './bot/bot';
import { startStoragePurgeCron } from './services/storage';

const app = express();
const server = http.createServer(app);

// Enable CORS with origin whitelist & JSON parsing
const allowedOrigins = [
  env.MINI_APP_URL,
  env.ADMIN_PANEL_URL || '',
  'https://web.telegram.org',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => allowed && origin.startsWith(allowed))) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Initialize Database connection
connectDB();

// Register REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve compiled static frontend Mini App & Admin Panel
import path from 'path';

// Client Mini App
app.use('/client', express.static(path.join(__dirname, '../public/client')));
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/client/index.html'));
});
app.get('/client/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/client/index.html'));
});

// Admin Panel
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// Root redirect to health check (useful for Railway health probes)
app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'IELTS Speaking P2P Platform', endpoints: ['/client', '/admin', '/health'] });
});

// Setup Socket.io Signaling
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.some(allowed => allowed && origin.startsWith(allowed))) {
        return callback(null, true);
      }
      return callback(null, true); // Allow WebApp websocket connections
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize Grammy Telegram Bot
let bot: any = null;
if (env.BOT_TOKEN && env.BOT_TOKEN !== 'mock_bot_token') {
  try {
    bot = createBot(env.BOT_TOKEN);
    bot.start({
      onStart: (botInfo: any) => {
        console.log(`[Grammy Bot] Bot @${botInfo.username} launched successfully.`);
      },
    }).catch((botErr: any) => {
      console.warn('[Grammy Bot Conflict Warning] Long polling instance conflict detected or network drop. Grammy will auto-retry polling.', botErr.message);
    });
  } catch (err) {
    console.warn('[Grammy Bot] Could not start polling:', err);
  }
} else {
  console.log('[Grammy Bot] Mock bot token configured. Bot polling disabled.');
}

setupSocketSignaling(io, bot);

// Start Daily Storage Retention Purge Cron
startStoragePurgeCron();

// Start HTTP Server
if (process.env.NODE_ENV !== 'test') {
  server.listen(env.PORT, () => {
    console.log(`[Server] IELTS Speaking P2P Backend running on port ${env.PORT}`);
  });
}

export { app, server, io, bot };
