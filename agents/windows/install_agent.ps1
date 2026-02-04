#============================================================
# ServerManager Windows Agent - Installation Script
# Run as Administrator in PowerShell
#============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,

    [Parameter(Mandatory=$true)]
    [string]$ApiKey
)

$ErrorActionPreference = "Stop"

$AgentDir = "$env:ProgramFiles\ServerManager\Agent"
$ConfigDir = "$env:ProgramData\ServerManager"
$ServiceName = "ServerManagerAgent"

Write-Host "========================================" -ForegroundColor Green
Write-Host "  ServerManager Agent Installer"          -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Error: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

# Check Python installation
Write-Host "Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Python not found. Installing Python..." -ForegroundColor Yellow
    Write-Host "Please install Python 3.9+ from https://www.python.org/downloads/" -ForegroundColor Red
    Write-Host "Make sure to check 'Add Python to PATH' during installation." -ForegroundColor Red
    exit 1
}

# Create directories
Write-Host "Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

# Copy agent files
Write-Host "Copying agent files..." -ForegroundColor Yellow
$ScriptDir = Split-Path -Parent $PSCommandPath
Copy-Item "$ScriptDir\agent.py" "$AgentDir\agent.py" -Force
Copy-Item "$ScriptDir\requirements.txt" "$AgentDir\requirements.txt" -Force

# Install Python dependencies
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
python -m pip install --quiet -r "$AgentDir\requirements.txt"

# Create configuration
Write-Host "Creating configuration..." -ForegroundColor Yellow
$config = @{
    server_url = $ServerUrl
    api_key = $ApiKey
    metrics_interval = 5
    heartbeat_interval = 30
    package_sync_interval = 3600
    verify_ssl = $true
} | ConvertTo-Json

$config | Out-File -FilePath "$ConfigDir\agent.conf" -Encoding UTF8 -Force

# Create Scheduled Task (runs as SYSTEM, starts at boot)
Write-Host "Creating scheduled task..." -ForegroundColor Yellow

# Remove existing task if present
Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue

$PythonPath = (Get-Command python).Source
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$AgentDir\agent.py`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount

Register-ScheduledTask -TaskName $ServiceName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "ServerManager Monitoring Agent" | Out-Null

# Start the task
Start-ScheduledTask -TaskName $ServiceName

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Agent Directory: $AgentDir"
Write-Host "  Config File:     $ConfigDir\agent.conf"
Write-Host "  Task Name:       $ServiceName"
Write-Host ""
Write-Host "  Commands:"
Write-Host "    Get-ScheduledTask -TaskName $ServiceName"
Write-Host "    Start-ScheduledTask -TaskName $ServiceName"
Write-Host "    Stop-ScheduledTask -TaskName $ServiceName"
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
