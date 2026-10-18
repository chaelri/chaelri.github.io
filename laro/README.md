# Laro

The offline party games in one place. Open **Laro** from Spotlight (`~/Applications/Laro.app`), double-click **Laro.command** on the Desktop, or run `laro/play`: a page opens on the Mac with a card per game. Pick one and its board opens; phones join by scanning the QR there. No internet needed, only the same WiFi (or a phone hotspot).

- `rambulan/`: island brawl royale, 2-4 players (port 8830).
- `karera/`: kart racing, up to 3 players + CPU racers (port 8810). Also holds three.js and the critter models that Rambulan borrows.

`laro/play rambulan` or `laro/play karera` skips the picker. The picker (`serve.py`, port 8840) only listens on localhost because it starts processes; Ctrl-C there stops the games it started.
