# ── Build stage (frontend) ──
FROM node:20-alpine AS frontend-builder
WORKDIR /app/pos-src

# Install frontend dependencies and build
COPY POS/package*.json ./
RUN npm ci 2>/dev/null || npm install

COPY POS/ ./ 
# Build output goes to ../DyPOS/public/pos (per vite.config.js)
WORKDIR /app/pos-src
RUN npm run build

# ── Production stage (backend) ──
FROM node:20-alpine AS backend
WORKDIR /app

# Create non-root user for security
RUN addgroup -S dypos && adduser -S -G dypos dypos \
    && mkdir -p /app/data /app/DyPOS/public/pos && chown -R dypos:dypos /app

# Copy backend
COPY server/package*.json ./
RUN npm ci --production && npm cache clean --force

COPY server/ ./server/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/pos-src/../DyPOS/public/pos/ ./DyPOS/public/pos/

# Set NODE_ENV
ENV NODE_ENV=production
ENV DYPOS_PORT=3001
ENV DYPOS_HOST=0.0.0.0
ENV DYPOS_DB_PATH=/app/data/dypos.db

WORKDIR /app/server
USER dypos

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const http=require('http');const options={host:'localhost',port:3001,path:'/api/health',timeout:3000};const req=http.get(options,res=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.setTimeout(3000,()=>{req.destroy();process.exit(1)})"

# Run migrations then start server
CMD ["node", "entrypoint.js"]