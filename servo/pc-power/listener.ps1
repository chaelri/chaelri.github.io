# listener.ps1: answer the ESP32 (servo/firmware/wol-power) on the LAN.
#   "SERVO-PING <token>" -> reply "SERVO-PONG"  (tells the ESP32 the PC is on)
#   "SERVO-OFF <token>"  -> reply "SERVO-BYE", then shut down
# Runs forever as SYSTEM from the task install.ps1 registers.
$Port  = 40510
$Token = "k7Qm2vXe9Rt4"   # must match PC_TOKEN in wol-power.ino

$udp = New-Object System.Net.Sockets.UdpClient($Port)
$enc = [System.Text.Encoding]::ASCII
function Reply($text, $to) { $b = $enc.GetBytes($text); [void]$udp.Send($b, $b.Length, $to) }

while ($true) {
    $from = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    try { $msg = $enc.GetString($udp.Receive([ref]$from)).Trim() } catch { continue }
    if ($msg -eq "SERVO-PING $Token") {
        Reply "SERVO-PONG" $from
    } elseif ($msg -eq "SERVO-OFF $Token") {
        Reply "SERVO-BYE" $from
        & shutdown.exe /s /t 0
    }
}
