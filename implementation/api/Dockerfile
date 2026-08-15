# DocBridge API & Worker
# Multi-stage build for minimal production image
# Same image, different CMD for API vs Worker

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Security: don't run as root
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy built app and production deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

USER appuser

EXPOSE 3000

# Default: run API server. Override CMD for worker.
CMD ["node", "dist/server.js"]
