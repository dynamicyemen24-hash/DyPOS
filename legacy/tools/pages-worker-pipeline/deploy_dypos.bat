@echo off
REM ============================================
REM DyPOS Deployment Script for dypos.smartportssoft.com
%= Run as Administrator =%
REM ============================================

setlocal enabledelayedexpansion

set "SRC=%~dp0"
set "BUILD_DIR=D:\SulationDy\DyPOS\DyPOS\public\pos"
set "WWW_DIR=C:\inetpub\wwwroot"

echo ============================================
echo  DyPOS Deployment Script
echo  Domain: dypos.smartportssoft.com
echo  Build: %BUILD_DIR%
echo  Target: %WWW_DIR%
echo ============================================
echo.

REM Check admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo [1/4] Granting permissions...
icacls "%WWW_DIR%" /grant "IIS_IUSRS:(OI)(CI)F" /T /C /Q
icacls "%WWW_DIR%" /grant "Users:(OI)(CI)F" /T /C /Q
echo DONE.

echo [2/4] Copying assets...
xcopy "%BUILD_DIR%\assets" "%WWW_DIR%\assets" /E /Y /Q /I
echo DONE.

echo [3/4] Copying files...
copy "%BUILD_DIR%\pos.html" "%WWW_DIR%\pos.html" /Y /Q
copy "%BUILD_DIR%\index.html" "%WWW_DIR%\index.html" /Y /Q
copy "%BUILD_DIR%\manifest.json" "%WWW_DIR%\manifest.json" /Y /Q
copy "%BUILD_DIR%\manifest.webmanifest" "%WWW_DIR%\manifest.webmanifest" /Y /Q
copy "%BUILD_DIR%\sw.js" "%WWW_DIR%\sw.js" /Y /Q
copy "%BUILD_DIR%\version.json" "%WWW_DIR%\version.json" /Y /Q
copy "%BUILD_DIR%\offline.html" "%WWW_DIR%\offline.html" /Y /Q
copy "%BUILD_DIR%\DyPOSLogo.png" "%WWW_DIR%\DyPOSLogo.png" /Y /Q
copy "%BUILD_DIR%\smart-ports-og.jpg" "%WWW_DIR%\smart-ports-og.jpg" /Y /Q
copy "%BUILD_DIR%\workbox-7334f08a.js" "%WWW_DIR%\workbox-7334f08a.js" /Y /Q
copy "%BUILD_DIR%\favicon.ico" "%WWW_DIR%\favicon.ico" /Y /Q
copy "%BUILD_DIR%\favicon-16x16.png" "%WWW_DIR%\favicon-16x16.png" /Y /Q
copy "%BUILD_DIR%\favicon-32x32.png" "%WWW_DIR%\favicon-32x32.png" /Y /Q
copy "%BUILD_DIR%\apple-touch-icon.png" "%WWW_DIR%\apple-touch-icon.png" /Y /Q
copy "%BUILD_DIR%\android-chrome-192x192.png" "%WWW_DIR%\android-chrome-192x192.png" /Y /Q
copy "%BUILD_DIR%\android-chrome-512x512.png" "%WWW_DIR%\android-chrome-512x512.png" /Y /Q
echo DONE.

echo [4/4] Copying workers...
if not exist "%WWW_DIR%\workers" mkdir "%WWW_DIR%\workers"
xcopy "%BUILD_DIR%\workers" "%WWW_DIR%\workers" /E /Y /Q /I
echo DONE.

echo.
echo ============================================
echo  DEPLOYMENT COMPLETE!
echo  ============================================
echo.
echo  Next steps on Cloudflare (dash.cloudflare.com):
echo  1. Go to: dypos.smartportssoft.com DNS
echo  2. Add A record pointing to server IP
echo  3. Enable SSL/TLS (Full/Strict)
echo  4. Enable Page Rules for caching if needed
echo  5. Clear Cloudflare cache
echo.
echo  Then restart IIS:
echo    iisreset /restart
echo ============================================
pause