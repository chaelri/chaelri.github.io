# Pray — Architecture

## Prayer Submission Pipeline

**Initiation:**
```
User clicks "EXIT PRAYER" (#exitPrayerBtn)
  ↓ exitPrayerBtn.onclick (line 463)
Save to localStorage: {timestamp, type, name}
  ↓
runFireTransition(callback)
  ↓
If ACTS session: increment Firebase /streak
  ↓
Show landing or requests modal
```

## Current Flow (Gemini NOT Yet Wired)

1. **Loading Overlay Shown**
   - `requestSendingOverlay.classList.remove("hidden")` in `addRequestBtn.onclick` (line 491)
   - Breathing pray.png + "Lifting up..." text (pulsing blue, font-black)

2. **Upload & Compress** (if image)
   - `compressImage()` resizes max 1024px, quality 0.6 JPEG
   - Returns Blob → uploaded to `prayers/${timestamp}.jpg` Firebase Storage
   - Download URL stored in request

3. **Database Write**
   - `push(ref(db, "requests"), {...})` writes to RTDB
   - Fields: `text`, `imageUrl`, `isAnswered: false`, `count: 0`, `createdAt`, `includeInActs: true`, `checklist`
   - Triggers `loadData()` listener → `activeRequests` UI updates

4. **[MISSING] Gemini Proxy POST**
   - Expected URL: `https://gemini-proxy-668755364170.asia-southeast1.run.app`
   - Expected payload:
     ```json
     { "prayer_text": "...", "acts_phase": "Supplication", "image_url": "...", "checklist": [], "timestamp": ... }
     ```
   - Expected response: `{ "intercession": "...", "confidence": 0.95 }`
   - **Not implemented:** No fetch call after line 516

5. **Fire Transition Trigger** (on completion)
   - `runFireTransition(callback)` in `exitPrayerBtn.onclick`
   - Callback after 600ms (mid-animation)

## Gemini Integration (Architectural Intent)

**Integration point** (after line 504, before line 513):
```js
// Pseudocode
const geminiResp = await fetch(GEMINI_PROXY, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({prayer_text, image_url, checklist})
});
const intercession = await geminiResp.json();
```

## Loading State

**Visual (`#request-sending-overlay`):**
- Z-index: 150 (above everything)
- Backdrop: `bg-[#0f172a]/95 backdrop-blur-xl`
- `<img src="assets/pray.png" class="animate-loader-breathe">` — breathing animation
- `<p class="animate-pulse">Lifting up...</p>` — pulsing text

**Animation:** `.animate-loader-breathe` (custom keyframe, scales 1→1.1, blue glow, 2s infinite ease-in-out).

**Lifecycle:**
- Show: `classList.remove("hidden")` (line 494)
- Hide: `classList.add("hidden")` (line 520) in finally block
- Duration: 600–1400ms (Gemini call + DB sync)

## Fire Animation Finish

**`runFireTransition(callback)` (line 359–384):**

1. DOM prep: `#fire-transition` cleared, opacity → 1
2. Particle generation (15 loops):
   - Element: `<div class="fire-particle animate-fire-blast">`
   - CSS vars per particle:
     - `--tx`: `cos(angle) × random(50–130vw)`
     - `--ty`: `sin(angle) × random(50–130vh)`
     - `--s`: random(2–6) — scale
     - `--r`: random(0–360deg) — rotation
     - `animationDelay`: random(0–0.3s)
   - Size: random(100–250px)
3. Animation (`@keyframes fireBlast`, line 371–389):
   - 0%: centered, opacity 0, scale(0)
   - 15%: opacity 1
   - 100%: translated, scaled, rotated, opacity 0
   - Easing: `cubic-bezier(0.1, 0, 0.3, 1)` (fast start, decel)
   - Duration: 1.2s
4. Lifecycle:
   - `setTimeout(cb, 600)` — callback at 600ms
   - `setTimeout(() => fireTransition.style.opacity = "0", 1400)` — fade out
   - `setTimeout(() => fireTransition.innerHTML = "", 1700)` — cleanup

## PWA & Offline

**Manifest:**
- `display: "standalone"` (fullscreen)
- `theme_color: "#0f172a"`, `background_color: "#0f172a"` (dark navy)
- Icons: 192px + 512px maskable

**Service Worker:** Not present in current code; offline support not yet implemented.

**Firebase Real-time:**
- `onValue(ref(db, "streak"), ...)` — streak listener
- `onValue(ref(db, "requests"), ...)` — request list listener

## Error Handling

**Request upload (line 491):**
```js
try { ... }
catch (e) { alert("Failed to send."); }
finally { requestSendingOverlay.classList.add("hidden"); }
```

**Image compression (line 96):** Promise rejects on image load error → caught by try-catch.

**Firebase errors:** No explicit handling (Firebase SDK logs).

**Gemini call:** Not implemented; gap noted.

## Data Schema

**Firebase `/requests/{id}`:**
```js
{
  text, imageUrl?, isAnswered, count, createdAt,
  includeInActs, checklist: string[]
}
```

**Firebase `/streak`:** number (incremented per ACTS session).

**localStorage `last_prayer_record`:**
```js
{ timestamp, type: "acts" | "single", name? }
```
