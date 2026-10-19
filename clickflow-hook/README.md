# clickflow-hook

Cloud Run service: `POST` anything to it → saved under `/clickflow/messages` in the
`test-database-55379` RTDB → the exact payload is posted to the #clickflow Discord channel.

- URL: https://clickflow-hook-668755364170.asia-southeast1.run.app (project `gen-lang-client-0614956024`)
- The Discord webhook URL lives only in the service env var `DISCORD_WEBHOOK_URL`.
- Entries are marked `delivered: true` + `discordMessageId`. `GET /sweep` sends any undelivered entry
  (written straight into RTDB, or a failed send); each POST also sweeps.

Redeploy, keeping the env var:

```
gcloud run deploy clickflow-hook --source . --region asia-southeast1 --project gen-lang-client-0614956024 --allow-unauthenticated
```
