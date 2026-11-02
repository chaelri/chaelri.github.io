# Display settings: match Karla's PC to Charlie's

**FOR CLAUDE ON KARLA'S PC:** Charlie's PC looks different from Karla's. Below are the display
settings read from Charlie's PC on 2026-11-02. Your job is to read the same settings on this PC,
show Karla a side-by-side table (Charlie / this PC / differs?), and then change only what she
agrees to. Don't change anything before she has seen the table.

## Charlie's PC (reference)

| Setting | Charlie's value | Where in Windows |
|---|---|---|
| Monitor | HCS ATLAS 27F2I (27", 1080p, high refresh) | — |
| GPU | NVIDIA GeForce GTX 1050 Ti (driver 32.0.15.8228) | — |
| Monitors in use | 1, primary | Settings > System > Display |
| Resolution | **1920 x 1080** | Settings > System > Display |
| Refresh rate | **192 Hz** (the monitor's max) | Settings > System > Display > Advanced display |
| Color depth | 32-bit | — |
| Scale | **100%** (recommended) | Settings > System > Display > Scale |
| Text size | 100% (default) | Settings > Accessibility > Text size |
| Night light | **Off** | Settings > System > Display |
| HDR | Off / not used | Settings > System > Display > HDR |
| Windows + app mode | **Dark** (both) | Settings > Personalization > Colors |
| Transparency effects | **Off** | Settings > Personalization > Colors |
| Accent color on Start/taskbar | Off | Settings > Personalization > Colors |
| ClearType | On (standard ClearType) | `cttune` |
| Visual effects | Custom (`VisualFXSetting = 3`), window animations on | System > Advanced system settings > Performance |
| Wallpaper | Windows Spotlight | Settings > Personalization > Background |

Ignore the "SudoMaker Virtual Display Adapter" if you see it mentioned anywhere. It's a virtual display
driver on Charlie's PC, it's in an error state, and Karla doesn't need it.

## Step 1: read this PC's values

```powershell
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Screen]::AllScreens | % { "{0} primary={1} {2}" -f $_.DeviceName,$_.Primary,$_.Bounds }
Get-CimInstance Win32_VideoController | Select Name, DriverVersion, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate, CurrentBitsPerPixel
Get-CimInstance -Namespace root\wmi WmiMonitorID | % { (($_.ManufacturerName -ne 0 | % {[char]$_}) -join '') + ' ' + (($_.UserFriendlyName -ne 0 | % {[char]$_}) -join '') }
# Scale per monitor: DpiValue 0 = recommended; negative = smaller, positive = steps above recommended
Get-ChildItem "HKCU:\Control Panel\Desktop\PerMonitorSettings" -EA SilentlyContinue | % { "$($_.PSChildName) DpiValue=$((Get-ItemProperty $_.PSPath).DpiValue)" }
(Get-ItemProperty "HKCU:\Software\Microsoft\Accessibility" -EA SilentlyContinue).TextScaleFactor   # empty = 100%
$p = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"; $p | Select AppsUseLightTheme, SystemUsesLightTheme, EnableTransparency, ColorPrevalence
# Night light: byte 18 = 0x15 means on, 0x13 means off
$nl = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current\default`$windows.data.bluelightreduction.bluelightreductionstate\windows.data.bluelightreduction.bluelightreductionstate").Data; '{0:X2}' -f $nl[18]
Get-ItemProperty "HKCU:\Control Panel\Desktop" | Select FontSmoothing, FontSmoothingType
```

Note: the refresh rate in `Win32_VideoController` can be blank or stale. If so, check it in
Settings > System > Display > Advanced display.

## Step 2: change what she agrees to

- **Refresh rate (the most likely difference):** open `start ms-settings:display-advanced` and pick the
  highest rate listed. 192 Hz only applies if her monitor supports it. If it's a different model, use
  its max. If the high rate isn't listed:
  - check that the cable is **DisplayPort** (or a high-speed HDMI) and plugged into the **GPU**, not the motherboard
  - check that the NVIDIA driver is installed
  - in NVIDIA Control Panel > Change resolution, pick the higher rate
- **Resolution / scale / night light / HDR:** use `start ms-settings:display`. Guide her through it rather
  than editing the registry, because Windows only applies these properly through Settings.
- **Dark mode + transparency off:** set them in the registry (takes effect right away), or use `start ms-settings:colors`:
  ```powershell
  $k = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
  Set-ItemProperty $k AppsUseLightTheme 0; Set-ItemProperty $k SystemUsesLightTheme 0; Set-ItemProperty $k EnableTransparency 0
  ```
- **ClearType:** run `cttune` if text looks blurry.
- **Brightness, contrast, color mode:** these are set on the monitor's own buttons (OSD), not in Windows.
  Charlie's values weren't recorded. If the image still looks different after the steps above, ask
  Charlie to read his monitor's OSD values and compare.

Finish by showing the table again with the new values.
