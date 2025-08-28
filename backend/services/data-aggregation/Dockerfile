# Fine Print AI - Data Aggregation Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S fineprintai -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=fineprintai:nodejs /app/dist ./dist
COPY --from=builder --chown=fineprintai:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=fineprintai:nodejs /app/package.json ./

# Create directories for logs and temp files
RUN mkdir -p /app/logs /app/temp && chown -R fineprintai:nodejs /app

# Switch to non-root user
USER fineprintai

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]