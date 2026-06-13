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

// Gemini text proxy — defaults to flash-lite for latency-optimized callers.
// Optional `model` field in the request body picks a different whitelisted
// model (e.g. flash, pro). Existing callers that don't pass `model` keep the
// original flash-lite + thinkingBudget:0 behavior unchanged.
//
// If the caller passes { stream: true } in the body, we pipe Server-Sent
// Events from Gemini back to the client as they arrive.
const MODEL_WHITELIST = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  // Latest preview lines (verified callable in this project):
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-pro-latest",
  "gemini-flash-latest",
]);
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

app.post("/", async (req, res) => {
  try {
    const { task, stream, model: rawModel, ...geminiBody } = req.body || {};
    const model = (rawModel && MODEL_WHITELIST.has(rawModel)) ? rawModel : DEFAULT_MODEL;

    // For non-default models (i.e. callers explicitly opting into pro/flash),
    // don't force thinkingBudget=0 — let the caller decide. For the default
    // (flash-lite) keep the original behavior so existing apps aren't affected.
    const isDefaultModel = model === DEFAULT_MODEL;
    const baseGenConfig = isDefaultModel
      ? {
          temperature: 0.4,
          maxOutputTokens: 2048,
          ...(geminiBody.generationConfig || {}),
          thinkingConfig: {
            thinkingBudget: 0,
            ...((geminiBody.generationConfig || {}).thinkingConfig || {}),
          },
        }
      : {
          temperature: 0.4,
          maxOutputTokens: 8192,
          ...(geminiBody.generationConfig || {}),
        };
    geminiBody.generationConfig = baseGenConfig;

    const endpoint = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}key=${process.env.GEMINI_API_KEY}`;

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
// Wedding planning sheet — two-way sync for collaterals/details/
// ---------------------------------------------------------------------------
// The collaterals/details page asks Charlie + Karla to fill in cells from
// their wedding sheet (SONGLIST, CHECKLIST, SUPPLIER'S LIST tabs). Two
// endpoints back it:
//   POST /sheets-update  → write a row's cells (web → sheet, instant)
//   POST /sheets-read    → batch-get the same cells back (sheet → web, polled)
//
// Auth: separate refresh token with `spreadsheets` scope (the existing
// DRIVE_OAUTH_* token only has `drive.file`, which can't see files the app
// didn't create). Set up by gemini-proxy/setup-sheets-oauth.sh.
//
// Safelist below restricts which tab + column combinations can be written
// or read. Anything else is rejected with 400.

const WEDDING_SHEET_ID = "1AhowIveOjjVy73F6_x4c5ajsZXJE5wpu-tuLGQYIQzk";
const SHEETS_QUOTA_PROJECT = "gen-lang-client-0614956024";

const SHEET_ACCESS = {
  "SONGLIST":        { cols: new Set(["B", "C"]) },
  "CHECKLIST":       { cols: new Set(["C"]) },
  "SUPPLIER'S LIST": { cols: new Set(["D", "E"]) },
};

function validateSheetItem(item) {
  if (!item || typeof item !== "object") return "item missing";
  const { tab, row, cols } = item;
  const access = SHEET_ACCESS[tab];
  if (!access) return `tab "${tab}" not in safelist`;
  if (!Number.isInteger(row) || row < 1 || row > 500) return `row ${row} out of range`;
  if (!Array.isArray(cols) || cols.length === 0 || cols.length > 4) return "cols must be 1-4";
  for (const c of cols) {
    if (typeof c !== "string" || !/^[A-Z]$/.test(c)) return `bad column "${c}"`;
    if (!access.cols.has(c)) return `column ${c} not writable on ${tab}`;
  }
  return null;
}

function a1RangeFor(item) {
  // Quote sheet names that have spaces/apostrophes; escape inner apostrophes
  // per A1-notation rules ('SUPPLIER''S LIST'!D3).
  const escaped = item.tab.replace(/'/g, "''");
  const tabPart = /[\s']/.test(item.tab) ? `'${escaped}'` : escaped;
  const start = `${item.cols[0]}${item.row}`;
  const end   = `${item.cols[item.cols.length - 1]}${item.row}`;
  return item.cols.length === 1 ? `${tabPart}!${start}` : `${tabPart}!${start}:${end}`;
}

let sheetsTokenCache = { token: null, expiresAt: 0 };
async function getSheetsAccessToken() {
  if (sheetsTokenCache.token && Date.now() < sheetsTokenCache.expiresAt - 60_000) {
    return sheetsTokenCache.token;
  }
  const cid  = process.env.SHEETS_OAUTH_CLIENT_ID;
  const csec = process.env.SHEETS_OAUTH_CLIENT_SECRET;
  const rt   = process.env.SHEETS_OAUTH_REFRESH_TOKEN;
  if (!cid || !csec || !rt) {
    throw new Error("Sheets OAuth not configured. Run gemini-proxy/setup-sheets-oauth.sh.");
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
    throw new Error(`Sheets OAuth refresh failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  }
  const data = await r.json();
  sheetsTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

function sheetsHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "x-goog-user-project": SHEETS_QUOTA_PROJECT,
  };
}

function normalizeSheetLabel(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Read column A of `tab` and return every non-blank row as { label, row } in
// sheet order. The browser uses this to keep its label→row map fresh; the
// /sheets-update + /sheets-delete-row endpoints also use it to resolve a
// label to a current row even if the sheet was edited mid-flight.
async function fetchColumnA(token, tab) {
  const escaped = tab.replace(/'/g, "''");
  const tabRef = /[\s']/.test(tab) ? `'${escaped}'` : escaped;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WEDDING_SHEET_ID}/values/${encodeURIComponent(`${tabRef}!A1:A500`)}`;
  const r = await fetch(url, { headers: sheetsHeaders(token) });
  if (!r.ok) throw new Error(`column A read failed: ${r.status}`);
  const j = await r.json();
  const out = [];
  (j.values || []).forEach((cells, i) => {
    const v = (cells[0] || "").toString();
    if (v.trim()) out.push({ label: v, row: i + 1 });
  });
  return out;
}

// Find every row whose column-A label matches `label` (case- and
// whitespace-insensitive). May return 0, 1, or more rows.
async function findRowsByLabel(token, tab, label) {
  const entries = await fetchColumnA(token, tab);
  const norm = normalizeSheetLabel(label);
  return entries.filter((e) => normalizeSheetLabel(e.label) === norm).map((e) => e.row);
}

// Resolve { row, label } → an actual row in the sheet. When `label` is
// provided we look it up live so a row-drift between browser fetch and write
// can't cause us to clobber the wrong cell. When the label is ambiguous
// (e.g. "SHOES" appears twice in CHECKLIST), we prefer the match closest to
// the provided `row` hint. Falls back to the raw `row` if no label given or
// no match found (so empty-A continuation rows like SDE slots 2-4 still work).
async function resolveRow(token, tab, { row, label }) {
  if (label) {
    const matches = await findRowsByLabel(token, tab, label);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1 && Number.isInteger(row)) {
      matches.sort((a, b) => Math.abs(a - row) - Math.abs(b - row));
      return matches[0];
    }
    if (matches.length === 0 && !Number.isInteger(row)) {
      throw new Error(`label "${label}" not found in ${tab}`);
    }
  }
  return row;
}

let _sheetIdCache = null;
async function getSheetIdMap(token) {
  if (_sheetIdCache) return _sheetIdCache;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WEDDING_SHEET_ID}?fields=sheets.properties(sheetId,title)`;
  const r = await fetch(url, { headers: sheetsHeaders(token) });
  if (!r.ok) throw new Error(`spreadsheets.get failed: ${r.status}`);
  const j = await r.json();
  const map = {};
  for (const s of j.sheets || []) {
    map[s.properties.title] = s.properties.sheetId;
  }
  _sheetIdCache = map;
  return map;
}

// Return label→row mappings for every tracked tab. Browser polls this on each
// tick so it always knows the current row for every label.
app.post("/sheets-labels", async (_req, res) => {
  try {
    const token = await getSheetsAccessToken();
    const labels = {};
    for (const tab of Object.keys(SHEET_ACCESS)) {
      const entries = await fetchColumnA(token, tab);
      // For ambiguous labels (e.g. SHOES, PERFUME in CHECKLIST) we return
      // every match so the browser can pick by closest-row.
      const byLabel = {};
      for (const { label, row } of entries) {
        const key = label;
        (byLabel[key] = byLabel[key] || []).push(row);
      }
      labels[tab] = byLabel;
    }
    res.json({ labels });
  } catch (e) {
    console.error("sheets-labels error:", e);
    res.status(500).json({ error: e.message || "sheets-labels failed" });
  }
});

// Delete a single row in the sheet. Body: { tab, row?, label? }
// At least one of `row` and `label` must be given. Uses Sheets batchUpdate
// with a deleteDimension request so subsequent rows shift up.
app.post("/sheets-delete-row", async (req, res) => {
  try {
    const { tab, row, label } = req.body || {};
    const access = SHEET_ACCESS[tab];
    if (!access) return res.status(400).json({ error: `tab "${tab}" not in safelist` });
    if (!Number.isInteger(row) && !label) {
      return res.status(400).json({ error: "row or label required" });
    }
    const token = await getSheetsAccessToken();
    const resolved = await resolveRow(token, tab, { row, label });
    if (!Number.isInteger(resolved) || resolved < 2 || resolved > 500) {
      return res.status(400).json({ error: "could not resolve a valid row to delete" });
    }
    const sheetMap = await getSheetIdMap(token);
    const sheetId = sheetMap[tab];
    if (sheetId == null) return res.status(500).json({ error: `sheetId for "${tab}" not found` });
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${WEDDING_SHEET_ID}:batchUpdate`;
    const r = await fetch(url, {
      method: "POST",
      headers: { ...sheetsHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: resolved - 1, // 0-indexed, inclusive
              endIndex: resolved,        // 0-indexed, exclusive
            },
          },
        }],
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: `delete failed (${r.status}): ${text.slice(0, 300)}` });
    }
    res.json({ deletedRow: resolved, tab });
  } catch (e) {
    console.error("sheets-delete-row error:", e);
    res.status(500).json({ error: e.message || "sheets-delete-row failed" });
  }
});

// Write one row's cells. Body: { tab, row, cols, values, label? }
//   values is a 1D array of strings matching cols.length.
//   If `label` is supplied we look it up in column A so we still hit the
//   right cell even if the sheet's row numbering has drifted since the
//   browser last refreshed.
app.post("/sheets-update", async (req, res) => {
  try {
    const { tab, row, cols, values, label } = req.body || {};
    const err = validateSheetItem({ tab, row, cols });
    if (err) return res.status(400).json({ error: err });
    if (!Array.isArray(values) || values.length !== cols.length) {
      return res.status(400).json({ error: "values must be a 1D array matching cols.length" });
    }
    for (const v of values) {
      if (typeof v !== "string") return res.status(400).json({ error: "values must be strings" });
      if (v.length > 2000) return res.status(400).json({ error: "value too long (>2000 chars)" });
    }
    const token = await getSheetsAccessToken();
    const resolvedRow = await resolveRow(token, tab, { row, label });
    if (!Number.isInteger(resolvedRow)) {
      return res.status(404).json({ error: `could not resolve a row (label="${label || "?"}", row=${row})` });
    }
    const range = a1RangeFor({ tab, row: resolvedRow, cols });
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${WEDDING_SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const r = await fetch(url, {
      method: "PUT",
      headers: { ...sheetsHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ values: [values] }),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error("Sheets update failed:", r.status, text);
      return res.status(502).json({ error: `Sheets update failed (${r.status}): ${text.slice(0, 300)}` });
    }
    const j = await r.json();
    res.json({ updatedRange: j.updatedRange, updatedCells: j.updatedCells, resolvedRow });
  } catch (e) {
    console.error("sheets-update error:", e);
    res.status(500).json({ error: e.message || "sheets-update failed" });
  }
});

// Batch-read multiple cells. Body: { items: [{ tab, row, cols }, ...] }
// Returns: { results: [{ tab, row, cols, values: [...] }, ...] } in input order.
app.post("/sheets-read", async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array required" });
    }
    if (items.length > 200) {
      return res.status(400).json({ error: "too many items (>200)" });
    }
    for (const it of items) {
      const err = validateSheetItem(it);
      if (err) return res.status(400).json({ error: err });
    }
    const ranges = items.map(a1RangeFor);
    const token  = await getSheetsAccessToken();
    const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${WEDDING_SHEET_ID}/values:batchGet?${qs}`;
    const r = await fetch(url, { headers: sheetsHeaders(token) });
    if (!r.ok) {
      const text = await r.text();
      console.error("Sheets read failed:", r.status, text);
      return res.status(502).json({ error: `Sheets read failed (${r.status}): ${text.slice(0, 300)}` });
    }
    const j = await r.json();
    const valueRanges = j.valueRanges || [];
    const results = items.map((it, i) => {
      const vr = valueRanges[i];
      const row = vr?.values?.[0] || [];
      // Pad with "" so the array length always matches cols (Sheets trims
      // trailing empties from the response).
      const values = it.cols.map((_, k) => typeof row[k] === "string" ? row[k] : "");
      return { tab: it.tab, row: it.row, cols: it.cols, values };
    });
    res.json({ results });
  } catch (e) {
    console.error("sheets-read error:", e);
    res.status(500).json({ error: e.message || "sheets-read failed" });
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

// Bible passthrough — fetches a per-chapter file from chaelri.github.io and
// streams it back. Existed because the ESP32-S3 SuperMini in the bible-reader
// build can't reliably negotiate TLS with GitHub Pages, but Cloud Run's cert
// chain works fine.
const BIBLE_BOOK_RE = /^[A-Za-z0-9]+$/;
app.get("/bible/:book/:chapter", async (req, res) => {
  const { book, chapter } = req.params;
  if (!BIBLE_BOOK_RE.test(book) || !/^\d{1,3}$/.test(chapter)) {
    return res.status(400).send("bad request");
  }
  const upstream = `https://chaelri.github.io/bible-reader/sd-card/Bible/ch/${book}/${chapter}.txt`;
  try {
    const r = await fetch(upstream);
    if (!r.ok) return res.status(r.status).send(`upstream ${r.status}`);
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.set("Cache-Control", "public, max-age=86400");
    const body = await r.text();
    res.send(body);
  } catch (e) {
    res.status(502).send(String(e?.message || e));
  }
});

// Health check — also acts as the warm-up target hit from the devo app on
// page load to keep the Cloud Run container alive and skip cold starts.
app.get("/", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server running on port", port));
