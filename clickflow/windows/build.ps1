# ClickFlow for Windows - build with the .NET 8 SDK (winget install Microsoft.DotNet.SDK.8).
#
#   .\build.ps1            -> bin\Release\...\ClickFlow.exe
#   .\build.ps1 test       -> build, then the headless self-test (schedule maths, shortcuts, JSON)
#   .\build.ps1 install    -> publish to %LOCALAPPDATA%\Programs\ClickFlow, add a Start Menu shortcut
#
# install never starts ClickFlow and never turns a schedule on. When there are no macros yet it
# seeds them from ..\macros\macros.windows.json, where every schedule is off and every step is
# Show only, so nothing can click, type or send until you switch steps back to Live.
param([ValidateSet("build", "test", "install")][string]$Action = "build")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$dotnet = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
if (-not $dotnet) { $dotnet = "C:\Program Files\dotnet\dotnet.exe" }
if (-not (Test-Path $dotnet)) { throw ".NET SDK not found: winget install Microsoft.DotNet.SDK.8" }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"
$env:DOTNET_NOLOGO = "1"

if (-not (Test-Path AppIcon.ico)) { python make-icon.py }

switch ($Action) {
  "build" {
    & $dotnet build ClickFlow.csproj -c Release -v q
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    Write-Host "OK bin\Release\net8.0-windows10.0.19041.0\ClickFlow.exe"
  }
  "test" {
    & $dotnet build ClickFlow.csproj -c Release -v q
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    $out = Join-Path $env:TEMP "clickflow-selftest.txt"
    $p = Start-Process "bin\Release\net8.0-windows10.0.19041.0\ClickFlow.exe" -ArgumentList "--selftest `"$out`"" -Wait -PassThru
    Get-Content $out -Encoding utf8
    exit $p.ExitCode
  }
  "install" {
    $dest = Join-Path $env:LOCALAPPDATA "Programs\ClickFlow"
    Get-Process ClickFlow -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$dest*" } | ForEach-Object {
      throw "ClickFlow is running from $dest. Quit it from the tray icon first."
    }
    & $dotnet publish ClickFlow.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o publish -v q
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item publish\ClickFlow.exe $dest -Force

    $data = Join-Path $env:APPDATA "ClickFlow"
    if (-not (Test-Path (Join-Path $data "macros.json"))) {
      New-Item -ItemType Directory -Force $data | Out-Null
      Copy-Item ..\macros\macros.windows.json (Join-Path $data "macros.json")
      Write-Host "-> seeded $data\macros.json from macros.windows.json (schedules off, every step Show only)"
    }

    $lnk = Join-Path ([Environment]::GetFolderPath("Programs")) "ClickFlow.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $s = $shell.CreateShortcut($lnk)
    $s.TargetPath = Join-Path $dest "ClickFlow.exe"
    $s.WorkingDirectory = $dest
    $s.Description = "Record, edit and schedule click macros"
    $s.Save()
    Write-Host "OK $dest\ClickFlow.exe  (Start Menu: ClickFlow)"
  }
}
