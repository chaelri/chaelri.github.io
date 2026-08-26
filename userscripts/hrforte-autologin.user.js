// ==UserScript==
// @name         HR Forte — Auto Login
// @namespace    https://chaelri.github.io/
// @version      1.4.3
// @description  Signs in to eva.hrforte.com, clears SELECT COMPANY, then opens E-Smart Time › Clock Out and stops at the END screen. It never presses END. Credentials live in Tampermonkey storage, never in this file.
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
  const K_AUTOCLOCKOUT = 'hrf_autoclockout';   // open E-Smart Time › Clock Out after landing
  const SS_TRIED = 'hrf_autologin_tries';      // per-tab guard against submit loops
  const SS_WENT = 'hrf_company_done';          // per-tab guard against Go loops
  const SS_CLOCK = 'hrf_clockout_opened';      // timestamp of the last Clock Out open
  const MAX_TRIES = 2;                         // never burn more than this per tab
  const WAIT_MS = 15000;                       // how long to wait for the form to render
  const COMPANY_WAIT_MS = 180000;              // SELECT COMPANY arrives after a round trip
  const MAX_GO_CLICKS = 3;                     // stop hammering Go if it does nothing
  const SETTLE_MS = 700;                       // form must hold still this long before filling
  const ERROR_GRACE_MS = 6000;                 // how long to watch for a failed sign-in
  const DASH_WAIT_MS = 240000;                 // login → company → dashboard can be slow
  const MAX_EST_CLICKS = 4;                    // stop poking the header widget if it's dead
  // sessionStorage outlives a reload, so a plain "done" flag would mean the
  // modal opens once per TAB and never again — even after Charlie hits ⌘R
  // expecting it to. Time-box it instead: long enough that an SPA re-run or a
  // double load can't reopen a sheet he just cancelled, short enough that a
  // deliberate reload always retries.
  const CLOCK_COOLDOWN_MS = 90000;

  const cfg = {
    email: () => GM_getValue(K_EMAIL, ''),
    pass: () => GM_getValue(K_PASS, ''),
    autoSubmit: () => GM_getValue(K_AUTOSUBMIT, true),
    company: () => GM_getValue(K_COMPANY, ''),
    autoGo: () => GM_getValue(K_AUTOGO, true),
    autoClockOut: () => GM_getValue(K_AUTOCLOCKOUT, true),
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

  // ------------------------------------------------ E-Smart Time / Clock Out --
  // After the dashboard lands: open the red timer widget in the header, pick
  // Clock Out, and stop dead at the confirmation modal. Charlie presses END.

  // Belt and braces: this script must never be the thing that files the punch.
  const NEVER_CLICK = /^(end|submit|confirm|ok|yes)$/i;

  // React/antd want a full pointer sequence — a bare .click() misses handlers
  // wired to onMouseDown, and the header widget is a hover-or-click dropdown.
  function realClick(el) {
    const label = (el.value || el.innerText || el.textContent || '').trim();
    if (NEVER_CLICK.test(label)) {
      console.warn('[hrf] refusing to click "' + label + '" — that is yours to press.');
      return false;
    }
    const r = el.getBoundingClientRect();
    // No `view` here. Under Tampermonkey's sandbox `window` is a proxy object
    // rather than a real Window, and UIEventInit rejects it outright:
    //   Failed to construct 'PointerEvent': Failed to convert value to 'Window'
    // That threw straight out of handleClockOut and killed the run silently.
    // The events dispatch fine without it — React reads target/coords, not view.
    const at = { bubbles: true, cancelable: true, composed: true,
      clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) };
    // Exactly one 'click' in this sequence — antd's trigger toggles, so a
    // second click (e.g. an extra el.click() fallback) would close it again.
    for (const type of ['pointerover', 'mouseover', 'pointerenter', 'mouseenter',
      'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') && typeof PointerEvent === 'function'
        ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, at));
    }
    return true;
  }

  const visible = (el) => !!el && el.getClientRects().length > 0;

  // `#est-clock-cell` is the header widget's own id (an .ant-dropdown-trigger).
  // Fallback: any visible trigger in the header showing a running HH:MM:SS.
  function estTrigger() {
    const byId = document.querySelector('#est-clock-cell');
    if (visible(byId)) return byId;
    return [...document.querySelectorAll('.ant-dropdown-trigger')].find((el) =>
      visible(el) && /\b\d{1,2}:\d{2}:\d{2}\b/.test((el.innerText || '').trim())) || null;
  }

  // antd leaves the panel in the DOM and marks it .ant-dropdown-hidden on close.
  function estDropdown() {
    return [...document.querySelectorAll('.ant-dropdown')].find((d) =>
      visible(d) && !d.classList.contains('ant-dropdown-hidden')
      && /clock\s*(in|out)/i.test(d.textContent || '')) || null;
  }

  // Exact match only: "Break" sits directly above Clock Out in the same panel.
  function clockOutButton(scope) {
    return [...scope.querySelectorAll('button, [role="button"]')].find((b) =>
      visible(b) && /^clock\s*out$/i.test((b.textContent || '').trim())) || null;
  }

  function anyModalOpen() {
    return [...document.querySelectorAll('.ant-modal, .ant-modal-wrap, [role="dialog"]')]
      .some((m) => visible(m));
  }

  function clockOutModal() {
    return [...document.querySelectorAll('.ant-modal-title')].find((t) =>
      visible(t) && /^clock\s*out$/i.test((t.textContent || '').trim())) || null;
  }

  const clockRecentlyOpened = () =>
    Date.now() - Number(sessionStorage.getItem(SS_CLOCK) || 0) < CLOCK_COOLDOWN_MS;
  const markClockOpened = () => sessionStorage.setItem(SS_CLOCK, String(Date.now()));

  // A throw anywhere below used to vanish into an unhandled promise rejection,
  // which is exactly how the PointerEvent bug hid: no toast, no guard written,
  // no sign on screen that anything had been attempted. Never again.
  async function handleClockOut() {
    try {
      await clockOutRun();
    } catch (err) {
      console.error('[hrf] clock-out failed:', err);
      toast('Auto Clock Out hit an error: ' + ((err && err.message) || err)
        + ' — open E-Smart Time yourself.', 12000);
    }
  }

  async function clockOutRun() {
    if (!cfg.autoClockOut()) return;
    if (clockRecentlyOpened()) return;              // just did this; don't nag

    const deadline = Date.now() + DASH_WAIT_MS;
    let clicks = 0;

    while (Date.now() < deadline) {
      // Something is already on screen — a modal Charlie opened himself, or the
      // Clock Out sheet from an earlier run. Never talk over it.
      if (anyModalOpen()) {
        markClockOpened();
        return;
      }

      const trigger = estTrigger();
      if (!trigger) { await sleep(700); continue; }   // still on login/company/loading

      let dd = estDropdown();
      if (!dd) {
        if (clicks >= MAX_EST_CLICKS) {
          toast('Found E-Smart Time but its menu never opened. Open it yourself this once.', 8000);
          return;
        }
        clicks++;
        realClick(trigger);
        dd = await waitFor(estDropdown, 8000);
        if (!dd) { await sleep(1200); continue; }
      }

      // waitFor resolves on the first mutation that matches, which is the
      // instant antd inserts the panel — mid mount and mid zoom-in animation.
      // Clicking that early is what made this flaky: same reload, same page,
      // sometimes a modal and sometimes a dropdown left sitting open. Let it
      // finish before touching it.
      await sleep(600);

      const btn = clockOutButton(estDropdown() || dd);
      console.log('[hrf] dropdown open; Clock Out button found: ' + !!btn);
      if (!btn) {
        // Panel is up but offers Clock In (or Break only) — nothing to do today.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        markClockOpened();
        toast('E-Smart Time is not offering Clock Out right now — already clocked out?', 7000);
        return;
      }

      markClockOpened();

      // The widget opens on HOVER as well as click, so a dropdown appearing is
      // no proof the click landed — only a modal is. Verify, and retry with a
      // plain .click() before giving up. Retrying is safe here: unlike the
      // trigger, this button is not a toggle.
      // "Landed" means ANY modal, not the finished sheet: it renders as a bare
      // spinner first (no title) and only fills in after a server round trip.
      let landed = false;
      for (let attempt = 1; attempt <= 3 && !landed; attempt++) {
        const live = (estDropdown() && clockOutButton(estDropdown())) || btn;
        if (attempt === 1) realClick(live); else live.click();
        landed = !!(await waitFor(() => (anyModalOpen() ? true : null), 6000));
        console.log('[hrf] Clock Out click attempt ' + attempt + ' → landed: ' + landed);
      }

      if (!landed) {
        toast('Clicked Clock Out but nothing opened. Open it yourself this once, '
          + 'and send me the console.', 12000);
        return;
      }

      const modal = await waitFor(clockOutModal, 45000);
      toast(modal
        ? 'Clock Out is open. Press END when you are ready — I will not.'
        : 'Clock Out opened but the sheet never finished loading. Check the page.', 9000);
      return;
    }
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
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:6px">
          <input id="hrf-go" type="checkbox"> Click Go on SELECT COMPANY
        </label>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:16px">
          <input id="hrf-clock" type="checkbox"> Open E-Smart Time › Clock Out (stops at END)
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
    $('#hrf-clock').checked = cfg.autoClockOut();
    $('#hrf-email').focus();

    $('#hrf-cancel').onclick = () => wrap.remove();
    $('#hrf-save').onclick = () => {
      GM_setValue(K_EMAIL, $('#hrf-email').value.trim());
      GM_setValue(K_PASS, $('#hrf-pass').value);
      GM_setValue(K_COMPANY, $('#hrf-company').value.trim());
      GM_setValue(K_AUTOSUBMIT, $('#hrf-auto').checked);
      GM_setValue(K_AUTOGO, $('#hrf-go').checked);
      GM_setValue(K_AUTOCLOCKOUT, $('#hrf-clock').checked);
      wrap.remove();
      sessionStorage.removeItem(SS_TRIED);
      sessionStorage.removeItem(SS_WENT);
      sessionStorage.removeItem(SS_CLOCK);
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
    sessionStorage.removeItem(SS_CLOCK);
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
    const dd = estDropdown();
    console.log('[hrf] E-Smart Time trigger:', estTrigger());
    console.log('[hrf] E-Smart Time dropdown:', dd, dd && (dd.innerText || '').trim());
    console.log('[hrf] Clock Out button:', dd && clockOutButton(dd));
    console.log('[hrf] Clock Out modal:', clockOutModal(), 'any modal:', anyModalOpen());
    toast('Logged to the console (⌥⌘J).');
  });
  GM_registerMenuCommand('HR Forte: toggle auto-Go (company screen)', () => {
    const next = !cfg.autoGo();
    GM_setValue(K_AUTOGO, next);
    toast('Auto-Go ' + (next ? 'ON' : 'OFF'));
  });
  GM_registerMenuCommand('HR Forte: toggle auto Clock Out', () => {
    const next = !cfg.autoClockOut();
    GM_setValue(K_AUTOCLOCKOUT, next);
    toast('Auto Clock Out ' + (next ? 'ON — stops at the END screen' : 'OFF'));
  });
  GM_registerMenuCommand('HR Forte: open Clock Out now', () => {
    sessionStorage.removeItem(SS_CLOCK);
    handleClockOut();
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
    // One line in the console answers "is the new version actually live?" —
    // the whole reason v1.4.0 looked broken was Tampermonkey still serving
    // 1.3.0 while the repo file had moved on.
    console.log('[hrf] auto-login v1.4.3 armed', {
      autoSubmit: cfg.autoSubmit(), autoGo: cfg.autoGo(), autoClockOut: cfg.autoClockOut(),
    });

    // Both of these run in parallel with the login and with each other — they
    // poll for their own screen and carry their own guards. handleClockOut in
    // particular has to run even when there's no login form at all, because a
    // live session drops straight onto the dashboard.
    handleCompanyStep();
    handleClockOut();

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
