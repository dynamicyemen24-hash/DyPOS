$sizes = @('72','96','144','192','384','512','180')
foreach ($s in $sizes) {
    $rx = [math]::Round($s*0.15)
    $cx = [math]::Round($s/2)
    $cy = [math]::Round($s*0.6)
    $fs = [math]::Round($s*0.35)
    $svg = "<svg xmlns=`"http://www.w3.org/2000/svg`" width=`"$s`" height=`"$s`" viewBox=`"0 0 $s $s`"><rect width=`"$s`" height=`"$s`" rx=`"$rx`" fill=`"#1E40AF`"/><text x=`"$cx`" y=`"$cy`" text-anchor=`"middle`" dominant-baseline=`"middle`" fill=`"white`" font-size=`"$fs`" font-family=`"Cairo,sans-serif`" font-weight=`"bold`">SP</text></svg>"
    [System.IO.File]::WriteAllText("icon-$s`x$s.png", $svg, [System.Text.Encoding]::UTF8)
}
Write-Host "Icons created successfully"
