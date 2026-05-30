#!/usr/bin/env bash
# ============================================================================
# One-time setup: enable Sheets read+write from collaterals/details/ via the
# gemini-proxy /sheets-update and /sheets-read endpoints.
#
# Triggers an interactive `gcloud auth application-default login` with the
# `spreadsheets` scope (NOT `drive.file` — that scope only sees files the app
# itself created, so it can't touch the existing wedding planning sheet).
# Extracts the refresh token from the resulting ADC file and pushes it (plus
# gcloud's own OAuth client ID/secret) to the gemini-proxy Cloud Run service
# as env vars.
#
# Usage:
#   bash gemini-proxy/setup-sheets-oauth.sh
#
# After running, click "Allow" in the browser when prompted. The
# collaterals/details page will then be able to sync answers two-way with
# the wedding sheet.
# ============================================================================
set -euo pipefail

PROJECT_ID="gen-lang-client-0614956024"
REGION="asia-southeast1"
SERVICE="gemini-proxy"
ADC_FILE="$HOME/.config/gcloud/application_default_credentials.json"

# Scopes: cloud-platform preserves quota-project routing; spreadsheets gives
# read+write on Google Sheets owned by the signed-in user.
SCOPES="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets,openid,email"

echo "→ Logging in (a browser window will open). Sign in as charliecayno@gmail.com,"
echo "  then click Allow when asked for Sheets access."
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
  --update-env-vars="SHEETS_OAUTH_CLIENT_ID=${CID},SHEETS_OAUTH_CLIENT_SECRET=${CSEC},SHEETS_OAUTH_REFRESH_TOKEN=${RT}" \
  --quiet

echo
echo "✓ Done. collaterals/details/ can now sync with the wedding sheet."
echo "  Sheet: https://docs.google.com/spreadsheets/d/1AhowIveOjjVy73F6_x4c5ajsZXJE5wpu-tuLGQYIQzk/edit"
