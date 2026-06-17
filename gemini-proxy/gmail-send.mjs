#!/usr/bin/env node
// ============================================================================
// gmail-send.mjs — local Gmail send CLI for chaelri.github.io.
//
// Reuses the same OAuth client as drive-helper.mjs (.drive-client.json).
// Stores its own refresh token in .gmail-creds.json so it doesn't trample
// drive-helper's creds. Scope set: drive + gmail.send + email + openid, so
// one auth grant covers both helpers if you ever want to consolidate.
//
// Commands:
//   node gmail-send.mjs auth
//     One-time. Opens browser, you click through consent (the app is in
//     "Testing" mode so you'll see an "unverified app" warning — proceed),
//     paste happens automatically via loopback redirect.
//
//   node gmail-send.mjs send --to <addr> --subject <s> [--body <text>] \
//                            [--attach <path>] [--from <addr>]
//     Sends one email. --attach can be repeated for multiple files.
//
// Files:
//   .drive-client.json — shared OAuth client (Desktop type)
//   .gmail-creds.json  — refresh token cache (gitignored)
// ============================================================================

import { readFile, writeFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { basename } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const CLIENT_PATH = `${HERE}.drive-client.json`;
const CREDS_PATH = `${HERE}.gmail-creds.json`;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.send",
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

  console.log("Opening browser… if it doesn't open, visit:\n", url.toString());
  exec(`open "${url.toString()}"`);

  const code = await new Promise((res, rej) => {
    server.on("request", (req, resp) => {
      const u = new URL(req.url, redirectUri);
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      resp.writeHead(200, { "content-type": "text/html" });
      resp.end(
        c
          ? "<h2>Authorized.</h2><p>You can close this tab.</p>"
          : `<h2>Auth failed</h2><pre>${err || "no code"}</pre>`,
      );
      server.close();
      c ? res(c) : rej(new Error(err || "no code"));
    });
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tok = await tokenRes.json();
  if (!tok.refresh_token) {
    throw new Error(`No refresh_token in response: ${JSON.stringify(tok)}`);
  }
  await saveCreds({ refresh_token: tok.refresh_token });
  console.log("Saved", CREDS_PATH);
}

async function accessToken() {
  const client = await loadClient();
  const { refresh_token } = await loadCreds();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(j)}`);
  }
  return j.access_token;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseArgs(argv) {
  const out = { attach: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--to") out.to = argv[++i];
    else if (a === "--from") out.from = argv[++i];
    else if (a === "--subject") out.subject = argv[++i];
    else if (a === "--body") out.body = argv[++i];
    else if (a === "--attach") out.attach.push(argv[++i]);
  }
  return out;
}

async function buildMime({ from, to, subject, body, attach }) {
  const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
  ];

  const parts = [];
  // Body part (plaintext; empty allowed)
  parts.push(
    [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      body ?? "",
      "",
    ].join("\r\n"),
  );

  for (const path of attach) {
    const data = await readFile(path);
    const name = basename(path);
    const b64 = data.toString("base64").replace(/(.{76})/g, "$1\r\n");
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: application/pdf; name="${name}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${name}"`,
        "",
        b64,
        "",
      ].join("\r\n"),
    );
  }
  parts.push(`--${boundary}--`);
  return headers.join("\r\n") + parts.join("\r\n");
}

async function cmdSend(args) {
  const opts = parseArgs(args);
  if (!opts.to || !opts.subject) {
    throw new Error("--to and --subject are required");
  }
  const from = opts.from || "charliecayno@gmail.com";

  for (const p of opts.attach) {
    const s = await stat(p);
    console.log(`attaching ${p} (${(s.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  const mime = await buildMime({
    from,
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    attach: opts.attach,
  });

  const token = await accessToken();
  const raw = b64url(mime);
  // Gmail send caps at 35 MB for the request body; large attachments need
  // resumable upload via /upload endpoint with uploadType=media.
  const useResumable = raw.length > 5 * 1024 * 1024;

  if (useResumable) {
    // Start resumable session
    const init = await fetch(
      "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=resumable",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-upload-content-type": "message/rfc822",
        },
        body: JSON.stringify({}),
      },
    );
    if (!init.ok) {
      throw new Error(
        `Resumable init failed: ${init.status} ${await init.text()}`,
      );
    }
    const sessionUrl = init.headers.get("location");
    const upload = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "content-type": "message/rfc822" },
      body: mime,
    });
    if (!upload.ok) {
      throw new Error(
        `Resumable upload failed: ${upload.status} ${await upload.text()}`,
      );
    }
    const j = await upload.json();
    console.log("Sent. Message id:", j.id, "thread:", j.threadId);
  } else {
    const r = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    if (!r.ok) {
      throw new Error(`Send failed: ${r.status} ${await r.text()}`);
    }
    const j = await r.json();
    console.log("Sent. Message id:", j.id, "thread:", j.threadId);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "auth") await cmdAuth();
  else if (cmd === "send") await cmdSend(rest);
  else {
    console.error(
      "usage:\n  node gmail-send.mjs auth\n  node gmail-send.mjs send --to <addr> --subject <s> [--body <t>] [--attach <path>]...",
    );
    process.exit(1);
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
