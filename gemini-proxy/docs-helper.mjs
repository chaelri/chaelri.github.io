#!/usr/bin/env node
// ============================================================================
// docs-helper.mjs — local Google Docs read/write CLI for chaelri.github.io.
//
// Sibling of drive-helper.mjs / sheets-helper.mjs. Same OAuth client
// (gen-lang-client-0614956024, Testing mode, Charlie as the only test user),
// but its own refresh-token cache so re-authing Docs doesn't disturb the
// others. The Docs API accepts the `drive` scope, so SCOPES matches
// drive-helper.mjs and no consent-screen change was needed.
//
// Files:
//   .drive-client.json — shared OAuth client (Desktop app type). Gitignored.
//   .docs-creds.json   — refresh token cache, written by `auth`. Gitignored.
//
// Commands:
//   node docs-helper.mjs auth                    one-time, opens browser
//   node docs-helper.mjs get <docId>             dump the doc as plain text
//   node docs-helper.mjs raw <docId> [outPath]   dump the full JSON structure
//   node docs-helper.mjs update <docId> <reqs.json>
//                                                POST a batchUpdate requests[]
//
// docId = the chunk between /document/d/ and /edit in the doc URL.
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { exec } from "node:child_process";

const HERE = new URL(".", import.meta.url).pathname;
const CLIENT_PATH = `${HERE}.drive-client.json`;
const CREDS_PATH = `${HERE}.docs-creds.json`;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
].join(" ");
const QUOTA_PROJECT = "gen-lang-client-0614956024";
const API = "https://docs.googleapis.com/v1/documents";

async function loadClient() {
  const raw = JSON.parse(await readFile(CLIENT_PATH, "utf8"));
  const c = raw.installed || raw.web || raw;
  if (!c.client_id || !c.client_secret) {
    throw new Error(`Invalid client JSON at ${CLIENT_PATH}`);
  }
  return c;
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
  await writeFile(CREDS_PATH, JSON.stringify({ refresh_token: tok.refresh_token }, null, 2));
  console.log(`Saved refresh token to ${CREDS_PATH}`);
}

async function accessToken() {
  const client = await loadClient();
  const { refresh_token } = JSON.parse(await readFile(CREDS_PATH, "utf8"));
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
  if (!r.ok) throw new Error(`refresh failed (run \`auth\` again): ${await r.text()}`);
  return (await r.json()).access_token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "x-goog-user-project": QUOTA_PROJECT,
  };
}

async function fetchDoc(docId) {
  const token = await accessToken();
  // includeTabsContent surfaces every tab, not just the first.
  const r = await fetch(`${API}/${docId}?includeTabsContent=true`, {
    headers: authHeaders(token),
  });
  if (!r.ok) throw new Error(`get failed ${r.status}: ${await r.text()}`);
  return r.json();
}

// Walk a body's structuralElements and print paragraph text with its style,
// plus the start index — the numbers every batchUpdate request needs.
function dumpBody(body, label) {
  if (label) console.log(`\n===== ${label} =====`);
  for (const el of body?.content || []) {
    if (el.paragraph) {
      const style = el.paragraph.paragraphStyle?.namedStyleType || "NORMAL_TEXT";
      const text = (el.paragraph.elements || [])
        .map((e) => e.textRun?.content || "")
        .join("")
        .replace(/\n$/, "");
      const bullet = el.paragraph.bullet ? "• " : "";
      console.log(`[${el.startIndex}-${el.endIndex}] ${style.padEnd(12)} ${bullet}${text}`);
    } else if (el.table) {
      console.log(`[${el.startIndex}-${el.endIndex}] TABLE ${el.table.rows}x${el.table.columns}`);
    } else if (el.sectionBreak) {
      console.log(`[${el.startIndex}] --- section break ---`);
    }
  }
}

async function cmdGet(docId) {
  const doc = await fetchDoc(docId);
  console.log(`Title: ${doc.title}`);
  if (doc.tabs?.length) {
    for (const tab of doc.tabs) {
      dumpBody(tab.documentTab?.body, tab.tabProperties?.title || "tab");
    }
  } else {
    dumpBody(doc.body);
  }
}

async function cmdRaw(docId, outPath) {
  const doc = await fetchDoc(docId);
  const json = JSON.stringify(doc, null, 2);
  if (outPath) {
    await writeFile(outPath, json);
    console.log(`Wrote ${outPath}`);
  } else {
    console.log(json);
  }
}

async function cmdUpdate(docId, reqsPath) {
  const parsed = JSON.parse(await readFile(reqsPath, "utf8"));
  // Accept either a bare array or a full { requests: [...] } envelope.
  const requests = Array.isArray(parsed) ? parsed : parsed.requests;
  if (!Array.isArray(requests)) throw new Error("expected an array of requests");
  const token = await accessToken();
  const r = await fetch(`${API}/${docId}:batchUpdate`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`batchUpdate failed ${r.status}: ${body}`);
  console.log(`Applied ${requests.length} request(s).`);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case "auth": await cmdAuth(); break;
    case "get": await cmdGet(args[0]); break;
    case "raw": await cmdRaw(args[0], args[1]); break;
    case "update": await cmdUpdate(args[0], args[1]); break;
    default:
      console.log(
        "Usage:\n" +
          "  node docs-helper.mjs auth\n" +
          "  node docs-helper.mjs get <docId>\n" +
          "  node docs-helper.mjs raw <docId> [outPath]\n" +
          "  node docs-helper.mjs update <docId> <reqs.json>"
      );
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
