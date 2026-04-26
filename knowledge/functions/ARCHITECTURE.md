# WeddingBar Firebase Cloud Functions — Architecture

## Overview

Two core services on Node.js 20:
1. **Gemini AI Integration** — HTTP endpoint for generative AI
2. **Push Notification System** — Auto-forwarding queued notifications to FCM

## Function Specifications

### 1. `gemini` HTTP Function

**Trigger:** HTTPS only (`functions.https.onRequest()`)

**Method Restrictions:**
- Accepts: POST
- Rejects: GET, PUT (returns 405)
- OPTIONS: handled for CORS preflight (204)

**CORS Configuration:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

**Request/Response Flow:**
1. Client sends JSON POST body
2. Function retrieves Gemini API key from `functions.config().gemini.key`
3. Forwards body to `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={apiKey}`
4. Returns Gemini API response to client
5. On error: 500 with `{ error: "Gemini failed" }` + Cloud Logging

**Error Handling:**
- Try-catch wrapper catches network, JSON parsing, API errors
- Errors logged to Cloud Logging

**Configuration:**
- Must set: `firebase functions:config:set gemini.key="YOUR_API_KEY"`
- Or use Secret Manager reference

### 2. `pushNotificationForwarder` RTDB Trigger

**Trigger:** `functions.database.ref('/notifications/queue/{id}').onCreate()`

**Trigger Path:** `/notifications/queue/{id}` — fires automatically when new notification written.

**Handler:**
```js
exports.pushNotificationForwarder = functions.database
  .ref("/notifications/queue/{id}")
  .onCreate(async (snapshot, context) => { ... })
```

**Payload Validation:**
- Expects `{ title, body, data? }`
- If null/missing → returns early (no-op)

**Processing Flow:**
1. Extract notification payload from snapshot
2. Query RTDB `/fcmTokens` for all registered FCM tokens
3. If no tokens → log + exit
4. Build FCM message with notification + optional data
5. Send via `admin.messaging().sendToDevice(tokens, message)`
6. Remove processed notification: `snapshot.ref.remove()`
7. Return null on success

**Database References:**
- **Input:** `/notifications/queue/{id}` — write here to trigger
- **Token Store:** `/fcmTokens` — `{ "token1": true, "token2": true, ... }`

**Error Handling:**
- Catches FCM send errors and logs them
- Function still completes (returns null) even if send fails
- Does not retry or persist failed messages

**Logging:**
- Prefixes logs with `[FN]` for Cloud Logging filtering
- Logs notification ID, payload (sanitized), token count, errors

## Security & Runtime Credentials

### Pre-Apr 26 (Insecure)
- Service account JSON committed to repository
- Security risk: credentials exposed in version history

### Post-Apr 26 (Current)
- Service account key removed from Git tracking
- IAM-based authentication: function runtime uses associated service account's IAM roles
- `admin.initializeApp({})` auto-discovers ADC credentials
- No local key file needed for production

### Local Development
- Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` env var
- Firebase emulator suite reads this and provides credentials
- Or: `firebase login:ci` for CI/CD token

## Deployment Flow

```
1. Developer updates index.js or config
2. Run: firebase deploy --only functions
3. Firebase CLI authenticates (gcloud or firebase login)
4. Functions deployed with service account attached
5. Runtime: admin.initializeApp() finds credentials via ADC
6. Function executes with RTDB, FCM, and logging permissions
```

## Config Management

- **Gemini API Key:** Firebase Function Config or Secret Manager (NOT hardcoded)
- **Database URL:** Hardcoded in `admin.initializeApp({databaseURL: "..."})`
  - Why hardcoded: Deterministic init in test/prod without env var setup

## Integration Points

### With Firebase Realtime Database
- Listens to `/notifications/queue/{id}` for new writes
- Reads from `/fcmTokens` for active device tokens
- Writes to `/notifications/queue/{id}` for cleanup (`ref.remove()`)

### With Firebase Cloud Messaging (FCM)
- `admin.messaging().sendToDevice()` for push notifications
- Tokens pre-registered in `/fcmTokens` path
- Message includes notification payload (title, body) + optional data

### With Google Generative AI
- HTTP proxy to Gemini 1.5 Flash model
- API key in function config
- Forwards client body directly

### With Cloud Logging
- All `console.log()`/`error()` routed to Cloud Logging
- Searchable by function name, log level, timestamp

## Considerations & Future Improvements

### Current Limitations
1. Notification queue: no retry logic for failed FCM sends
2. Gemini key rotation: not automated
3. Token cleanup: no automatic removal of invalid/expired tokens
4. Error responses: Gemini function returns generic "failed" message

### Recommended Enhancements
- Add Dead Letter Queue (DLQ) path for failed notifications
- Implement Cloud Tasks for retries with exponential backoff
- Use Secret Manager for Gemini key with automatic rotation
- Add token validation before sending (check token health)
- Return detailed error info from Gemini (in non-prod environments)
- Monitor function execution time and memory with Cloud Monitoring

## Status & Notes

- **Last Update:** Apr 26, 2026 (security: service account key removed)
- **Tested Triggers:** HTTP (gemini), Realtime Database (pushNotificationForwarder)
- **Node Version:** 20 (LTS, suitable for production)
- **Maintenance:** Monitor Cloud Function logs weekly for errors
