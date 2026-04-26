# Echoes — Story Sharing App

**Instagram-style real-time social app for two users (Charlie & Karla).** Stories + posts + likes + comments. Vanilla JS + Tailwind v4 + Firebase RTDB + Storage.

**Last commit:** Jan 24, 2026 (parked).

## File Structure
```
echoes/
├── index.html              — Single-page template + modals
├── script.js               (1,443 lines) — Core logic, vanilla JS ES modules
├── style.css               — Dark theme, animations, story progress bars
├── sw.js                   — Service worker (cache-first)
├── manifest.json           — PWA
└── icons/icon-512x512.png
```

## Dual-Login (No OAuth, No Real Auth)

```js
const loginUser = (username) => {
    currentUser = { id: username.toLowerCase(), name: username };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
};
```

**Login buttons:**
- `#login-charlie` → `loginUser('Charlie')` → `currentUser.id = 'charlie'`
- `#login-karla` → `loginUser('Karla')` → `currentUser.id = 'karla'`

**Session:** `localStorage['currentUser']` — auto-restore on app load. No explicit logout (clear localStorage).

## Story Data Model (Firebase: `stories/{id}`)
```js
{
  userName: "Charlie",
  userId: "charlie",
  mediaURL: "https://firebasestorage...",
  thumbnailBase64: "...",      // Tiny blurred placeholder (~1KB)
  mediaType: "image/jpeg",
  expiresAt: 1705961486000,    // 24h from creation
  seenBy: { charlie: { timestamp }, karla: { timestamp } }
}
```

**Auto-advance:** 5s per story via `startProgressBar(index)`. Progress bar 0% → 100% via `progress-animation` keyframe.

## Post Data Model (Firebase: `posts/{id}`)
```js
{
  author: "Charlie",
  caption: "...",
  timestamp: 1705961486000,
  media: [{ mediaURL, thumbnailBase64, mediaType }],   // Multi-image carousel
  likes: { charlie: true, karla: true }
}
```

**Comments sub-collection:** `posts/{postId}/comments/{commentId}`
```js
{ author, text, timestamp, likes: { karla: true } }
```

## Real-Time Listeners
- `loadPosts()`: `onValue(ref(db, 'posts'), cb)`
- `loadStories()`: `onValue(ref(db, 'stories'), cb)` — filters expired (`expiresAt > now`)
- `loadAllUserProfiles()`: `onValue(ref(db, 'users'), cb)` — global cache
- `loadComments(postId, el)`: per-post listener

## Firebase Config
- **Project:** `test-database-55379` (asia-southeast1)
- **No auth required** (anonymous read/write)
- **Storage paths:**
  - Posts: `posts/{timestamp}_{filename}`
  - Stories: `stories/{timestamp}_{filename}`
  - Profile pics: `profilePics/{userId}_{timestamp}_{filename}`

## Image Pipeline
- `compressImage(file, maxWidth=1000, quality=0.7)` — Canvas-based resize
- `generateBase64Thumbnail(file, size=20, quality=0.1)` — Tiny blurred LQIP
- Upload to Firebase Storage → returns CDN URL

## Story Viewer
- `#story-viewer-modal` (full-screen overlay)
- `#story-progress-container` (top, dynamic per story)
- `#story-viewer-top-overlay` (username, seen-by, delete button)
- `#story-viewer-prev-btn`, `#story-viewer-next-btn` (chevron icons)
- Owner can delete; viewers see "Viewed by:" list

## Like / Comment Handlers
- `toggleLike(postId, currentLikes)` — `set(postRef, updatedLikes)`
- `addComment(postId, commentText)` — `push(ref(db, 'posts/{id}/comments'))`
- `toggleCommentLike(postId, commentId, currentLikes)`
- `deletePost(postId, mediaData)` — Removes post + cleans Firebase Storage
- `deleteStory(storyId, mediaURL)` — Removes story + storage; closes viewer if last

## Service Worker (Cache-First)
```js
const CACHE_NAME = 'echoes-cache-v1';
const urlsToCache = ['./', './index.html', './script.js', './manifest.json', '...firebase-*.js', '...tailwindcss@2.2.19'];

// Cache-first strategy
event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
```

## Why
- **Why dual-user only:** Privacy for couple, no OAuth complexity
- **Why Firebase RTDB (not Firestore):** Real-time sync default, lower cost
- **Why 24h ephemeral stories:** Casual sharing, auto-cleanup, "seen by" tracking
- **Why Tailwind v4 browser build:** No build step, GitHub Pages friendly
- **Why vanilla JS:** No framework bloat for simple UI state
- **Why localStorage for session:** Single JSON object, no IndexedDB complexity
- **Why blur-up images:** Perceived performance (instant placeholder)
- **Why no encryption:** Trust model (couple only), no PII

## Known Issues
- Like button uses `favorite` icon regardless of state (should toggle to `favorite_border`)
- Expired stories linger in RTDB (no cleanup job)
- No Firebase rules visible in codebase (likely permissive)
