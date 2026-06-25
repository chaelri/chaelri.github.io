#!/usr/bin/env node
// ============================================================================
// sheets-helper.mjs — local Sheets API CLI for chaelri.github.io.
//
// Uses Charlie's own OAuth Desktop client (gen-lang-client-0614956024, kept in
// "Testing" mode) with the `spreadsheets` scope. Needed because Google now
// blocks `spreadsheets` on gcloud's built-in ADC client ("This app is blocked").
//
// Files (gitignored, share path with drive-helper):
//   .drive-client.json  — same OAuth client JSON (Desktop app)
//   .sheets-creds.json  — refresh token cache, written by `auth`
//
// Commands:
//   node sheets-helper.mjs auth
//   node sheets-helper.mjs token                          print fresh access token
//   node sheets-helper.mjs tabs <sheetId>                 list tab titles + gids
//   node sheets-helper.mjs read <sheetId> <range>         e.g. 'Seating!A1:Z200'
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { exec } from "node:child_process";

const HERE = new URL(".", import.meta.url).pathname;
const CLIENT_PATH = `${HERE}.drive-client.json`;
const CREDS_PATH = `${HERE}.sheets-creds.json`;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");
const QUOTA_PROJECT = "gen-lang-client-0614956024";

async function loadClient() {
  const raw = JSON.parse(await readFile(CLIENT_PATH, "utf8"));
  const c = raw.installed || raw.web || raw;
  if (!c.client_id || !c.client_secret) throw new Error(`Invalid ${CLIENT_PATH}`);
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
      reply.end(c
        ? "<h2>Sheets auth complete. You can close this tab.</h2>"
        : `<h2>Auth failed: ${err}</h2>`);
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
  const t = await tokenResp.json();
  if (!t.refresh_token) throw new Error(`No refresh_token: ${JSON.stringify(t)}`);
  await writeFile(CREDS_PATH, JSON.stringify({
    refresh_token: t.refresh_token,
    client_id: client.client_id,
    client_secret: client.client_secret,
  }, null, 2));
  console.log("✓ Saved refresh token to", CREDS_PATH);
}

async function getToken() {
  const creds = JSON.parse(await readFile(CREDS_PATH, "utf8"));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`refresh failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

function headers(tok) {
  return { Authorization: `Bearer ${tok}`, "x-goog-user-project": QUOTA_PROJECT };
}

async function cmdToken() {
  console.log(await getToken());
}

async function cmdTabs(sheetId) {
  const tok = await getToken();
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title,index,gridProperties)`,
    { headers: headers(tok) },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  for (const s of j.sheets || []) {
    const p = s.properties;
    console.log(`${String(p.index).padStart(2)}  gid=${p.sheetId}  ${p.gridProperties?.rowCount}×${p.gridProperties?.columnCount}  ${p.title}`);
  }
}

async function cmdRead(sheetId, range) {
  const tok = await getToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const r = await fetch(url, { headers: headers(tok) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  console.log(JSON.stringify(j.values || [], null, 2));
}

const [cmd, ...args] = process.argv.slice(2);
const dispatch = { auth: cmdAuth, token: () => cmdToken(), tabs: () => cmdTabs(args[0]), read: () => cmdRead(args[0], args[1]) };
if (!dispatch[cmd]) {
  console.error("Usage: sheets-helper.mjs {auth|token|tabs <id>|read <id> <range>}");
  process.exit(1);
}
dispatch[cmd]().catch((e) => { console.error(e.message || e); process.exit(1); });
