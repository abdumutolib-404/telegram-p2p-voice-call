# Multi-Stage Production Dockerfile for Telegram IELTS Speaking P2P Platform
FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache ffmpeg openssl libssl3

# --- Stage 1: Build Go Gateway ---
FROM golang:1.26-alpine AS gateway-builder
WORKDIR /app/gateway
COPY gateway/go.mod gateway/go.sum ./
RUN go mod download
COPY gateway/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /gateway-bin ./cmd/gateway

# Optional Linux verification target; compiler tools never enter the production runner.
FROM gateway-builder AS gateway-verification
RUN apk add --no-cache gcc musl-dev
RUN NODE_ENV=test CGO_ENABLED=1 go test -race ./... -count=1 && go vet ./...

# --- Stage 2: Build Server ---
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
COPY platform/ /app/platform/
COPY server/src/contracts/ /app/server/src/contracts/
RUN npm run build

# --- Stage 3: Build Landing Page ---
FROM base AS landing-builder
WORKDIR /app/landing
COPY landing/package*.json ./
RUN npm ci
COPY landing/ ./
COPY platform/ /app/platform/
COPY server/src/contracts/ /app/server/src/contracts/
RUN npm run build

# --- Stage 4: Build Admin Panel ---
FROM base AS admin-builder
WORKDIR /app/admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
COPY platform/ /app/platform/
COPY server/src/contracts/ /app/server/src/contracts/
RUN npm run build

# --- Stage 5: Production Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy compiled Go Gateway
COPY --from=gateway-builder /gateway-bin /usr/local/bin/gateway

# Copy compiled backend & assets
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/assets ./server/assets
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/prisma ./server/prisma
COPY --from=server-builder /app/server/node_modules ./server/node_modules

# Copy static frontend, landing & admin builds
COPY --from=client-builder /app/client/dist ./server/public/client
COPY --from=landing-builder /app/landing/dist ./server/public/landing
COPY --from=admin-builder /app/admin/dist ./server/public/admin

# Create recordings directory
RUN mkdir -p /app/server/recordings

# Copy docker entrypoint script
COPY server/docker-entrypoint.sh ./server/docker-entrypoint.sh
RUN chmod +x ./server/docker-entrypoint.sh

WORKDIR /app/server
EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
