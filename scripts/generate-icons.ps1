param(
    [string]$Source,
    [string]$OutputDir
)

if (-not $Source) {
    $Source = Join-Path (Split-Path -Parent $PSScriptRoot) 'logo icon.png'
}

if (-not $OutputDir) {
    $OutputDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'packages\frontend\public'
}

if (-not (Test-Path $Source)) {
    throw "Imagem fonte não encontrada em $Source"
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool DestroyIcon(IntPtr handle);
}
"@

function Save-ResizedPng {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$Size
    )

    $original = [System.Drawing.Image]::FromFile($InputPath)
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($original, 0, 0, $Size, $Size)
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    $original.Dispose()
}

function Save-Ico {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$Size
    )

    $original = [System.Drawing.Image]::FromFile($InputPath)
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($original, 0, 0, $Size, $Size)
    $iconHandle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    $fileStream = [System.IO.File]::Create($OutputPath)
    $icon.Save($fileStream)
    $fileStream.Close()
    [NativeMethods]::DestroyIcon($iconHandle) | Out-Null
    $graphics.Dispose()
    $bitmap.Dispose()
    $original.Dispose()
}

Save-ResizedPng -InputPath $Source -OutputPath (Join-Path $OutputDir 'apple-touch-icon.png') -Size 180
Save-ResizedPng -InputPath $Source -OutputPath (Join-Path $OutputDir 'pwa-192x192.png') -Size 192
Save-ResizedPng -InputPath $Source -OutputPath (Join-Path $OutputDir 'pwa-512x512.png') -Size 512
Save-Ico -InputPath $Source -OutputPath (Join-Path $OutputDir 'favicon.ico') -Size 256
