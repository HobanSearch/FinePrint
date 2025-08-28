# Fine Print AI - Analytics Service Dockerfile
FROM node:20-alpine AS base

# Install Python for some analytics dependencies
RUN apk add --no-cache python3 py3-pip make g++

# Create app directory
WORKDIR /app

# Copy shared dependencies
COPY backend/shared ./shared

# Copy service files
COPY backend/services/analytics/package*.json ./
COPY backend/services/analytics/tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS build
RUN npm ci
COPY backend/services/analytics/src ./src
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install Python for analytics dependencies
RUN apk add --no-cache python3

WORKDIR /app

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Change ownership
RUN chown -R appuser:appgroup /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

EXPOSE 3007

CMD ["node", "dist/index.js"]