# DyPOS — Cloudflare purge + live verify for dypos.smartportssoft.com
# Usage:
#   $env:CF_TOKEN = "<scoped API token: Zone / Cache Purge>"
#   powershell -ExecutionPolicy Bypass -File scripts\cf-purge.ps1 -ZoneId "<zone-id>"
# Zone ID: dash.cloudflare.com → smartportssoft.com → Overview (right sidebar).
# NOTE: purge alone cannot fix 404 origin files — run ORIGIN-DEPLOY.bat on the
# origin FIRST, then this script. Exit 0 = live 1.21.0 verified.
param([string]$ZoneId = "", [string]$Version = "1.21.0")
$ErrorActionPreference = "Stop"
$Token = $env:CF_TOKEN
if (-not $Token) { Write-Output "ERROR: set CF_TOKEN first."; exit 2 }
if (-not $ZoneId) { Write-Output "ERROR: pass -ZoneId (dashboard Overview page)."; exit 2 }
$Site = "https://dypos.smartportssoft.com"
$H = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }

Write-Output "[1/3] Purge Everything..."
$purgeAll = Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/purge_cache" -Headers $H -Body '{"purge_everything":true}'
Write-Output ("  success=" + $purgeAll.success)
if (-not $purgeAll.success) { Write-Output ("  errors=" + ($purgeAll.errors | ConvertTo-Json -Compress)); exit 1 }

Write-Output "[2/3] Custom purge (pos.html + version.json + bundle)..."
$bundle = (Get-Content "D:\SulationDy\DyPOS\DyPOS\public\pos\pos.html" -Raw | Select-String -Pattern 'assets/index-[^"]+\.js' -AllMatches).Matches.Value | Select-Object -First 1
if (-not $bundle) { $bundle = "assets/index-BhIo9O6U.js" }
$files = @("$Site/pos.html", "$Site/assets/DyPOS/pos/version.json", "$Site/assets/DyPOS/pos/assets/$bundle", "$Site/sw.js")
$purgeFiles = Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/purge_cache" -Headers $H -Body (@{files = $files} | ConvertTo-Json)
Write-Output ("  success=" + $purgeFiles.success)

Write-Output "[3/3] Live verify..."
Start-Sleep -Seconds 5
function Get-Status($u) { try { (Invoke-WebRequest $u -UseBasicParsing).StatusCode } catch { [int]$_.Exception.Response.StatusCode } }
$ok = $true
$s1 = Get-Status "$Site/pos.html?v=$Version";            Write-Output "  pos.html=$s1";            if ($s1 -ne 200) { $ok = $false }
$v = Invoke-RestMethod "$Site/assets/DyPOS/pos/version.json"; Write-Output ("  version.json=" + $v.version); if ($v.version -ne $Version) { $ok = $false }
$s3 = Get-Status "$Site/assets/DyPOS/pos/assets/$bundle"; Write-Output "  bundle=$s3";              if ($s3 -ne 200) { $ok = $false }
if ($ok) { Write-Output "LIVE $Version VERIFIED"; exit 0 } else { Write-Output "LIVE VERIFY FAILED (origin files still missing?)"; exit 1 }
