# DyPOS API Edge Worker Deployment
# Run this separately from Pages deployment

Write-Host "=== DyPOS API Edge Worker v1.44.5 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "The edge worker must be deployed as a Cloudflare WORKER (not Pages)." -ForegroundColor Yellow
Write-Host ""

# Option 1: Deploy via Wrangler CLI (separate worker project)
Write-Host "Option A: Deploy as standalone Worker" -ForegroundColor Cyan
Write-Host "  1. npx wrangler init dypos-api-edge --worker" -ForegroundColor White
Write-Host "  2. Copy worker-api.js and worker-edge-hosts.mjs to that folder" -ForegroundColor White
Write-Host "  3. Create wrangler.toml with D1 binding" -ForegroundColor White
Write-Host "  4. npx wrangler deploy --env production" -ForegroundColor White
Write-Host ""

# Option 2: Deploy via Cloudflare Dashboard
Write-Host "Option B: Cloudflare Dashboard (recommended)" -ForegroundColor Cyan
Write-Host "  1. Go to Cloudflare Dashboard > Workers & Pages > Create > Worker" -ForegroundColor White
Write-Host "  2. Name: dypos-api-edge" -ForegroundColor White
Write-Host "  3. Paste contents of worker-api.js" -ForegroundColor White
Write-Host "  4. Add worker-edge-hosts.mjs as a module" -ForegroundColor White
Write-Host "  5. Settings > Variables: BACKEND_URL=https://dypos-api.smartportssoft.com" -ForegroundColor White
Write-Host "  6. Settings > D1 Database: bind dypos_db to your D1 database" -ForegroundColor White
Write-Host "  7. Deploy" -ForegroundColor White
Write-Host ""

# Option 3: Use wrangler deploy with explicit config
Write-Host "Option C: Direct deploy (if wrangler.toml exists in separate dir)" -ForegroundColor Cyan
Write-Host "  npx wrangler deploy worker-api.js --name dypos-api-edge --env production" -ForegroundColor White
Write-Host ""

Write-Host "=== REQUIRED: Authoritative Backend ===" -ForegroundColor Red
Write-Host "The edge worker proxies /api/* to BACKEND_URL" -ForegroundColor White
Write-Host "You MUST deploy the Express server (server/) to a Node.js host:" -ForegroundColor White
Write-Host ""
Write-Host "  BACKEND_URL: https://dypos-api.smartportssoft.com" -ForegroundColor Green
Write-Host ""
Write-Host "Quick deploy options for server/:" -ForegroundColor Cyan
Write-Host "  1. Railway: cd server && railway init && railway up" -ForegroundColor White
Write-Host "     (uses nixpacks.toml - already created)" -ForegroundColor White
Write-Host "  2. Render: New Web Service > Docker > docker build -t dypos-api server/" -ForegroundColor White
Write-Host "  3. Fly.io: fly launch --dockerfile server/Dockerfile" -ForegroundColor White
Write-Host "  4. VPS: docker compose -f server/docker-compose.yml up -d" -ForegroundColor White
Write-Host ""
Write-Host "Required env vars on backend host:" -ForegroundColor Cyan
Write-Host "  NODE_ENV=production" -ForegroundColor White
Write-Host "  PORT=3001" -ForegroundColor White
Write-Host "  DATABASE_URL=file:./data/dypos.db (or postgresql://...)" -ForegroundColor White
Write-Host "  JWT_SECRET=<32+ char random>" -ForegroundColor White
Write-Host "  CORS_ORIGIN=https://dypos.smartportssoft.com" -ForegroundColor White
Write-Host ""
Write-Host "After backend deploys:" -ForegroundColor Cyan
Write-Host "  1. Test: curl https://dypos-api.smartportssoft.com/api/health" -ForegroundColor White
Write-Host "  2. Update edge worker: npx wrangler secret put BACKEND_URL" -ForegroundColor White
Write-Host "  3. Verify: npm run verify:live" -ForegroundColor White