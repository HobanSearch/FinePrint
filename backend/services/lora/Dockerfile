# Multi-stage Dockerfile for LoRA Service with Python Backend
FROM python:3.11-slim as python-backend

WORKDIR /app/python

# Install system dependencies for machine learning
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install dependencies
COPY python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python source code
COPY python/ .

# Stage 2: Node.js TypeScript Service
FROM node:20-alpine as node-service

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    python3-dev \
    curl \
    git \
    bash

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy TypeScript source
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Stage 3: Production Runtime
FROM python:3.11-slim

WORKDIR /app

# Install Node.js in Python container
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY python/requirements.txt ./python/
RUN pip install --no-cache-dir -r python/requirements.txt

# Copy Python application
COPY --from=python-backend /app/python ./python/

# Copy Node.js application
COPY --from=node-service /app/node_modules ./node_modules/
COPY --from=node-service /app/dist ./dist/
COPY --from=node-service /app/package*.json ./

# Create directories for models and training data
RUN mkdir -p /app/models /app/training_data /app/lora_adapters

# Set environment variables
ENV NODE_ENV=production
ENV PYTHON_SERVICE_URL=http://localhost:8008
ENV MODEL_CACHE_DIR=/app/models
ENV TRAINING_DATA_DIR=/app/training_data
ENV PORT=8007

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Function to cleanup background processes\n\
cleanup() {\n\
    echo "Shutting down services..."\n\
    kill $PYTHON_PID $NODE_PID 2>/dev/null || true\n\
    exit 0\n\
}\n\
\n\
# Set up signal handlers\n\
trap cleanup SIGTERM SIGINT\n\
\n\
# Start Python LoRA training service in background\n\
echo "Starting Python LoRA training service on port 8008..."\n\
cd /app/python && python server.py &\n\
PYTHON_PID=$!\n\
\n\
# Wait for Python service to start\n\
echo "Waiting for Python service to initialize..."\n\
sleep 10\n\
\n\
# Start Node.js TypeScript service\n\
echo "Starting Node.js LoRA service on port 8007..."\n\
cd /app && node dist/index.js &\n\
NODE_PID=$!\n\
\n\
# Wait for services to be ready\n\
echo "Services started. PIDs: Python=$PYTHON_PID, Node=$NODE_PID"\n\
\n\
# Wait for any process to exit\n\
wait -n\n\
\n\
# Cleanup\n\
cleanup' > /app/start.sh && chmod +x /app/start.sh

# Health check for both services
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8007/health && curl -f http://localhost:8008/health || exit 1

# Expose ports for both services
EXPOSE 8007 8008

# Start both services
CMD ["/app/start.sh"]