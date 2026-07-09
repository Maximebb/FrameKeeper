# FrameKeeper Windows client installer.
#
# One-liner (elevated PowerShell):
#   iwr -useb https://github.com/Maximebb/FrameKeeper/releases/latest/download/install-framekeeper-client.ps1 | iex
#
# Downloads the client artifact from a GitHub release, extracts it, writes
# config.yaml (prompting if needed) and registers the "FrameKeeper Client"
# Windows service. Safe to re-run for upgrades: the service is stopped, files
# are replaced in place and the existing config.yaml is preserved.
#
# Overrides (set before running, all optional):
#   $env:FK_VERSION      release tag to install, e.g. "v1.2.3" (default: latest)
#   $env:FK_INSTALL_DIR  install directory (default: %ProgramData%\FrameKeeper\client)
#   $env:FK_SERVER_URL   server URL written to a new config.yaml (skips prompt)
#   $env:FK_API_TOKEN    API token written to a new config.yaml (skips prompt)

$ErrorActionPreference = 'Stop'

$Repo = 'Maximebb/FrameKeeper'
$AssetPrefix = 'framekeeper-client'
# node-windows registers the service as "<id>.exe" where the id is derived
# from the display name "FrameKeeper Client".
$ServiceName = 'framekeeperclient.exe'

$Version = if ($env:FK_VERSION) { $env:FK_VERSION } else { 'latest' }
$InstallDir = if ($env:FK_INSTALL_DIR) { $env:FK_INSTALL_DIR } else { Join-Path $env:ProgramData 'FrameKeeper\client' }

$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator privileges are required to install the FrameKeeper Client service. Re-run from an elevated PowerShell.'
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js 20+ is required but was not found on PATH. Install it first (e.g. 'winget install OpenJS.NodeJS.LTS'), open a new elevated shell, and re-run."
}
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20+ is required (found $(& node --version)). Upgrade Node.js and re-run."
}

Write-Host "Resolving FrameKeeper client release ($Version)..."
$releaseUrl = if ($Version -eq 'latest') {
    "https://api.github.com/repos/$Repo/releases/latest"
} else {
    "https://api.github.com/repos/$Repo/releases/tags/$Version"
}
$release = Invoke-RestMethod -UseBasicParsing -Uri $releaseUrl
$tag = $release.tag_name
$assetName = "$AssetPrefix-$tag.zip"
$asset = $release.assets | Where-Object { $_.name -eq $assetName }
if (-not $asset) {
    throw "Release $tag has no asset named $assetName. Was the release workflow successful?"
}

$zipPath = Join-Path $env:TEMP $assetName
Write-Host "Downloading $assetName..."
Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $zipPath

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing -and $existing.Status -ne 'Stopped') {
    Write-Host 'Stopping existing FrameKeeper Client service...'
    Stop-Service -Name $ServiceName -Force
    $existing.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
}

Write-Host "Installing to $InstallDir..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
Remove-Item $zipPath

$configPath = Join-Path $InstallDir 'config.yaml'
if (-not (Test-Path $configPath)) {
    $serverUrl = if ($env:FK_SERVER_URL) { $env:FK_SERVER_URL } else { Read-Host 'FrameKeeper server URL (e.g. http://192.168.1.10:8080)' }
    $apiToken = if ($env:FK_API_TOKEN) { $env:FK_API_TOKEN } else { Read-Host 'API token (frontend: Settings -> API Tokens)' }
    if (-not $serverUrl -or -not $apiToken) {
        throw 'serverUrl and apiToken are required to create config.yaml.'
    }
    @(
        '# FrameKeeper client configuration. See config.example.yaml for all options.'
        "serverUrl: `"$serverUrl`""
        "apiToken: `"$apiToken`""
        "clientName: `"$env:COMPUTERNAME`""
    ) | Set-Content -Path $configPath -Encoding UTF8
    Write-Host "Wrote $configPath"
} else {
    Write-Host "Keeping existing $configPath"
}

Write-Host 'Registering Windows service...'
Push-Location $InstallDir
try {
    & node (Join-Path $InstallDir 'dist\service\install.js')
    if ($LASTEXITCODE -ne 0) { throw "Service installation failed (exit code $LASTEXITCODE)." }
} finally {
    Pop-Location
}

# On upgrades node-windows reports "already installed" without restarting.
$svc = $null
foreach ($i in 1..15) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) { break }
    Start-Sleep -Seconds 2
}
if (-not $svc) {
    throw "Service $ServiceName was not registered. Check the output above."
}
if ($svc.Status -ne 'Running') {
    Start-Service -Name $ServiceName
}

Write-Host "FrameKeeper Client $tag installed and running as service '$ServiceName'."
Write-Host "Config: $configPath"
