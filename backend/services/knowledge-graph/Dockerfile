FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY ../../shared ./shared
COPY ../../packages ./packages

# Install dependencies
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 knowledgegraph

# Copy built application
COPY --from=builder --chown=knowledgegraph:nodejs /app/dist ./dist
COPY --from=builder --chown=knowledgegraph:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=knowledgegraph:nodejs /app/package.json ./package.json

USER knowledgegraph

EXPOSE 3007

ENV PORT=3007
ENV NODE_OPTIONS="--max-old-space-size=2048"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/healthcheck.js

CMD ["node", "dist/index.js"]