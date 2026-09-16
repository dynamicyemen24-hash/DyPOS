@echo off
REM === DyPOS origin deploy v1.18.0 -- RUN AS ADMINISTRATOR on the ORIGIN server ===
set SRC=%~dp0
set DST=C:\inetpub\wwwroot
set SITE=https://dypos.smartportssoft.com
echo [1/5] Mirroring POS assets (stale chunks removed)...
robocopy "%SRC%assets" "%DST%\assets" /MIR /COPY:DAT /R:3 /W:5 /MT:8 /XF *.log
echo [2/5] Publishing pos.html + web.config...
copy /Y "%SRC%pos.html" "%DST%\pos.html"
copy /Y "%SRC%web.config" "%DST%\web.config"
echo [3/5] Restarting IIS...
iisreset /restart
echo [4/5] Verifying LOCAL files...
findstr /C:"1.18.0" "%DST%\pos.html" && echo LOCAL BUILD 1.18.0 OK || echo LOCAL VERIFY FAILED
findstr /C:"{% for" "%DST%\pos.html" && echo LOCAL JINJA LEAK ^(BAD^) || echo LOCAL JINJA CLEAN ^(GOOD^)
echo [5/5] Verifying LIVE URLs ^(purge Cloudflare cache FIRST^)...
curl -s -o NUL -w "live pos.html: %%{http_code}\n" "%SITE%/pos.html?v=1.18.0"
curl -s "%SITE%/assets/DyPOS/pos/version.json" | findstr /C:"1.18.0" && echo LIVE VERSION 1.18.0 OK || echo LIVE VERSION MISMATCH ^(purge CF cache^)
curl -s -o NUL -w "live bundle index-BhIo9O6U.js: %%{http_code}\n" "%SITE%/assets/DyPOS/pos/assets/index-BhIo9O6U.js"
curl -s -D - -o NUL "%SITE%/pos.html" | findstr /I /C:"content-security-policy" && echo LIVE CSP OK || echo LIVE CSP MISSING ^(check web.config on origin^)
echo DONE. Expected: 200 / OK / 200 / CSP OK.
pause