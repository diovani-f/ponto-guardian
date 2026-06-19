$ErrorActionPreference = "Stop"

$Repo = "diovani-f/ponto-guardian"
$InstallDir = Join-Path $env:LOCALAPPDATA "PontoGuardian"
$AppPath = Join-Path $InstallDir "Ponto Guardian.exe"
$ReleaseUrl = "https://api.github.com/repos/$Repo/releases/latest"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "Buscando ultima release do Ponto Guardian..."
$Release = Invoke-RestMethod -Uri $ReleaseUrl -Headers @{ "User-Agent" = "ponto-guardian-installer" }
$Asset = $Release.assets | Where-Object { $_.name -like "*.exe" -and $_.name -like "*portable*" } | Select-Object -First 1

if (-not $Asset) {
  throw "Nenhum .exe portable encontrado na ultima release."
}

Write-Host "Baixando $($Asset.name)..."
$DownloadedPath = Join-Path $InstallDir $Asset.name
Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $DownloadedPath

if (Test-Path $AppPath) {
  Remove-Item $AppPath -Force
}

Rename-Item -Path $DownloadedPath -NewName "Ponto Guardian.exe"

Write-Host "Instalado em $AppPath"
Write-Host "Abrindo Ponto Guardian..."
Start-Process -FilePath $AppPath
Write-Host "Pronto!"
