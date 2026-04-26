# Wedding100 — 100-Day Countdown to Wedding

**100-day kettlebell workout challenge leading up to July 2, 2026 wedding.** Dual-user (Charlie + Karla) with Firebase RTDB sync.

**🚨 NOT the actual invitation** — that's `weddingtest/`. This is a **fitness countdown** with workouts and step tracking.

**Last commit:** September 2024 (parked).

## File Structure
```
wedding100/
├── index.html          (~3800 lines) — Complete single-page app
├── figure3d.js         (~990 lines) — Three.js mannequin for exercises
├── manifest.json       — PWA
├── icon.svg
└── strap1-4.gif        — Karla's strap band routine videos
```

## Core Constants
- **WEDDING_DATE:** `'2026-07-02'`
- **START_DATE:** `'2026-03-24'`
- **firebaseConfig:** `test-database-55379` (asia-southeast1)

## Features
1. **100-day countdown** with progress ring
2. **Dual-user** (Charlie = groom, Karla = bride) with separate progress
3. **5-minute kettlebell workouts** — 5 routines + 1 recovery flow
4. **Steps tracking** — daily input, weekly averages, milestone confetti (5K/10K/15K/20K)
5. **Calorie tracking** per exercise
6. **3D exercise viewer** — Three.js mannequin with 20+ poses
7. **Confetti celebrations** — canvas-confetti v1.6.0
8. **Firebase RTDB sync** — Real-time across devices

## State (Lines 1316–1361)
- **Local storage:** `wedding100_charlie` / `wedding100_karla`
- **Firebase:** `wedding100/users/charlie` / `wedding100/users/karla`
- **Shape:** `{completed, steps, exerciseChecks, bonusRounds, startDate}`

## Three.js Mannequin (figure3d.js)
- **Class:** `Mannequin(scene)` — lofted-mesh human figure
- **Build:** Connecting elliptical cross-sections at different Y positions (~MRI slices)
- **Constants:** Hip Y (0.82), shoulder width (0.17), upper arm length (0.26)
- **Pose convention:** Spine X (forward/back lean), Y (twist), Z (side lean) — negate in Three.js. Arms X (elevation), Z (abduction). Legs X (hip flexion), Z (abduction), knee (bend, positive = natural)

## Exercise Viewer (Lazy Loading)
```js
// Max 3 simultaneous WebGL contexts
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !active.has(el)) {
      evictIfNeeded();  // Dispose viewers scrolled out
      const v = new Viewer(el, name);
      active.set(el, v);
    }
  });
}, { rootMargin: '100px 0px', threshold: 0.1 });
```

## Confetti Triggers
- **Step milestones (5K, 10K, 15K, 20K):** SFX + small confetti + speak motivational message
- **Day completion:** `fireConfetti()` (full burst + side cannons + shower) + speak random phrase + 3.5s celebration overlay
- **`fireSmallConfetti()`:** 25 particles, 40° spread, 0.8× scalar

## Countdown Calculation
```js
function getDaysUntilWedding() {
  return Math.max(0, Math.ceil(
    (new Date('2026-07-02T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 864e5
  ));
}
```
**Timezone:** Philippines (`'Asia/Manila'` via `phNow()`).

## Exercise Routines (5 + 1 Recovery)
- **Full Body Flow:** Swing, Squat, Clean & Press, Row, Farmer's Hold
- **Lower Body Power:** Squat, Deadlift, Lunge, Sumo Squat, Calf Raise
- **Core & Control:** Halo, Russian Twist, Side Bend, Figure 8, Suitcase Carry
- **Upper Body Strength:** Press, Row, Curl, Upright Row, Halo
- **Recovery Flow:** Goblet Hold, Around the World, Halo (slow), Good Morning, Figure 8 (slow)
- **Bonus:** Karla's Strap Band Routine (4 video-based exercises)

## Firebase Sync (Lines 1330–1361)
```js
function initFirebase() {
  if (!userName) return;
  const safeKey = userName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  dbRef = db.ref('wedding100/users/' + safeKey);
  
  dbRef.once('value').then(snap => {
    const fbData = snap.val();
    if (fbData) { /* merge with local */ }
    else { dbRef.set(state); }  // First time: upload
  });
  
  dbRef.on('value', snap => {
    if (changed) { state = fbData; render(); }
  });
}
```

## Why
- **Why Three.js (not 2D):** 3D depth shows exercise mechanics, dual-view animation (front → side)
- **Why countdown-only:** wedding100 is fitness tracker, NOT invitation (separate project)
- **Why Firebase RTDB:** Multi-device sync (Karla on phone, Charlie laptop)
- **Why vanilla JS:** Single HTML file, easy version control & deploy
- **Why dual-user:** Engaged couple training together, accountability
- **Why Manila TZ:** Hardcoded `'Asia/Manila'` for midnight reset + 6pm-6am dark mode
- **Why confetti on milestones:** Dopamine hit, habit-forming for fitness
