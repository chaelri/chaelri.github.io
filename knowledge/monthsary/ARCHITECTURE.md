# 4th Monthsary — Architecture Deep Dive

## Firebase Setup

**Project:** `test-database-55379` (asia-southeast1 region)

**Config** (hardcoded in `script.js` lines 21–31):
- `databaseURL`: `https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app`

**Module imports** (Firebase SDK v11.0.2, lines 1–18):
- `initializeApp`, `getAuth`, `GoogleAuthProvider`, `signInWithPopup`, `signOut`, `onAuthStateChanged`
- `getDatabase`, `ref`, `onValue`, `set`, `get`, `push`, `remove`

---

## Login Gate Pattern

**Flow:**
```
Page Load
  ↓
onAuthStateChanged() listener (line 570)
  ├─ User exists & email in allowedEmails
  │  └─→ updateUI(email) + updateOnlineStatus(email, true)
  │      └─→ Hide #login-container, show #protected-content
  └─ No user or invalid email
     └─→ Keep #login-container visible
```

**Sign-In Initiation** (event on `#googleSignIn`, lines 500–527):
1. Disable button, clear error text
2. Call `signInWithPopup(auth, GoogleAuthProvider)`
3. Check `result.user.email` against `allowedEmails`
4. If invalid: `firebaseSignOut(auth)` + status text *"This page is just for Charlie & Karla 💕"*
5. If valid: store email in `localStorage`, derive `formattedUser`, hide login, show content, track online

**Logout** (`#sign-out-button`, lines 537–554): `firebaseSignOut(auth)` → restore login-container, remove from `onlineUsers/`.

---

## Hidden Content Reveal Pattern

- **Login card:** `#login-container` (always visible until auth)
- **Protected content:** `#protected-content` (initially `style="display: none"`, line 52 in HTML)

Gate is purely in Firebase auth state + email whitelist. Inspecting HTML shows the structure but content only loads after real auth.

---

## Date-Locking: NOT YET IMPLEMENTED

**Status:** Date-locking to Nov 11 is **not currently implemented** in code despite the project's name suggesting it should.

**Evidence:**
- No `new Date()` checks for month/day in `script.js`
- No conditional based on date for `#protected-content`
- Title says "Happy 4th monthsary, love!" — suggests Nov 11 is the intended unlock date

**If implementing later:** Add before `updateUI()`:
```js
const today = new Date();
if (today.getMonth() !== 10 || today.getDate() !== 11) {
  loginContainer.innerHTML = "<h1>Locked until Nov 11 ❤️</h1>";
  return;
}
```

---

## Audio Player Wiring

**HTML elements** (lines 110–121 in index.html): Four `<audio>` tags with `preload="auto"`.

**Cached refs** (script.js 95–98): `apaSound`, `ilySound`, `whoAmIToYouSound`, `hmmmpSound`.

**Play logic** (`playRandomSound(count)`, lines 164–187):
```js
if (count % 100 === 0 && count !== 0) {
  ilySound.play();  // Every 100 clicks
  return;
}
const r = Math.random() * 100;
if (r < 55) apaSound.play();
else if (r < 80) hmmmpSound.play();
else if (r < 95) whoAmIToYouSound.play();
else ilySound.play();
```

**Initialization** (lines 342–358): On first user click, all 4 audio elements are preloaded (play+pause to warm up browser, prevents CORS/autoplay issues on mobile).

**Trigger:** Called inside `increment()` (line 216) when clickable avatar is clicked.

---

## Image Display

**Clickable Avatar** (`Chalee1.png`, lines 63–68 in HTML): 300×300 (250 on mobile). On hover: scale 1.1. On click: `heartBeat` animation (1s).

**Click Handler** (lines 295–300):
```js
clickableImage.addEventListener("click", (event) => {
  increment();
  createParticles(event.clientX + scrollX, event.clientY + scrollY);  // 15 hearts
});
```

**Particles** (`createParticles()`, lines 368–393): 15 sprites with `background-image: url("heart.png")`, random angle + velocity, fade out + remove after 1s.

---

## Real-Time Chat

**Firebase structure:** `/chat/<msgId>: { user, message, timestamp }`

**Send** (lines 414–426): `push(chatRef, { user: formattedUser, message, timestamp: ISOString })`.

**Render** (lines 434–459): `onValue` listener sorts by timestamp, builds chat bubbles. Display name: "Chalee" or "Karlyy" (line 448). Bubble class: `sent-message` if own user, `received-message` otherwise.

**Typing indicator** (Firebase ref `/typing`): On input, `set(ref(db, "typing/"+formattedUser), text)`. Listener (467–475) shows "Charlie is typing: '...'". Cleared on send.

---

## Online Status Tracking

**Structure:** `/onlineUsers/<emailKey>: { online: bool, timestamp }`

**Persistence:**
1. On auth: `updateOnlineStatus(email, true)` (lines 521, 574)
2. On logout: `remove(ref)` (line 546)
3. On window unload: set `online: false` (627–634)
4. On tab hidden/visible: toggle (637–645)

**Display** (`trackOnlineStatus()`, 579–607): Shows other user's `🟢` or `🔴 (Last seen X min ago)`.

---

## Counter & Click History

**Counter** (Firebase `/counter`): Single int, globally shared. Real-time listener (308–324) triggers animation + sound + notification.

**Click history** (Firebase `/clickHistory`): Timestamps pushed (line 221), trimmed to last 5 (240–245). UI ticks every 1s (332–336) showing relative time ("2 sec ago").

---

## Permissions & Mobile

- **Notifications:** `Notification.requestPermission()` (361–365). Fires only when tab hidden.
- **Vibration:** `navigator.vibrate([100, 50, 200])` on click (224–226, 315–316).
- **Cache control:** `no-cache, no-store, must-revalidate` meta tags ensure fresh auth state on every load.
