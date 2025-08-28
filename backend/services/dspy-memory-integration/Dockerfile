# Multi-stage build for DSPy-Memory Integration Service
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8015

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 dspy-memory-integration

# Copy built application
COPY --from=builder --chown=dspy-memory-integration:nodejs /app/dist ./dist
COPY --from=builder --chown=dspy-memory-integration:nodejs /app/package.json ./package.json

# Copy production dependencies
COPY --from=deps --chown=dspy-memory-integration:nodejs /app/node_modules ./node_modules

USER dspy-memory-integration

EXPOSE 8015

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8015/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"]