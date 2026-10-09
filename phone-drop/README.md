# phone-drop

The Mac as a receiver. Scan the QR, pick files on the iPhone, and they land in `~/Downloads/From iPhone`. It keeps receiving until you stop it.

```
python3 receive.py                       # opens the QR page
python3 receive.py --out ~/Desktop/drop  # somewhere else
```

Stdlib Python only. Nothing loads from the internet (`qrcode.js` is vendored), so it works fully offline.

## Getting the phone and Mac onto one link

The phone has to reach the Mac over *some* local link:

- **No router, no internet:** turn on the iPhone's **Personal Hotspot** (it works with mobile data off) and join it from the Mac's WiFi menu. The QR page notices and switches to the hotspot address on its own.
- Or both devices on the same WiFi.

When more than one network is up, the QR page shows a pill for each.

## Phone side

Camera → scan → **Choose files** → pick photos, videos or files (multi-select). Each file shows its own progress bar, and there's an overall bar with an ETA. Failed sends have a **Retry failed** button. Keep the page open while it sends; it holds a screen wake lock so the phone doesn't sleep mid-upload.

## Notes

- Uploads stream to disk in 1 MB chunks as `.part` files. A file is renamed into place only once complete, so a dropped connection never leaves a half-file.
- Name clashes get `(2)` and nothing is ever overwritten. Names are flattened, so `../` can't escape the folder.
- Every run makes a new random token in the QR. An old QR gets told to rescan.
- The QR page and its API only answer `localhost`, checked on both the client IP and the `Host` header.
