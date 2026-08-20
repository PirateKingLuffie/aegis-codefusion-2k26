[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = "E:\CodeFusion EIT Hackathon\AEGIS"
$runtimeRoot = Join-Path $projectRoot "artifacts\runtime"
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

$backend = Start-Process -FilePath (Join-Path $projectRoot "backend\.venv\Scripts\python.exe") `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8080") `
    -WorkingDirectory (Join-Path $projectRoot "backend") -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $runtimeRoot "backend.stdout.log") `
    -RedirectStandardError (Join-Path $runtimeRoot "backend.stderr.log")

$web = Start-Process -FilePath "C:\Program Files\nodejs\npm.cmd" `
    -ArgumentList @("run", "start", "--", "--hostname", "0.0.0.0", "--port", "4173") `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $runtimeRoot "web.stdout.log") `
    -RedirectStandardError (Join-Path $runtimeRoot "web.stderr.log")

function Get-ListenerPid([int]$port) {
    try {
        return Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop |
            Select-Object -First 1 -ExpandProperty OwningProcess
    } catch {
        return $null
    }
}

$processState = [ordered]@{
    backendLauncherPid = $backend.Id
    backendPid = $null
    webLauncherPid = $web.Id
    webPid = $null
    startedUtc = [DateTime]::UtcNow.ToString("o")
}

$deadline = [DateTime]::UtcNow.AddSeconds(45)
do {
    Start-Sleep -Milliseconds 500
    $backendReady = $false
    $webApiReady = $false
    $webPageReady = $false
    try { $backendReady = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8080/health/live" -TimeoutSec 2).StatusCode -eq 200 } catch {}
    try { $webApiReady = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:4173/api/health" -TimeoutSec 2).StatusCode -eq 200 } catch {}
    try {
        $page = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:4173/" -TimeoutSec 2
        $webPageReady = $page.StatusCode -eq 200 -and $page.Content -match "AEGIS"
    } catch {}
} until (($backendReady -and $webApiReady -and $webPageReady) -or [DateTime]::UtcNow -gt $deadline)

$processState.backendPid = Get-ListenerPid 8080
$processState.webPid = Get-ListenerPid 4173
[System.IO.File]::WriteAllText(
    (Join-Path $runtimeRoot "processes.json"),
    ($processState | ConvertTo-Json),
    [System.Text.UTF8Encoding]::new($false)
)

$result = [ordered]@{
    backend = $backendReady
    webApi = $webApiReady
    webPage = $webPageReady
    backendPid = $processState.backendPid
    backendLauncherPid = $backend.Id
    webPid = $processState.webPid
    webLauncherPid = $web.Id
}
$result | ConvertTo-Json

if (-not ($backendReady -and $webApiReady -and $webPageReady)) {
    Get-Content (Join-Path $runtimeRoot "backend.stderr.log") -Tail 80 -ErrorAction SilentlyContinue
    Get-Content (Join-Path $runtimeRoot "web.stderr.log") -Tail 80 -ErrorAction SilentlyContinue
    exit 1
}
