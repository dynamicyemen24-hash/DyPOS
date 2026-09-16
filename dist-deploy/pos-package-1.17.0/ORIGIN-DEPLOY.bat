@echo off
REM === DyPOS origin deploy v1.17.0 — RUN AS ADMINISTRATOR on the ORIGIN server ===
set SRC=%~dp0
set DST=C:\inetpub\wwwroot
echo [1/4] Mirroring POS assets (stale chunks removed)...
robocopy "%SRC%assets" "%DST%\assets" /MIR /COPY:DAT /R:3 /W:5 /MT:8 /XF *.log
echo [2/4] Publishing pos.html + web.config...
copy /Y "%SRC%pos.html" "%DST%\pos.html"
copy /Y "%SRC%web.config" "%DST%\web.config"
echo [3/4] Restarting IIS...
iisreset /restart
echo [4/4] Verifying...
findstr /C:"1.17.0" "%DST%\pos.html" && echo BUILD 1.17.0 LIVE || echo VERIFY FAILED
pause