# Functions — Decisions

## Why Firebase Cloud Functions

- **Zero ops:** Managed runtime, auto-scaling
- **Integrated with Firebase:** Native RTDB triggers, FCM, Cloud Logging
- **Free tier sufficient:** 2M invocations/month + outbound network
- **Quick deploy:** `firebase deploy --only functions`

**Alternatives rejected:**
- Cloud Run: heavier ops (Docker, container orchestration)
- AWS Lambda: cross-cloud complexity
- Self-hosted Node.js: server management overhead

## Why HTTP Proxy for Gemini

**Goals:**
- Hide API key from client (server-side only)
- Server-side rate limiting & auth
- Custom prompt validation (future)
- Swappable LLM backend

**Why NOT Firebase Cloud Functions for Gemini directly?**
- Used in WeddingBar specifically for that app's needs
- Other apps (devo, pray, tayo) use external Cloud Run proxy at `gemini-proxy-668755364170.asia-southeast1.run.app`
- This `gemini` function may be redundant if those apps use the external proxy

**Architectural inconsistency:** Two Gemini proxies (Cloud Run + this Cloud Function). Likely historical artifact.

## Why RTDB Trigger for Push Notifications

**Goals:**
- Real-time push (no polling)
- Decoupled producers (any app can write to `/notifications/queue/{id}`)
- Single consumer (this function processes + sends + cleans)

**Pattern:** Producer-Consumer queue with RTDB as the broker.

**Why NOT Cloud Tasks?**
- Adds setup complexity
- RTDB triggers simpler for low volume (couple-scale)
- Free tier covers it

**Why NOT FCM directly from client?**
- API key exposure
- Per-device token management complex
- Server-side aggregation cleaner

## Why No Retry on FCM Failure

**Current:** Notification sent best-effort. If FCM fails, message lost.

**Why acceptable:**
- Personal scale (couple's app, low volume)
- Notifications are "nice to have" (not critical)
- Adding retry = Cloud Tasks setup + DLQ design = more complexity

**Trade-off:** Some pushes may be silently dropped.

**Future improvement:** Cloud Tasks queue with exponential backoff + DLQ.

## Why Service Account Key Removed (Apr 26)

**Pre Apr 26:** `service-account.json` committed to repo (security risk).

**Post Apr 26:**
- Removed from Git tracking
- Function uses **runtime IAM credentials** (Application Default Credentials)
- `admin.initializeApp({})` auto-discovers credentials
- No exposed credentials in source

**Why this matters:**
- Service account JSON is a long-lived credential
- Once exposed in git history, permanently leaked (even if removed)
- IAM-based auth is rotated automatically

**Local dev path:** `GOOGLE_APPLICATION_CREDENTIALS` env var pointing to local key file.

## Why Hardcoded Database URL

```js
admin.initializeApp({
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
});
```

**Why hardcoded:**
- Deterministic init (no env var setup needed in test/prod)
- One Firebase project for all functions
- Reduces deploy complexity

**Trade-off:** Code change required to point at different DB (rare).

## Why Generic Error Messages

**Current:** `{ error: "Gemini failed" }` for any Gemini API error.

**Why generic:**
- Don't leak Gemini API internals to client
- Don't expose API key in error messages
- Simpler error handling

**Trade-off:** Hard to debug issues from client side. **Recommended:** detailed errors in non-prod, generic in prod.

## Why Node.js 20

- LTS (long-term support, good production stability)
- Modern features (top-level await, etc.)
- Firebase Functions v4 supports it

## Recommended Future Improvements

1. **Dead Letter Queue (DLQ):** Failed FCM sends go to retry queue
2. **Cloud Tasks integration:** Exponential backoff retries
3. **Secret Manager:** Gemini key with automatic rotation
4. **Token validation:** Check FCM token health before sending
5. **Detailed errors (non-prod):** Better debugging
6. **Cloud Monitoring:** Track execution time, memory, errors
7. **Decommission?** If apps use external Cloud Run proxy, this `gemini` function may be redundant
