[CmdletBinding()]
param(
    [string]$ToolchainRoot = "E:\Toolchains"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$resolvedDrive = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($ToolchainRoot))
if ($resolvedDrive -ne "E:\") {
    throw "The portable Rust toolchain must remain on drive E:."
}

$rustupHome = Join-Path $ToolchainRoot "rustup"
$cargoHome = Join-Path $ToolchainRoot "cargo"
$temporaryRoot = Join-Path $ToolchainRoot "temp"
$installerRoot = Join-Path $ToolchainRoot "installers"
$installer = Join-Path $installerRoot "rustup-init-x86_64-pc-windows-msvc.exe"

New-Item -ItemType Directory -Force -Path $rustupHome, $cargoHome, $temporaryRoot, $installerRoot | Out-Null
$env:RUSTUP_HOME = $rustupHome
$env:CARGO_HOME = $cargoHome
$env:TEMP = $temporaryRoot
$env:TMP = $temporaryRoot

if (-not (Test-Path -LiteralPath $installer)) {
    Invoke-WebRequest -UseBasicParsing -Uri "https://win.rustup.rs/x86_64" -OutFile $installer
}

& $installer -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-msvc --default-toolchain stable
if ($LASTEXITCODE -ne 0) { throw "rustup-init failed with exit code $LASTEXITCODE." }

$env:Path = "$cargoHome\bin;$env:Path"
& (Join-Path $cargoHome "bin\rustup.exe") target add x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { throw "The Rust MSVC target could not be installed." }

Write-Host "Rust is installed only under $ToolchainRoot."
Write-Host "For future terminals set RUSTUP_HOME=$rustupHome and CARGO_HOME=$cargoHome, then prepend $cargoHome\bin to PATH."
