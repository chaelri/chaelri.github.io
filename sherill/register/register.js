/* ==========================================================================
   register.js — the one form on this site that actually leaves the browser.

   Everything else Sherill has (quotation, loan application, test drive,
   service) is copy-only by design: the customer copies a message and sends it
   to her themselves. That's right for those, because they carry real PII and
   because the customer is already on her page with Viber one tap away.

   This one is different. It's meant to be scanned off a QR code at a booth or
   an expo, where the person has ten seconds, no interest in opening Viber, and
   walks away the moment the form asks them to do anything extra. So this posts
   to a Google Apps Script web app that (a) appends the lead to a Google Sheet
   and (b) emails it straight to Sherill and Charlie. See apps-script.gs and
   README.md in this folder for the deploy steps.

   If the endpoint isn't configured yet, or the network eats the request, the
   page falls back to the copy-only contract the rest of the site uses — the
   customer never loses what they typed.
   ========================================================================== */
(() => {
  'use strict';

  /* ────────────────────────────────────────────────────────────── config ──
     The Apps Script deployment (project "drive-with-sherill — register",
     bound to the "drive-with-sherill — leads" sheet, deployed 2026-08-19 as
     Execute-as-me / access-Anyone). It ends in /exec — a /dev URL only works
     while signed in as the owner, so it is NOT the one to use.

     Redeploying the script after an edit keeps this URL: Deploy → Manage
     deployments → edit → Version: New version. Only a brand-new deployment
     would mint a different URL. */
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycby3dYYLmGOget0HoDPLklPpnlAp2GHt_yCt6wmavM9V3n5YA29Qa5QNIDAs3HE8md_APg/exec';

  /* Open the page as ?test=1 and the lead is still stored and emailed for
     real — but only to Charlie, subject-tagged [TEST], with no acknowledgement
     to the "customer". That's how the whole path gets exercised after a change
     without dropping a fake lead in Sherill's inbox. */
  const testMode = new URLSearchParams(location.search).get('test') === '1';

  /* Booth / expo presets. Open the page as ?event=medical-expo and the company
     fields appear, the headline changes, and the event lands in the email
     subject so leads from one day are easy to pick out of the sheet.
     An unknown tag still works — it just shows the tag as the event name. */
  const EVENTS = {
    'medical-expo': {
      name: 'Phil Medical Expo 2026',
      meta: 'August 19–21, 2026 · SMX Convention Center',
    },
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────────────────────────────────────────────────────── event mode ─ */
  const params = new URLSearchParams(location.search);
  const eventTag = (params.get('event') || '').trim().toLowerCase();
  const eventInfo = eventTag
    ? (EVENTS[eventTag] || { name: eventTag.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), meta: '' })
    : null;

  if (eventInfo) {
    $('#eventBanner').hidden = false;
    $('#eventName').textContent = eventInfo.name;
    $('#eventMeta').textContent = eventInfo.meta;
    $('#companyGroup').hidden = false;
    $('#headline').textContent = 'Register your interest';
    $('#headLead').textContent =
      'Leave your details here and I\'ll follow up after the event with the '
      + 'price list, the running promo and a monthly estimate for the unit you\'re after.';
    document.title = `${eventInfo.name} — register with Sherill Obillo`;
  }

  /* ───────────────────────────────────────────────────────────── fields ── */
  const TIMELINES = [
    'Within this month',
    'In 1–3 months',
    'In 3–6 months',
    'Still canvassing',
  ];

  const YOU_FIELDS = [
    { key: 'name',   label: 'Full name',     type: 'text',  span: 6, required: true, autocomplete: 'name',  placeholder: 'Juan Dela Cruz' },
    { key: 'mobile', label: 'Mobile number', type: 'tel',   span: 6, required: true, autocomplete: 'tel', inputmode: 'tel', placeholder: '0917 123 4567' },
    { key: 'email',  label: 'Email address', type: 'email', span: 6, autocomplete: 'email', placeholder: 'juan@email.com' },
    { key: 'city',   label: 'City / area',   type: 'text',  span: 6, autocomplete: 'address-level2', placeholder: 'e.g. Quezon City' },
  ];

  const COMPANY_FIELDS = [
    { key: 'company', label: 'Company name', type: 'text', span: 6, autocomplete: 'organization', placeholder: 'e.g. Metro Medical Group' },
    { key: 'role',    label: 'Role / position', type: 'text', span: 6, autocomplete: 'organization-title', placeholder: 'e.g. Admin Officer' },
  ];

  /* `units` only shows in event mode — a company at an expo is often asking
     about a fleet, a walk-in on the website almost never is. */
  const planFields = () => [
    { key: 'timeline', label: 'When do you need it?', type: 'select', span: 6, options: TIMELINES },
    ...(eventInfo
      ? [{ key: 'units', label: 'How many units?', type: 'number', span: 6, inputmode: 'numeric', placeholder: 'e.g. 1' }]
      : []),
  ];

  function fieldHTML(f) {
    const id = `f_${f.key}`;
    const req = f.required ? '<span class="field__req">Required</span>' : '';
    const attrs = [
      `id="${id}"`,
      `data-fkey="${f.key}"`,
      f.autocomplete ? `autocomplete="${f.autocomplete}"` : '',
      f.inputmode ? `inputmode="${f.inputmode}"` : '',
      f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
      f.required ? 'required aria-required="true"' : '',
    ].filter(Boolean).join(' ');

    const control = f.type === 'select'
      ? `<div class="select"><select ${attrs}>
           <option value="">Select…</option>
           ${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}
         </select><span class="ms">expand_more</span></div>`
      : `<input ${attrs} type="${f.type}" />`;

    return `<div class="field field--s${f.span || 6}">
        <label for="${id}"><span>${esc(f.label)}</span>${req}</label>
        ${control}
      </div>`;
  }

  const ALL_FIELDS = [...YOU_FIELDS, ...(eventInfo ? COMPANY_FIELDS : []), ...planFields()];

  $('#youFields').innerHTML = YOU_FIELDS.map(fieldHTML).join('');
  if (eventInfo) $('#companyFields').innerHTML = COMPANY_FIELDS.map(fieldHTML).join('');
  $('#planFields').innerHTML = planFields().map(fieldHTML).join('');

  /* ────────────────────────────────────────────────────── model chips ──
     Straight from js/data.js, so a model added to the site appears here with
     no edit. The two extras cover what MODELS can't: fleet/special builds
     (the ambulance conversions the medical expo asks about) and the honest
     "I don't know yet", which is a perfectly good lead. */
  const CHOICES = [
    ...MODELS.map((m) => ({ id: m.id, label: m.name })),
    { id: 'fleet', label: 'Fleet / special build' },
    { id: 'unsure', label: 'Not sure yet' },
  ];
  $('#modelChips').innerHTML = CHOICES.map((c) => `
    <button type="button" class="chip" data-model="${esc(c.label)}">
      <span class="ms">check_circle</span>${esc(c.label)}
    </button>`).join('');

  $('#modelChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    chip.classList.toggle('is-on');
  });

  const pickedModels = () => $$('#modelChips .chip.is-on').map((c) => c.dataset.model);

  /* ────────────────────────────────────────────────── plan segmented ── */
  let plan = 'Bank financing';
  $('#planSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg__btn');
    if (!btn) return;
    $$('#planSeg .seg__btn').forEach((b) => b.classList.toggle('is-on', b === btn));
    plan = btn.dataset.plan;
  });

  /* ─────────────────────────────────────────────────────────── toast ── */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  }

  /* ────────────────────────────────────────────────────── validation ── */
  const form = $('#regForm');
  form.addEventListener('input', (e) => {
    if (e.target.classList?.contains('is-invalid')) e.target.classList.remove('is-invalid');
    if (e.target.id === 'f_consent') $('.consent').classList.remove('is-invalid');
  });

  function val(key) {
    const el = $(`#f_${key}`);
    return el ? el.value.trim() : '';
  }

  function validate() {
    let bad = null;
    for (const f of ALL_FIELDS.filter((x) => x.required)) {
      const el = $(`#f_${f.key}`);
      const ok = !!el.value.trim();
      el.classList.toggle('is-invalid', !ok);
      if (!ok && !bad) bad = el;
    }
    if (bad) {
      toast('Please fill in your name and mobile number');
      bad.focus();
      bad.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      return false;
    }
    if (!$('#f_consent').checked) {
      $('.consent').classList.add('is-invalid');
      toast('Please tick the box so Sherill can reply to you');
      $('.consent').scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      return false;
    }
    return true;
  }

  /* ──────────────────────────────────────────────────────── payload ── */
  function payload() {
    return {
      name: val('name'),
      mobile: val('mobile'),
      email: val('email'),
      city: val('city'),
      company: val('company'),
      role: val('role'),
      models: pickedModels(),
      plan,
      timeline: val('timeline'),
      units: val('units'),
      notes: $('#f_notes').value.trim(),
      event: eventTag,
      eventName: eventInfo ? eventInfo.name : '',
      source: location.href,
      submittedAt: new Date().toISOString(),
      test: testMode,
      website: $('#website').value,       /* honeypot — must arrive empty */
    };
  }

  /* The same lead as plain text, for the fallback path and for the SMS/Viber
     message. Mirrors the field order on screen. */
  function asText(p) {
    const L = [];
    L.push(p.eventName ? `Registration — ${p.eventName}` : 'Registration — drive-with-sherill');
    L.push('');
    L.push(`Name: ${p.name}`);
    L.push(`Mobile: ${p.mobile}`);
    if (p.email) L.push(`Email: ${p.email}`);
    if (p.city) L.push(`City / area: ${p.city}`);
    if (p.company) L.push(`Company: ${p.company}`);
    if (p.role) L.push(`Role: ${p.role}`);
    L.push('');
    L.push(`Interested in: ${p.models.length ? p.models.join(', ') : 'Not specified'}`);
    L.push(`Plan: ${p.plan}`);
    if (p.timeline) L.push(`Timeline: ${p.timeline}`);
    if (p.units) L.push(`Units: ${p.units}`);
    if (p.notes) { L.push(''); L.push(`Notes: ${p.notes}`); }
    return L.join('\n');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      return ok;
    }
  }

  /* ───────────────────────────────────────────────────────── sending ──
     Content-Type is text/plain on purpose. Apps Script web apps can't answer
     a CORS preflight, and application/json triggers one — text/plain keeps it
     a "simple request" that goes straight through. The script reads the raw
     body out of e.postData.contents either way. */
  async function send(p) {
    if (!ENDPOINT) throw new Error('endpoint-not-configured');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(p),
        signal: ctl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`http-${res.status}`);
      const out = await res.json().catch(() => ({ ok: true }));
      if (out && out.ok === false) throw new Error(out.error || 'rejected');
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ───────────────────────────────────────────────── contact shortcuts ── */
  const viberLink = `viber://chat?number=${encodeURIComponent(AGENT.mobileIntl)}`;
  $('#doneViber').href = viberLink;
  $('#doneCall').href = `tel:${AGENT.mobileIntl}`;
  $('#fbViber').href = viberLink;

  /* ────────────────────────────────────────────────────────── submit ── */
  const submitBtn = $('#submitBtn');
  let lastPayload = null;

  function showDone(p) {
    form.hidden = true;
    $('#fallbackCard').hidden = true;
    $('#doneCard').hidden = false;
    $('#doneLead').textContent = p.eventName
      ? `Your details are in Sherill's inbox, tagged ${p.eventName}. She'll message you shortly — or reach her right now.`
      : "Your details are already in Sherill's inbox. She'll message you shortly — or you can reach her right now.";
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  function showFallback(p) {
    form.hidden = true;
    $('#doneCard').hidden = true;
    $('#fallbackCard').hidden = false;
    $('#fallbackText').textContent = asText(p);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const p = payload();
    lastPayload = p;

    /* A bot filled the hidden field. Show the same success screen it would
       get from a real send, and drop it on the floor. */
    if (p.website) { showDone(p); return; }

    submitBtn.classList.add('is-busy');
    $('#submitLabel').textContent = 'Sending…';
    try {
      await send(p);
      showDone(p);
    } catch (err) {
      console.warn('[register] send failed:', err.message);
      showFallback(p);
    } finally {
      submitBtn.classList.remove('is-busy');
      $('#submitLabel').textContent = 'Send to Sherill';
    }
  });

  $('#againBtn').addEventListener('click', () => {
    form.reset();
    $$('#modelChips .chip.is-on').forEach((c) => c.classList.remove('is-on'));
    $('#doneCard').hidden = true;
    form.hidden = false;
    $('#f_name').focus();
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });

  $('#fbCopy').addEventListener('click', async () => {
    const ok = await copyText(asText(lastPayload));
    toast(ok ? 'Copied — paste it to Sherill on Viber' : 'Could not copy — please select the text manually');
  });

  $('#fbRetry').addEventListener('click', async () => {
    if (!lastPayload) return;
    toast('Trying again…');
    try {
      await send(lastPayload);
      showDone(lastPayload);
    } catch {
      toast('Still no luck — please copy and send it on Viber');
    }
  });
})();
