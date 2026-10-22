# install.ps1: register the PC heartbeat tasks. Run once, as Administrator:
#   powershell -ExecutionPolicy Bypass -File install.ps1
# Re-running replaces the tasks. Remove with: install.ps1 -Uninstall
#
# Two tasks, both as SYSTEM (hidden, run before anyone logs in):
#   Servo PC heartbeat        Mon-Fri, every minute 5:50-5:55 AM and 3:50-3:55 PM
#   Servo PC heartbeat (boot) at startup
# Times are the PC's local time, so Windows must be on Manila time.
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$names = "Servo PC heartbeat", "Servo PC heartbeat (boot)"
$dir   = Join-Path $env:ProgramData "servo-heartbeat"

foreach ($n in $names) {
    Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue
}
if ($Uninstall) {
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed."
    exit 0
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item (Join-Path $PSScriptRoot "heartbeat.ps1") $dir -Force
$script = Join-Path $dir "heartbeat.ps1"

function Action($via) {
    New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Via $via"
}

# Weekly trigger + 1-minute repetition for 6 minutes = x:50, x:51 ... x:55.
function Window($at) {
    $t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $at
    $t.Repetition = (New-ScheduledTaskTrigger -Once -At $at `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Minutes 6)).Repetition
    $t
}

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
# StartWhenAvailable stays off: a run missed because the PC was off must NOT
# fire later, or it would report "on" for a window it was actually off in.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $names[0] -Action (Action "repeat") `
    -Trigger @((Window "5:50AM"), (Window "3:50PM")) `
    -Principal $principal -Settings $settings | Out-Null

Register-ScheduledTask -TaskName $names[1] -Action (Action "boot") `
    -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Principal $principal -Settings $settings | Out-Null

# One write now so the Firebase console shows it working straight away.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Via install
if ($LASTEXITCODE -eq 0) {
    Write-Host "Installed. /servo/pc in Firebase should now show via: install."
} else {
    Write-Host "Tasks installed, but the test write failed. Check the network."
}
