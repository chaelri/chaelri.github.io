# heartbeat.ps1: tell Firebase this PC is on.
# Writes /servo/pc = { lastSeen: <server time>, via: <boot|repeat> }.
# The 5:55 / 3:55 servo check (gemini-proxy /servo-poweron) skips the power
# button click when lastSeen is under 6 minutes old.
#
# Run by the scheduled tasks install.ps1 registers; not meant to be run by hand
# (though it is harmless to: .\heartbeat.ps1 -Via test).
param([string]$Via = "repeat")

$uri  = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servo/pc.json?print=silent"
$body = @{ lastSeen = @{ ".sv" = "timestamp" }; via = $Via } | ConvertTo-Json -Compress

# At boot the network can take a while to come up, so keep trying for ~2 min.
$tries = if ($Via -eq "boot") { 24 } else { 3 }
for ($i = 1; $i -le $tries; $i++) {
    try {
        Invoke-RestMethod -Method Put -Uri $uri -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
        exit 0
    } catch {
        Start-Sleep -Seconds 5
    }
}
exit 1
