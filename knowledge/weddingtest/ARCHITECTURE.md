# Wedding Invitation — Architecture

## Page Load Sequence

### DOM Ready (`document.addEventListener("DOMContentLoaded")`)

**Overlay Phase (2.5–4.5s):**
1. Body overflow hidden
2. Monogram (#intro-monogram) opacity 0→1 (500ms delay)
3. Monogram gets `monogram-entrance` class (~2.5s animation)
4. After 2.5s: `monogram-float` class (gentle floating)
5. At 3s:
   - Monogram scales to 0.7, blur added, opacity → 0.4
   - Floral elements (#fl-5 through #fl-10) get `floral-center` class
   - 2s later: `floral-alive` class triggers breathing
6. At 4.5s: Welcome modal (#welcomeModal) opacity 0→1
7. User clicks "CONTINUE" (#closeModalBtn):
   - Body overflow restored
   - Overlay pointer-events disabled
   - Flowers fade out
   - Overlay fades 3s
   - Scroll forced to top
   - `startGlobalPetalFall()` begins (continuous drift)

**Post-overlay:**
- bgMusic primed (muted play → pause)
- All modals ready
- Page fully interactive

## Core Sections (Top → Bottom)

### Hero Section
- Left: hero image (mobile: top), hero-portrait.jpg
- Right: names, date, countdown (#countdown-container with #days, #hours, #minutes, #seconds), RSVP CTA, "Our Story" hint

**Countdown:** Targets July 2, 2026, 10:00 AM. Updates every 1000ms via `setInterval`. Format: `${days}d ${hrs}h ${mins}m ${secs}s`. When dist < 0: "Today is the Day!"

### Story Section (#story)
- **Trivia Notes:** 5 interactive `.trivia-note` cards, rotated ±2-3°. On click: `.is-active` class → reveal answer + confetti sparkle
- **Story Photos/Videos:** `.story-img` with `data-title` & `data-description`. On click: opens attireModal lightbox
- **Audio Player:** `#courtshipAudio` (courtship.m4a) with #audioToggle. On play: bgMusic pauses, spinning flower rotates, progress ring updates, transcription subtitles in #audioSubtitles fade

### Forever Section (#forever-section)
- Hidden until ~50% in viewport
- One-time celebration confetti burst on entry
- Continuous soft drift while visible (left/right side cannons)
- Resets on leaving viewport
- Uses `IntersectionObserver` with `threshold: 0.5`

### Entourage Section (#entourage)
- Names & photos, role badges (Maid of Honor, Best Man, etc.)
- Integrated with guestlistmanager data

### Attire Section (#attire)
- Cards per role (Best Man, Maid of Honor, etc.) with `data-role` & `data-description`
- On click: scrollYMemory captured, body fixed + `modal-active` class, attireModal opens
- Thumbnails scroll horizontally; swipe left/right (touchstart/touchend)

**Gallery Engine:**
- `attireData` object maps role → image array
- `currentImagesArray` & `currentImgIndex` track state
- `updateGalleryView(index)` updates main + active thumbnail
- `closeAttireModal()` restores scroll + removes `modal-active`

### Schedule Section (#schedule)
- Timeline: 09:30 AM Arrival, 10:00 AM Ceremony, 11:30 AM Cocktails, 12:30 PM Reception, 03:30 PM Send-Off
- Add to Calendar (Google, Apple)

### Gifting Section (#gifting)
- Left (2/3): Wedding Notes (8 bullets: unplugged, dress code, arrival, adults-only, RSVP limit, deadline, respect space, social media)
- Right (1/3): QR cards (BPI, GCash, Maribank). On click: qrLightbox enlarges + `downloadQR` button

### Q&A Section (#qa)
- FAQ accordion (`.faq-item`)
- Trigger: `.faq-trigger` → nextElementSibling opens/closes
- Icon rotates 180° on expand
- Only one open at a time

### RSVP Section (#rsvp) — CRITICAL

**Form Phase:**
```html
<form id="rsvpForm">
  <input id="guestName" type="text" />
  <div id="autocomplete-list" class="hidden"></div>
  <select id="attendance">
    <option value="yes">Joyfully Accept</option>
    <option value="no">Regretfully Decline</option>
  </select>
  <button type="submit">SUBMIT RSVP</button>
</form>
```

**Autocomplete:**
- `nameInput` fires `addEventListener("input")` on keystroke
- Filters `masterGuestList` (case-insensitive substring)
- Renders `.suggestion-item` divs in `listContainer`
- Matching substring bolded
- Arrow keys (↑↓) navigate; Enter selects
- Click selects + focuses `#attendance`

**Form Submission:**
1. Get typed name & attendance
2. Validate against `masterGuestList`
3. Invalid: shake input, show error
4. Valid: personalize response (`#res-name`, `#res-status`, `#res-note`); push to Firebase `rsvps`; send Discord webhook; hide form, show `#successMsg`; inject wax seal; confetti burst; scroll to RSVP

**Success Phase (#successMsg):**
- Personalized thank-you
- Wax seal (monogram.png)
- Optional `#post-rsvp-container` with `#secondaryNote` textarea
- Submit note button (`#btnSubmitNote`): pushes to Firebase `wishes` + second webhook; shows `#note-thank-you`

### Footer & Global Elements

**Navigation (#main-nav):** sticky, monogram + links (Story, Entourage, Attire, Schedule, More dropdown, RSVP). Hides on scroll down, shows on scroll up.

**Music Toggle (#musicToggle):** fixed bottom-left z-100. `#bgMusic` (6.4 MB MP3, looped, volume 0.4). On `courtshipAudio.play`: pauses; on pause/end: resumes. Same for all `<video>` elements.

**Scroll Progress Bar (#scroll-progress-bar):** fixed top, h-3px, width = scroll percent.

**Scroll Flower Overlay (#scroll-flower-overlay):** fixed flowers around edges, animated.

## Modal Patterns

### Attire/Story Lightbox
```js
// Open
scrollYMemory = window.scrollY;
document.body.style.top = `-${scrollYMemory}px`;
document.body.classList.add("modal-active");
modal.style.display = "flex";

// Close
document.body.classList.remove("modal-active");
document.body.style.top = "";
window.scrollTo({ top: scrollYMemory, behavior: "instant" });
```

### QR Lightbox
```js
trigger.addEventListener("click", () => {
  lightbox.style.display = "flex";
  updateQRImage(src, bank);
});

window.closeQRModal = () => {
  lightbox.style.opacity = "0";
  setTimeout(() => { lightbox.style.display = "none"; }, 300);
};
```

## Animation Triggers

**Floral Breathing:** `.floral-alive` → `bloomBreathe` 10s infinite, uses `--r` (rotation) and `--t` (delay) CSS vars.

**Monogram Shimmer:** `.monogram-shimmer` (gradual scale + opacity).

**Confetti Variants:**
- Petal Fall: continuous drift (circles, gravity 0.4)
- RSVP Burst: 300 particles, high spread, center origin
- Forever Section: left/right side bursts, lower gravity
- Trivia Sparkle: 20 particles at note position

**Scroll-Driven:** IntersectionObserver reveals elements with `.reveal-wrapper`. Progress bar updates on scroll.
