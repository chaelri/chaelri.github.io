#!/usr/bin/env node
// Pre-renders all 1,000 Campus UNITE 2026 tickets to PNG at the actual
// physical size (4.5 × 2 in / 300 DPI = 1,350 × 600 px). Runs Chrome via
// puppeteer-core (system browser, no Chromium download) against a tiny
// local static server so the same code path that the live print page uses
// (ticket.js + style.css + Google Fonts) produces every file.
//
// Usage:
//   BASE_URL=https://chaelri.github.io/elevate-eo-campus-unite-2026/ \
//     node render-tickets.mjs                  # all 1,000 tickets
//   FROM=1 TO=5 node render-tickets.mjs       # render only 1..5 (smoke test)
//
// The BASE_URL is the address that gets encoded into every QR code. Defaults
// to the GitHub Pages deploy.

import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";  // full puppeteer with bundled Chrome-for-Testing

// Pipe a PNG buffer through pngquant and return the compressed buffer.
// Falls back to the original if pngquant exits non-zero.
function pngquant(buf, quality = "78-92") {
  return new Promise((resolve) => {
    const proc = spawn("pngquant", ["--quality", quality, "--speed", "3", "--strip", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    let errOut = "";
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => (errOut += c.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else {
        if (errOut) console.warn("pngquant:", errOut.trim());
        resolve(buf);
      }
    });
    proc.on("error", () => resolve(buf));
    proc.stdin.end(buf);
  });
}

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, "../..");      // chaelri.github.io
const OUT_DIR    = path.resolve(__dirname, "../assets/tickets");

const BASE_URL   = process.env.BASE_URL || "https://chaelri.github.io/elevate-eo-campus-unite-2026/";
const FROM       = parseInt(process.env.FROM || "1",    10);
const TO         = parseInt(process.env.TO   || "1000", 10);
const PORT       = parseInt(process.env.PORT || "7891", 10);
// Falls back to puppeteer's bundled Chrome-for-Testing — much more stable
// for batch automation than recent versions of system Chrome.
const CHROME_BIN = process.env.CHROME_PATH || null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".otf":  "font/otf",
  ".ico":  "image/x-icon",
};

function startStaticServer(root, port) {
  const server = http.createServer(async (req, res) => {
    try {
      const url  = new URL(req.url, "http://x");
      // Silence the favicon 404 every browser requests on every page load.
      if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
      const rel  = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const full = path.resolve(root, rel);
      // Containment: never serve files outside the repo root.
      if (!full.startsWith(root)) { res.writeHead(403).end("forbidden"); return; }
      const data = await fs.readFile(full);
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch (err) {
      if (err.code === "ENOENT") { res.writeHead(404).end("not found"); return; }
      res.writeHead(500).end(String(err));
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function fmt(ms) {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}m ${r.toFixed(0)}s`;
}

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(`Repo root  : ${REPO_ROOT}`);
  console.log(`Out dir    : ${OUT_DIR}`);
  console.log(`Base URL   : ${BASE_URL}`);
  console.log(`Range      : ECU-${String(FROM).padStart(4,"0")} → ECU-${String(TO).padStart(4,"0")}`);
  console.log(`Chrome     : ${CHROME_BIN}`);

  const server = await startStaticServer(REPO_ROOT, PORT);
  const stageUrl = `http://127.0.0.1:${PORT}/elevate-eo-campus-unite-2026/scripts/render-stage.html`;

  // Headless Chrome was crashing reliably after ~10–15 screenshots in a
  // single page ("detached Frame"). The fix that actually held was to
  // relaunch a fresh Chrome process per BATCH of renders. Adds ~1 s/batch
  // overhead, but each batch starts with a clean page.
  // Bundled Chrome-for-Testing is far more stable for batch automation; can
  // safely keep one process alive for 200 renders.
  const BATCH = 200;
  const t0 = Date.now();
  let ok = 0, fail = 0;
  let totalBytes = 0;

  async function renderRangeInOnePage(fromN, toN) {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "cu-prerender-"));
    const browser = await puppeteer.launch({
      ...(CHROME_BIN ? { executablePath: CHROME_BIN } : {}),
      headless: true,
      userDataDir,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-features=Translate",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--mute-audio",
      ],
      defaultViewport: {
        width: 800,
        height: 400,
        deviceScaleFactor: 25 / 8,  // 3.125 — turns 432×192 CSS into 1350×600 px
      },
    });
    try {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("page error :", e.message));
      page.on("console",   (msg) => { if (msg.type() === "error") console.error("[err]", msg.text()); });
      await page.goto(stageUrl, { waitUntil: "load" });
      await page.waitForFunction("window.__ready === true");
      await page.evaluate(() => window.__fontsReady);

      for (let n = fromN; n <= toN; n++) {
        let handle = null;
        try {
          const id = await page.evaluate((nn, base) => window.__renderTicket(nn, base), n, BASE_URL);
          handle = await page.$("#stage > .ticket");
          if (!handle) throw new Error("no .ticket node");
          const raw = await handle.screenshot({ type: "png", omitBackground: false });
          const buf = await pngquant(raw);
          await fs.writeFile(path.join(OUT_DIR, `${id}.png`), buf);
          totalBytes += buf.length;
          ok++;
        } finally {
          if (handle) await handle.dispose().catch(() => {});
        }
      }
    } finally {
      await browser.close();
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  for (let batchStart = FROM; batchStart <= TO; batchStart += BATCH) {
    const batchEnd = Math.min(batchStart + BATCH - 1, TO);
    let attempts = 0;
    while (attempts < 3) {
      try {
        await renderRangeInOnePage(batchStart, batchEnd);
        break;
      } catch (err) {
        attempts++;
        console.warn(`  batch ${batchStart}..${batchEnd} attempt ${attempts} failed:`, err.message);
        if (attempts >= 3) {
          fail += (batchEnd - batchStart + 1);
          console.error("  giving up on this batch");
        }
      }
    }
    const done = batchEnd - FROM + 1;
    const total = TO - FROM + 1;
    const elapsed = Date.now() - t0;
    const perTicket = elapsed / done;
    const remaining = (total - done) * perTicket;
    const avgKB = ok > 0 ? (totalBytes / ok / 1024).toFixed(0) : "—";
    console.log(`  ECU-${String(batchEnd).padStart(4,"0")}  ·  ${done}/${total}  ·  ${avgKB} KB avg  ·  ${fmt(elapsed)} elapsed  ·  ~${fmt(remaining)} left  ·  ${fail} fail`);
  }

  server.close();

  const totalKB = (totalBytes / 1024).toFixed(0);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
  console.log("");
  console.log(`Done. ${ok} rendered · ${fail} failed`);
  console.log(`Total payload: ${totalKB} KB (${totalMB} MB)`);
  console.log(`Output dir   : ${OUT_DIR}`);

  // No bulk ZIP is built here: a single ~127 MB ZIP would exceed GitHub's
  // 100 MB per-file limit, and chunking adds friction for the printer.
  // print.html assembles the archive client-side from the static PNGs
  // using the `client-zip` library on demand.
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
