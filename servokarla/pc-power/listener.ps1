# listener.ps1: answer the ESP32 (servokarla/firmware/wol-power-karla) on the LAN.
#   "KARLA-PING <token>" -> reply "KARLA-PONG"  (tells the ESP32 the PC is on)
#   "KARLA-OFF <token>"  -> reply "KARLA-BYE", then shut down
# Runs forever as SYSTEM from the task install.ps1 registers.
$Port  = 40511
$Token = "lcjLudnI6gkT"   # must match PC_TOKEN in wol-power-karla.ino

$udp = New-Object System.Net.Sockets.UdpClient($Port)
$enc = [System.Text.Encoding]::ASCII
function Reply($text, $to) { $b = $enc.GetBytes($text); [void]$udp.Send($b, $b.Length, $to) }

while ($true) {
    $from = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    try { $msg = $enc.GetString($udp.Receive([ref]$from)).Trim() } catch { continue }
    if ($msg -eq "KARLA-PING $Token") {
        Reply "KARLA-PONG" $from
    } elseif ($msg -eq "KARLA-OFF $Token") {
        Reply "KARLA-BYE" $from
        & shutdown.exe /s /t 0
    }
}
