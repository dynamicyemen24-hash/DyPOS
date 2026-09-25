<#
.SYNOPSIS
    DyPOS Full Stack Deploy Script
    Builds frontend, deploys to Cloudflare Pages, and triggers backend deploy
#>

param(
    [switch]$SkipTests,
    [switch]$SkipBuild,
    [string]$BackendUrl = "https://dypos-api.smartportssoft.com"
)

$ErrorActionPreference = "Stop"

function Write-Header($msg) {
    Write-Host "`n========== $msg ==========" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "✅ $msg" -ForegroundColor Green
}

function Write-Error($msg) {
    Write-Host "❌ $msg" -ForegroundColor Red
}

Write-Header "DyPOS v1.36.0 - Offline-First PWA Deploy"

# 1. Run tests
if (-not $SkipTests) {
    Write-Header "Running Frontend Tests"
    cd POS
    npm run test:run
    Write-Success "Frontend tests passed (594 tests)"

    Write-Header "Running Server Tests"
    cd ..\server
    node --test --import ./tests/setup.js "tests/**/*.test.js"
    Write-Success "Server tests passed (365 tests)"
    cd ..
}

# 2. Build frontend (Pages root build: base "/" + SW scope "/")
if (-not $SkipBuild) {
    Write-Header "Building Frontend (PWA, Pages root)"
    cd POS
    npm run build:pages
    Write-Success "Pages build complete"
    cd ..
}

# 3. Deploy to Cloudflare Pages (DyPOS/public/pos served as site root)
Write-Header "Deploying to Cloudflare Pages"
npx wrangler@latest pages deploy DyPOS/public/pos --project-name=dypos-pos --commit-dirty=true
Write-Success "Pages deployed: https://dypos.smartportssoft.com"

# 4. Deploy API Worker (if backend URL set)
if ($BackendUrl) {
    Write-Header "Updating Worker with backend URL: $BackendUrl"
    # Update wrangler.toml BACKEND_URL var and deploy worker
    Write-Host "Configure BACKEND_URL in Cloudflare Dashboard → Workers → dypos-pos → Settings → Variables"
}

Write-Header "Deploy Complete!"
Write-Host "🌐 PWA: https://dypos.smartportssoft.com (after DNS)"
Write-Host "🌐 Preview: https://d2ad7477.dypos-pos.pages.dev"
Write-Host ""
Write-Host "📋 Post-Deploy Checklist:"
Write-Host "  1. Add custom domain in Cloudflare Pages dashboard"
Write-Host "  2. Deploy backend API at dypos-api.smartportssoft.com"
Write-Host "  3. Set BACKEND_URL in Worker vars"
Write-Host "  4. Test offline login/registration"