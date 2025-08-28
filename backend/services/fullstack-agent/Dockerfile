# Multi-stage build for Full Stack Development Agent
FROM node:20-alpine AS base

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    bash

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Development stage
FROM base AS development
ENV NODE_ENV=development
RUN npm ci --include=dev
COPY . .
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S fullstack-agent -u 1001

# Install system dependencies
RUN apk add --no-cache git bash

WORKDIR /app

# Copy built application
COPY --from=build --chown=fullstack-agent:nodejs /app/dist ./dist
COPY --from=build --chown=fullstack-agent:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=fullstack-agent:nodejs /app/package.json ./package.json

# Create necessary directories
RUN mkdir -p /app/templates /app/generated /app/logs && \
    chown -R fullstack-agent:nodejs /app

USER fullstack-agent

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]