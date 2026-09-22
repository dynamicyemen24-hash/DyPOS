# ── Build stage (frontend) ──
FROM node:20-alpine AS frontend-builder
WORKDIR /app/pos-src

# Install frontend dependencies and build (deterministic when lockfile exists)
COPY POS/package*.json ./
RUN npm ci 2>/dev/null || npm install --no-audit --no-fund

COPY POS/ ./
# Build output goes to /app/DyPOS/public/pos (see POS/vite.config.js outDir)
RUN npm run build

# ── Production stage (backend) ──
FROM node:22-alpine AS backend
WORKDIR /app

# tini = proper PID1 (reaps zombies, forwards SIGTERM for graceful shutdown)
RUN apk add --no-cache tini \
 && addgroup -S dypos && adduser -S -G dypos dypos \
 && mkdir -p /app/data /app/DyPOS/public/pos && chown -R dypos:dypos /app

# Copy backend (server/package.json pins engines: node>=22.5 for node:sqlite)
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

WORKDIR /app
COPY server/ ./server/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/DyPOS/public/pos/ ./DyPOS/public/pos/
RUN chown -R dypos:dypos /app/DyPOS

# Production defaults (override via environment / compose)
ENV NODE_ENV=production
ENV DYPOS_PORT=3001
ENV DYPOS_HOST=0.0.0.0
ENV DYPOS_DB_PATH=/app/data/dypos.db
# Cluster mode requires PostgreSQL Tier-2 (server refuses SQLite+cluster).
# Default 0 so the standard SQLite deploy boots; set 1 only with DYPOS_DATABASE_URL.
ENV DYPOS_CLUSTER=0

WORKDIR /app/server
USER dypos

EXPOSE 3001

# Readiness probe (ready = DB migrated + queryable)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http');const options={host:'localhost',port:process.env.DYPOS_PORT||3001,path:'/api/ready',timeout:3000};const req=http.get(options,res=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.setTimeout(3000,()=>{req.destroy();process.exit(1)})"

ENTRYPOINT ["/sbin/tini", "--"]
# Run migrations then start server (clustered when DYPOS_CLUSTER=1)
CMD ["node", "entrypoint.js"]
