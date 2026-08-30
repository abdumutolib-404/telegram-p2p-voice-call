# Multi-Stage Production Dockerfile for Telegram IELTS Speaking P2P Platform
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache ffmpeg openssl libssl3

# --- Stage 1: Build Server ---
FROM base AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
COPY server/prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY server/ ./
RUN npm run build

# --- Stage 2: Build Mini App (Frontend) ---
FROM base AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Stage 3: Build Admin Panel ---
FROM base AS admin-builder
WORKDIR /app/admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# --- Stage 4: Production Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy compiled backend & assets
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/assets ./server/assets
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/prisma ./server/prisma
COPY --from=server-builder /app/server/node_modules ./server/node_modules

# Copy static frontend & admin builds
COPY --from=client-builder /app/client/dist ./server/public/client
COPY --from=admin-builder /app/admin/dist ./server/public/admin

# Create recordings directory
RUN mkdir -p /app/server/recordings

# Copy docker entrypoint script
COPY server/docker-entrypoint.sh ./server/docker-entrypoint.sh
RUN chmod +x ./server/docker-entrypoint.sh

WORKDIR /app/server
EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
