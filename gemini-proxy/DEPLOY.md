# Deploy Push Notification Proxy to Cloud Run

## Prerequisites
- `gcloud` CLI installed and authenticated
- Your existing Gemini proxy project ID: `668755364170`

## Step 1: Enable Firestore (one-time)
```bash
gcloud firestore databases create --location=asia-southeast1 --project=YOUR_PROJECT_ID
```
If you already have Firestore, skip this. If it says "already exists", that's fine.

## Step 2: Set environment variables and deploy
```bash
cd gemini-proxy

gcloud run deploy gemini-proxy \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=YOUR_GEMINI_KEY,VAPID_PUBLIC_KEY=BFRkTDi99cyJzGlYRdl6gKuEcDWetGk-sm7LycamJIqJAR3-1KqmyY4gJW9mhtmcKFq8rNbfvJCAUvRzmzjmMOo,VAPID_PRIVATE_KEY=2z-YymznyIjVejofFuE05eq7DlpJ3rVR0_016QiRJ7w"
```

Replace `YOUR_GEMINI_KEY` with your actual Gemini API key (the one already set in your current Cloud Run service).

## Step 3: Create Cloud Scheduler job (daily 3 PM PHT)
```bash
gcloud scheduler jobs create http devotion-daily-reminder \
  --location asia-southeast1 \
  --schedule "0 15 * * *" \
  --time-zone "Asia/Manila" \
  --uri "https://gemini-proxy-668755364170.asia-southeast1.run.app/send-reminder" \
  --http-method POST \
  --headers "Content-Type=application/json" \
  --message-body '{}' \
  --attempt-deadline 60s
```

## Step 4: Test it
```bash
# Test the reminder endpoint manually
curl -X POST https://gemini-proxy-668755364170.asia-southeast1.run.app/send-reminder
```

## How it works
1. User toggles "Daily Reminder" ON in the app dashboard
2. Browser asks for notification permission → subscribes to push
3. Subscription is stored in Firestore via `/subscribe`
4. Every day at 3 PM PHT, Cloud Scheduler hits `/send-reminder`
5. Server checks who hasn't visited recently, generates AI message from their notes
6. Sends Web Push → phone shows notification even if app is closed

## Cost: $0
- Cloud Run free tier: 2M requests/month
- Firestore free tier: 1 GiB storage, 50K reads/day
- Cloud Scheduler free tier: 3 jobs
- Web Push API: free (no third-party service)
