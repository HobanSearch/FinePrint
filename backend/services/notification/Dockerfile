# Multi-stage build for notification service
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY backend/services/notification/package.json ./backend/services/notification/
COPY backend/shared/*/package.json ./backend/shared/*/

# Install dependencies
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Generate Prisma client
RUN cd backend/services/notification && npx prisma generate

# Build application
RUN cd backend/services/notification && npm run build

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 notification

# Copy built application
COPY --from=builder --chown=notification:nodejs /app/backend/services/notification/dist ./dist
COPY --from=builder --chown=notification:nodejs /app/backend/services/notification/package.json ./
COPY --from=builder --chown=notification:nodejs /app/backend/services/notification/prisma ./prisma
COPY --from=deps --chown=notification:nodejs /app/node_modules ./node_modules

# Create required directories
RUN mkdir -p /app/logs /app/temp && chown notification:nodejs /app/logs /app/temp

# Switch to non-root user
USER notification

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["node", "dist/index.js"]