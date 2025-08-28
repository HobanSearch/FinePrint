# AI/ML Engineering Service Dockerfile
FROM node:20-alpine AS builder

# Install Python and system dependencies for ML libraries
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    python3-dev \
    libffi-dev \
    openssl-dev \
    curl \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install Python and ML runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    libstdc++ \
    lapack \
    openblas

# Install Python ML libraries
RUN pip3 install --no-cache-dir \
    numpy==1.25.2 \
    pandas==2.1.4 \
    scikit-learn==1.3.2 \
    mlflow==2.8.0 \
    optuna==3.4.0 \
    torch==2.1.0 \
    transformers==4.36.0 \
    tensorboard==2.15.1 \
    matplotlib==3.8.2 \
    seaborn==0.13.0

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aiml -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=aiml:nodejs /app/dist ./dist
COPY --from=builder --chown=aiml:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=aiml:nodejs /app/package.json ./

# Create directories for models and data
RUN mkdir -p /app/data/models /app/data/experiments /app/data/registry /app/logs && \
    chown -R aiml:nodejs /app/data /app/logs

# Switch to non-root user
USER aiml

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3006/health || exit 1

# Start the service
CMD ["node", "dist/index.js"]