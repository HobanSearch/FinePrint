# Business Agents API Service Dockerfile

FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.docker.json ./package.json
COPY tsconfig.json ./ 2>/dev/null || true

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Build the application
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache tini

WORKDIR /app

# Copy package files
COPY package.docker.json ./package.json

# Install production dependencies only
RUN npm install --production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3007/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]