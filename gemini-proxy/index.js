// Minimal Gemini text proxy. No image gen, no push notifications, no
// Firestore, no grounding. Every route that could cost more than raw Gemini
// text tokens has been removed to keep this service cheap.
//
// Plus: a tiny POST /upload-drive endpoint for the SNS DQ app — uploads a PNG
// to a single hardcoded Drive folder using Cloud Run's runtime service account.
// The browser never authenticates; the SA must be shared (Editor) on the
// target folder.
import express from "express";
import fetch from "node-fetch";
import { Readable } from "stream";

const app = express();
// 10mb body cap so a base64-encoded 1920×1080 PNG (~2-3 MB raw → ~3-4 MB b64)
// fits comfortably with headroom.
app.use(express.json({ limit: "10mb" }));

// CORS
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

// Gemini text proxy — forwards to flash-lite with latency-optimized config.
// If the caller passes { stream: true } in the body, we pipe Server-Sent
// Events from Gemini back to the client as they arrive (typically first
// token in ~200-400ms instead of waiting ~2s for the whole response).
app.post("/", async (req, res) => {
  try {
    const { task, stream, ...geminiBody } = req.body || {};

    // Merge in performance-tuned defaults unless caller already set them.
    geminiBody.generationConfig = {
      temperature: 0.4,
      maxOutputTokens: 2048,
      ...(geminiBody.generationConfig || {}),
      thinkingConfig: {
        thinkingBudget: 0,
        ...((geminiBody.generationConfig || {}).thinkingConfig || {}),
      },
    };

    const endpoint = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:${endpoint}key=${process.env.GEMINI_API_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (stream) {
      // Pipe SSE chunks through without buffering. Using Readable.fromWeb to
      // convert node-fetch's Web ReadableStream to a Node stream — this flows
      // through Express + Cloud Run reliably (the for-await approach was
      // getting buffered somewhere in the chain and the client never saw
      // chunks until the response ended).
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      Readable.fromWeb(r.body).pipe(res);
    } else {
      const data = await r.json();
      res.json(data);
    }
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Gemini request failed" });
    else res.end();
  }
});

// ---------------------------------------------------------------------------
// SNS DQ → Google Drive upload
// ---------------------------------------------------------------------------
// Authenticates as a *user* (charliecayno@gmail.com) via stored OAuth refresh
// token, NOT as a service account — service accounts can't write to consumer
// (@gmail.com) Drives at all (no storage quota outside Workspace Shared Drives).
//
// Setup is done by running gemini-proxy/setup-drive-oauth.sh once. That script
// triggers an interactive `gcloud auth application-default login` with the
// Drive scope, then pushes the resulting refresh token + gcloud client creds
// to this service as env vars:
//   DRIVE_OAUTH_CLIENT_ID, DRIVE_OAUTH_CLIENT_SECRET, DRIVE_OAUTH_REFRESH_TOKEN
//
// One hardcoded folder; this endpoint can ONLY write to that folder.
const SNS_DQ_FOLDER_ID = "1O34ndqW8eTvcZvtfHKl-cqcbsCzTfWBo";
const SAFE_FILENAME_RE = /^[\w .,()\-+&'’]+\.png$/i;

let driveTokenCache = { token: null, expiresAt: 0 };
async function getDriveAccessToken() {
  // Reuse a token until 60s before expiry; otherwise refresh.
  if (driveTokenCache.token && Date.now() < driveTokenCache.expiresAt - 60_000) {
    return driveTokenCache.token;
  }
  const cid = process.env.DRIVE_OAUTH_CLIENT_ID;
  const csec = process.env.DRIVE_OAUTH_CLIENT_SECRET;
  const rt = process.env.DRIVE_OAUTH_REFRESH_TOKEN;
  if (!cid || !csec || !rt) {
    throw new Error("Drive OAuth not configured. Run gemini-proxy/setup-drive-oauth.sh.");
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: csec,
      refresh_token: rt,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`OAuth token refresh failed (${r.status}): ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  driveTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

app.post("/upload-drive", async (req, res) => {
  try {
    const { filename, imageBase64 } = req.body || {};
    if (!filename || !imageBase64) {
      return res.status(400).json({ error: "filename and imageBase64 required" });
    }
    if (!SAFE_FILENAME_RE.test(filename)) {
      return res.status(400).json({ error: "invalid filename (must end in .png, alphanum + basic punctuation)" });
    }
    if (imageBase64.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "image too large (>6MB raw)" });
    }

    const buffer = Buffer.from(imageBase64, "base64");

    const token = await getDriveAccessToken();

    // Multipart upload to Drive (single-request multipart/related)
    const boundary = "snsdq-" + Math.random().toString(36).slice(2);
    const metadata = { name: filename, mimeType: "image/png", parents: [SNS_DQ_FOLDER_ID] };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: binary\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    // Drive API requires x-goog-user-project for user-credential requests
    // (the refresh-token flow we're using) so it knows which project to bill
    // for quota. Hardcoded to the same project that hosts this Cloud Run.
    const QUOTA_PROJECT = "gen-lang-client-0614956024";

    const uploadResp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "x-goog-user-project": QUOTA_PROJECT,
        },
        body,
      }
    );

    if (!uploadResp.ok) {
      const text = await uploadResp.text();
      console.error("Drive upload failed:", uploadResp.status, text);
      return res.status(502).json({ error: `Drive upload failed (${uploadResp.status}): ${text.slice(0, 300)}` });
    }
    const uploaded = await uploadResp.json();

    // Make link-shareable (anyone with link can view).
    const permResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-goog-user-project": QUOTA_PROJECT,
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      }
    );
    if (!permResp.ok) {
      const text = await permResp.text();
      console.warn("Drive permission share failed (file uploaded, link may be private):", permResp.status, text);
    }

    res.json({ id: uploaded.id, link: uploaded.webViewLink, downloadLink: uploaded.webContentLink });
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

// Health check — also acts as the warm-up target hit from the devo app on
// page load to keep the Cloud Run container alive and skip cold starts.
app.get("/", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server running on port", port));
