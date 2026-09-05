$ErrorActionPreference = "Stop"

$Source = "C:\Taskade-Export\cryptoversehq-os"
$Destination = "C:\GitHub\cryptoversehq-os"

Write-Host ""
Write-Host "========================================"
Write-Host " CryptoVerseHQ - SAFE TASKADE SYNC"
Write-Host "========================================"
Write-Host ""

if (-not (Test-Path $Source)) {
    Write-Host "ERROR: Taskade Export folder not found:"
    Write-Host $Source
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path $Destination)) {
    Write-Host "ERROR: GitHub repository folder not found:"
    Write-Host $Destination
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Source:"
Write-Host "  $Source"
Write-Host ""

Write-Host "Destination:"
Write-Host "  $Destination"
Write-Host ""

Write-Host "Protected:"
Write-Host "  backend"
Write-Host "  .git"
Write-Host "  .env files"
Write-Host ""

Write-Host "Syncing..."
Write-Host ""

robocopy $Source $Destination `
    /E `
    /IS `
    /IT `
    /XD "backend" ".git" `
    /XF ".env" ".env.*" `
    /R:2 `
    /W:2

$ExitCode = $LASTEXITCODE

Write-Host ""
Write-Host "========================================"

if ($ExitCode -le 7) {
    Write-Host "SYNC COMPLETED SUCCESSFULLY"
    Write-Host ""
    Write-Host "Rules applied:"
    Write-Host "  - Matching files: replaced with Taskade version"
    Write-Host "  - New Taskade files: added"
    Write-Host "  - GitHub-only files: preserved"
    Write-Host "  - GitHub-only folders: preserved"
    Write-Host "  - backend: protected"
    Write-Host "  - .git: protected"
    Write-Host "  - .env files: protected"
} else {
    Write-Host "SYNC FINISHED WITH ERRORS"
    Write-Host "Robocopy exit code: $ExitCode"
}

Write-Host "========================================"
Write-Host ""

Read-Host "Press Enter to close"