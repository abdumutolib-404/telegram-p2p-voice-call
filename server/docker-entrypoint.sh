#!/bin/sh

echo "[Container Startup] Running Prisma DB Push to sync schema to PostgreSQL..."
npx prisma db push --accept-data-loss --skip-generate 2>&1 || {
  echo "[Container Startup] WARNING: Prisma db push encountered an error, but continuing server startup..."
}

echo "[Container Startup] Starting Node.js server..."
exec node dist/index.js
