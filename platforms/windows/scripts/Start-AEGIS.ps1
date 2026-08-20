[CmdletBinding()]
param(
    [uri]$ServerUrl = "http://127.0.0.1:4173"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$windowsRoot = Split-Path $PSScriptRoot -Parent
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $windowsRoot "..\.."))
$releaseRoot = Join-Path $repositoryRoot "artifacts\releases"
$runtimeRoot = Join-Path $repositoryRoot "artifacts\runtime"
$env:npm_config_cache = Join-Path $repositoryRoot ".npm-cache"

function Test-AegisService([uri]$Address) {
    try {
        $health = [uri]::new($Address, "/api/health")
        $response = Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch { return $false }
}

$isLocal = $ServerUrl.Host -in @("127.0.0.1", "localhost")
if ($isLocal -and -not (Test-AegisService $ServerUrl)) {
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot "dist\server"))) {
        Push-Location $repositoryRoot
        try {
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw "The AEGIS production web build failed." }
        } finally { Pop-Location }
    }

    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    $arguments = @("run", "start", "--", "--hostname", "127.0.0.1", "--port", "4173")
    Start-Process -FilePath "npm.cmd" -ArgumentList $arguments -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot "web.stdout.log") -RedirectStandardError (Join-Path $runtimeRoot "web.stderr.log")

    for ($attempt = 0; $attempt -lt 40 -and -not (Test-AegisService $ServerUrl); $attempt++) {
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-AegisService $ServerUrl)) { throw "AEGIS did not become healthy at $ServerUrl. See artifacts/runtime logs." }
}

if (-not $isLocal -and -not (Test-AegisService $ServerUrl)) {
    throw "The configured AEGIS service is unavailable at $ServerUrl."
}

$portable = Get-ChildItem -LiteralPath $releaseRoot -Filter "AEGIS-Windows-x64-Portable-v*.exe" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($null -ne $portable) {
    Start-Process -FilePath $portable.FullName -ArgumentList "--server=$($ServerUrl.AbsoluteUri)"
    exit 0
}

$edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($null -ne $edge) {
    Start-Process -FilePath $edge -ArgumentList "--app=$($ServerUrl.AbsoluteUri)"
} else {
    Start-Process $ServerUrl.AbsoluteUri
}
