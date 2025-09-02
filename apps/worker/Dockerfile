# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install system dependencies for document processing
RUN apk add --no-cache \
    python3 \
    py3-pip \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-data-eng

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create necessary directories
RUN mkdir -p /app/tmp /app/uploads && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Start the worker
CMD ["node", "dist/worker.js"]