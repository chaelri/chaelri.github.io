# Installs the shared mod list into %APPDATA%\.minecraft\mods (or -Dir).
# Usage: powershell -ExecutionPolicy Bypass -File install-mods.ps1
param([string]$Dir = "$env:APPDATA\.minecraft\mods")
$cfg = Get-Content "$PSScriptRoot\mods.json" -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force $Dir | Out-Null
foreach ($p in $cfg.modrinth) {
  $u = "https://api.modrinth.com/v2/project/$p/version?loaders=%5B%22$($cfg.loader)%22%5D&game_versions=%5B%22$($cfg.minecraft)%22%5D"
  $f = (Invoke-RestMethod $u)[0].files[0]
  Invoke-WebRequest $f.url -OutFile (Join-Path $Dir $f.filename)
  "installed $($f.filename)"
}
# OptiFine: the download link carries a rotating key, so read it from the mirror page.
$page = (Invoke-WebRequest "http://optifine.net/adloadx?f=$($cfg.optifine)" -UseBasicParsing).Content
$m = [regex]::Match($page, "downloadx\?f=[^'""]+")
Invoke-WebRequest "http://optifine.net/$($m.Value)" -OutFile (Join-Path $Dir $cfg.optifine.Replace('preview_',''))
"installed OptiFine"
