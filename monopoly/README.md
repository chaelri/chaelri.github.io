# Monopoly Night

Offline Monopoly for 2 to 8 players. The Mac is the board and the bank; each phone is that player's wallet.

```
python3 server.py          # resumes the saved game, or opens a fresh lobby
python3 server.py --new    # throw the saved game away
```

The board opens on the Mac with a QR code. Everyone scans it, types a name and picks a colour, then the host clicks **Start game**.

## Offline setup

- All devices on the **same WiFi**. The router doesn't need working internet: game traffic stays inside the house.
- No router: turn on one phone's Personal Hotspot and join the Mac and the other phones to it (iPhone hotspots get crowded past about 5 devices).
- Nothing loads from the internet: no CDN, no fonts, and the QR library is bundled.

## What the Mac does automatically

- Rent (houses, hotels, full colour sets, train lines, utilities), taxes, ₱200 for passing GO
- Chance and Community Chest, including "pay / collect from every player" and repairs
- Jail: doubles, ₱50 bail, Get Out of Jail Free cards, the forced fine on the third try
- Auctions when someone passes on a property (all phones bid, countdown on the board)
- Debts: if you can't pay, the game waits while you sell houses or mortgage, then pays the moment you have enough. Bankruptcy hands everything to the creditor.
- Optional house rule: Free Parking jackpot

Phones handle: roll, buy or auction, bid, build/sell houses (even-building rule), mortgage, trade offers, end turn.

## Files

- `game.py`: the rules engine (pure, no I/O)
- `server.py`: stdlib HTTP server, Server-Sent Events push, autosave to `saves/current.json`
- `board.html`: Mac display. `phone.html`: wallet. `common.js`: shared helpers.
- `_selftest.py`: plays random bot games and checks money and house invariants after every action (`python3 _selftest.py 500`)
