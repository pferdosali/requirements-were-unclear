# DocBridge — Shared API/Worker Image
# Entry point determined by ECS task definition command override:
#   API:    ["node", "dist/server.js"]
#   Worker: ["node", "dist/worker/worker.js"]

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -g 1001 -S docbridge && \
    adduser -S docbridge -u 1001 -G docbridge
USER docbridge

# Health check for API mode (ignored by Worker which has no HTTP server)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

# Default: API server. Override in ECS task definition for worker.
CMD ["node", "dist/server.js"]
