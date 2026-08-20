[CmdletBinding()]
param(
    [switch]$SkipDependencyRestore,
    [string]$ToolchainRoot = "E:\Toolchains"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Sha256Hex([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $sha256.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

$windowsRoot = Split-Path $PSScriptRoot -Parent
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $windowsRoot "..\.."))
$repositoryDrive = [System.IO.Path]::GetPathRoot($repositoryRoot)
if ($repositoryDrive -ne "E:\") { throw "AEGIS release builds must remain on drive E:." }
$toolchainDrive = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($ToolchainRoot))
if ($toolchainDrive -ne "E:\") { throw "The Rust toolchain must remain on drive E:." }

$releaseRoot = Join-Path $repositoryRoot "artifacts\releases"
$targetRoot = Join-Path $windowsRoot "src-tauri\target"
$temporaryRoot = Join-Path $windowsRoot ".tmp"
$localAppDataRoot = Join-Path $windowsRoot ".local-app-data"
New-Item -ItemType Directory -Force -Path $temporaryRoot, $localAppDataRoot | Out-Null
$env:npm_config_cache = Join-Path $repositoryRoot ".npm-cache"
$env:CARGO_TARGET_DIR = $targetRoot
$env:TEMP = $temporaryRoot
$env:TMP = $temporaryRoot
$env:LOCALAPPDATA = $localAppDataRoot
$env:XDG_CACHE_HOME = $localAppDataRoot

$env:CARGO_HOME = Join-Path $ToolchainRoot "cargo"
$env:RUSTUP_HOME = Join-Path $ToolchainRoot "rustup"
$cargoBin = Join-Path $env:CARGO_HOME "bin"
if (Test-Path -LiteralPath $cargoBin) { $env:Path = "$cargoBin;$env:Path" }

& (Join-Path $PSScriptRoot "Test-Toolchain.ps1") -RequireComplete
if ($LASTEXITCODE -ne 0) { throw "Windows build prerequisites are incomplete." }

if (-not $SkipDependencyRestore) {
    Push-Location $repositoryRoot
    try {
        & npm.cmd ci --prefer-offline --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "Root npm dependency restore failed." }
    } finally { Pop-Location }

    Push-Location $windowsRoot
    try {
        & npm.cmd ci --prefer-offline --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "Windows npm dependency restore failed." }
    } finally { Pop-Location }
}

$tauriCli = Join-Path $windowsRoot "node_modules\.bin\tauri.cmd"
if (-not (Test-Path -LiteralPath $tauriCli)) { throw "Tauri CLI is missing. Run npm ci in platforms/windows." }

Push-Location $windowsRoot
try {
    & $tauriCli build --ci --no-sign
    if ($LASTEXITCODE -ne 0) { throw "Tauri release build failed with exit code $LASTEXITCODE." }
} finally { Pop-Location }

$config = Get-Content -LiteralPath (Join-Path $windowsRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = [string]$config.version
$installer = Get-ChildItem -LiteralPath (Join-Path $targetRoot "release\bundle\nsis") -Filter "*.exe" -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
$binary = Join-Path $targetRoot "release\aegis-desktop.exe"
if ($null -eq $installer) { throw "Tauri completed without producing an NSIS installer." }
if (-not (Test-Path -LiteralPath $binary)) { throw "Tauri completed without producing the desktop executable." }

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
$setupDestination = Join-Path $releaseRoot "AEGIS-Windows-x64-Setup-v$version.exe"
$portableDestination = Join-Path $releaseRoot "AEGIS-Windows-x64-Portable-v$version.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $setupDestination -Force
Copy-Item -LiteralPath $binary -Destination $portableDestination -Force

$artifacts = @($setupDestination, $portableDestination)
$hashLines = $artifacts | ForEach-Object {
    $hash = Get-Sha256Hex -Path $_
    "$hash  $([System.IO.Path]::GetFileName($_))"
}
[System.IO.File]::WriteAllLines((Join-Path $releaseRoot "AEGIS-Windows-SHA256SUMS.txt"), $hashLines, [System.Text.UTF8Encoding]::new($false))

$manifest = [ordered]@{
    product = "AEGIS"
    version = $version
    architecture = "x64"
    generatedUtc = [DateTime]::UtcNow.ToString("o")
    signed = $false
    serverMode = "shared AEGIS service (local or HTTPS)"
    artifacts = $artifacts | ForEach-Object {
        [ordered]@{
            file = [System.IO.Path]::GetFileName($_)
            bytes = (Get-Item -LiteralPath $_).Length
            sha256 = Get-Sha256Hex -Path $_
        }
    }
}
[System.IO.File]::WriteAllText((Join-Path $releaseRoot "AEGIS-Windows-release.json"), ($manifest | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

Write-Host "Windows release artifacts created in $releaseRoot"
$artifacts | ForEach-Object { Write-Host $_ }
