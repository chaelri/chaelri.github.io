// ==UserScript==
// @name         HR Forte — Auto Login
// @namespace    https://chaelri.github.io/
// @version      1.3.0
// @description  Signs in to eva.hrforte.com and clears the SELECT COMPANY step. Credentials live in Tampermonkey storage, never in this file.
// @author       Charlie Cayno
// @match        https://eva.hrforte.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------- config --
  const K_EMAIL = 'hrf_email';
  const K_PASS = 'hrf_pass';
  const K_AUTOSUBMIT = 'hrf_autosubmit';       // true = click SIGN IN, false = fill only
  const K_COMPANY = 'hrf_company';             // substring to match; '' = keep preselected
  const K_AUTOGO = 'hrf_autogo';               // click Go on the SELECT COMPANY screen
  const SS_TRIED = 'hrf_autologin_tries';      // per-tab guard against submit loops
  const SS_WENT = 'hrf_company_done';          // per-tab guard against Go loops
  const MAX_TRIES = 2;                         // never burn more than this per tab
  const WAIT_MS = 15000;                       // how long to wait for the form to render
  const COMPANY_WAIT_MS = 180000;              // SELECT COMPANY arrives after a round trip
  const MAX_GO_CLICKS = 3;                     // stop hammering Go if it does nothing
  const SETTLE_MS = 700;                       // form must hold still this long before filling
  const ERROR_GRACE_MS = 6000;                 // how long to watch for a failed sign-in

  const cfg = {
    email: () => GM_getValue(K_EMAIL, ''),
    pass: () => GM_getValue(K_PASS, ''),
    autoSubmit: () => GM_getValue(K_AUTOSUBMIT, true),
    company: () => GM_getValue(K_COMPANY, ''),
    autoGo: () => GM_getValue(K_AUTOGO, true),
  };

  // ------------------------------------------------------------- utilities --

  // The form is React 16 with controlled inputs (`_valueTracker` on each field).
  // Assigning `el.value` directly updates the DOM but React's onChange never
  // fires, so state stays empty and SIGN IN posts blanks. Going through the
  // native prototype setter defeats the value tracker and makes React see it.
  function setReactValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function waitFor(selectorFn, timeout = WAIT_MS) {
    return new Promise((resolve) => {
      const found = selectorFn();
      if (found) return resolve(found);

      const obs = new MutationObserver(() => {
        const hit = selectorFn();
        if (hit) {
          obs.disconnect();
          clearTimeout(timer);
          resolve(hit);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });

      const timer = setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findForm() {
    const form = document.querySelector('#LoginForm')
      || document.querySelector('form:has(input[name="password"])');
    if (!form) return null;
    const email = form.querySelector('input[name="email"], input[type="email"]');
    const pass = form.querySelector('input[name="password"], input[type="password"]');
    const submit = form.querySelector('button[type="submit"]')
      || [...form.querySelectorAll('button')].find((b) => /sign\s*in/i.test(b.textContent));
    return email && pass ? { form, email, pass, submit } : null;
  }

  function toast(message, ms = 4000, onClick) {
    const el = document.createElement('div');
    el.textContent = message;
    Object.assign(el.style, {
      position: 'fixed', zIndex: 2147483647, left: '16px', bottom: '16px',
      background: '#1f2937', color: '#fff', font: '13px/1.4 system-ui, sans-serif',
      padding: '10px 14px', borderRadius: '8px', maxWidth: '320px',
      boxShadow: '0 6px 24px rgba(0,0,0,.35)',
      cursor: onClick ? 'pointer' : 'default',
    });
    if (onClick) el.addEventListener('click', onClick);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // The login screen re-mounts once the app's async config lands, which throws
  // away anything typed before that. Wait until the form element stops being
  // replaced for SETTLE_MS before touching it.
  async function settledForm() {
    let last = null;
    for (let i = 0; i < 20; i++) {
      const now = findForm();
      if (!now) return null;
      if (last && now.email === last.email && now.pass === last.pass) return now;
      last = now;
      await sleep(SETTLE_MS);
    }
    return last;
  }

  // Even after settling, re-check that React still holds our values right
  // before clicking — a late re-mount would otherwise submit an empty form.
  async function fillAndVerify(email, pass) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const f = findForm();
      if (!f) return null;

      f.email.focus();
      setReactValue(f.email, email);
      f.email.dispatchEvent(new Event('blur', { bubbles: true }));
      f.pass.focus();
      setReactValue(f.pass, pass);
      f.pass.dispatchEvent(new Event('blur', { bubbles: true }));

      await sleep(400);

      const after = findForm();
      if (after && after.email.value === email && after.pass.value === pass) return after;
    }
    return null;
  }

  // ------------------------------------------------- SELECT COMPANY screen --
  // Shown after a successful sign-in (and on a fresh load when the session is
  // still alive). Client-side route — no page load, so it needs its own watch.
  const CLICKABLE = 'button, input[type="submit"], input[type="button"], a,'
    + ' [role="button"], [class*="Button"], [class*="button"]';

  // Deliberately loose: SIGN IN is a real <button>, but Go may be an
  // <input type="submit"> (innerText empty — read .value) or a styled div.
  function clickableWithText(re) {
    const hits = [...document.querySelectorAll(CLICKABLE)].filter((el) => {
      const t = (el.value || el.innerText || el.textContent || '').trim();
      return re.test(t) && el.getClientRects().length > 0;
    });
    // Prefer the innermost match — clicking a styled wrapper can miss the
    // element React actually attached its handler to.
    return hits.find((el) => !hits.some((o) => o !== el && el.contains(o))) || null;
  }

  function findCompanyStep() {
    const go = clickableWithText(/^go$/i);
    if (!go) return null;
    const scope = go.closest('form') || go.parentElement?.parentElement || document.body;
    return { go, select: scope.querySelector('select') };
  }

  function pickCompany(select, wanted) {
    if (!select) return false;                 // custom dropdown, not a native <select>
    const opts = [...select.options];
    const match = wanted
      ? opts.find((o) => o.text.toLowerCase().includes(wanted.toLowerCase()))
      : null;
    // With no preference, only step in if nothing real is selected yet.
    const target = match
      || (select.selectedIndex <= 0 ? opts.find((o) => o.value && o.value !== '') : null);
    if (!target || target.selected) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, target.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Surface whatever the app says instead of a generic "it failed".
  function readPageError() {
    const text = (document.querySelector('#LoginForm')?.parentElement?.innerText || '');
    const line = text.split('\n').map((s) => s.trim()).find((s) =>
      /invalid|incorrect|wrong|not found|failed|locked|disabled|expired|required/i.test(s));
    return line && line.length < 140 ? line : '';
  }

  // ------------------------------------------------------- credential panel --
  // A real password field in an overlay, so the password is never typed into a
  // plaintext prompt() and never lives in this file.
  function openSetupPanel(prefillEmail) {
    if (document.getElementById('hrf-setup')) return;

    const wrap = document.createElement('div');
    wrap.id = 'hrf-setup';
    Object.assign(wrap.style, {
      position: 'fixed', inset: '0', zIndex: 2147483647,
      background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center',
      font: '14px/1.5 system-ui, sans-serif',
    });
    wrap.innerHTML = `
      <div style="background:#fff;color:#111;padding:22px;border-radius:12px;width:340px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">HR Forte auto-login</div>
        <div style="color:#666;font-size:12px;margin-bottom:14px">Stored in Tampermonkey's storage on this Mac only. Not encrypted — anyone with access to this browser profile can read it.</div>
        <label style="display:block;font-size:12px;color:#444;margin-bottom:4px">Email</label>
        <input id="hrf-email" type="email" autocomplete="off"
               style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccc;border-radius:6px;margin-bottom:10px">
        <label style="display:block;font-size:12px;color:#444;margin-bottom:4px">Password</label>
        <input id="hrf-pass" type="password" autocomplete="new-password"
               style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccc;border-radius:6px;margin-bottom:12px">
        <label style="display:block;font-size:12px;color:#444;margin-bottom:4px">Company (optional — leave blank to keep whatever is preselected)</label>
        <input id="hrf-company" type="text" autocomplete="off" placeholder="e.g. Home Repair Network"
               style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccc;border-radius:6px;margin-bottom:12px">
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:6px">
          <input id="hrf-auto" type="checkbox"> Click SIGN IN automatically
        </label>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:16px">
          <input id="hrf-go" type="checkbox"> Click Go on SELECT COMPANY
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="hrf-cancel" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">Cancel</button>
          <button id="hrf-save" style="padding:8px 14px;border:0;background:#f60;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">Save</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const $ = (id) => wrap.querySelector(id);
    $('#hrf-email').value = prefillEmail || cfg.email();
    $('#hrf-pass').value = cfg.pass();
    $('#hrf-company').value = cfg.company();
    $('#hrf-auto').checked = cfg.autoSubmit();
    $('#hrf-go').checked = cfg.autoGo();
    $('#hrf-email').focus();

    $('#hrf-cancel').onclick = () => wrap.remove();
    $('#hrf-save').onclick = () => {
      GM_setValue(K_EMAIL, $('#hrf-email').value.trim());
      GM_setValue(K_PASS, $('#hrf-pass').value);
      GM_setValue(K_COMPANY, $('#hrf-company').value.trim());
      GM_setValue(K_AUTOSUBMIT, $('#hrf-auto').checked);
      GM_setValue(K_AUTOGO, $('#hrf-go').checked);
      wrap.remove();
      sessionStorage.removeItem(SS_TRIED);
      sessionStorage.removeItem(SS_WENT);
      toast('Saved. Reloading…', 1500);
      setTimeout(() => location.reload(), 600);
    };
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') wrap.remove();
      if (e.key === 'Enter') $('#hrf-save').click();
    });
  }

  GM_registerMenuCommand('HR Forte: set credentials', () => openSetupPanel());
  GM_registerMenuCommand('HR Forte: clear credentials', () => {
    GM_deleteValue(K_EMAIL);
    GM_deleteValue(K_PASS);
    sessionStorage.removeItem(SS_TRIED);
    sessionStorage.removeItem(SS_WENT);
    toast('Credentials cleared.');
  });
  GM_registerMenuCommand('HR Forte: toggle auto-submit', () => {
    const next = !cfg.autoSubmit();
    GM_setValue(K_AUTOSUBMIT, next);
    toast('Auto-submit ' + (next ? 'ON' : 'OFF'));
  });
  GM_registerMenuCommand('HR Forte: debug — log what it sees', () => {
    const all = [...document.querySelectorAll(CLICKABLE)]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        tag: el.tagName, type: el.type || '', cls: (el.className || '').toString().slice(0, 60),
        text: (el.value || el.innerText || el.textContent || '').trim().slice(0, 30),
      }));
    console.log('[hrf] visible clickables:', all);
    console.log('[hrf] Go match:', clickableWithText(/^go$/i));
    console.log('[hrf] selects:', [...document.querySelectorAll('select')]);
    toast('Logged to the console (⌥⌘J).');
  });
  GM_registerMenuCommand('HR Forte: toggle auto-Go (company screen)', () => {
    const next = !cfg.autoGo();
    GM_setValue(K_AUTOGO, next);
    toast('Auto-Go ' + (next ? 'ON' : 'OFF'));
  });

  // ------------------------------------------------------------------ main --
  // A plain poller rather than a one-shot wait: the company screen can appear
  // long after login (client-side route, slow round trip) and can come back if
  // the app bounces you here again.
  async function handleCompanyStep() {
    if (!cfg.autoGo()) return;

    const deadline = Date.now() + COMPANY_WAIT_MS;
    while (Date.now() < deadline) {
      const clicks = Number(sessionStorage.getItem(SS_WENT) || 0);
      if (clicks >= MAX_GO_CLICKS) return;      // Go isn't working; stop hammering it

      const step = findCompanyStep();
      if (step) {
        if (pickCompany(step.select, cfg.company())) await sleep(400);
        const again = findCompanyStep();
        if (again) {
          again.go.click();
          sessionStorage.setItem(SS_WENT, String(clicks + 1));
          await sleep(3000);                    // let the app route away
          continue;
        }
      }
      await sleep(500);
    }
  }

  (async function main() {
    handleCompanyStep();                       // runs in parallel; own guards

    if (!await waitFor(findForm)) return;      // already signed in, or not the login screen

    if (!cfg.email() || !cfg.pass()) {
      openSetupPanel(findForm()?.email.value);
      return;
    }

    // Cap attempts per tab so a wrong saved password can't resubmit on every
    // re-render and trip an account lockout. Clicking the toast resets it.
    const tries = Number(sessionStorage.getItem(SS_TRIED) || 0);
    if (tries >= MAX_TRIES) {
      toast(`Auto-login stopped after ${tries} tries this tab. Click here to try again, or fix the saved password from the Tampermonkey menu.`, 12000, () => {
        sessionStorage.removeItem(SS_TRIED);
        location.reload();
      });
      return;
    }
    sessionStorage.setItem(SS_TRIED, String(tries + 1));

    const settled = await settledForm();
    if (!settled) return;

    const ready = await fillAndVerify(cfg.email(), cfg.pass());
    if (!ready) {
      toast('Could not fill the form — the page kept resetting it. Sign in manually this once.', 8000);
      return;
    }

    if (!cfg.autoSubmit()) {
      toast('Filled. Auto-submit is off — press SIGN IN.');
      return;
    }
    if (!ready.submit) {
      toast('Filled, but no SIGN IN button found.');
      return;
    }

    ready.submit.click();

    // If the form is still sitting there a few seconds later, the sign-in
    // failed — say what the app said instead of leaving a silent blank page.
    await sleep(ERROR_GRACE_MS);
    if (findForm()) {
      const why = readPageError();
      toast(why
        ? `Auto-login failed: "${why}" — fix the saved password from the Tampermonkey menu.`
        : 'Auto-login did not go through. Click here to retry, or fix the saved password from the Tampermonkey menu.',
      10000, () => { sessionStorage.removeItem(SS_TRIED); location.reload(); });
    }
  })();
})();
