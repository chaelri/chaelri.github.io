# monopoly/ — SUMMARY

Offline Monopoly for game nights (built 2026-10-09). Mac = board + bank, phones = wallets. Manila edition names, classic prices.

- **Run:** `python3 monopoly/server.py` (port 8800; `--new` resets, `--save` for tests). Board at `http://localhost:8800/`, phones at `http://<lan-ip>:8800/p` via the QR.
- **Why this shape:** the house internet is weak, so nothing touches the internet. A LAN router works without upstream; a phone hotspot is the fallback.
- **Engine is server-authoritative** (`game.py`, pure Python, no I/O). Phones send intents; all money moves happen in the engine. Debts block the game (`stage == "debt"`) and auto-settle via `settle()` whenever the debtor raises cash.
- **Transport:** stdlib `ThreadingHTTPServer`, SSE `/events` pushes the whole public state on every change (`commit()`), POST `/api/act` with the player's secret. Host routes (`/`, `/api/host`, `/api/net`) are localhost-only (client IP + Host header).
- **Persistence:** every change is written to `saves/current.json` (gitignored); restarting resumes. Auction deadline is reset on resume.
- **`spendable()`** = cash minus your own winning auction bid. Found by the self-test: a top bidder could build mid-auction and go negative at the hammer.
- **Self-test:** `python3 _selftest.py N` plays N bot games (1,500 pass) with invariants: no negative cash, house/hotel supply = 32/12, even building, 16 cards per deck counting held GOOJF cards.
- Logs use a plain `P` for pesos; `M.money()` in `common.js` renders it as ₱.
