$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$version = (Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json).version
$dist = Join-Path $repoRoot "POS\dist\pos"

if (-not (Test-Path (Join-Path $dist "index.html"))) {
	throw "Pages build is missing. Run 'npm --prefix POS run build:pages' first."
}

$builtVersion = (Get-Content (Join-Path $dist "version.json") -Raw | ConvertFrom-Json).version
if ($builtVersion -ne $version) {
	throw "Build version $builtVersion does not match package version $version. Rebuild before deploying."
}

Write-Host "Deploying DyPOS $version to Cloudflare Pages project dypos-pos..." -ForegroundColor Cyan
Push-Location $repoRoot
try {
	& npx wrangler pages deploy POS/dist/pos --project-name=dypos-pos --branch=main --commit-dirty=true
	if ($LASTEXITCODE -ne 0) { throw "Cloudflare Pages deployment failed with exit code $LASTEXITCODE." }

	& npm run verify:live -- "--version=$version"
	if ($LASTEXITCODE -ne 0) { throw "Live verification failed for release $version." }
} finally {
	Pop-Location
}
