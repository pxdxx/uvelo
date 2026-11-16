# Вырезает скруглённые углы у иконки (белый фон → прозрачность) и сохраняет нужные размеры.
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/round-icon.ps1 <исходник.png>
param([string]$Source = "$PSScriptRoot\..\resources\logo-square.png")
Add-Type -AssemblyName System.Drawing

function Save-Rounded([string]$src, [string]$dst, [int]$size, [double]$radiusFrac, [double]$insetFrac) {
  $img = [System.Drawing.Image]::FromFile((Resolve-Path $src))
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $inset = $size * $insetFrac
  $r = $size * $radiusFrac
  $w = $size - 2 * $inset
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($inset, $inset, 2 * $r, 2 * $r, 180, 90)
  $path.AddArc($inset + $w - 2 * $r, $inset, 2 * $r, 2 * $r, 270, 90)
  $path.AddArc($inset + $w - 2 * $r, $inset + $w - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $path.AddArc($inset, $inset + $w - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $path.CloseFigure()
  $brush = New-Object System.Drawing.TextureBrush $img
  $scale = $size / $img.Width
  $brush.ScaleTransform($scale, $scale)
  $g.FillPath($brush, $path)
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose(); $path.Dispose(); $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  Write-Output "$dst ($size px)"
}

$root = Resolve-Path "$PSScriptRoot\.."
# радиус ~29% и небольшой отступ: гарантированно срезают белые углы исходника
Save-Rounded $Source "$root\build\icon.png" 1024 0.29 0.006
Save-Rounded $Source "$root\resources\icon.png" 512 0.29 0.006
Save-Rounded $Source "$root\src\renderer\src\assets\logo.png" 256 0.29 0.006
