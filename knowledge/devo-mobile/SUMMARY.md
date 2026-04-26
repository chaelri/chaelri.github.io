# Devo Mobile — Quick Reference Card

## Project Essentials
- **Framework:** Expo Router (v6.0.23) on React Native 0.81.5 + React 19.1.0
- **State:** Zustand (v5.0.12) — single store (`useStore`)
- **Storage:** expo-secure-store (mobile) + localStorage fallback (web)
- **Status:** Parked since Feb 2026. Companion to devo PWA but separate codebase.
- **Entry:** `/app/_layout.tsx` (Stack root) → onboarding → tabs or direct to main flow

## File Structure
```
/devo-mobile/
├── /app/                    # Expo Router routes (file-based)
│   ├── _layout.tsx         # Root Stack + splash/hydration
│   ├── onboarding.tsx      # Feature walkthrough (SLIDES array)
│   ├── paywall.tsx         # Premium upsell (modal)
│   ├── verse-chat.tsx      # AI chat per verse (params-driven)
│   ├── immersive-tts.tsx   # Word-by-word playback + highlight
│   └── /(tabs)/
│       ├── _layout.tsx     # Tab navigator (Read/Notes/Settings)
│       ├── index.tsx       # READ screen (main feature)
│       ├── notes.tsx       # Notes/comments journal (list/detail/edit)
│       └── settings.tsx    # Theme, premium, data mgmt
├── /src/
│   ├── /store/             # Zustand state (useStore.ts)
│   ├── /services/          # AI (Gemini), TTS (Google Cloud), storage
│   ├── /components/        # Reusable UI + slides (InlineAI, AIPanel, etc.)
│   ├── /hooks/             # useTheme, custom logic
│   ├── /data/              # Bible loader (NASB2020, EASY2024 JSONs)
│   ├── /constants/         # Theme colors, bible-meta (all 66 books)
│   └── /utils/             # haptics.ts (vibration feedback)
├── /assets/
│   ├── /data/              # Bible JSON bundles (versioned)
│   ├── /fonts/             # EditorsNote-Italic.ttf
│   └── *.png              # Icons, splash, adaptive icon
└── /public/ (web fallback)
```

## Global State (Zustand useStore)
All state in `/src/store/useStore.ts`. Persists via storage service (chunked for 2KB limit).

| Store Key | Type | Purpose |
|-----------|------|---------|
| `colorScheme` | 'dark'\|'light' | Theme toggle |
| `currentBook` | string (code: 'JHN') | Active book |
| `currentChapter` | number | Active chapter |
| `currentVersion` | 'NASB'\|'EASY' | Bible translation |
| `hasSeenOnboarding` | boolean | First-run guard |
| `isPremium` | boolean | Premium flag (not yet connected to billing) |
| `dailyLimits` | object | Free tier counters (reset daily) |
| `favorites` | Record<verseKey, timestamp> | Favorited verses |
| `notes` | Note[] | User journal entries (with verseKey if verse-linked) |
| `comments` | Record<verseKey, Comment> | Per-verse inline notes (deprecated — migrated to notes) |
| `highlights` | Record<verseKey, Highlight> | Highlighted verses (color + timestamp) |
| `userName` | string | Display name (onboarding) |

**Free Limits** (hardcoded, reset daily):
```typescript
crossRef: 3,      // Dig Deeper (Greek/Hebrew)
verseChat: 3,     // Verse Chat (AI per-verse)
digDeeper: 1,     // Deep study
immersiveTts: 1,  // Listen to chapter
```

## Entry Points & Navigation

| Route | File | Purpose |
|-------|------|---------|
| `/` (onboarding → tabs) | Root stack → `/onboarding` if `!hasSeenOnboarding` | First run |
| `/(tabs)` | `_layout.tsx` + 3 screens | Main app (Read / Notes / Settings) |
| `/verse-chat` | `verse-chat.tsx` | AI conversation on single verse |
| `/immersive-tts` | `immersive-tts.tsx` | Listen + highlight + pause/annotate |
| `/paywall` | `paywall.tsx` | Premium upgrade modal |

**Root hydration flow:**
1. `_layout.tsx` calls `hydrate()` on mount
2. Shows loading spinner until `_hydrated: true`
3. Routes to `/onboarding` if needed, else shows splash intro

## Key AI Calls

| Service | Endpoint | Purpose |
|---------|----------|---------|
| Gemini Proxy | `https://gemini-proxy-...asia-southeast1.run.app` | All AI (summary, context, dig deeper, reflection) |
| Google TTS | `texttospeech.googleapis.com/v1/text:synthesize` | Audio synthesis (MP3 base64) |

Both are **NOT Firebase-based**. Gemini proxy is custom Cloud Run service; TTS is standard Google API.

## Build & Deploy
- `npm start` → Expo Go
- `npm run ios` / `npm run android` → Native build
- `npm run web` → Web bundle
- EAS project: `f3c2f938-c8fc-4c7d-a953-b5a60369b445` (OTA updates via Expo)
- App name: "Devo — Daily Bible" | Bundle: `com.chaelri.devo` (iOS/Android)
