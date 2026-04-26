# Wedding Invitation — Key Files

## index.html (2,812 lines)

### Head (1–22)
- Meta, viewport, "Charlie & Karla | July 02, 2026" title
- Tailwind CDN, Google Fonts (Playfair Display, Inter, Dancing Script, Material Icons)
- Favicon, link to style.css

### Body Sections

**Scroll Progress Bar (25–34):** `#scroll-progress-container > #scroll-progress-bar` (fixed, top 0, h-3px, width updates via JS).

**Intro Overlay (35–137):** `#floral-overlay` (z-200) → `#intro-monogram` with `.monogram-entrance` class → 6 `.floral-element` (`#fl-5` through `#fl-10`) with `--r` and `--t` style vars → `#welcomeModal` with "CONTINUE" button (`#closeModalBtn`).

**Navigation (139–268):** `#main-nav` fixed, monogram + names left, links right (Story, Entourage, Attire, Schedule, More dropdown, RSVP). More menu (#more-menu) toggles via `#more-trigger`.

**Hero Section (270–393):** Left image (hero-portrait.jpg), right names + date + countdown (#countdown-container with #days, #hours, #minutes, #seconds) + RSVP CTA.

**Story Section (395–870):** 5 trivia notes (Q&A reveal on tap), story content (photos with `.story-img` + videos), audio player with `#courtshipAudio` + `#audioToggle` + transcription subtitles.

**Entourage Section (922–1268):** Cards with photos + role labels.

**Attire Section (1269–1688):** `.attire-album-card` cards with `data-role` & `data-description` → opens `#attireModal` with `#mainAttireImg` + `#attireThumbs` (horizontal scroll).

**Schedule Section (1744–1912):** Timeline + Add to Calendar links.

**Gifting Section (1916–2129):** Left = wedding notes (8 bullets), right = QR cards (BPI/GCash/Maribank) → `#qrLightbox`.

**Q&A Section (2177–2580):** `.faq-item` accordion with `.faq-trigger`.

**RSVP Section (2581–2723):** `#rsvpForm` (`#guestName` autocomplete + `#attendance` radio) → `#successMsg` (with wax seal + `#post-rsvp-container` for optional message).

**Global Elements:** `#scroll-flower-overlay`, `#bgMusic` (audio loop), `#musicToggle`, footer.

## script.js (1,416 lines)

### Sections by line range

**1–24: Firebase Init**
- Imports, `firebaseConfig`, `initializeApp`, `getDatabase`

**25–30: Globals**
- `masterGuestList`, `scrollYMemory`, `currentImagesArray`, `currentImgIndex`, `touchStartX`, `currentGuestName`

**33–204: Intro & Overlay**
- `DOMContentLoaded` handler with timed reveal sequence
- `closeBtn.addEventListener("click")` → fades overlay, primes videos, calls `startGlobalPetalFall()`
- `startGlobalPetalFall()` — continuous random petals via `confetti()` + recursive `frame()`

**151–174: Scroll Progress Bar**
- `window.addEventListener("scroll", ...)` updates `#scroll-progress-bar` width

**206–368: Attire Gallery**
- `attireData = { "Best Man": [...], ... }`
- `.attire-album-card` click → save scrollY, set modal content, lock body, show modal
- `window.closeAttireModal()` — restore scroll + remove `modal-active`
- `window.updateGalleryView(index)` — change main image + thumbnail
- Touch swipe (touchstart/touchend) for navigation

**371–437: Navigation & Menu**
- More menu toggle with click + outside dismiss
- FAQ accordion (single open at a time)

**441–718: Firebase & RSVP**
- Load guest list: `get(child(ref(db), "guestList"))`
- Typeahead autocomplete on `#guestName` (input listener + arrow keys + Enter)
- `rsvpForm.onsubmit` — validate name → personalize response → `push(ref(db, "rsvps"))` → Discord webhook → UI transition + confetti
- `#btnSubmitNote.click` — push to `wishes` + second webhook

**721–730: Countdown Timer**
- `setInterval(1000, ...)` — calculates days/hours/minutes/seconds to July 2, 2026 10:00 AM

**734–827: Smooth Scroll & Audio**
- Anchor scroll for nav links (offset -80px for sticky nav)
- Audio player wiring (play/pause toggle + transcription + spinning flower + progress ring)

**835–862: QR Lightbox**
- `.qr-trigger` click → opens lightbox
- `window.closeQRModal()` — fade out

**1034–1132: Forever Section**
- `startSpringDrift()` — left/right side confetti while visible
- `triggerCelebration()` — multi-burst confetti
- `IntersectionObserver` with threshold 0.5 → set `window.isForeverVisible`

**1134–1185: Music Control**
- `bgMusic` toggle, smart pause/resume on courtshipAudio + videos

**1187–1215: Trivia Notes**
- Click handler → toggle `.is-active` + confetti at note position

**1217–1239: Dramatic Countdown**
- Updates `#days`, `#hours`, `#minutes`, `#seconds` every second; "Today is the Day!" if past

**1241–1260: Active Nav Highlighting**
- Scroll listener marks active link in nav

**1262–1294: Story Lightbox**
- `.story-img` click → opens `#attireModal` (reused) with image

**1296+: Reveal Observer**
- IntersectionObserver for scroll-driven reveals

## style.css (1,329 lines)

**CSS Variables:** `--sage: #7b8a5b`, `--cream: #faf9f6`

**Global:** smooth scroll, paper texture bg, Inter font + Playfair Display serif class

**Floral Animations:** `.floral-element` (transitions), `.floral-center` (opacity 1), `.floral-alive` (`bloomBreathe` 10s infinite alternate, --r and --t vars)

**Ampersand:** `.ampersand-animate` (`springColorCycle` 8s infinite, color cycle through pink/sage/amber/rose)

**Shake:** `.shake` (animation 0.2s ease-in-out, alternating ±6px translateX)

**Modal:** `.modal-active` (fixed body, overflow hidden), `#attireModal` (z-200, opacity transition)

**Audio:** `.animate-spin-slow` (8s linear infinite), `#audioSubtitles` (opacity transition + text-shadow), `#audioProgressRing` (stroke-dashoffset 0.1s linear)

**QR Cards:** `.qr-card` (white bg, hover lifts + sage border + shadow)

**Navigation:** `nav` (max-width 100vw, no horizontal scrollbar), `nav a:active` (scale 0.9)

## guestlistmanager/

**dashboard.html (17 KB):** admin interface for managing guest list (search, filter, edit, photo upload)

**dashboard.js (36 KB):** `init()`, `render()`, `ENTOURAGE_ROLES`, `MARCHING_ORDER`, CRUD operations, `initVisitorLogs()`, `updateVenueWeather()`

**dashboard.css (4 KB):** responsive table layout, filter chips, photo upload preview
