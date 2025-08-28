# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

# Install Python and build dependencies
RUN apk add --no-cache python3 py3-pip make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install -g typescript

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install Python for ML operations
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-numpy \
    py3-scipy \
    curl \
    && pip3 install --no-cache-dir \
    torch==2.1.0 \
    transformers==4.36.0 \
    peft==0.7.0 \
    bitsandbytes==0.41.0 \
    wandb==0.16.0 \
    optuna==3.5.0 \
    scikit-learn==1.3.0

# Install DVC for data versioning
RUN pip3 install --no-cache-dir dvc[s3]==3.0.0

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Create directories for models and data
RUN mkdir -p /models /data/training /data/cache && \
    chown -R node:node /models /data

# Create non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3010/health || exit 1

# Expose port
EXPOSE 3010

# Set environment variables
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    PORT=3010 \
    HOST=0.0.0.0

# Start the service
CMD ["node", "dist/index.js"]