#!/usr/bin/env bash
# ============================================================================
# One-time setup: enable Drive uploads from sns-dq via the gemini-proxy.
#
# Triggers an interactive `gcloud auth application-default login` with the
# Drive scope, extracts the refresh token from the resulting ADC file, and
# pushes it (plus gcloud's own OAuth client ID/secret) to the gemini-proxy
# Cloud Run service as env vars.
#
# Usage:
#   bash gemini-proxy/setup-drive-oauth.sh
#
# After running, click "Allow" in the browser when prompted. Files uploaded
# from sns-dq will then be owned by your Google account (no service-account
# quota issue) and land in the hardcoded SNS Discussion Questions folder.
# ============================================================================
set -euo pipefail

PROJECT_ID="gen-lang-client-0614956024"
REGION="asia-southeast1"
SERVICE="gemini-proxy"
ADC_FILE="$HOME/.config/gcloud/application_default_credentials.json"

# Scopes: cloud-platform preserves any other gcloud-driven workflows; drive.file
# (NOT drive) — per-file access only, non-sensitive. Sufficient for uploading
# new PNGs into a folder we already have access to. Avoids the "App is blocked"
# verification gate that fires for the full drive scope.
SCOPES="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive.file,openid,email"

echo "→ Logging in (a browser window will open). Sign in as charliecayno@gmail.com,"
echo "  then click Allow when asked for Drive access."
gcloud auth application-default login --scopes="$SCOPES"

if [ ! -f "$ADC_FILE" ]; then
  echo "✗ Expected ADC file at $ADC_FILE — login may have failed." >&2
  exit 1
fi

CID=$(jq -r '.client_id' "$ADC_FILE")
CSEC=$(jq -r '.client_secret' "$ADC_FILE")
RT=$(jq -r '.refresh_token' "$ADC_FILE")

if [ -z "$CID" ] || [ "$CID" = "null" ] || [ -z "$RT" ] || [ "$RT" = "null" ]; then
  echo "✗ Couldn't read client_id / refresh_token from $ADC_FILE." >&2
  exit 1
fi

echo "→ Pushing OAuth creds to Cloud Run (preserving existing env vars)…"
gcloud run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="DRIVE_OAUTH_CLIENT_ID=${CID},DRIVE_OAUTH_CLIENT_SECRET=${CSEC},DRIVE_OAUTH_REFRESH_TOKEN=${RT}" \
  --quiet

echo
echo "✓ Done. Drive uploads from sns-dq now write to your account's Drive."
echo "  Folder: https://drive.google.com/drive/folders/1O34ndqW8eTvcZvtfHKl-cqcbsCzTfWBo"
