# WeddingBar Firebase Cloud Functions

**Two Cloud Functions associated with WeddingBar Firebase Hosting setup.** Node.js 20.

## Directory Structure
```
functions/
├── index.js                 # Main function exports
├── package.json             # Dependencies & metadata
├── package-lock.json
├── .eslintrc.js
├── .gitignore
└── service-account.json     # SECURITY: untracked from version control as of Apr 26
```

## Package
- **Name:** `weddingbar-functions`
- **Description:** Firebase functions for WeddingBar
- **Runtime:** Node.js 20
- **Project:** Associated with WeddingBar Firebase Hosting (per `firebase.json`)

## Dependencies
| Package | Version |
|---------|---------|
| `firebase-admin` | ^11.0.0 |
| `firebase-functions` | ^4.0.0 |
| `node-fetch` | (per package-lock.json) |

## Exported Functions

### 1. `gemini` (HTTP trigger)
- **Type:** `functions.https.onRequest()`
- **Method:** POST (rejects GET/PUT with 405)
- **CORS:** `*` (preflight handled with 204)
- **Purpose:** Proxies requests to Google Generative AI (Gemini 1.5 Flash)
- **Config:** `functions.config().gemini.key`
- **Endpoint:** `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={apiKey}`
- **Errors:** 500 with `{ error: "Gemini failed" }` + Cloud Logging

### 2. `pushNotificationForwarder` (RTDB trigger)
- **Type:** `functions.database.ref('/notifications/queue/{id}').onCreate()`
- **Trigger:** New write to `/notifications/queue/{id}`
- **Functionality:**
  1. Extract notification payload (title, body, data)
  2. Query RTDB `/fcmTokens` for all tokens
  3. Build FCM message with notification + data
  4. Send via `admin.messaging().sendToDevice(tokens, message)`
  5. Remove processed notification (`snapshot.ref.remove()`)

## Security Model (Post Apr 26)

**Pre Apr 26:** Service account key committed to repository (security risk).

**Post Apr 26:**
- Service account JSON removed from Git tracking
- **Runtime credentials:** Cloud Function uses associated service account's IAM roles
- `admin.initializeApp({})` auto-discovers credentials
- No local key file needed for production

## Local Development
- Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` env var
- Firebase emulator suite reads this and provides credentials
- Or: `firebase login:ci` for CI/CD token

## Config Management
- **Gemini API Key:** Firebase Function Config (`firebase functions:config:set gemini.key="..."`) or Secret Manager
- **Database URL:** Hardcoded in `admin.initializeApp({databaseURL: "..."})` — `https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app`

## Integration Points
- **RTDB:** Listens `/notifications/queue/{id}`, reads `/fcmTokens`, writes (cleanup)
- **FCM:** `admin.messaging().sendToDevice()` for push notifications
- **Generative AI:** HTTP proxy to Gemini 1.5 Flash
- **Cloud Logging:** All console.log/error routed; `[FN]` prefix for filtering

## Deploy
```bash
firebase functions:config:set gemini.key="..."
firebase deploy --only functions
firebase deploy --only functions:gemini  # specific function
```

## Why
- **Why HTTP proxy for Gemini:** Hides API key, server-side rate limiting
- **Why RTDB trigger for FCM:** Real-time push notifications without polling
- **Why service account in code → IAM:** Security improvement (no exposed credentials)
- **Why no Cloud Tasks/Retry:** Notifications best-effort (no retry on FCM failure currently)
- **Why hardcoded DB URL:** Deterministic init in test/prod

## Recommended Enhancements
1. Dead Letter Queue (DLQ) for failed FCM sends
2. Cloud Tasks for retry with exponential backoff
3. Secret Manager for Gemini key with rotation
4. Token validation before sending (check token health)
5. Detailed error info from Gemini (in non-prod)
6. Cloud Monitoring (execution time, memory)
