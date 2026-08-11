#!/bin/sh
set -e

echo "[Container Startup] Running Prisma DB Push to push schema to PostgreSQL..."
npx prisma db push --skip-generate

echo "[Container Startup] Starting Server..."
exec node dist/index.js
