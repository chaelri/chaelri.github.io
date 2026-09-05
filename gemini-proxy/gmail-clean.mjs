#!/usr/bin/env node
// ============================================================================
// gmail-clean.mjs — multi-account Gmail inbox cleanup CLI.
//
// Sibling to gmail-helper.mjs (read/search) and gmail-send.mjs (send). Reuses
// the same OAuth Desktop client (.drive-client.json) but keeps a SEPARATE
// refresh-token file per account so Charlie's creds are never overwritten:
//
//     --account charlie  ->  .gmail-creds-charlie.json
//     --account karla    ->  .gmail-creds-karla.json
//
// Requests gmail.modify (archive / label / mark-read). gmail.modify is a
// Google *restricted* scope: the account signing in must be listed as a Test
// User on the consent screen of project gen-lang-client-0614956024, and in
// Testing mode the refresh token expires after 7 days. Re-run `auth` if a
// command starts failing with invalid_grant.
//
// EVERY mutating command is a DRY RUN unless --apply is passed.
//
// Commands:
//   node gmail-clean.mjs auth      --account <name>
//   node gmail-clean.mjs whoami    --account <name>
//   node gmail-clean.mjs labels    --account <name>
//   node gmail-clean.mjs survey    --account <name> [--query "in:inbox"] [--max N]
//   node gmail-clean.mjs count     --account <name> --query "<gmail query>"
//   node gmail-clean.mjs preview   --account <name> --query "<q>" [--max N]
//   node gmail-clean.mjs mklabel   --account <name> --label "Name" [--color RED] [--apply]
//   node gmail-clean.mjs archive   --account <name> --query "<q>" [--apply]
//   node gmail-clean.mjs label     --account <name> --query "<q>" --label "Name" [--archive] [--apply]
//   node gmail-clean.mjs markread  --account <name> --query "<q>" [--apply]
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { exec } from "node:child_process";

const HERE = new URL(".", import.meta.url).pathname;
const CLIENT_PATH = `${HERE}.drive-client.json`;
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

// ---------------------------------------------------------------- flags ----

function parseFlags(args) {
  const out = { positional: [], apply: false, archive: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--archive") out.archive = true;
    else if (a === "--json") out.json = true;
    else if (a.startsWith("--")) out[a.slice(2)] = args[++i];
    else out.positional.push(a);
  }
  return out;
}

function credsPath(account) {
  if (!account) throw new Error("--account <name> is required (e.g. karla)");
  if (!/^[a-z0-9_-]+$/i.test(account)) throw new Error(`bad --account: ${account}`);
  return `${HERE}.gmail-creds-${account}.json`;
}

// ----------------------------------------------------------------- auth ----

async function loadClient() {
  const raw = JSON.parse(await readFile(CLIENT_PATH, "utf8"));
  const c = raw.installed || raw.web;
  if (!c?.client_id) throw new Error(`Invalid client JSON at ${CLIENT_PATH}`);
  return c;
}

async function cmdAuth(f) {
  const path = credsPath(f.account);
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
  if (f.login_hint) url.searchParams.set("login_hint", f.login_hint);

  console.log(`\nSign in as the ${f.account} account. If the browser does not open:\n`);
  console.log(url.toString() + "\n");
  exec(`open "${url.toString()}"`);

  const code = await new Promise((res, rej) => {
    server.on("request", (req, resp) => {
      const u = new URL(req.url, redirectUri);
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      resp.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      resp.end(
        c
          ? "<h2>Authorized.</h2><p>You can close this tab.</p>"
          : `<h2>Auth failed</h2><pre>${err || "no code"}</pre>`,
      );
      server.close();
      c ? res(c) : rej(new Error(err || "no code"));
    });
  });

  const tok = await (
    await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })
  ).json();

  if (!tok.refresh_token) throw new Error(`No refresh_token: ${JSON.stringify(tok)}`);

  // Restricted scopes are an opt-in tickbox on the consent screen. Clicking
  // Continue without ticking it still returns a valid token — one that grants
  // only openid+email. Refuse to save that, it fails confusingly much later.
  if (!(tok.scope || "").includes("gmail.modify")) {
    throw new Error(
      `Consent did not include gmail.modify — granted only: ${tok.scope}\n` +
        `On the "Select what chaelri-drive can access" screen you must TICK the\n` +
        `Gmail checkbox (or hit "Select all") before pressing Continue. Re-run auth.`,
    );
  }

  await writeFile(path, JSON.stringify({ refresh_token: tok.refresh_token }, null, 2));
  console.log("Saved", path);

  const who = await api(tok.access_token, "/profile");
  console.log("Signed in as:", who.emailAddress, `(${who.messagesTotal} messages)`);
}

async function accessToken(account) {
  const client = await loadClient();
  const { refresh_token } = JSON.parse(await readFile(credsPath(account), "utf8"));
  const j = await (
    await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        client_secret: client.client_secret,
        refresh_token,
        grant_type: "refresh_token",
      }),
    })
  ).json();
  if (!j.access_token) {
    throw new Error(
      `Token refresh failed for "${account}": ${JSON.stringify(j)}\n` +
        `If this says invalid_grant, re-run: node gmail-clean.mjs auth --account ${account}`,
    );
  }
  return j.access_token;
}

// ------------------------------------------------------------------ api ----

async function api(token, path, opts = {}) {
  for (let attempt = 0; attempt < 7; attempt++) {
    const r = await fetch(API + path, {
      ...opts,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(opts.headers || {}),
      },
    });
    if (r.status === 429 || r.status >= 500) {
      await sleep(1000 * 2 ** attempt + Math.random() * 400);
      continue;
    }
    const text = await r.text();
    // Gmail reports per-user rate limiting as 403 rateLimitExceeded, not 429.
    if (r.status === 403 && /rateLimitExceeded/i.test(text)) {
      await sleep(2000 * 2 ** attempt + Math.random() * 500);
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${path}\n${text.slice(0, 600)}`);
    return text ? JSON.parse(text) : {};
  }
  throw new Error(`giving up after retries: ${path}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------- helpers ----

function bar(done, total, label) {
  if (!process.stderr.isTTY && done !== total) return;
  const pct = total ? done / total : 0;
  const width = 28;
  const filled = Math.round(pct * width);
  const elapsed = (Date.now() - bar.start) / 1000;
  const eta = pct > 0.01 ? Math.max(0, elapsed / pct - elapsed) : 0;
  const line =
    `\r${label} [${"#".repeat(filled)}${"-".repeat(width - filled)}] ` +
    `${(pct * 100).toFixed(1)}%  ${done}/${total}  ETA ${fmt(eta)}   `;
  process.stderr.write(line);
  if (done === total) process.stderr.write("\n");
}
bar.reset = () => (bar.start = Date.now());
const fmt = (s) =>
  s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.round(s)}s`;

/** All message ids matching a query. */
async function allMessageIds(token, query, cap = Infinity) {
  const ids = [];
  let pageToken;
  bar.reset();
  do {
    const q = new URLSearchParams({ q: query, maxResults: "500" });
    if (pageToken) q.set("pageToken", pageToken);
    const page = await api(token, `/messages?${q}`);
    for (const m of page.messages || []) ids.push(m.id);
    pageToken = page.nextPageToken;
    process.stderr.write(`\rlisting… ${ids.length} messages   `);
  } while (pageToken && ids.length < cap);
  process.stderr.write("\n");
  return ids.slice(0, cap === Infinity ? undefined : cap);
}

/**
 * True match count. Gmail's resultSizeEstimate saturates around 201 for any
 * query, so it is useless — page through ids and count for real.
 */
async function estimate(token, query) {
  let n = 0;
  let pageToken;
  do {
    const q = new URLSearchParams({ q: query, maxResults: "500" });
    if (pageToken) q.set("pageToken", pageToken);
    const page = await api(token, `/messages?${q}`);
    n += (page.messages || []).length;
    pageToken = page.nextPageToken;
  } while (pageToken);
  return n;
}

/** Fetch From/Subject/Date metadata with bounded concurrency + progress. */
async function fetchMeta(token, ids, concurrency = 8) {
  const out = new Array(ids.length);
  let next = 0;
  let done = 0;
  bar.reset();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= ids.length) return;
        const q =
          "format=metadata&metadataHeaders=From&metadataHeaders=Subject" +
          "&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post";
        const m = await api(token, `/messages/${ids[i]}?${q}`);
        const h = Object.fromEntries(
          (m.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]),
        );
        out[i] = {
          id: m.id,
          threadId: m.threadId,
          size: m.sizeEstimate || 0,
          from: h.from || "",
          subject: h.subject || "",
          unsub: !!h["list-unsubscribe"],
          unsubHeader: h["list-unsubscribe"] || "",
          unsubPost: h["list-unsubscribe-post"] || "",
          labels: m.labelIds || [],
          date: Number(m.internalDate),
        };
        bar(++done, ids.length, "reading");
      }
    }),
  );
  return out;
}

function senderKey(from) {
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  const name = from.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
  return { addr, name: name || addr, domain: addr.split("@")[1] || "" };
}

async function batchModify(token, ids, addLabelIds, removeLabelIds, label) {
  bar.reset();
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await api(token, "/messages/batchModify", {
      method: "POST",
      body: JSON.stringify({ ids: chunk, addLabelIds, removeLabelIds }),
    });
    bar(Math.min(i + 1000, ids.length), ids.length, label);
  }
}

async function findLabel(token, name) {
  const { labels = [] } = await api(token, "/labels");
  return labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
}

// -------------------------------------------------------------- commands ----

async function cmdWhoami(f) {
  const token = await accessToken(f.account);
  const p = await api(token, "/profile");
  console.log(`${p.emailAddress}  —  ${p.messagesTotal} messages, ${p.threadsTotal} threads`);
}

async function cmdLabels(f) {
  const token = await accessToken(f.account);
  const { labels = [] } = await api(token, "/labels");
  const user = labels.filter((l) => l.type === "user");
  console.log(`${user.length} user label(s):`);
  for (const l of user.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${l.name}  (${l.id})`);
  }
}

async function cmdCount(f) {
  const token = await accessToken(f.account);
  const q = f.query || "in:inbox";
  console.log(`${await estimate(token, q)}  ~matches for: ${q}`);
}

async function cmdPreview(f) {
  const token = await accessToken(f.account);
  const q = f.query || "in:inbox";
  const max = Number(f.max || 25);
  const ids = await allMessageIds(token, q, max);
  const meta = await fetchMeta(token, ids);
  for (const m of meta) {
    const d = new Date(m.date).toISOString().slice(0, 10);
    console.log(`${d}  ${senderKey(m.from).addr.padEnd(38)}  ${m.subject.slice(0, 70)}`);
  }
  console.log(`\n(showing ${meta.length}; ~${await estimate(token, q)} total match)`);
}

async function cmdSurvey(f) {
  const token = await accessToken(f.account);
  const q = f.query || "in:inbox";
  const max = Number(f.max || 800);
  const total = await estimate(token, q);
  console.error(`query: ${q}\n~${total} matching; sampling up to ${max}\n`);

  const ids = await allMessageIds(token, q, max);
  const meta = await fetchMeta(token, ids);

  const bySender = new Map();
  for (const m of meta) {
    const k = senderKey(m.from);
    const e = bySender.get(k.addr) || { ...k, n: 0, unread: 0, unsub: 0, sample: "" };
    e.n++;
    if (m.labels.includes("UNREAD")) e.unread++;
    if (m.unsub) e.unsub++;
    if (!e.sample) e.sample = m.subject;
    bySender.set(k.addr, e);
  }

  const rows = [...bySender.values()].sort((a, b) => b.n - a.n);
  const unreadTotal = meta.filter((m) => m.labels.includes("UNREAD")).length;

  if (f.json) {
    console.log(JSON.stringify({ query: q, total, sampled: meta.length, unreadTotal, senders: rows }, null, 2));
    return;
  }

  console.log(`\nsampled ${meta.length} of ~${total}   (${unreadTotal} unread in sample)\n`);
  console.log("  n  unread  unsub?  sender");
  console.log("  -  ------  ------  ------");
  for (const r of rows.slice(0, 60)) {
    console.log(
      `${String(r.n).padStart(4)}  ${String(r.unread).padStart(6)}  ${(r.unsub ? "yes" : "").padStart(6)}  ` +
        `${r.addr}  ${r.sample ? "— " + r.sample.slice(0, 50) : ""}`,
    );
  }
  if (rows.length > 60) console.log(`  … and ${rows.length - 60} more senders`);
}

async function cmdMklabel(f) {
  const token = await accessToken(f.account);
  if (!f.label) throw new Error("--label \"Name\" is required");
  const existing = await findLabel(token, f.label);
  if (existing) return console.log(`label already exists: ${f.label} (${existing.id})`);
  if (!f.apply) return console.log(`DRY RUN — would create label: ${f.label}`);
  const body = { name: f.label, labelListVisibility: "labelShow", messageListVisibility: "show" };
  if (f.color) body.color = { backgroundColor: f.color, textColor: "#ffffff" };
  const l = await api(token, "/labels", { method: "POST", body: JSON.stringify(body) });
  console.log(`created label: ${l.name} (${l.id})`);
}

async function mutate(f, { addLabelIds = [], removeLabelIds = [], verb }) {
  const token = await accessToken(f.account);
  const q = f.query;
  if (!q) throw new Error('--query "<gmail query>" is required');

  const ids = await allMessageIds(token, q);
  if (!ids.length) return console.log(`nothing matches: ${q}`);

  if (!f.apply) {
    const meta = await fetchMeta(token, ids.slice(0, 20));
    console.log(`\nDRY RUN — would ${verb} ${ids.length} message(s) matching: ${q}\n`);
    for (const m of meta) {
      console.log(`  ${new Date(m.date).toISOString().slice(0, 10)}  ${senderKey(m.from).addr.padEnd(34)}  ${m.subject.slice(0, 60)}`);
    }
    if (ids.length > meta.length) console.log(`  … and ${ids.length - meta.length} more`);
    console.log(`\nRe-run with --apply to do it.`);
    return;
  }

  await batchModify(token, ids, addLabelIds, removeLabelIds, verb);
  console.log(`${verb}: ${ids.length} message(s)  [${q}]`);
}

async function cmdArchive(f) {
  return mutate(f, { removeLabelIds: ["INBOX"], verb: "archive" });
}

async function cmdMarkread(f) {
  return mutate(f, { removeLabelIds: ["UNREAD"], verb: "mark read" });
}

async function cmdLabelQuery(f) {
  const token = await accessToken(f.account);
  if (!f.label) throw new Error('--label "Name" is required');
  let l = await findLabel(token, f.label);
  if (!l) {
    if (!f.apply) {
      console.log(`(label "${f.label}" does not exist yet — --apply would create it)`);
    } else {
      l = await api(token, "/labels", {
        method: "POST",
        body: JSON.stringify({ name: f.label, labelListVisibility: "labelShow", messageListVisibility: "show" }),
      });
      console.log(`created label: ${l.name} (${l.id})`);
    }
  }
  return mutate(f, {
    addLabelIds: l ? [l.id] : [],
    removeLabelIds: f.archive ? ["INBOX"] : [],
    verb: f.archive ? `label "${f.label}" + archive` : `label "${f.label}"`,
  });
}

/**
 * Recolor an existing label. Gmail only accepts background/text values from its
 * own fixed palette — an arbitrary hex is rejected with a 400.
 */
async function cmdRecolor(f) {
  const token = await accessToken(f.account);
  if (!f.label || !f.bg) throw new Error('usage: recolor --label "Name" --bg "#3c78d8" [--fg "#ffffff"] --apply');
  const l = await findLabel(token, f.label);
  if (!l) throw new Error(`no such label: ${f.label}`);
  const color = { backgroundColor: f.bg, textColor: f.fg || "#ffffff" };
  if (!f.apply) return console.log(`DRY RUN — would set ${f.label} to bg ${color.backgroundColor}`);
  await api(token, `/labels/${l.id}`, { method: "PATCH", body: JSON.stringify({ ...l, color }) });
  console.log(`recolored ${f.label} -> ${color.backgroundColor}`);
}

const mb = (b) => (b / 1048576).toFixed(1);

/**
 * Where the mailbox bytes actually are. Groups matching messages by sender and
 * totals their sizeEstimate, so the report is "who is costing you space",
 * not just "which single mail is biggest".
 */
async function cmdBig(f) {
  const token = await accessToken(f.account);
  const q = f.query || "larger:1M";
  const ids = await allMessageIds(token, q, Number(f.max || 3000));
  const meta = await fetchMeta(token, ids);

  const bySender = new Map();
  for (const m of meta) {
    const { addr } = senderKey(m.from);
    const e = bySender.get(addr) || { addr, n: 0, bytes: 0, sample: "", oldest: Infinity };
    e.n++;
    e.bytes += m.size;
    e.oldest = Math.min(e.oldest, m.date);
    if (!e.sample) e.sample = m.subject;
    bySender.set(addr, e);
  }

  const rows = [...bySender.values()].sort((a, b) => b.bytes - a.bytes);
  const total = meta.reduce((s, m) => s + m.size, 0);
  console.log(`\n${meta.length} message(s) matching "${q}" = ${mb(total)} MB total\n`);
  console.log("   MB     n  oldest      sender");
  for (const r of rows.slice(0, 40)) {
    console.log(
      `${mb(r.bytes).padStart(7)} ${String(r.n).padStart(5)}  ` +
        `${new Date(r.oldest).toISOString().slice(0, 10)}  ${r.addr.slice(0, 44)}  ${r.sample.slice(0, 34)}`,
    );
  }
  if (rows.length > 40) {
    const rest = rows.slice(40).reduce((s, r) => s + r.bytes, 0);
    console.log(`${mb(rest).padStart(7)}        …and ${rows.length - 40} more senders`);
  }
}

// ------------------------------------------------------------ unsubscribe ----

/** Split a List-Unsubscribe header into its https and mailto targets. */
function parseUnsub(header) {
  const out = { http: "", mailto: "" };
  for (const m of header.matchAll(/<([^>]+)>/g)) {
    const v = m[1].trim();
    if (/^https:\/\//i.test(v) && !out.http) out.http = v;
    else if (/^mailto:/i.test(v) && !out.mailto) out.mailto = v;
  }
  return out;
}

/**
 * One-click unsubscribe per RFC 8058: POST "List-Unsubscribe=One-Click" to the
 * https target. Only sent when the sender advertised List-Unsubscribe-Post,
 * which is the sender declaring that the POST alone completes the opt-out.
 * The body is a fixed constant — no mailbox data ever leaves in the request.
 */
async function oneClick(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, {
      method: "POST",
      redirect: "follow",
      signal: ctl.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: e.name === "AbortError" ? "timeout" : e.message.slice(0, 40) };
  } finally {
    clearTimeout(timer);
  }
}

async function cmdUnsub(f) {
  const token = await accessToken(f.account);
  const q = f.query;
  if (!q) throw new Error('--query "<gmail query>" is required');

  const ids = await allMessageIds(token, q, Number(f.max || 700));
  const meta = await fetchMeta(token, ids);

  // Newest message per sender that actually carries an unsubscribe header.
  const bySender = new Map();
  for (const m of meta) {
    const { addr } = senderKey(m.from);
    if (!m.unsubHeader) continue;
    const prev = bySender.get(addr);
    if (!prev || m.date > prev.date) bySender.set(addr, m);
  }

  const rows = [...bySender.entries()].map(([addr, m]) => {
    const u = parseUnsub(m.unsubHeader);
    const isOneClick = /one-click/i.test(m.unsubPost) && !!u.http;
    return { addr, ...u, isOneClick, count: meta.filter((x) => senderKey(x.from).addr === addr).length };
  }).sort((a, b) => b.count - a.count);

  const auto = rows.filter((r) => r.isOneClick);
  const manualHttp = rows.filter((r) => !r.isOneClick && r.http);
  const mailOnly = rows.filter((r) => !r.isOneClick && !r.http && r.mailto);
  const none = meta.length
    ? [...new Set(meta.filter((m) => !m.unsubHeader).map((m) => senderKey(m.from).addr))]
    : [];

  console.log(
    `\n${rows.length} sender(s) with an unsubscribe header — ` +
      `${auto.length} one-click, ${manualHttp.length} need a browser, ${mailOnly.length} mailto-only\n`,
  );

  if (!f.apply) {
    for (const r of auto) console.log(`  [one-click] ${String(r.count).padStart(4)}  ${r.addr}`);
    for (const r of manualHttp) console.log(`  [browser  ] ${String(r.count).padStart(4)}  ${r.addr}  ${r.http.slice(0, 80)}`);
    for (const r of mailOnly) console.log(`  [mailto   ] ${String(r.count).padStart(4)}  ${r.addr}  ${r.mailto.slice(0, 60)}`);
    if (none.length) console.log(`\n  no unsubscribe header at all: ${none.length} sender(s)`);
    console.log(`\nDRY RUN — re-run with --apply to send the ${auto.length} one-click opt-outs.`);
    return;
  }

  let ok = 0;
  bar.reset();
  for (let i = 0; i < auto.length; i++) {
    const r = await oneClick(auto[i].http);
    if (r.ok) ok++;
    console.log(`  ${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(8)} ${auto[i].addr}`);
    await sleep(300);
  }
  console.log(`\none-click unsubscribed: ${ok}/${auto.length}`);
  if (manualHttp.length) {
    console.log(`\nNeed a browser click (open these yourself):`);
    for (const r of manualHttp) console.log(`  ${r.addr}\n    ${r.http}`);
  }
  if (mailOnly.length) {
    console.log(`\nMailto-only (needs an email sent from her account, not done here):`);
    for (const r of mailOnly) console.log(`  ${r.addr}  ${r.mailto}`);
  }
}

// ----------------------------------------------------------------- main ----

const CMDS = {
  auth: cmdAuth,
  whoami: cmdWhoami,
  labels: cmdLabels,
  count: cmdCount,
  preview: cmdPreview,
  survey: cmdSurvey,
  mklabel: cmdMklabel,
  archive: cmdArchive,
  markread: cmdMarkread,
  unsub: cmdUnsub,
  recolor: cmdRecolor,
  big: cmdBig,
  label: cmdLabelQuery,
};

const [, , cmd, ...rest] = process.argv;
const fn = CMDS[cmd];
if (!fn) {
  console.error(
    "usage:\n" +
      Object.keys(CMDS)
        .map((c) => `  node gmail-clean.mjs ${c} --account <name> …`)
        .join("\n"),
  );
  process.exit(1);
}
fn(parseFlags(rest)).catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
