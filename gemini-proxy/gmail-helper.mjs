#!/usr/bin/env node
// ============================================================================
// gmail-helper.mjs — local Gmail read/search CLI.
//
// Sibling to gmail-send.mjs. Reuses the same OAuth client (.drive-client.json)
// and the same refresh-token file (.gmail-creds.json) but requests an
// additional gmail.readonly scope. Re-auth once with this helper and both
// gmail-send.mjs (send) and gmail-helper.mjs (read) keep working from a
// single set of creds.
//
// Commands:
//   node gmail-helper.mjs auth
//     One-time OAuth. Overwrites .gmail-creds.json with a refresh token that
//     covers send + readonly + drive.
//
//   node gmail-helper.mjs search <query> [--max N] [--json]
//     Gmail search syntax: from:, to:, subject:, has:attachment, newer_than:7d, etc.
//     Default --max 25. Default output is human-friendly; --json for raw.
//
//   node gmail-helper.mjs get <messageId> [--json]
//     Full message: headers + decoded text body + attachment list.
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { exec } from "node:child_process";

const HERE = new URL(".", import.meta.url).pathname;
const CLIENT_PATH = `${HERE}.drive-client.json`;
const CREDS_PATH = `${HERE}.gmail-creds.json`;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
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

function parseFlags(args) {
  const out = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--max") out.max = parseInt(args[++i], 10);
    else if (a === "--json") out.json = true;
    else out.positional.push(a);
  }
  return out;
}

function b64urlDecode(s) {
  if (!s) return "";
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}

function headerMap(headers) {
  const m = {};
  for (const h of headers || []) m[h.name.toLowerCase()] = h.value;
  return m;
}

// Walk MIME tree; return { text, html, attachments[] }
function extractBody(payload) {
  const out = { text: "", html: "", attachments: [] };
  const walk = (part) => {
    if (!part) return;
    const mime = part.mimeType || "";
    const filename = part.filename || "";
    const body = part.body || {};
    if (filename && body.attachmentId) {
      out.attachments.push({
        filename,
        mimeType: mime,
        size: body.size || 0,
        attachmentId: body.attachmentId,
      });
    } else if (mime === "text/plain" && body.data) {
      out.text += b64urlDecode(body.data);
    } else if (mime === "text/html" && body.data) {
      out.html += b64urlDecode(body.data);
    }
    for (const p of part.parts || []) walk(p);
  };
  walk(payload);
  return out;
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function gmailGet(token, id, format = "full") {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=${format}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`messages.get ${id}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function cmdSearch(args) {
  const f = parseFlags(args);
  const query = f.positional.join(" ").trim();
  if (!query) throw new Error('usage: search "<gmail query>" [--max N] [--json]');
  const max = f.max || 25;
  const token = await accessToken();

  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(max));
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`list failed: ${r.status} ${await r.text()}`);
  const listing = await r.json();
  const ids = (listing.messages || []).map((m) => m.id);

  const rows = [];
  for (const id of ids) {
    const msg = await gmailGet(token, id, "metadata");
    const h = headerMap(msg.payload && msg.payload.headers);
    rows.push({
      id,
      threadId: msg.threadId,
      date: h.date || "",
      from: h.from || "",
      to: h.to || "",
      subject: h.subject || "",
      snippet: msg.snippet || "",
    });
  }

  if (f.json) {
    console.log(JSON.stringify({ query, count: rows.length, messages: rows }, null, 2));
    return;
  }

  if (!rows.length) {
    console.log(`No results for: ${query}`);
    return;
  }
  console.log(`${rows.length} result(s) for: ${query}\n`);
  for (const r of rows) {
    console.log(`id:      ${r.id}`);
    console.log(`date:    ${r.date}`);
    console.log(`from:    ${r.from}`);
    console.log(`subject: ${r.subject}`);
    console.log(`snippet: ${r.snippet}`);
    console.log("");
  }
}

async function cmdGet(args) {
  const f = parseFlags(args);
  const id = f.positional[0];
  if (!id) throw new Error("usage: get <messageId> [--json]");
  const token = await accessToken();
  const msg = await gmailGet(token, id, "full");
  const h = headerMap(msg.payload && msg.payload.headers);
  const body = extractBody(msg.payload);
  const text = body.text || htmlToText(body.html);

  if (f.json) {
    console.log(JSON.stringify({
      id: msg.id,
      threadId: msg.threadId,
      labels: msg.labelIds,
      headers: h,
      text,
      attachments: body.attachments,
    }, null, 2));
    return;
  }

  console.log(`id:      ${msg.id}`);
  console.log(`thread:  ${msg.threadId}`);
  console.log(`date:    ${h.date || ""}`);
  console.log(`from:    ${h.from || ""}`);
  console.log(`to:      ${h.to || ""}`);
  console.log(`cc:      ${h.cc || ""}`);
  console.log(`subject: ${h.subject || ""}`);
  if (body.attachments.length) {
    console.log(`attachments:`);
    for (const a of body.attachments) {
      console.log(`  - ${a.filename} (${a.mimeType}, ${(a.size/1024).toFixed(1)} KB)`);
    }
  }
  console.log("\n--- body ---");
  console.log(text);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "auth") await cmdAuth();
  else if (cmd === "search") await cmdSearch(rest);
  else if (cmd === "get") await cmdGet(rest);
  else {
    console.error(
      'usage:\n  node gmail-helper.mjs auth\n  node gmail-helper.mjs search "<query>" [--max N] [--json]\n  node gmail-helper.mjs get <messageId> [--json]',
    );
    process.exit(1);
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
