FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY ../../shared ./shared
COPY ../../packages ./packages

# Install dependencies
RUN npm ci --only=production

# Development image, copy all the files and run next dev
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3003
ENV PORT 3003
ENV NODE_ENV development

CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy only the necessary files
FROM base AS prod
WORKDIR /app

ENV NODE_ENV production
ENV PORT 3003

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 billing

# Copy built application
COPY --from=build --chown=billing:nodejs /app/dist ./dist
COPY --from=build --chown=billing:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=billing:nodejs /app/package.json ./package.json

USER billing

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1

CMD ["node", "dist/index.js"]