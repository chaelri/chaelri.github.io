#!/usr/bin/env node
// ============================================================================
// yt-helper.mjs — local YouTube uploader. Sibling to drive-helper.mjs.
//
// Uses Charlie's own OAuth Desktop client (project gen-lang-client-0614956024,
// "Testing" mode, with charliecayno@gmail.com as test user). Required because
// youtube.upload is a Google "restricted scope" — gcloud's built-in OAuth
// client is NOT verified for it, so the ADC shortcut path
// (`gcloud auth application-default login --scopes=...youtube.upload`) fails
// with "This app is blocked." A self-owned Testing-mode app + listed test
// user bypasses the verification gate.
//
// Files (all gitignored):
//   gemini-proxy/.yt-client.json — OAuth Desktop client_id+secret
//   gemini-proxy/.yt-creds.json  — refresh token from `auth`
//
// One-time setup (per GCP project — persists across machines):
//   1. Enable YouTube Data API v3:
//        gcloud services enable youtube.googleapis.com --project=gen-lang-client-0614956024
//   2. Cloud Console → OAuth consent screen → add scope
//      https://www.googleapis.com/auth/youtube.upload (no API can do this — UI only)
//      URL: https://console.cloud.google.com/apis/credentials/consent?project=gen-lang-client-0614956024
//   3. cp gemini-proxy/.drive-client.json gemini-proxy/.yt-client.json
//   4. cd gemini-proxy && node yt-helper.mjs auth   ← one Allow click in browser
//
// Upload:
//   node yt-helper.mjs upload <video> [--title ...] [--description ...]
//                                    [--tags a,b,c] [--privacy unlisted|private|public]
//                                    [--category 22]
//
// Quota: each upload costs 1600 units. Default daily quota = 10,000 units
// → ~6 uploads per day per project. Plenty.
// ============================================================================

import { readFile, writeFile, stat, open } from "node:fs/promises";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { resolve as resolvePath } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const CLIENT_PATH = `${HERE}.yt-client.json`;
const CREDS_PATH = `${HERE}.yt-creds.json`;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/youtube.upload",
].join(" ");

async function loadClient() {
  const raw = JSON.parse(await readFile(CLIENT_PATH, "utf8"));
  const c = raw.installed || raw.web || raw;
  if (!c.client_id || !c.client_secret) {
    throw new Error(`Invalid client JSON at ${CLIENT_PATH}`);
  }
  return c;
}

async function loadCreds() {
  return JSON.parse(await readFile(CREDS_PATH, "utf8"));
}

async function saveCreds(creds) {
  await writeFile(CREDS_PATH, JSON.stringify(creds, null, 2));
}

async function cmdAuth() {
  const client = await loadClient();
  const server = createServer();
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  console.log("Opening browser…");
  console.log("If it doesn't open, paste this URL:");
  console.log(url.toString());
  exec(`open "${url.toString()}"`);

  const code = await new Promise((res, rej) => {
    server.on("request", (req, reply) => {
      const u = new URL(req.url, redirectUri);
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      reply.writeHead(200, { "Content-Type": "text/html" });
      reply.end(
        c
          ? "<h2>Auth complete. You can close this tab.</h2>"
          : `<h2>Auth failed: ${err}</h2>`
      );
      server.close();
      c ? res(c) : rej(new Error(err || "no code"));
    });
  });

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResp.ok) throw new Error(`token exchange failed: ${await tokenResp.text()}`);
  const tok = await tokenResp.json();
  if (!tok.refresh_token) {
    throw new Error("no refresh_token in response — revoke prior consent at https://myaccount.google.com/permissions and retry");
  }
  await saveCreds({ refresh_token: tok.refresh_token });
  console.log(`Saved refresh token to ${CREDS_PATH}`);
}

async function accessToken() {
  const client = await loadClient();
  const { refresh_token } = await loadCreds();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`refresh failed: ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

function parseOpts(args) {
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = args[i + 1];
      o[key] = val;
      i++;
    }
  }
  return o;
}

async function cmdUpload(videoPath, opts) {
  if (!videoPath) throw new Error("usage: upload <video> [--title ...] [--description ...] [--tags a,b] [--privacy unlisted]");
  const abs = resolvePath(videoPath);
  const st = await stat(abs);
  const total = st.size;
  const token = await accessToken();

  const title = opts.title || abs.split("/").pop().replace(/\.[^.]+$/, "");
  const description = opts.description || "";
  const tags = opts.tags ? opts.tags.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const privacy = opts.privacy || "unlisted";
  const category = opts.category || "22";

  // upload.json sits next to the video file; the Render Progress.app polls it.
  const progressPath = abs.replace(/[^/]+$/, "upload.json");
  const writeProgress = async (state) => {
    const tmp = progressPath + ".tmp";
    await writeFile(tmp, JSON.stringify({
      title, totalBytes: total, ...state,
    }));
    // atomic rename so readers never see a partial file
    await import("node:fs/promises").then((m) => m.rename(tmp, progressPath));
  };
  await writeProgress({ status: "starting", uploadedBytes: 0, percent: 0, mbps: 0 });

  const metadata = {
    snippet: { title, description, tags, categoryId: category },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: false,
      embeddable: true,
    },
  };

  console.log(`Initiating resumable upload (${(total / 1e9).toFixed(2)} GB)…`);
  console.log(`  title: ${title}`);
  console.log(`  privacy: ${privacy}  notForKids: true`);

  const initResp = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(total),
        "X-Upload-Content-Type": "video/*",
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initResp.ok) {
    throw new Error(`init failed: ${initResp.status} ${await initResp.text()}`);
  }
  const uploadUrl = initResp.headers.get("location");
  if (!uploadUrl) throw new Error("no Location header in init response");
  console.log("Resumable session opened. Uploading…");

  const CHUNK = 8 * 1024 * 1024;
  const fh = await open(abs, "r");
  try {
    let offset = 0;
    const t0 = Date.now();
    while (offset < total) {
      const end = Math.min(offset + CHUNK, total) - 1;
      const len = end - offset + 1;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, offset);

      const r = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(len),
          "Content-Range": `bytes ${offset}-${end}/${total}`,
        },
        body: buf,
      });

      if (r.status === 308) {
        const range = r.headers.get("range");
        const last = range ? parseInt(range.split("-")[1], 10) : end;
        offset = last + 1;
        const pct = (offset / total) * 100;
        const mbps = offset / 1e6 / ((Date.now() - t0) / 1000);
        process.stdout.write(`\r  ${pct.toFixed(1)}%  (${(offset/1e9).toFixed(2)}/${(total/1e9).toFixed(2)} GB · ${mbps.toFixed(1)} MB/s)`);
        await writeProgress({
          status: "uploading",
          uploadedBytes: offset, percent: pct, mbps,
        });
      } else if (r.status === 200 || r.status === 201) {
        process.stdout.write("\n");
        const j = await r.json();
        const id = j.id;
        console.log(`\nDone. videoId = ${id}`);
        console.log(`  https://youtu.be/${id}`);
        console.log(`  studio: https://studio.youtube.com/video/${id}/edit`);
        await writeProgress({
          status: "done",
          uploadedBytes: total, percent: 100, mbps: 0,
          videoId: id,
          url: `https://youtu.be/${id}`,
          studioUrl: `https://studio.youtube.com/video/${id}/edit`,
        });
        return;
      } else {
        const txt = await r.text();
        await writeProgress({
          status: "error",
          uploadedBytes: offset, percent: (offset / total) * 100, mbps: 0,
          error: `chunk PUT ${r.status}: ${txt.slice(0, 200)}`,
        });
        throw new Error(`chunk PUT failed: ${r.status} ${txt}`);
      }
    }
  } finally {
    await fh.close();
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "auth") await cmdAuth();
  else if (cmd === "upload") await cmdUpload(rest[0], parseOpts(rest.slice(1)));
  else {
    console.error("Commands: auth | upload <video> [--title ... --description ... --tags a,b --privacy unlisted]");
    process.exit(1);
  }
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}
