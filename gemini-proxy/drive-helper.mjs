#!/usr/bin/env node
// ============================================================================
// drive-helper.mjs — local Drive read/write CLI for chaelri.github.io.
//
// Uses Charlie's own OAuth client (created in GCP project
// gen-lang-client-0614956024, kept in "Testing" mode) so the full Drive scope
// works without going through Google's app verification gate. The scope here
// is `drive` (full read/write) — strictly more powerful than gcloud ADC's
// default `drive.file`, which is why this exists.
//
// Files:
//   .drive-client.json — downloaded from Cloud Console → Credentials → OAuth
//                        client (Desktop app type). Contains client_id +
//                        client_secret. Gitignored.
//   .drive-creds.json  — refresh token cache, written by `auth`. Gitignored.
//
// Commands:
//   node drive-helper.mjs auth                            one-time, opens browser
//   node drive-helper.mjs ls <folderId>                   list a folder
//   node drive-helper.mjs get <fileId> [outPath]          download a file
//   node drive-helper.mjs put <localPath> <folderId>      upload a file
//
// Folder ID = the chunk after /folders/ in the share URL.
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { basename, resolve as resolvePath } from "node:path";
import { pipeline } from "node:stream/promises";

const HERE = new URL(".", import.meta.url).pathname;
const CLIENT_PATH = `${HERE}.drive-client.json`;
const CREDS_PATH = `${HERE}.drive-creds.json`;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
].join(" ");
const QUOTA_PROJECT = "gen-lang-client-0614956024";

async function loadClient() {
  const raw = JSON.parse(await readFile(CLIENT_PATH, "utf8"));
  // Cloud Console exports either { installed: {...} } or { web: {...} }
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
  // Loopback redirect on a free port — Google-recommended flow for Desktop apps.
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

  console.log("Opening browser… if it doesn't open, visit:\n", url.toString());
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
    throw new Error("no refresh_token in response — revoke prior consent and retry");
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

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "x-goog-user-project": QUOTA_PROJECT,
  };
}

async function cmdLs(folderId) {
  if (!folderId) throw new Error("usage: ls <folderId>");
  const token = await accessToken();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,modifiedTime)");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(url, { headers: authHeaders(token) });
  if (!r.ok) throw new Error(`list failed: ${r.status} ${await r.text()}`);
  const { files } = await r.json();
  if (!files?.length) {
    console.log("(empty)");
    return;
  }
  for (const f of files) {
    const sz = f.size ? `${(+f.size / 1024).toFixed(1)} KB` : "—";
    console.log(`${f.id}\t${sz}\t${f.mimeType}\t${f.name}`);
  }
}

async function cmdGet(fileId, outPath) {
  if (!fileId) throw new Error("usage: get <fileId> [outPath]");
  const token = await accessToken();
  // First fetch metadata so we know the name + whether it's a Google Doc
  const metaResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    { headers: authHeaders(token) }
  );
  if (!metaResp.ok) throw new Error(`meta failed: ${metaResp.status} ${await metaResp.text()}`);
  const meta = await metaResp.json();

  // Google-native formats need export; binary files use alt=media
  const exportMap = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/pdf",
    "application/vnd.google-apps.presentation": "application/pdf",
  };
  const isNative = meta.mimeType?.startsWith("application/vnd.google-apps.");
  let url;
  let suffix = "";
  if (isNative) {
    const exportMime = exportMap[meta.mimeType] || "application/pdf";
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
    suffix = ".pdf";
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  }
  const dest = outPath
    ? resolvePath(outPath)
    : resolvePath(process.cwd(), `${meta.name}${suffix}`);
  const dl = await fetch(url, { headers: authHeaders(token) });
  if (!dl.ok) throw new Error(`download failed: ${dl.status} ${await dl.text()}`);
  await pipeline(dl.body, createWriteStream(dest));
  console.log(`Saved → ${dest} (${meta.mimeType})`);
}

async function cmdPut(localPath, folderId) {
  if (!localPath || !folderId) throw new Error("usage: put <localPath> <folderId>");
  const token = await accessToken();
  const buf = await readFile(localPath);
  const name = basename(localPath);
  const boundary = "drvbnd_" + Math.random().toString(36).slice(2);
  const metadata = { name, parents: [folderId] };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  console.log(`Uploaded → ${j.webViewLink} (id=${j.id})`);
}

const [, , cmd, ...rest] = process.argv;
try {
  if (cmd === "auth") await cmdAuth();
  else if (cmd === "ls") await cmdLs(rest[0]);
  else if (cmd === "get") await cmdGet(rest[0], rest[1]);
  else if (cmd === "put") await cmdPut(rest[0], rest[1]);
  else {
    console.log("commands: auth | ls <folderId> | get <fileId> [out] | put <localPath> <folderId>");
    process.exit(1);
  }
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}
