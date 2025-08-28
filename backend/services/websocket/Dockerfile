# Multi-stage build for production optimization
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY ../../shared/types/package.json ./shared/types/
COPY ../../shared/config/package.json ./shared/config/
COPY ../../shared/middleware/package.json ./shared/middleware/
COPY ../../shared/security/package.json ./shared/security/
COPY ../../packages/cache/package.json ./packages/cache/
COPY ../../packages/logger/package.json ./packages/logger/

# Install dependencies
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy shared packages
COPY ../../shared ./shared
COPY ../../packages ./packages

# Copy source
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run the application
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 websocket
RUN adduser --system --uid 1001 websocket

# Copy built application
COPY --from=builder --chown=websocket:websocket /app/dist ./dist
COPY --from=builder --chown=websocket:websocket /app/node_modules ./node_modules
COPY --from=builder --chown=websocket:websocket /app/package.json ./package.json

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');const options={hostname:'localhost',port:process.env.PORT||8080,path:'/health',timeout:2000};const req=http.request(options,res=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.end();"

# Switch to non-root user
USER websocket

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the application
CMD ["node", "dist/index.js"]