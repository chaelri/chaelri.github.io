# Devo Mobile — File-by-File Map

## package.json Scripts

```json
{
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web"
}
```

No build, test, lint, or deploy scripts. Bare Expo workflow. Dependencies:
- React 19.1.0, React Native 0.81.5
- Expo 54.0.0 (router, TTS, fonts, haptics, secure-store)
- Zustand 5.0.12, React Native Reanimated 3.16.1

## app/ — Routes (Expo Router)

### `_layout.tsx` (Root)
- Root Stack navigator + hydration + splash
- `useFonts()` loads EditorsNote-Italic.ttf
- `hydrate()` on mount → ActivityIndicator until `_hydrated`
- Shows `SplashIntro` post-onboarding (dismissable)

### `onboarding.tsx`
- Carousel of 8 slides (welcome, features, final)
- Horizontal scroll, prev/next buttons, fingerprint on slides
- On finish: `completeOnboarding()` → redirects to tabs

### `paywall.tsx`
- Premium upsell modal (placeholder)
- 3 feature cards (Unlimited AI, Priority, Unlimited Downloads)
- Action: "Upgrade" → `setPremium(true)` (no real payment backend)

### `verse-chat.tsx`
- AI conversation per verse (modal screen)
- Params: bookName, chapter, verseNum, verseText
- State: messages, suggestions, input
- AI: `sendVerseChat()` (multi-turn with context)
- UI: FlatList of bubbles, fade-out gradient at top

### `immersive-tts.tsx`
- Listen to chapter with word-by-word highlighting
- Params: bookCode, chapter, version
- `createChapterPlayer()` manages verse-by-verse playback
- Pre-fetches next verse while playing current
- Shows previous (greyed), current (highlighted), next (faded)

### `(tabs)/_layout.tsx`
- Tab navigator: index (Read), notes, settings
- Material Icons, theme colors, haptic on tab press

### `(tabs)/index.tsx` (Read Screen, ~886 lines)
- Main Bible reading interface
- Header: book selector, search, version toggle, theme toggle
- Title row: prev/next chapter nav, chapter picker
- Chapter tools: Story, Reflect, Listen
- Verse list with action chips: Context, Ask, Note
- Modals: BookPicker, ChapterPicker, SearchModal, SummaryPanel, ReflectionPanel, AIPanel, LimitReachedModal
- Functions: toggleInlineContext, openInlineDigDeeper, openInlineCrossRefs, openVerseChat, saveInlineNote

### `(tabs)/notes.tsx` (~200 lines)
- Modes: 'list' / 'detail' / 'edit'
- Combines notes + comments, sorted by updatedAt
- Search bar, edit/delete buttons, inline form

### `(tabs)/settings.tsx`
- Stats card (favorites count, notes count)
- Usage card (daily limits)
- Settings: Appearance, Your Name, Premium, Restore Purchase, Delete All Data

## src/store/useStore.ts (~370 lines)

- Zustand store with 40+ state keys and actions
- Key exports: `useStore`, `FREE_LIMITS`
- Functions: `getTodayKey()`, `persistState()`, `debouncedPersist()`
- Sections: Theme, Bible nav, Onboarding, Premium, Daily limits, Favorites, Notes, Comments, Highlights, User, Persistence

## src/services/

**`storage.ts`** (~75 lines): Platform-aware (SecureStore mobile, localStorage web), chunking >2000 bytes.

**`ai.ts`** (~100+ lines): `callGemini(prompt)`, `getContextSummary()`, `getAtAGlance()`, `getDigDeeper()`, `getCrossReferences()`, `getReflectionQuestions()`, `getQuickContext()`, `sendVerseChat()`, `getSuggestedQuestions()`.

**`tts.ts`** (~250 lines): `getTTSKey()`, `synthesize(text)`, `createChapterPlayer()`, queue management, exponential backoff retry, fallback to device speech.

## src/data/bibleLoader.ts (~33 lines)

- `getNASB()` / `getEASY()` lazy-load from `/assets/data/`
- `getVerses(version, bookName, chapter)` returns Record<verseNum, text>

## src/constants/

**`bible-meta.ts`**: BIBLE_META (66 books with chapter verse counts) + BOOK_ORDER.

**`theme.ts`**: Colors (dark/light palettes), Spacing, FontSize, BorderRadius, LabelStyle, gradients.

## src/components/ (18 components)

| File | Purpose |
|------|---------|
| AIPanel.tsx | Full-screen modal for AI content |
| InlineAI.tsx | Below-verse inline expands |
| BookPicker.tsx | Modal book selector |
| SearchModal.tsx | Modal chapter search |
| ReflectionPanel.tsx | Reflection questions + journal |
| SummaryPanel.tsx | Chapter story summary |
| VersionToggle.tsx | NASB ↔ EASY switcher |
| LimitReachedModal.tsx | Free tier upsell |
| SplashIntro.tsx | Post-onboarding splash |
| GradientButton.tsx, GradientView.tsx, GradientText.tsx | Styled gradient components |
| /slides/ | Onboarding slide components |

## Configuration

**`app.json`**: App name "Devo — Daily Bible", bundle `com.chaelri.devo`, EAS project ID, OTA updates URL.

**`assets/`**: icon.png, splash-icon.png, adaptive-icon.png, favicon.png, /data/ (Bible JSONs), /fonts/ (EditorsNote-Italic).

**`.env`**: `EXPO_PUBLIC_GOOGLE_TTS_KEY` (Google TTS API key).
