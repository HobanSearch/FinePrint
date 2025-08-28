# DevOps Agent - Production Dockerfile
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    git \
    openssh-client \
    curl \
    bash \
    python3 \
    py3-pip \
    gcc \
    g++ \
    make \
    docker \
    kubectl \
    helm \
    unzip

# Install Pulumi
RUN curl -fsSL https://get.pulumi.com | sh
ENV PATH="/root/.pulumi/bin:${PATH}"

# Install Terraform
RUN curl -fsSL https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_linux_arm64.zip -o terraform.zip && \
    unzip terraform.zip && \
    mv terraform /usr/local/bin/ && \
    rm terraform.zip

# Install AWS CLI
RUN pip3 install awscli

# Install Google Cloud SDK
RUN curl https://sdk.cloud.google.com | bash
ENV PATH="/root/google-cloud-sdk/bin:${PATH}"

# Install Azure CLI
RUN pip3 install azure-cli

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM base AS runtime
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 devops-agent

# Copy built application
COPY --from=build --chown=devops-agent:nodejs /app/dist ./dist
COPY --from=deps --chown=devops-agent:nodejs /app/node_modules ./node_modules
COPY --chown=devops-agent:nodejs package.json ./

# Create necessary directories
RUN mkdir -p /app/tmp /app/workspace /app/logs && \
    chown -R devops-agent:nodejs /app

USER devops-agent

# Health check
COPY --from=build --chown=devops-agent:nodejs /app/scripts/health-check.sh ./
RUN chmod +x health-check.sh
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ./health-check.sh

EXPOSE 8015

CMD ["node", "dist/index.js"]