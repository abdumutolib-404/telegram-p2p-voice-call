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
  ALLOWED_ORIGINS: string;
  ADMIN_TELEGRAM_IDS: readonly string[];
  MASTER_PASSWORD: string;
  JWT_SECRET: string;
  LIVEKIT_HOST: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  ADMIN_PANEL_URL: string;
  RECORDINGS_DIR: string;
  PAYMENTS_BOT_TOKEN?: string;
  MANUAL_PAYMENT_ADMIN_USERNAME?: string;
  MANUAL_PAYMENT_ADMIN_CHAT_ID?: string;
  MANUAL_PAYMENT_INSTRUCTIONS?: string;
  MANUAL_PAYMENT_CARD_HOLDER?: string;
  S3_KEY?: string;
  S3_SECRET?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ENDPOINT?: string;
  S3_FORCE_PATH_STYLE?: boolean;
  PRIVACY_POLICY_URL: string;
  COMMUNITY_GUIDELINES_URL: string;
  GEMINI_API_KEY?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseTelegramIds(raw: string | undefined): readonly string[] {
  if (!raw?.trim()) return [];
  const cleaned = raw.replace(/[\[\]"'\s]/g, '');
  const ids = cleaned.split(',').map((value) => value.trim()).filter((value) => /^\d+$/.test(value));
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

const adminTelegramIds = parseTelegramIds(process.env.ADMIN_TELEGRAM_IDS);
const masterPassword = process.env.MASTER_PASSWORD ?? process.env.ADMIN_MASTER_PASSWORD ?? 'admin123456';
const jwtSecret = process.env.JWT_SECRET ?? 'super_secret_jwt_key_change_me_in_production';
const livekitApiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
const livekitApiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';

if (production) {
  if (!process.env.MASTER_PASSWORD && !process.env.ADMIN_MASTER_PASSWORD) {
    throw new Error('Production config error: Missing MASTER_PASSWORD or ADMIN_MASTER_PASSWORD.');
  }
  if (masterPassword === 'admin123456') {
    throw new Error('Production config error: Insecure default MASTER_PASSWORD is not allowed in production.');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('Production config error: Missing JWT_SECRET.');
  }
  if (jwtSecret === 'super_secret_jwt_key_change_me_in_production') {
    throw new Error('Production config error: Insecure default JWT_SECRET is not allowed in production.');
  }
  if (adminTelegramIds.length === 0) {
    throw new Error('Production config error: ADMIN_TELEGRAM_IDS must be specified in production and cannot be empty.');
  }
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || livekitApiKey === 'devkey' || livekitApiSecret === 'secret') {
    throw new Error('Production config error: Valid LiveKit production credentials (LIVEKIT_API_KEY / LIVEKIT_API_SECRET) are required.');
  }
}

export const env: EnvConfig = {
  PORT: port,
  NODE_ENV: nodeEnv,
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  BOT_TOKEN: production ? required('BOT_TOKEN') : (process.env.BOT_TOKEN ?? 'mock_bot_token'),
  MINI_APP_URL: process.env.MINI_APP_URL ?? 'http://localhost:3001/client',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? '',
  ADMIN_TELEGRAM_IDS: adminTelegramIds,
  MASTER_PASSWORD: masterPassword,
  JWT_SECRET: jwtSecret,
  LIVEKIT_HOST: process.env.LIVEKIT_HOST ?? process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
  LIVEKIT_API_KEY: livekitApiKey,
  LIVEKIT_API_SECRET: livekitApiSecret,
  ADMIN_PANEL_URL: process.env.ADMIN_PANEL_URL ?? `${process.env.MINI_APP_URL ?? 'http://localhost:3001/client'}/admin`,
  RECORDINGS_DIR: path.resolve(process.cwd(), process.env.RECORDINGS_DIR ?? './recordings'),
  PAYMENTS_BOT_TOKEN: process.env.PAYMENTS_BOT_TOKEN?.trim(),
  MANUAL_PAYMENT_ADMIN_USERNAME: process.env.MANUAL_PAYMENT_ADMIN_USERNAME?.trim() || 'PairTalkSupport',
  MANUAL_PAYMENT_ADMIN_CHAT_ID: process.env.MANUAL_PAYMENT_ADMIN_CHAT_ID?.trim() || adminTelegramIds[0],
  MANUAL_PAYMENT_INSTRUCTIONS: process.env.MANUAL_PAYMENT_INSTRUCTIONS?.trim() || '1. Transfer exact amount to the card.\n2. Save receipt screenshot or PDF.\n3. Send receipt here in bot for verification.',
  MANUAL_PAYMENT_CARD_HOLDER: process.env.MANUAL_PAYMENT_CARD_HOLDER?.trim() || 'PairTalk Official (Humo / Uzcard)',
  S3_KEY: (process.env.S3_KEY || process.env.AWS_ACCESS_KEY_ID)?.trim(),
  S3_SECRET: (process.env.S3_SECRET || process.env.AWS_SECRET_ACCESS_KEY)?.trim(),
  S3_BUCKET: (process.env.S3_BUCKET || process.env.RECORDINGS_BUCKET)?.trim(),
  S3_REGION: (process.env.S3_REGION || process.env.AWS_REGION)?.trim() || 'us-east-1',
  S3_ENDPOINT: process.env.S3_ENDPOINT?.trim(),
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE === 'true' || process.env.S3_FORCE_PATH_STYLE === '1',
  PRIVACY_POLICY_URL: process.env.PRIVACY_POLICY_URL?.trim() || 'https://pairtalk.online/privacy',
  COMMUNITY_GUIDELINES_URL: process.env.COMMUNITY_GUIDELINES_URL?.trim() || 'https://pairtalk.online/community-guidelines',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim(),
};

