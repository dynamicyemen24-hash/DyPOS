$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$version = (Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json).version

Push-Location $repoRoot
try {
	& npm --prefix server run upstream
	if ($LASTEXITCODE -ne 0) { throw "The checked-in API upstream configuration is unsafe." }

Write-Host "Deploying DyPOS API Worker $version..." -ForegroundColor Cyan
	& npx wrangler deploy --config wrangler.api.toml
	if ($LASTEXITCODE -ne 0) { throw "Cloudflare Worker deployment failed with exit code $LASTEXITCODE." }

	& npm run verify:live -- "--version=$version"
	if ($LASTEXITCODE -ne 0) { throw "Live edge/PWA verification failed for release $version." }
} finally {
	Pop-Location
}

Write-Warning "The Worker is only the edge gateway. Sync remains unavailable until a real Express backend is hosted and BACKEND_URL is set to its verified public origin."
