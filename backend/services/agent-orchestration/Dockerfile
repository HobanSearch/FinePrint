# Agent Orchestration System - Fixed Dockerfile for Production
FROM node:20-alpine

# Install system dependencies including bash for better debugging
RUN apk add --no-cache \
    curl \
    build-base \
    python3 \
    python3-dev \
    bash

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install ALL dependencies (including dev dependencies needed for tsx)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Create non-root user BEFORE changing ownership
RUN addgroup -g 1001 -S nodejs && \
    adduser -S orchestration -u 1001 -G nodejs

# Ensure proper permissions for node_modules and built files
RUN chown -R orchestration:nodejs /app && \
    chmod -R 755 /app/node_modules && \
    chmod -R 755 /app/dist && \
    chmod -R 755 /app/src

# Switch to non-root user
USER orchestration

# Expose port
EXPOSE 3010

# Health check with better endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3010/health || exit 1

# Use node directly to run built JavaScript instead of npm
CMD ["node", "dist/index.js"]