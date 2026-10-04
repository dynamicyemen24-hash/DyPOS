# DyPOS Server - Production Docker Image
# Multi-stage build for minimal size

# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Install Python/build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci --include=dev

# Copy source
COPY . .

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache sqlite-libs tini

# Create non-root user
RUN addgroup -g 1001 -S dypos && \
    adduser -S dypos -u 1001 -G dypos

# Copy built application from builder
COPY --from=builder --chown=dypos:dypos /app/node_modules ./node_modules
COPY --from=builder --chown=dypos:dypos /app/server.js ./server.js
COPY --from=builder --chown=dypos:dypos /app/entrypoint.js ./entrypoint.js
COPY --from=builder --chown=dypos:dypos /app/routes ./routes
COPY --from=builder --chown=dypos:dypos /app/lib ./lib
COPY --from=builder --chown=dypos:dypos /app/db ./db
COPY --from=builder --chown=dypos:dypos /app/middleware ./middleware
COPY --from=builder --chown=dypos:dypos /app/services ./services
COPY --from=builder --chown=dypos:dypos /app/scripts ./scripts
COPY --from=builder --chown=dypos:dypos /app/public ./public
COPY --from=builder --chown=dypos:dypos /app/package.json ./package.json
COPY --from=builder --chown=dypos:dypos /app/.env.example ./.env.example

# Create data directory for SQLite
RUN mkdir -p /app/data /app/uploads && chown -R dypos:dypos /app/data /app/uploads

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/ready || exit 1

# Switch to non-root
USER dypos

# Expose port
EXPOSE 3001

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start server
CMD ["node", "entrypoint.js"]