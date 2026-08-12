import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  REDIS_URL: string;
  BOT_TOKEN: string;
  MINI_APP_URL: string;
  ADMIN_TELEGRAM_IDS: readonly string[];
  MASTER_PASSWORD: string;
  JWT_SECRET: string;
  LIVEKIT_HOST: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  ADMIN_PANEL_URL: string;
  RECORDINGS_DIR: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseTelegramIds(raw: string | undefined): readonly string[] {
  if (!raw?.trim()) return [];
  const ids = raw.split(',').map((value) => value.trim()).filter((value) => /^\d+$/.test(value));
  if (ids.length === 0) return [];
  return ids;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
  throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
}

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');

const production = nodeEnv === 'production';

export const env: EnvConfig = {
  PORT: port,
  NODE_ENV: nodeEnv,
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  BOT_TOKEN: production ? required('BOT_TOKEN') : (process.env.BOT_TOKEN ?? 'mock_bot_token'),
  MINI_APP_URL: process.env.MINI_APP_URL ?? 'http://localhost:5173',
  ADMIN_TELEGRAM_IDS: parseTelegramIds(process.env.ADMIN_TELEGRAM_IDS),
  MASTER_PASSWORD: production ? required('MASTER_PASSWORD') : (process.env.MASTER_PASSWORD ?? 'dev-only'),
  JWT_SECRET: production ? required('JWT_SECRET') : (process.env.JWT_SECRET ?? 'dev-only'),
  LIVEKIT_HOST: production ? required('LIVEKIT_HOST') : (process.env.LIVEKIT_HOST ?? 'wss://livekit.example.com'),
  LIVEKIT_API_KEY: production ? required('LIVEKIT_API_KEY') : (process.env.LIVEKIT_API_KEY ?? 'devkey'),
  LIVEKIT_API_SECRET: production ? required('LIVEKIT_API_SECRET') : (process.env.LIVEKIT_API_SECRET ?? 'dev-secret'),
  ADMIN_PANEL_URL: process.env.ADMIN_PANEL_URL ?? `${process.env.MINI_APP_URL ?? 'http://localhost:5173'}/admin`,
  RECORDINGS_DIR: path.resolve(process.cwd(), process.env.RECORDINGS_DIR ?? './recordings'),
};
