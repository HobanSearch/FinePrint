# Multi-stage Docker build for Kong Gateway with custom plugins
FROM kong:3.7.1-alpine AS kong-base

# Install build dependencies
USER root
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev \
    lua5.1-dev \
    make \
    git \
    curl \
    bash \
    jq

# Install additional Lua rocks for custom plugins
RUN luarocks install lua-resty-jwt
RUN luarocks install lua-resty-redis
RUN luarocks install lua-cjson

# Node.js build stage for health check service
FROM node:20-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Final Kong image with custom plugins and health service
FROM kong:3.7.1-alpine

# Install runtime dependencies
USER root
RUN apk add --no-cache \
    nodejs \
    npm \
    curl \
    bash \
    jq \
    redis \
    postgresql-client

# Install Node.js dependencies for health service
RUN npm install -g pm2

# Create directories
RUN mkdir -p /opt/kong/plugins/custom
RUN mkdir -p /opt/gateway-health
RUN mkdir -p /etc/kong/declarative

# Copy Kong configuration
COPY kong/kong.conf /etc/kong/kong.conf
COPY kong/kong.yml /etc/kong/declarative/kong.yml

# Copy custom Kong plugins
COPY kong/plugins/ /opt/kong/plugins/custom/

# Copy health check service
COPY --from=node-builder /app/dist /opt/gateway-health/
COPY --from=node-builder /app/node_modules /opt/gateway-health/node_modules/

# Copy startup scripts
COPY scripts/entrypoint.sh /opt/entrypoint.sh
COPY scripts/health-check.sh /opt/health-check.sh

# Set permissions
RUN chmod +x /opt/entrypoint.sh /opt/health-check.sh
RUN chown -R kong:kong /opt/kong/plugins/custom
RUN chown -R kong:kong /opt/gateway-health

# Expose ports
EXPOSE 8000 8443 8001 8444 8002 8445 8003 8004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /opt/health-check.sh

# Switch back to kong user
USER kong

# Set environment variables
ENV KONG_DATABASE=off
ENV KONG_DECLARATIVE_CONFIG=/etc/kong/declarative/kong.yml
ENV KONG_PROXY_ACCESS_LOG=/dev/stdout
ENV KONG_ADMIN_ACCESS_LOG=/dev/stdout
ENV KONG_PROXY_ERROR_LOG=/dev/stderr
ENV KONG_ADMIN_ERROR_LOG=/dev/stderr
ENV KONG_LOG_LEVEL=info
ENV KONG_PLUGINS=bundled,custom-auth,custom-rate-limit,custom-circuit-breaker

# Start Kong with health service
ENTRYPOINT ["/opt/entrypoint.sh"]
CMD ["kong", "docker-start"]