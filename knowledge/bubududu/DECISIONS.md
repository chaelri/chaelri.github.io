# Bubududu — Decisions

## Why No Game Engine (Phaser/Babylon)

- Lightweight (~18 KB JS) for casual game scope
- HTML5 Canvas 2D rendering sufficient
- No WebGL needed

**Trade-off:** No physics library, manual collision (AABB).

## Why HTML5 Canvas (Not WebGL)

- 2D pixel rendering covers needs
- Browser-native (no shader complexity)
- Simpler debugging

## Why Fixed Per-Frame Physics (dt unused)

**Observation:** `dt = (timestamp - lastTime) / 16.666` calculated but NOT applied to physics.

**Impact:** Game runs at fixed 60fps; physics tied to frame rate.

**Why acceptable:**
- Casual game, not competitive
- Most modern devices hit 60fps stable
- Simpler logic (no time-scaling)

**Trade-off:** Low-end mobile devices may struggle (no frame-rate capping).

## Why Personal Romantic Theme

- Custom asset (Bubu = Charlie, Dudu = Karla?)
- Dudu ending shows hardcoded Filipino/English message to "Karla"
- No restart in `duduEnding` state (one-time meaningful event)

## Why No Audio

- No sound files in repo
- Possibly intentional (silent-friendly contexts)
- Or: deferred for later iteration

## Why No Frame-Rate Capping

- Browser handles `requestAnimationFrame` (typically 60fps)
- No throttling for slower devices
- May cause issues on very low-end hardware

## Why duduEnding No Restart

- One-time meaningful celebration moment
- User can refresh page to play again
- Forces "ending" feel (not endless)

**Trade-off:** Not user-friendly if user wants to retry.

## Game Constants Rationale

| Name | Value | Why |
|------|-------|-----|
| CANVAS_W, CANVAS_H | 400, 700 | Portrait mode, mobile-first |
| GRAVITY | 0.75 | Light enough for clear jump arc |
| JUMP_FORCE | -15 | Tunable for "feel" |
| SCROLL_GROUND | 3 | Fast enough to feel kinetic |
| SCROLL_BG | 1.2 | Slow parallax (background = farther) |
| MIN/MAX_SPAWN | 80/150 | Avoids overcrowding obstacles |

## Why Hitbox Reduced ~20px

```js
const bHit = { x: bubu.x+10, y: bubu.y+10, w:40, h:60 };
```

**Reduces "tight corner" deaths** — feels fairer to player.

**Trade-off:** Hits look "off" sometimes (hitbox smaller than sprite).

## Why Score = 0.15/Frame + 100 per Heart

- Continuous time bonus (rewards survival)
- Discrete heart bonus (rewards collection)
- Progress feels constant + spiky

## Why 75% Chance Dudu After Score 1000

- Not guaranteed (replayability)
- Eventual win (most runs >1000 succeed)
- Some randomness (encourages multiple plays)

## Why Hardcoded Romantic Message

- Personal app for couple
- One specific recipient (Karla)
- Couples find this charming

**Trade-off:** Not reusable for other relationships.

## Known Limitations

- `dt` unused in physics
- duduEnding no restart
- No audio
- No frame-rate capping
- Mobile performance may suffer on low-end
