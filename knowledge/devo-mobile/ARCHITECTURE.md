# Devo Mobile — Architecture Deep Dive

## Routing: Expo Router (File-based)

Devo Mobile uses **Expo Router v6** (file-based, similar to Next.js).

### Route Hierarchy

```
_layout.tsx (RootLayout — Stack navigator)
├── onboarding (8 slides, manual scroll)
├── (tabs) (TabLayout)
│   ├── index (Read Screen — main)
│   ├── notes (Notes/Journal)
│   └── settings (Preferences)
├── paywall (modal)
├── verse-chat (params-driven: bookName, chapter, verseNum, verseText)
└── immersive-tts (params-driven: bookCode, chapter, version)
```

**Stack behavior:**
- Root layout wraps all routes in `<Stack>` with fade animation + headerShown: false
- Onboarding: `gestureEnabled: false` (can't swipe back)
- Paywall: `presentation: 'modal'`, bottom slide
- Verse-chat: right slide animation, gesture enabled
- Immersive-TTS: bottom modal, gesture enabled

## State Management: Zustand (Single Store)

**Why Zustand, not Redux or Context?**
- Lightweight (~1KB), no boilerplate
- Subscriptions-based (no re-render waste)
- Direct mutations (no dispatch/action creators)
- Perfect for mobile single-source-of-truth

**Store architecture** (`src/store/useStore.ts`):
1. All state in one Zustand store
2. Mutations are synchronous
3. Async actions (hydrate, clearAllData) update state then persist
4. Debounced persistence (500ms) to avoid storage thrashing

**Hydration flow:**
1. App starts → `_layout.tsx` mounts
2. `hydrate()` called (async) → reads `app_state` from storage
3. Sets `_hydrated: true` once loaded
4. Root layout shows ActivityIndicator until `_hydrated` is true

## State Persistence

**Storage service** (`src/services/storage.ts`):
- Abstracts expo-secure-store (mobile) vs localStorage (web)
- All operations are async (Promise-based)
- Chunking for values >2000 bytes (SecureStore limit):
  - If too large, stores chunk count + individual chunks
  - On read, reassembles chunks

**What persists:**
- Theme (colorScheme)
- Current book/chapter/version
- Onboarding completion
- All user content (favorites, notes, highlights, comments)
- Daily limits (date key for reset detection)
- Premium status (flag only — no real billing backend yet)

## State: Shared Philosophy with devo PWA (Diverges in Implementation)

| Aspect | devo PWA | devo-mobile |
|--------|----------|-------------|
| **State mgmt** | Zustand (same) | Zustand (same) |
| **Storage** | LocalStorage + IndexedDB | expo-secure-store + localStorage |
| **Routing** | React Router v6 | Expo Router (file-based) |
| **Auth** | Firebase Auth (view-only) | None — local-only |
| **Data** | Same Bible JSON structure | Same (NASB2020, EASY2024 JSONs) |
| **AI service** | Gemini proxy + custom summarization | Gemini proxy (identical) |
| **TTS** | Google Cloud TTS + Web Audio API | Google Cloud TTS + expo-av + fallback speech |
| **Components** | React DOM | React Native |

**What IS shared:**
- Bible metadata (`bible-meta.ts` — all 66 books, verse counts)
- Bible JSON data format (same versioning)
- AI prompts (story types, reflection, dig deeper)
- Gemini proxy URL and request format

## AI Integration

### Gemini Proxy

**Endpoint:** `https://gemini-proxy-668755364170.asia-southeast1.run.app`

**Request format:**
```json
{
  "task": "summary",
  "contents": [{"parts": [{"text": "prompt here"}]}]
}
```

**Supported tasks** (task is hardcoded to "summary", but prompt drives behavior):
1. **Context Summary** — what's happening in the chapter
2. **At A Glance** — characters, setting, timeline (parsed JSON response)
3. **Story Segments** — narrative breakdown (parsed JSON with displayType, content)
4. **Reflection Questions** — personalized to passage
5. **Dig Deeper** — Greek/Hebrew word study + theological context
6. **Cross-References** — other Bible verses on same topic
7. **Verse Chat** — conversation on a specific verse (multi-turn with context)

All implemented in `src/services/ai.ts`. Tone: "Be direct — no greetings, no filler, bold key terms."

### TTS (Text-to-Speech)

**Google Cloud TTS API** (`src/services/tts.ts`):
- Voice: `en-US-Journey-D` (premium)
- Format: MP3, base64-encoded
- Rate limit: 2 concurrent synthesis, queue excess

**API Key management:**
- Dev: from `EXPO_PUBLIC_GOOGLE_TTS_KEY` env var
- User can enter key in app (stored securely)
- Fallback: device speech synthesis (Web Speech API on web, expo-speech on native)

## OTA Updates Strategy

**Expo Updates** (configured in app.json):
- EAS project ID: `f3c2f938-c8fc-4c7d-a953-b5a60369b445`
- Updates URL: `https://u.expo.dev/f3c2f938-c8fc-4c7d-a953-b5a60369b445`
- Runtime version policy: `appVersion` (tied to `package.json` version)

**How it works:**
- On app launch, checks for updates from Expo servers
- If new JS/assets available, downloads and applies on next app restart
- No code signing configured — any update replaces current

## Limits & Premium

**Free tier enforced client-side:**
- On each feature use, check `canUseFeature(feature)`
- If false, show `LimitReachedModal` (with upgrade button → paywall)
- Increment counter via `incrementLimit(feature)`

**Daily reset:**
- Tracked by date key (ISO string)
- `resetLimitsIfNewDay()` checks if date changed, resets counters

**Premium:**
- `isPremium` flag in store (toggled via settings)
- If true, `canUseFeature()` returns true always
- Paywall screen is placeholder (no backend checkout)
