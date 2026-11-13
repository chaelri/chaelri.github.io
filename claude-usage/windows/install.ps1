# Installs ClaudeUsage to start at every logon (copies the exe out of OneDrive, registers a logon Scheduled Task).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'ClaudeUsage'
$exe = Join-Path $dir 'ClaudeUsage.exe'
Get-Process ClaudeUsage -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
& "$here\build.ps1"
if ($LASTEXITCODE -ne 0) { throw "build failed" }
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item "$here\bin\ClaudeUsage.exe" $exe -Force
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'ClaudeUsage' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'ClaudeUsage'
Write-Host "Installed: $exe (task 'ClaudeUsage', runs at logon)"
