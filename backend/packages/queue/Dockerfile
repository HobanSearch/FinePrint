# Multi-stage build for Fine Print AI Queue System
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build the project
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    tini \
    curl \
    && addgroup -g 1001 -S queueuser \
    && adduser -S queueuser -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --production --silent && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy configuration files
COPY docker/queue-config.json ./config/
COPY docker/prometheus.yml ./monitoring/

# Create necessary directories
RUN mkdir -p /app/logs /app/data \
    && chown -R queueuser:queueuser /app

# Health check script
COPY docker/healthcheck.js ./
RUN chmod +x healthcheck.js

# Switch to non-root user
USER queueuser

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node healthcheck.js || exit 1

# Use tini as init system
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Labels for better container management
LABEL \
    maintainer="Fine Print AI <dev@fineprintai.com>" \
    version="2.0.0" \
    description="Enterprise-grade BullMQ queue system for Fine Print AI" \
    org.opencontainers.image.title="Fine Print AI Queue System" \
    org.opencontainers.image.description="Enterprise queue processing with auto-scaling and monitoring" \
    org.opencontainers.image.vendor="Fine Print AI" \
    org.opencontainers.image.version="2.0.0" \
    org.opencontainers.image.schema-version="1.0"