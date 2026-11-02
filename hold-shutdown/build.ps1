# Builds bin\HoldShutdown.exe with the .NET Framework compiler that ships with Windows.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
New-Item -ItemType Directory -Force "$here\bin" | Out-Null
& $csc /nologo /target:winexe /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    "/out:$here\bin\HoldShutdown.exe" "$here\HoldShutdown.cs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Built $here\bin\HoldShutdown.exe"
