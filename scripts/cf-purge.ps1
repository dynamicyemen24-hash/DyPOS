# DyPOS — Cloudflare purge + live verify for dypos.smartportssoft.com
# Usage:
#   $env:CF_TOKEN = "<scoped API token: Zone / Cache Purge>"
#   powershell -ExecutionPolicy Bypass -File scripts\cf-purge.ps1 -ZoneId "<zone-id>"
# Zone ID: dash.cloudflare.com → smartportssoft.com → Overview (right sidebar).
# NOTE: purge alone cannot fix 404 origin files — run ORIGIN-DEPLOY.bat on the
# origin FIRST, then this script. Exit 0 = live 1.21.0 verified.
param([string]$ZoneId = "", [string]$Version = "")
# Default version = single source of truth (server/lib/version.js), so the
# script never verifies a stale hardcoded release after a version bump.
if (-not $Version) {
	$m = Select-String -Path "D:\SulationDy\DyPOS\server\lib\version.js" -Pattern "VERSION\s*=\s*'([^']+)'" | Select-Object -First 1
	if ($m) { $Version = $m.Matches[0].Groups[1].Value }
}
if (-not $Version) { Write-Output "ERROR: cannot determine version."; exit 2 }
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
$bundle = (Get-Content "D:\SulationDy\DyPOS\DyPOS\public\pos\index.html" -Raw | Select-String -Pattern 'assets/index-[^"]+\.js' -AllMatches).Matches.Value | Select-Object -First 1
if (-not $bundle) { Write-Output "ERROR: cannot find bundle hash in fresh build output."; exit 2 }
$files = @("$Site/pos.html", "$Site/assets/DyPOS/pos/version.json", "$Site/assets/DyPOS/pos/assets/$bundle", "$Site/sw.js")
$purgeFiles = Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/purge_cache" -Headers $H -Body (@{files = $files} | ConvertTo-Json)
Write-Output ("  success=" + $purgeFiles.success)

Write-Output "[3/3] Live verify..."
Start-Sleep -Seconds 5
function Get-Status($u) { try { (Invoke-WebRequest $u -UseBasicParsing).StatusCode } catch { [int]$_.Exception.Response.StatusCode } }
$ok = $true
$s1 = Get-Status "$Site/pos.html?v=$Version";            Write-Output "  pos.html=$s1";            if ($s1 -ne 200) { $ok = $false }
$live = (Invoke-WebRequest "$Site/pos.html" -UseBasicParsing).Content; $fresh = $live.Contains($bundle); Write-Output "  pos.html references fresh bundle ($bundle)=$fresh"; if (-not $fresh) { $ok = $false }
$s3 = Get-Status "$Site/assets/DyPOS/pos/assets/$bundle"; Write-Output "  bundle=$s3";              if ($s3 -ne 200) { $ok = $false }
if ($ok) { Write-Output "LIVE $Version VERIFIED"; exit 0 } else { Write-Output "LIVE VERIFY FAILED (origin files still missing?)"; exit 1 }
