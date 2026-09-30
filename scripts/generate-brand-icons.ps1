Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot

function Add-RoundedBar($path, [single]$x, [single]$y, [single]$width, [single]$height) {
  $r = [single]2
  $d = [single]($r * 2)
  $path.StartFigure()
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $width - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $width - $d, $y + $height - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $height - $d, $d, $d, 90, 90)
  $path.CloseFigure()
}

function New-BrandBitmap([int]$size) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.Color]::FromArgb(21, 24, 23))
  $scale = [single]($size * 0.82 / 64)
  $offset = [single]($size * 0.09)
  $graphics.TranslateTransform($offset, $offset)
  $graphics.ScaleTransform($scale, $scale)
  $bars = [System.Drawing.Drawing2D.GraphicsPath]::new()
  Add-RoundedBar $bars 12 38 10 15
  Add-RoundedBar $bars 27 29 10 24
  Add-RoundedBar $bars 42 20 10 33
  $barBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 241, 233))
  $graphics.FillPath($barBrush, $bars)
  $arrow = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(217, 180, 93), [single]3.5)
  $arrow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arrow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arrow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(12,24),
    [System.Drawing.PointF]::new(24,11),
    [System.Drawing.PointF]::new(34,20),
    [System.Drawing.PointF]::new(51,5)
  )
  $graphics.DrawLines($arrow, $points)
  $graphics.DrawLine($arrow, [single]44, [single]5, [single]51, [single]5)
  $graphics.DrawLine($arrow, [single]51, [single]5, [single]51, [single]12)
  $baseline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 241, 233), [single]2.7)
  $baseline.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $baseline.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($baseline, [single]12, [single]57, [single]52, [single]57)
  $baseline.Dispose()
  $arrow.Dispose()
  $barBrush.Dispose()
  $bars.Dispose()
  $graphics.Dispose()
  return $bitmap
}

foreach ($size in @(180, 512)) {
  $bitmap = New-BrandBitmap $size
  $bitmap.Save((Join-Path $projectRoot "app-icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$favicon = New-BrandBitmap 32
$handle = $favicon.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Create((Join-Path $projectRoot 'favicon.ico'))
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
$favicon.Dispose()

# La carte de partage est regénérée entièrement : le nom n'utilise plus le symbole comme initiale.
$shareCardPath = Join-Path $projectRoot 'share-card.png'
$shareCard = [System.Drawing.Bitmap]::new(1200, 630)
$cardGraphics = [System.Drawing.Graphics]::FromImage($shareCard)
$cardGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$cardGraphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(20, 23, 26))
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 241, 233))
$muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(167, 171, 173))
$accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(217, 180, 93))
$cardGraphics.FillRectangle($background, 0, 0, 1200, 630)
$cardGraphics.TranslateTransform([single]68, [single]69)
$cardGraphics.ScaleTransform([single]0.9, [single]0.9)
$cardBars = [System.Drawing.Drawing2D.GraphicsPath]::new()
Add-RoundedBar $cardBars 12 38 10 15
Add-RoundedBar $cardBars 27 29 10 24
Add-RoundedBar $cardBars 42 20 10 33
$cardGraphics.FillPath($ink, $cardBars)
$cardTrend = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(217, 180, 93), [single]3.5)
$cardTrend.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$cardTrend.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$cardTrend.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$cardGraphics.DrawLines($cardTrend, [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(12,24),[System.Drawing.PointF]::new(24,11),[System.Drawing.PointF]::new(34,20),[System.Drawing.PointF]::new(51,5)))
$cardGraphics.DrawLine($cardTrend, [single]44, [single]5, [single]51, [single]5)
$cardGraphics.DrawLine($cardTrend, [single]51, [single]5, [single]51, [single]12)
$cardBase = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 241, 233), [single]2.7)
$cardBase.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$cardBase.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$cardGraphics.DrawLine($cardBase, [single]12, [single]57, [single]52, [single]57)
$cardGraphics.ResetTransform()
$brandFont = [System.Drawing.Font]::new('Arial', [single]42, [System.Drawing.FontStyle]::Bold)
$headlineFont = [System.Drawing.Font]::new('Arial', [single]58, [System.Drawing.FontStyle]::Bold)
$subtitleFont = [System.Drawing.Font]::new('Arial', [single]25)
$cardGraphics.DrawString('Meuniance', $brandFont, $ink, [single]140, [single]73)
$cardGraphics.DrawString('La finance personnelle,', $headlineFont, $ink, [single]68, [single]349)
$cardGraphics.DrawString('rendue claire.', $headlineFont, $ink, [single]68, [single]421)
$cardGraphics.DrawString('Tableur, objectifs et suivi mensuel, au même endroit.', $subtitleFont, $muted, [single]70, [single]523)
$chartBars = [System.Drawing.Drawing2D.GraphicsPath]::new()
Add-RoundedBar $chartBars 958 468 34 90
Add-RoundedBar $chartBars 1006 425 34 133
Add-RoundedBar $chartBars 1054 448 34 110
$softBar = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(49, 57, 66))
$cardGraphics.FillPath($softBar, $chartBars)
$highlightBar = [System.Drawing.Drawing2D.GraphicsPath]::new()
Add-RoundedBar $highlightBar 1102 339 34 219
$cardGraphics.FillPath($accent, $highlightBar)
$shareCard.Save($shareCardPath, [System.Drawing.Imaging.ImageFormat]::Png)
$highlightBar.Dispose(); $softBar.Dispose(); $chartBars.Dispose()
$subtitleFont.Dispose(); $headlineFont.Dispose(); $brandFont.Dispose()
$cardBase.Dispose(); $cardTrend.Dispose(); $cardBars.Dispose()
$accent.Dispose(); $muted.Dispose(); $ink.Dispose(); $background.Dispose()
$cardGraphics.Dispose(); $shareCard.Dispose()
