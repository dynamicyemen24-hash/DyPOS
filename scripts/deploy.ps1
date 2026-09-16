# DyPOS Deployment Script
# Run as Administrator: powershell -ExecutionPolicy Bypass -File deploy.ps1

$BUILD_DIR = "D:\SulationDy\DyPOS\DyPOS\public\pos"
$WWW_DIR = "C:\inetpub\wwwroot"

Write-Host "=== DyPOS Deployment ===" -ForegroundColor Green
Write-Host "Source: $BUILD_DIR"
Write-Host "Target: $WWW_DIR"

# Grant permissions
Write-Host "[1/4] Granting IIS permissions..." -ForegroundColor Yellow
icacls $WWW_DIR /grant "IIS_IUSRS:(OI)(CI)F" /T /C /Q 2>$null
icacls $WWW_DIR /grant "Users:(OI)(CI)F" /T /C /Q 2>$null
Write-Host "Done." -ForegroundColor Green

# Copy assets
Write-Host "[2/4] Copying assets..." -ForegroundColor Yellow
robocopy $BUILD_DIR\assets $WWW_DIR\assets /E /COPY:DAT /R:3 /W:5 /MT:8 /NFL /NDL 2>&1 | Out-Null
Write-Host "Done." -ForegroundColor Green

# Copy individual files
Write-Host "[3/4] Copying files..." -ForegroundColor Yellow
@("manifest.json", "manifest.webmanifest", "sw.js", "version.json", "offline.html", 
  "DyPOSLogo.png", "smart-ports-og.jpg", "workbox-7334f08a.js", "favicon.ico",
  "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png",
  "android-chrome-192x192.png", "android-chrome-512x512.png", "index.html") | ForEach-Object {
    Copy-Item "$BUILD_DIR\$_" "$WWW_DIR\" -Force -ErrorAction SilentlyContinue
}
Write-Host "Done." -ForegroundColor Green

# Copy workers
Write-Host "[4/4] Copying workers..." -ForegroundColor Yellow
robocopy "$BUILD_DIR\workers" "$WWW_DIR\workers" /E /COPY:DAT /R:3 /W:5 /MT:8 /NFL /NDL 2>&1 | Out-Null
Write-Host "Done." -ForegroundColor Green

# Copy pos.html
Copy-Item "D:\SulationDy\DyPOS\DyPOS\www\pos.html" "$WWW_DIR\pos.html" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== DEPLOYMENT COMPLETE ===" -ForegroundColor Green
Write-Host "Run: iisreset /restart" -ForegroundColor Cyan
Write-Host "Then configure Cloudflare DNS at: dash.cloudflare.com" -ForegroundColor Cyan

# Auto-restart IIS
Read-Host "Restart IIS now? (Y/N)" | ForEach-Object {
    if ($_ -eq 'Y') { iisreset /restart }
}
