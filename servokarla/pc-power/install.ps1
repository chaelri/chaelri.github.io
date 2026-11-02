# install.ps1: set up this PC for the Wake-on-LAN ESP32 (servokarla/firmware/wol-power-karla).
# Run once, as Administrator:
#   powershell -ExecutionPolicy Bypass -File install.ps1
# Re-running is safe. Remove with: install.ps1 -Uninstall
#
#  1. Task "Servokarla PC power listener" (SYSTEM, at startup) runs listener.ps1,
#     which answers the ESP32's ping and shuts down on its command.
#  2. Firewall: inbound UDP 40511 from the local subnet only.
#  3. NIC: Wake on Magic Packet + Enable PME on (Intel needs PME for WoL from off).
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$task = "Servokarla PC power listener"
$rule = "Servokarla PC power listener (UDP 40511)"
$dir  = Join-Path $env:ProgramData "servokarla-power"

Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
if ($Uninstall) {
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed."
    exit 0
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item (Join-Path $PSScriptRoot "listener.ps1") $dir -Force
$script = Join-Path $dir "listener.ps1"

New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol UDP -LocalPort 40511 `
    -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $task -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $task

# Wired NIC wake settings (names vary by driver; missing ones are skipped).
$nic = Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" -and $_.MediaType -eq "802.3" } | Select-Object -First 1
if ($nic) {
    foreach ($p in "Wake on Magic Packet", "Enable PME") {
        try {
            Set-NetAdapterAdvancedProperty -Name $nic.Name -DisplayName $p -DisplayValue "Enabled" -ErrorAction Stop
            Write-Host "$($nic.Name): $p = Enabled"
        } catch { Write-Host "$($nic.Name): '$p' not available, skipped" }
    }
    Write-Host "PC MAC (must match PC_MAC in wol-power-karla.ino): $($nic.MacAddress)"
} else {
    Write-Host "No wired NIC found. Wake-on-LAN needs Ethernet."
}

Write-Host "Installed. Listener running on UDP 40511."
