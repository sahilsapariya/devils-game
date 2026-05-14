# PROJECT EXTRACTION - AI service production image
# Multi-stage build for the @extraction/ai-service NestJS microservice.
#
# Build context: repo root
#   docker build -f packages/ai-service/Dockerfile -t extraction-ai-service:local .

# -----------------------------------------------------------------------------
# Stage 1: dependency installation
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/ai-service/package.json ./packages/ai-service/

RUN npm ci --workspaces --include-workspace-root

# -----------------------------------------------------------------------------
# Stage 2: builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build --workspace=@extraction/ai-service

# -----------------------------------------------------------------------------
# Stage 3: runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4001 \
    VOICE_CACHE_DIR=/app/voice-cache

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs && \
    mkdir -p /app/voice-cache && chown -R nestjs:nodejs /app/voice-cache

COPY --from=builder --chown=nestjs:nodejs /app/packages/ai-service/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/ai-service/package.json ./
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs
EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

CMD ["node", "dist/main.js"]
