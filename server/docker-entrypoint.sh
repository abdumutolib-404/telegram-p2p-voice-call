#!/bin/sh

echo "[Container Startup] Running Prisma DB Push to sync schema to PostgreSQL..."
npx prisma db push --accept-data-loss --skip-generate 2>&1 || {
  echo "[Container Startup] WARNING: Prisma db push encountered an error, but continuing server startup..."
}

echo "[Container Startup] Starting Node.js backend on internal port 3000..."
PORT=3000 node dist/index.js &
NODE_PID=$!

echo "[Container Startup] Waiting for internal Node backend to bind port 3000..."
sleep 2

if [ -f "/usr/local/bin/gateway" ]; then
  echo "[Container Startup] Starting Go Voice & Ingress Gateway on port ${PORT:-3001}..."
  NODE_URL="http://127.0.0.1:3000" exec /usr/local/bin/gateway
else
  echo "[Container Startup] Go Gateway binary not found, running Node.js in foreground..."
  wait $NODE_PID
fi
