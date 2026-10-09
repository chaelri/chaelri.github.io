# phone-drop

Send files from the iPhone to this Mac from any network. Nothing has to share WiFi.

iPhone → **iCloud Drive / To Mac** → (LaunchAgent) → `~/Downloads/From iPhone` + notification + Finder reveal. The inbox empties itself.

## Mac

```
./install.sh            # build + start (no sudo)
./install.sh uninstall
```

Log: `~/Library/Logs/phone-drop.log`

## iPhone: one-tap "Send to Mac" in the share sheet

Shortcuts app → **+** →
1. Tap the (i) / settings → turn on **Show in Share Sheet**. Receive: *Any*.
2. Add action **Save File**. Set it to *Shortcut Input*, Folder → **iCloud Drive › To Mac**. Turn **Ask Where to Save** off.
3. Name it **Send to Mac**.

Then: Share → **Send to Mac**. That works for photos, videos, PDFs and files from any app.

No shortcut? Share → **Save to Files** → iCloud Drive › To Mac does the same thing.

## Notes

- Photos shared from the Photos app arrive as HEIC/MOV unless you set Options → "Most Compatible" in the share sheet.
- Big videos take as long as iCloud takes to upload them, then download them. The watcher waits up to 10 min for a placeholder to materialise.
- Files are moved with `(2)` suffixes on name clashes and are never overwritten.
