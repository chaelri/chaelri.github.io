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
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

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
// Hardcoded folder safelist — clients pass `app` to pick the destination.
// Adding a new app = add a row here + redeploy. Anything not in this map is rejected.
const DRIVE_FOLDERS = {
  sns_dq: "1O34ndqW8eTvcZvtfHKl-cqcbsCzTfWBo",
  collaterals: "1IJWFdaSe8xSuqK-FJEJjMzhyqnOBQNhW",
};
const DEFAULT_APP = "sns_dq";
const SAFE_FILENAME_RE = /^[\w .,()\-+&'’]+\.(png|pdf)$/i;

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
    const { filename, imageBase64, app: appKey } = req.body || {};
    if (!filename || !imageBase64) {
      return res.status(400).json({ error: "filename and imageBase64 required" });
    }
    if (!SAFE_FILENAME_RE.test(filename)) {
      return res.status(400).json({ error: "invalid filename (must end in .png or .pdf, alphanum + basic punctuation)" });
    }
    if (imageBase64.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "image too large (>6MB raw)" });
    }
    const folderKey = appKey || DEFAULT_APP;
    const folderId = DRIVE_FOLDERS[folderKey];
    if (!folderId) {
      return res.status(400).json({ error: `unknown app "${folderKey}" (allowed: ${Object.keys(DRIVE_FOLDERS).join(", ")})` });
    }
    const isPdf = filename.toLowerCase().endsWith(".pdf");
    const contentMime = isPdf ? "application/pdf" : "image/png";

    const buffer = Buffer.from(imageBase64, "base64");

    const token = await getDriveAccessToken();

    // Multipart upload to Drive (single-request multipart/related)
    const boundary = "drvup-" + Math.random().toString(36).slice(2);
    const metadata = { name: filename, mimeType: contentMime, parents: [folderId] };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${contentMime}\r\nContent-Transfer-Encoding: binary\r\n\r\n`
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

// ---------------------------------------------------------------------------
// Edge TTS (devo) — Microsoft "Read Aloud" voice via msedge-tts WebSocket
// ---------------------------------------------------------------------------
// Devo calls this with a single verse; we open a WebSocket to Microsoft's
// undocumented Edge readaloud endpoint, collect MP3 audio + WordBoundary
// timings, and return them as JSON. Microsoft eats the synthesis cost; this
// proxy is just a relay (~100-300ms per verse), well within Cloud Run free
// tier even at 10× parallelism per chapter.
const EDGE_DEFAULT_VOICE = "en-US-BrianNeural";

function _consumeEdgeMetadata(metadataStream) {
  const timings = [];
  if (!metadataStream) return { timings, done: Promise.resolve() };

  const tryParse = (raw) => {
    if (!raw.trim()) return;
    let obj;
    try { obj = JSON.parse(raw); } catch { return; }
    if (!obj?.Metadata) return;
    for (const m of obj.Metadata) {
      if (m?.Type === "WordBoundary" && m.Data?.text?.Text) {
        timings.push({
          word: m.Data.text.Text,
          start: m.Data.Offset / 10_000_000,
          duration: m.Data.Duration / 10_000_000,
        });
      }
    }
  };

  metadataStream.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    try { JSON.parse(text); tryParse(text); }
    catch { for (const line of text.split(/\r?\n/)) tryParse(line); }
  });

  const done = new Promise((resolve) => {
    metadataStream.on("end", resolve);
    metadataStream.on("close", resolve);
  });
  return { timings, done };
}

app.post("/edge-tts", async (req, res) => {
  let tts;
  try {
    const { text, voice } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text required" });
    }
    if (text.length > 5000) {
      return res.status(413).json({ error: "text too long (>5000 chars)" });
    }

    tts = new MsEdgeTTS();
    await tts.setMetadata(
      voice || EDGE_DEFAULT_VOICE,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      { wordBoundaryEnabled: true }
    );

    const { audioStream, metadataStream } = tts.toStream(text);
    const { timings, done: metaDone } = _consumeEdgeMetadata(metadataStream);

    const audioChunks = [];
    audioStream.on("data", (chunk) => audioChunks.push(chunk));
    const audioDone = new Promise((resolve, reject) => {
      audioStream.on("end", resolve);
      audioStream.on("close", resolve);
      audioStream.on("error", reject);
    });

    await Promise.all([audioDone, metaDone]);

    const audioBase64 = Buffer.concat(audioChunks).toString("base64");
    res.json({ audioBase64, timings });
  } catch (e) {
    console.error("Edge TTS error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || "Edge TTS failed" });
    }
  } finally {
    if (tts && typeof tts.close === "function") {
      try { tts.close(); } catch {}
    }
  }
});

// Health check — also acts as the warm-up target hit from the devo app on
// page load to keep the Cloud Run container alive and skip cold starts.
app.get("/", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server running on port", port));
