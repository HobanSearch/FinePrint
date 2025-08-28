# Multi-stage Docker build for Monitoring Service
FROM node:20-alpine AS base

# Install system dependencies and Chromium for Puppeteer
RUN apk add --no-cache \
    curl \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip installing Chromium. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory
WORKDIR /app

# Copy root package.json and lockfile
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy workspace configurations
COPY packages/ ./packages/
COPY shared/ ./shared/
COPY services/monitoring/ ./services/monitoring/

# Development stage
FROM base AS development
RUN npm ci
RUN npm run build
EXPOSE 3002
CMD ["npm", "run", "dev", "--workspace=@fineprintai/monitoring-service"]

# Production build stage
FROM base AS build
RUN npm ci --only=production && npm cache clean --force
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Add non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Install system dependencies and Chromium for production
RUN apk add --no-cache \
    curl \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy built application
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages/*/dist ./packages/
COPY --from=build --chown=nodejs:nodejs /app/shared/*/dist ./shared/
COPY --from=build --chown=nodejs:nodejs /app/services/monitoring/dist ./services/monitoring/dist
COPY --from=build --chown=nodejs:nodejs /app/services/monitoring/package.json ./services/monitoring/

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the service
CMD ["node", "services/monitoring/dist/index.js"]