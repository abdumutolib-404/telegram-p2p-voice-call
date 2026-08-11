import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  BOT_TOKEN: string;
  MINI_APP_URL: string;
  ADMIN_TELEGRAM_IDS: number[];
  MASTER_PASSWORD: string;
  JWT_SECRET: string;
  LIVEKIT_HOST: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  ADMIN_PANEL_URL: string;
  RECORDINGS_DIR: string;
}

const parseAdminIds = (raw?: string): number[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));
};

export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  BOT_TOKEN: process.env.BOT_TOKEN || 'mock_bot_token',
  MINI_APP_URL: process.env.MINI_APP_URL || 'http://localhost:5173',
  ADMIN_TELEGRAM_IDS: parseAdminIds(process.env.ADMIN_TELEGRAM_IDS),
  MASTER_PASSWORD: process.env.MASTER_PASSWORD || process.env.ADMIN_MASTER_PASSWORD || 'admin_master_password_123',
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_987654321',
  LIVEKIT_HOST: process.env.LIVEKIT_HOST || process.env.LIVEKIT_URL || 'wss://livekit.example.com',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || 'devkey',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || 'secret12345678901234567890123456789012',
  ADMIN_PANEL_URL: process.env.ADMIN_PANEL_URL || process.env.MINI_APP_URL?.replace(/\/client\/?$/, '/admin') || 'http://localhost:3001/admin',
  RECORDINGS_DIR: path.resolve(process.cwd(), process.env.RECORDINGS_DIR || './recordings'),
};
