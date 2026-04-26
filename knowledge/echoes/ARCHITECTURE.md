# Echoes — Architecture

## High-Level Flow

```
USER BROWSER
  ├─ HTML (login, feed, post modal, story view)
  ├─ JavaScript (script.js, ~1,443 lines)
  │  ├─ Dual login (Charlie/Karla)
  │  ├─ Real-time listeners (onValue)
  │  ├─ Media upload & compression
  │  └─ Like/comment handlers
  ├─ IndexedDB/localStorage
  │  ├─ currentUser (session)
  │  └─ Service Worker cache (offline)
  ↓
Firebase RTDB (asia-southeast1)        Firebase Storage
  - users/{id}                          - stories/{name}/
  - posts/{id}                          - posts/{timestamp}/
  - stories/{id}                        - profilePics/{id}/
  - Real-time listeners (onValue)       - Signed URLs returned
```

## Authentication & Dual-User Design

**No OAuth/Firebase Auth used** — hardcoded dual-user approach:

```js
const loginUser = (username) => {
    currentUser = { id: username.toLowerCase(), name: username };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    userDisplay.textContent = `${currentUser.name}`;
    showScreen(appContainer);
    loadAllUserProfiles();
    loadPosts();
    loadStories();
    loadUserProfile();
};
```

**Login buttons (index.html 27–32):**
- `#login-charlie` → `loginUser('Charlie')` → `currentUser.id = 'charlie'`
- `#login-karla` → `loginUser('Karla')` → `currentUser.id = 'karla'`

**Session persistence:**
- On app load, checks `localStorage['currentUser']`
- If exists, auto-restores session and shows app
- If missing, shows login screen
- **No explicit logout** (clear localStorage)

**Profile data merging (line 1084):** `currentUser = { ...currentUser, ...profile };` — RTDB profile data merges into session.

## Real-Time Listeners

**Posts feed:**
```js
const loadPosts = () => {
    onValue(ref(db, 'posts'), (snapshot) => {
        // Renders newest first (reverse order)
        // Loads comments per post
    });
};
```

**Stories circle:**
```js
const loadStories = () => {
    onValue(ref(db, 'stories'), (snapshot) => {
        // Filters expired (expiresAt > now)
        // Groups by userName
        // Shows user circles with seen/unseen border
    });
};
```

**Comments (per post):**
```js
const loadComments = (postId, commentListElement) => {
    onValue(ref(db, `posts/${postId}/comments`), (snapshot) => {
        // Real-time updates per post's comments
    });
};
```

**User profiles (global cache):**
```js
const loadAllUserProfiles = () => {
    onValue(ref(db, 'users'), (snapshot) => {
        userProfiles = { ...profiles };
        // Re-renders posts/stories to apply new profile pics
    });
};
```

## Story Posting & Expiration

**Publish flow:**
1. User selects "Story" from content-type dropdown
2. Uploads single media file (multi-file ignored)
3. `processAndPublishMedia(file, 'story')` — compresses + thumbnail
4. Creates story object:
   ```js
   const newContent = {
       userName: currentUser.name,
       userId: currentUser.id,
       expiresAt: Date.now() + 86400000,  // +24h
       mediaURL, thumbnailBase64, mediaType,
       seenBy: {}
   };
   await push(ref(db, 'stories'), newContent);
   ```
5. Toast success
6. Modal closes

**Expiration filtering (line 905–918):**
```js
const now = Date.now();
const activeStoriesByUserName = {};
if (stories) {
    Object.entries(stories).forEach(([key, story]) => {
        const expiresAt = story.expiresAt;
        if (expiresAt && expiresAt > now) {  // Only active
            activeStoriesByUserName[storyUserName].push({ id: key, ...story });
        }
    });
}
```

**Stories expire naturally after 24h. No backend cleanup; expired stay in RTDB but aren't rendered.**

## Story Viewer

**Modal (`#story-viewer-modal`):**
- Progress bars (top, dynamic)
- Top overlay: username, seen-by, delete
- Media container: `#story-viewer-media-image` or `-video`
- Prev/Next buttons (chevron icons)

**Progress bar animation:**
```js
const openStoryViewer = (stories, startIndex) => {
    currentStories = stories;
    storyProgressBarContainer.innerHTML = '';
    currentStories.forEach((_, index) => {
        const segment = document.createElement('div');
        segment.classList.add('story-progress-segment');
        const innerBar = document.createElement('div');
        innerBar.classList.add('story-progress-segment-inner');
        segment.appendChild(innerBar);
        storyProgressBarContainer.appendChild(segment);
    });
    loadStoryContent(currentStoryIndex);
};
```

**CSS (`@keyframes progress-animation`):** width 0% → 100% over 5s.

**Auto-advance (lines 172–211):**
- Each story 5s timeout
- After 5s, advance or close
- Manual prev/next via `loadStoryContent(index)` (no auto-advance)

**⚠️ Video handling:** Duration not synced to progress bar; always 5s.

## Like & Comment Handlers

**Toggle like (lines 591–616):**
```js
const toggleLike = async (postId, currentLikes) => {
    if (!currentUser) return;
    const postRef = ref(db, `posts/${postId}/likes`);
    let updatedLikes = { ...currentLikes };
    if (updatedLikes[currentUser.id]) {
        delete updatedLikes[currentUser.id];
    } else {
        updatedLikes[currentUser.id] = true;
    }
    await set(postRef, updatedLikes);
};
```

**⚠️ UI bug (lines 714–717):** Button uses `favorite` icon regardless of state. Should toggle to `favorite_border` when not liked.

**Add comment (lines 565–588):**
```js
const addComment = async (postId, commentText) => {
    if (!currentUser || !commentText.trim()) return;
    const newComment = {
        author: currentUser.name,
        text: commentText.trim(),
        timestamp: Date.now(),
        likes: {}
    };
    await push(ref(db, `posts/${postId}/comments`), newComment);
};
```

**Toggle comment like (475–500):** Same pattern as post like.

**Delete comment (464–472):** `await remove(ref(db, `posts/${postId}/comments/${commentId}`));` — only author can delete.

## Media Upload Pipeline

**Compress image (394–436):**
```js
const compressImage = (imageFile, maxWidth = 1000, quality = 0.7) => {
    // 1. Read file as data URL
    // 2. Draw to canvas, max width 1000px
    // 3. Reduce quality to 70%
    // 4. Return new File blob
};
```

**Generate thumbnail (439–461):**
```js
const generateBase64Thumbnail = (imageFile, size = 20, quality = 0.1) => {
    // 1. Create 20px canvas
    // 2. Apply blur filter
    // 3. Draw at tiny size
    // 4. Return base64 string
};
```

**Upload (1027–1049):**
```js
const processAndPublishMedia = async (mediaFile, type) => {
    let mediaURL = '', thumbnailBase64 = '';
    if (mediaFile && mediaFile.type.startsWith('image/')) {
        thumbnailBase64 = await generateBase64Thumbnail(mediaFile);
        mediaFile = await compressImage(mediaFile, 1000, 0.7);
    }
    const storageRef = sRef(storage, `${type}s/${Date.now()}_${mediaFile.name}`);
    const snapshot = await uploadBytes(storageRef, mediaFile);
    mediaURL = await getDownloadURL(snapshot.ref);
    return { mediaURL, thumbnailBase64, mediaType };
};
```

## Caching & Offline

**Service Worker (cache-first, sw.js):**
```js
const CACHE_NAME = 'echoes-cache-v1';
const urlsToCache = [
    './', './index.html', './script.js', './manifest.json',
    'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-*.js'
];

// Cache-first
event.respondWith(
    caches.match(event.request).then((response) =>
        response ? response : fetch(event.request)
    )
);
```

**Cache-First Strategy:** Offline users see cached posts/stories from last session.

**localStorage:** `currentUser` (session restoration).

**IndexedDB:** Not used. All real-time data from Firebase listeners cached in memory.
