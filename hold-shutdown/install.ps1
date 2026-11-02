# Installs HoldShutdown to run (armed) at every logon.
# Copies the exe out of OneDrive (so an online-only file can't break startup)
# and registers a logon Scheduled Task (starts right away, no Startup-folder delay,
# no 72h run limit, keeps running on battery).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'HoldShutdown'
$exe = Join-Path $dir 'HoldShutdown.exe'

Get-Process HoldShutdown -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
& "$here\build.ps1"
if ($LASTEXITCODE -ne 0) { throw "build failed" }
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item "$here\bin\HoldShutdown.exe" $exe -Force

# old Startup-folder shortcut is replaced by the task
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'HoldShutdown.lnk'
if (Test-Path $lnk) { Remove-Item $lnk }

$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $exe -Argument '--armed' -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'HoldShutdown' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Start-ScheduledTask -TaskName 'HoldShutdown'
Write-Host "Installed: $exe (task 'HoldShutdown', runs armed at logon)"
