# DyPOS — Clean production package builder (static IIS origin + Cloudflare)
# Output: D:\SulationDy\DyPOS\dist-deploy\pos-package-<version>\

$ErrorActionPreference = "Stop"

$RepoRoot   = "D:\SulationDy\DyPOS"
$SrcPos     = Join-Path $RepoRoot "DyPOS\public\pos"
$SrcWww     = Join-Path $RepoRoot "DyPOS\www\pos.html"
$SrcCfg     = Join-Path $RepoRoot "scripts\web.config"

$VersionObj = Get-Content (Join-Path $SrcPos "version.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Version    = $VersionObj.version

$OutRoot = Join-Path $RepoRoot "dist-deploy\pos-package-$Version"
$OutAssets = Join-Path $OutRoot "assets\DyPOS\pos"

Write-Output "Building production package v$Version ..."

if (Test-Path $OutRoot) { Remove-Item $OutRoot -Recurse -Force }
New-Item -ItemType Directory -Path $OutAssets -Force | Out-Null

# 1) Fresh mirror copy of the latest build (no stale chunks)
Copy-Item (Join-Path $SrcPos "*") $OutAssets -Recurse -Force

# 2) Static-safe pos.html: strip Frappe Jinja boot block (IIS cannot render Jinja;
#    raw {% %} tags are a JS syntax error + unprofessional), add ?v= cache-buster
$html = Get-Content $SrcWww -Raw -Encoding UTF8
$html = $html -replace "(?s)\s*<script>\s*\{% for key in boot %\}.*?\{% endfor %\}\s*</script>", ""
$html = $html -replace "(/assets/DyPOS/pos/assets/[^""']+\.(js|css))", ('$1?v=' + $Version)
$html = $html -replace "</head>", "`r`n  <!-- DyPOS build $Version -->`r`n</head>"
[System.IO.File]::WriteAllText((Join-Path $OutRoot "pos.html"), $html, (New-Object System.Text.UTF8Encoding($false)))

# 3) Same treatment for inner index.html (direct-asset access path)
$idxPath = Join-Path $OutAssets "index.html"
if (Test-Path $idxPath) {
    $idx = Get-Content $idxPath -Raw -Encoding UTF8
    $idx = $idx -replace "(?s)\s*<script>\s*\{% for key in boot %\}.*?\{% endfor %\}\s*</script>", ""
    [System.IO.File]::WriteAllText($idxPath, $idx, (New-Object System.Text.UTF8Encoding($false)))
}

# 4) Hardened web.config (CSP/HSTS/no-cache HTML + SW)
Copy-Item $SrcCfg (Join-Path $OutRoot "web.config") -Force

# 5) Origin deploy script (MIR = deletes stale hashed chunks like old Login-*.js)
#     Step 5 = end-to-end verification: local files AND live URLs (origin + edge).
$BundleName = (Get-ChildItem (Join-Path $SrcPos "assets\index-*.js") | Select-Object -First 1).Name
$deployBat = @"
@echo off
REM === DyPOS origin deploy v$Version -- RUN AS ADMINISTRATOR on the ORIGIN server ===
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
findstr /C:"$Version" "%DST%\pos.html" && echo LOCAL BUILD $Version OK || echo LOCAL VERIFY FAILED
findstr /C:"{% for" "%DST%\pos.html" && echo LOCAL JINJA LEAK ^(BAD^) || echo LOCAL JINJA CLEAN ^(GOOD^)
echo [5/5] Verifying LIVE URLs ^(purge Cloudflare cache FIRST^)...
curl -s -o NUL -w "live pos.html: %%{http_code}\n" "%SITE%/pos.html?v=$Version"
curl -s "%SITE%/assets/DyPOS/pos/version.json" | findstr /C:"$Version" && echo LIVE VERSION $Version OK || echo LIVE VERSION MISMATCH ^(purge CF cache^)
curl -s -o NUL -w "live bundle ${BundleName}: %%{http_code}\n" "%SITE%/assets/DyPOS/pos/assets/$BundleName"
curl -s -D - -o NUL "%SITE%/pos.html" | findstr /I /C:"content-security-policy" && echo LIVE CSP OK || echo LIVE CSP MISSING ^(check web.config on origin^)
echo DONE. Expected: 200 / OK / 200 / CSP OK.
pause
"@
[System.IO.File]::WriteAllText((Join-Path $OutRoot "ORIGIN-DEPLOY.bat"), $deployBat, (New-Object System.Text.UTF8Encoding($false)))

# 6) Arabic ops README
$readme = @"
DyPOS — حزمة النشر الإنتاجية v$Version
========================================

المحتويات:
- pos.html ......... الواجهة (عربية RTL، بدون Jinja، مع كسر كاش ?v=$Version)
- assets\DyPOS\pos . ملفات البناء الجديدة (تحوي شاشات الدخول/التسجيل العربية)
- web.config ....... حماية IIS (CSP/HSTS + منع كاش HTML و SW)
- ORIGIN-DEPLOY.bat  سكربت النشر على خادم الأصل (يحذف الملفات القديمة تلقائياً)

خطوات النشر على الخادم الأصل (Origin):
1) انسخ مجلد الحزمة كاملاً إلى الخادم الأصل.
2) شغّل ORIGIN-DEPLOY.bat كمسؤول (Run as Administrator).
3) تأكد من ظهور: LOCAL BUILD $Version OK ثم LIVE VERSION $Version OK
   (النص الحرفي من ORIGIN-DEPLOY.bat — ابحث عنه كما هو).

Cloudflare (مهم — وإلا ستستمر الشاشة القديمة):
1) افتح: dash.cloudflare.com → smartportssoft.com → Caching → Purge Cache
2) Purge Everything — أو Custom Purge لهذه الروابط الثلاثة:
   - https://dypos.smartportssoft.com/pos.html
   - https://dypos.smartportssoft.com/assets/DyPOS/pos/*
   - https://dypos.smartportssoft.com/sw.js
3) Rules → Caching: اجعل pos.html و sw.js و version.json = Bypass cache
   (ملف web.config يضبطها من جهة IIS أيضاً).

في المتصفح (لكل جهاز اختبار):
1) Ctrl+Shift+R (تحديث صلب)
2) DevTools → Application → Service Workers → Unregister ثم Clear site data
3) أعد فتح https://dypos.smartportssoft.com/pos.html
4) تحقق من الفوتر/الكونسول: يجب أن تظهر النسخة $Version
   (افتح version.json للتأكد: /assets/DyPOS/pos/version.json)

ملاحظة: مجلد C:\inetpub\wwwroot على جهاز التطوير الحالي ليس هو خادم
الإنتاج (لا توجد خدمة IIS عليه) — النشر الحقيقي يجب أن يتم على الخادم
الأصل الذي يشير إليه سجل DNS ثم تنقية كاش Cloudflare.
"@
[System.IO.File]::WriteAllText((Join-Path $OutRoot "README-AR.txt"), $readme, (New-Object System.Text.UTF8Encoding($false)))

# 7) Zip the package
$ZipPath = "$OutRoot.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $OutRoot "*") -DestinationPath $ZipPath -Force

Write-Output ""
Write-Output "Package ready:"
Write-Output "  Folder: $OutRoot"
Write-Output "  Zip:    $ZipPath"
Get-ChildItem $OutRoot -Recurse -File | Measure-Object | ForEach-Object { Write-Output ("  Files:  " + $_.Count) }
Write-Output "Verify markers:"
Select-String -Path (Join-Path $OutRoot "pos.html") -Pattern ("v=" + $Version) | Select-Object -First 2
$jinjaLeft = Select-String -Path (Join-Path $OutRoot "pos.html") -Pattern "{% for" | Measure-Object | Select-Object -ExpandProperty Count
Write-Output ("  Jinja blocks remaining (must be 0): " + $jinjaLeft)
