# Wedding100 — Architecture

## Countdown Calculation (Line 1390)

```js
function getDaysUntilWedding() {
  return Math.max(0, Math.ceil(
    (new Date(WEDDING_DATE + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 864e5
  ));
}
// 864e5 = 86400000 ms = 1 day
```

**Key points:**
- Hardcoded date: `WEDDING_DATE = '2026-07-02'`
- Uses Philippines timezone (UTC+8) via `phNow()` (line 1377)
- Calculates exact days; zero-clamps when past
- Called for splash screen, stats display, partner progress

## Three.js Mannequin (figure3d.js)

### Mannequin Structure
Lofted meshes — connecting elliptical cross-sections at different Y positions to form smooth body parts:

```js
class Mannequin {
  _build(scene) {
    // Torso: 15 cross-sections from crotch to shoulder top
    const torso = this._loft([
      [-0.05, 0, 0, 0, -0.01],     // bottom cap
      // ...
      [0.42, 0.08, 0.06, 0, 0.0],  // shoulder top
    ], 20, skin);

    // Limbs (arms, legs as lofted tapers)
    // Head (simple sphere)
  }
}
```

**Constants:** Hip Y (0.82), shoulder width (0.17), upper arm length (0.26).

### Pose Convention
Poses defined in **degrees** with sign corrections:
- **Spine:** X (forward/back lean), Y (twist), Z (side lean) — negate in Three.js
- **Arms:** X (elevation), Z (abduction), elbow (curl)
- **Legs:** X (hip flexion), Z (abduction), knee (bend, positive = natural)

Example: `Kettlebell Swing` p1 = deep hip hinge (spine:-40), p2 = standing tall (spine:5).

### Viewer & Lazy Loading (944–989)
```js
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      if (!active.has(el)) {
        evictIfNeeded();
        const v = new Viewer(el, name);
        active.set(el, v);
      }
    }
  });
}, { rootMargin: '100px 0px', threshold: 0.1 });
```

- **Max contexts:** 3 simultaneous WebGL contexts (line 925)
- **Eviction:** Disposes viewers scrolled out when limit hit
- **Placeholder:** "Tap to load 3D" message on evicted

## Canvas-Confetti Triggers

**Library:** canvas-confetti v1.6.0.

**Functions (lines 2798–2817):**

1. **`fireConfetti()`** (2801) — Full celebration
   - Center burst: 80 particles, 70° spread, origin y=0.6
   - Side cannons (300ms later): 40 particles at 60° and 120° angles
   - Shower (600ms later): 60 particles, 100° spread, higher gravity

2. **`fireSmallConfetti()`** (2815) — Subtle
   - 25 particles, 40° spread, 0.8× scalar

**Step Milestone Triggers** (1423–1437):
- Reach 5K, 10K, 15K, 20K → SFX + small confetti + speak motivational message
- Track `_lastStepsMilestone` to avoid duplicates

**Day Completion Trigger** (2820–2840):
- All exercises complete → full confetti + day-complete SFX + speak random phrase + 3.5s celebration overlay (figure with arms raised)

## Firebase RTDB Usage

**Configuration (line 1311):**
```js
const firebaseConfig = {
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  // ...
};
```

**Init Flow (line 1330):**
```js
function initFirebase() {
  if (!userName) return;
  const safeKey = userName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  dbRef = db.ref('wedding100/users/' + safeKey);

  // One-time
  dbRef.once('value').then(snap => {
    const fbData = snap.val();
    if (fbData) {
      state.completed = fbData.completed || state.completed;
      state.steps = fbData.steps || state.steps;
      // ...
      render();
    } else {
      dbRef.set(state);  // First time: upload
    }
  });

  // Continuous
  dbRef.on('value', snap => {
    const fbData = snap.val();
    if (fbData && JSON.stringify(fbData) !== JSON.stringify(state)) {
      state.completed = fbData.completed || {};
      // ...
      render();
    }
  });
}
```

**Path:** `wedding100/users/{username}/completed/steps/exerciseChecks/...`

**Sync rule:** Firebase wins on conflicts. Local `exerciseChecks` kept separate.

## Responsive Layout (lines 177–187)

**Mobile (<768px):**
```css
.app-grid { display: flex; flex-direction: column; }
.col-workout { order: -2; }  /* Workout first */
.col-steps   { order: -1; }
.col-stats   { order:  0; }
```

**Desktop (≥768px):**
```css
.app-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.col-stats   { grid-column: 1; grid-row: 1; }
.col-steps   { grid-column: 1; grid-row: 2; }
.col-workout { grid-column: 2; grid-row: 1/3; }
```

## Exercise Data (lines 911–1289)

**5 routines × 5 exercises + 1 recovery:**
- Full Body Flow: Swing, Squat, Clean & Press, Row, Farmer's Hold
- Lower Body Power: Squat, Deadlift, Lunge, Sumo Squat, Calf Raise
- Core & Control: Halo, Russian Twist, Side Bend, Figure 8, Suitcase Carry
- Upper Body Strength: Press, Row, Curl, Upright Row, Halo
- Recovery Flow: Goblet Hold, Around the World, Halo (slow), Good Morning, Figure 8 (slow)
- Bonus: Karla's Strap Band Routine (4 exercises, video-based)

**Each exercise:** p1 & p2 poses (front view), side poses (SIDE_POSES dict 1170), howTo, kcal estimate.

## Motivational Progression (1290–1305)

Day 1–3: "Still showing up"
Day 50: "Halfway there"
Day 100: "Day 100. You did it. 👑"
