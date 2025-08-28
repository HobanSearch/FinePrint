FROM node:20-alpine

WORKDIR /app

# Copy source code
COPY src ./src

# Expose port
EXPOSE 3010

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3010/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the service
CMD ["node", "src/index.js"]