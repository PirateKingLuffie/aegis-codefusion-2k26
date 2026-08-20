[CmdletBinding()]
param(
    [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Find-Executable([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    $portable = Join-Path "E:\Toolchains\cargo\bin" ("{0}.exe" -f $Name)
    if (Test-Path -LiteralPath $portable) { return $portable }
    return $null
}

$vswhere = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
$msvcRoot = $null
if (Test-Path -LiteralPath $vswhere) {
    $candidate = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($candidate)) {
        $msvcRoot = $candidate.Trim()
    }
}

$webViewRoot = "C:\Program Files (x86)\Microsoft\EdgeWebView\Application"
$webViewVersion = Get-ChildItem -LiteralPath $webViewRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+(\.\d+)+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1 -ExpandProperty Name
$windowsSdkRoot = "C:\Program Files (x86)\Windows Kits\10\Lib"
$windowsSdkVersion = Get-ChildItem -LiteralPath $windowsSdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+(\.\d+)+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1 -ExpandProperty Name

$tauriCli = Join-Path (Split-Path $PSScriptRoot -Parent) "node_modules\.bin\tauri.cmd"
$checks = [ordered]@{
    node = Find-Executable "node"
    npm = Find-Executable "npm"
    tauri_cli = if (Test-Path -LiteralPath $tauriCli) { $tauriCli } else { $null }
    rustc = Find-Executable "rustc"
    cargo = Find-Executable "cargo"
    msvc = $msvcRoot
    windows_sdk = $windowsSdkVersion
    webview2 = $webViewVersion
}

$missing = @($checks.GetEnumerator() | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.Value) } | ForEach-Object Key)
[ordered]@{
    ready = $missing.Count -eq 0
    missing = $missing
    detected = $checks
} | ConvertTo-Json -Depth 4

if ($RequireComplete -and $missing.Count -gt 0) {
    Write-Error ("Windows toolchain is incomplete. Missing: " + ($missing -join ", "))
    exit 1
}
