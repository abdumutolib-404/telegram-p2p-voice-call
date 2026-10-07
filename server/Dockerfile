# PairTalk Node/Go backend. Build from the repository root:
# docker build -f server/Dockerfile -t pairtalk-api .
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

FROM server-builder AS server-runtime-dependencies
# Keep the migration CLI, but omit test runners and deployment authoring tools.
RUN npm prune --omit=dev

# Production runner: frontends deploy independently to Cloudflare Workers.
FROM base AS runtime-base
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=127.0.0.1

# Copy compiled Go Gateway
COPY --from=gateway-builder /gateway-bin /usr/local/bin/gateway

# Copy compiled backend & assets
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/assets ./server/assets
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/prisma ./server/prisma
COPY --from=server-runtime-dependencies /app/server/node_modules ./server/node_modules

# Create recordings directory
RUN mkdir -p /app/server/recordings

# Copy docker entrypoint script
COPY server/docker-entrypoint.sh ./server/docker-entrypoint.sh
RUN chmod +x ./server/docker-entrypoint.sh

WORKDIR /app/server
EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]

# Disposable verification only: socket smoke probes need their development client.
# Never deploy this target; the default final runner below omits these tools.
FROM runtime-base AS backend-verification
COPY --from=server-builder /app/server/node_modules /app/server/node_modules

FROM runtime-base AS runner
