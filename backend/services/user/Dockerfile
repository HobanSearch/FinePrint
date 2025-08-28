# Multi-stage Docker build for User Service
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy root package.json and lockfile
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy workspace configurations
COPY packages/ ./packages/
COPY shared/ ./shared/
COPY services/user/ ./services/user/

# Development stage
FROM base AS development
RUN npm ci
RUN npm run build
EXPOSE 3005
CMD ["npm", "run", "dev", "--workspace=@fineprintai/user-service"]

# Production build stage
FROM base AS build
RUN npm ci --only=production && npm cache clean --force
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Add non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy built application
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages/*/dist ./packages/
COPY --from=build --chown=nodejs:nodejs /app/shared/*/dist ./shared/
COPY --from=build --chown=nodejs:nodejs /app/services/user/dist ./services/user/dist
COPY --from=build --chown=nodejs:nodejs /app/services/user/package.json ./services/user/

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1

# Start the service
CMD ["node", "services/user/dist/index.js"]