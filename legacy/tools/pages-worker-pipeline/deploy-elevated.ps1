# DyPOS Production Deployment Script - Elevated Permissions
# Run this script as Administrator to deploy to IIS

param(
    [string]$SourcePath = "D:\SulationDy\DyPOS\DyPOS\public\pos",
    [string]$DestinationPath = "C:\inetpub\wwwroot\assets\DyPOS\pos",
    [string]$WwwPath = "D:\SulationDy\DyPOS\DyPOS\www",
    [string]$DestinationWww = "C:\inetpub\wwwroot"
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $DestinationPath "deploy_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Write-Host $logEntry -ForegroundColor Cyan
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Test-Administrator {
    $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Check if running as Administrator
if (-not (Test-Administrator)) {
    Write-Host "This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please run as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

Write-Log "=== DyPOS Deployment Started ==="
Write-Log "Source: $SourcePath"
Write-Log "Destination: $DestinationPath"

# Verify source exists
if (-not (Test-Path $SourcePath)) {
    Write-Log "ERROR: Source path does not exist: $SourcePath"
    exit 1
}

# Create destination directory if it doesn't exist
if (-not (Test-Path $DestinationPath)) {
    Write-Log "Creating destination directory..."
    New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
}

# Stop IIS site if running
Write-Log "Checking IIS..."
$site = Get-Website | Where-Object { $_.Name -eq "Default Web Site" } -ErrorAction SilentlyContinue
if ($site) {
    Write-Log "Stopping IIS site..."
    Stop-Website -Name "Default Web Site" -ErrorAction SilentlyContinue
}

# Deploy POS assets
Write-Log "Deploying POS assets..."
robocopy $SourcePath $DestinationPath /E /COPYALL /R:3 /W:5 /MT:8 /XF *.log

if ($LASTEXITCODE -ge 8) {
    Write-Log "ERROR: Robocopy failed with exit code $LASTEXITCODE"
    exit 1
}

# Deploy pos.html to wwwroot
if (Test-Path "$WwwPath\pos.html") {
    Write-Log "Deploying pos.html..."
    Copy-Item "$WwwPath\pos.html" "$DestinationWww\pos.html" -Force
}

# Restart IIS
Write-Log "Restarting IIS..."
iisreset /restart

# Verify deployment
Write-Log "Verifying deployment..."
$indexHtml = Join-Path $DestinationPath "index.html"
if (Test-Path $indexHtml) {
    Write-Log "✓ index.html exists"
} else {
    Write-Log "⚠ index.html not found"
}

$posHtml = Join-Path $DestinationWww "pos.html"
if (Test-Path $posHtml) {
    Write-Log "✓ pos.html exists"
} else {
    Write-Log "⚠ pos.html not found"
}

# List deployed files
Write-Log "Deployed files:"
Get-ChildItem $DestinationPath -Recurse -File | 
    Select-Object FullName, Length |
    ForEach-Object { Write-Log "  $($_.FullName) ($($_.Length) bytes)" }

Write-Log "=== Deployment Complete ==="
Write-Host "`nDeployment finished successfully!" -ForegroundColor Green
Write-Host "Log saved to: $LogFile" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Configure Cloudflare DNS A record for dypos.smartportssoft.com" -ForegroundColor Yellow
Write-Host "2. Set SSL mode to Full (Strict) in Cloudflare" -ForegroundColor Yellow
Write-Host "3. Purge Cloudflare cache" -ForegroundColor Yellow
Write-Host "4. Test https://dypos.smartportssoft.com/pos.html" -ForegroundColor Yellow
