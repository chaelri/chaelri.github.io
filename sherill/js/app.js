/* ==========================================================================
   app.js — rendering, motion and the quotation engine.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const peso = (n) => '₱' + Math.round(n).toLocaleString('en-PH');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ═══════════════════════════════════════════════════════════ reveals */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  const watchReveals = (root = document) => $$('.reveal', root).forEach((el) => {
    if (!el.classList.contains('is-in')) revealIO.observe(el);
  });

  /* ══════════════════════════════════════════════════ button feedback */
  function ripple(e) {
    const el = e.currentTarget;
    if (reduced) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 640);
  }

  function trackPointer(e) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.btn, .dock__btn');
    if (t) ripple({ currentTarget: t, clientX: e.clientX, clientY: e.clientY });
  });
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest('.btn, .model-card');
    if (t) trackPointer({ currentTarget: t, clientX: e.clientX, clientY: e.clientY });
  }, { passive: true });

  /* ═══════════════════════════════════════════════════════════════ nav */
  const nav = $('#nav');
  const navProgress = $('#navProgress');
  const dock = $('#dock');
  const drawer = $('#drawer');
  const burger = $('#burger');
  let lastY = 0, navTicking = false;

  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle('is-stuck', y > 12);
    nav.classList.toggle('is-hidden', y > 420 && y > lastY && !drawer.classList.contains('is-open'));
    dock.classList.toggle('is-up', y > 520);
    const max = document.documentElement.scrollHeight - innerHeight;
    navProgress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    lastY = y;
    navTicking = false;
  }
  addEventListener('scroll', () => {
    if (!navTicking) { navTicking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  }
  burger.addEventListener('click', () => {
    const open = !drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-nav]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (!id || !id.startsWith('#')) return;
    const target = $(id);
    if (!target) return;
    e.preventDefault();
    closeDrawer();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', id);
  });

  /* active section in nav */
  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      $$('.nav__links a').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => sectionIO.observe(s));

  /* ═════════════════════════════════════════════════════════ counters */
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      const end = +e.target.dataset.count;
      const suffix = e.target.dataset.suffix || '';
      if (reduced) { e.target.textContent = end + suffix; return; }
      const dur = 1100, t0 = performance.now();
      const step = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        e.target.textContent = Math.round(end * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => countIO.observe(el));

  /* ═══════════════════════════════════════════════════════════ toast */
  let toastTimer;
  const toastEl = $('#toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-up');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-up'), 2800);
  }

  const shotSrc = (id) => `assets/models/${id}.webp`;        // scenic key visual
  const cutSrc = (id) => `assets/models/cut/${id}.webp`;      // transparent studio cut-out

  /* ═════════════════════════════════════════════════════ model cards */
  const CATEGORIES = [
    { id: 'all', label: 'All models' },
    { id: 'electrified', label: 'e-POWER', match: (m) => m.id === 'kicks' || m.id === 'xtrail' },
    { id: 'suv', label: 'SUV & Crossover', match: (m) => ['crossover', 'suv'].includes(m.body) },
    { id: 'family', label: 'Sedan & MPV', match: (m) => ['sedan', 'mpv'].includes(m.body) },
    { id: 'work', label: 'Pickup & Van', match: (m) => ['pickup', 'van'].includes(m.body) },
  ];

  const grid = $('#modelGrid');
  grid.innerHTML = MODELS.map((m, i) => {
    const swatches = m.colorGroups.flatMap((g) => g.colors).slice(0, 6)
      .map((c) => `<i style="background:${c.hex}"></i>`).join('');
    return `
    <article class="model-card reveal" data-delay="${(i % 3) + 1}" data-model="${m.id}" tabindex="0" role="button"
      aria-label="View ${esc(m.full)} details">
      <div class="model-card__art">
        <img src="${shotSrc(m.id)}" alt="${esc(m.full)}" loading="lazy" decoding="async"
             width="1400" height="787" />
        <p class="model-card__kicker">${esc(m.kicker)}</p>
        ${m.featured ? '<span class="model-card__badge">Spotlight</span>' : ''}
      </div>
      <div class="model-card__body">
        <h3 class="model-card__name">${esc(m.name)}</h3>
        <p class="model-card__tag">${esc(m.tagline)}</p>
        <div class="model-card__swatches">${swatches}</div>
        <div class="model-card__foot">
          <div class="model-card__price">
            <small>Starts at</small>
            <strong>${peso(m.priceFrom)}</strong>
          </div>
          <span class="model-card__go"><span class="ms">arrow_outward</span></span>
        </div>
      </div>
    </article>`;
  }).join('');

  $('#modelFilter').innerHTML = CATEGORIES.map((c, i) =>
    `<button class="chip${i === 0 ? ' is-active' : ''}" data-cat="${c.id}" role="tab" aria-selected="${i === 0}">${c.label}</button>`
  ).join('');

  $('#modelFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    $$('#modelFilter .chip').forEach((c) => {
      const on = c === btn;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-selected', String(on));
    });
    const cat = CATEGORIES.find((c) => c.id === btn.dataset.cat);
    $$('.model-card', grid).forEach((card) => {
      const m = MODELS.find((x) => x.id === card.dataset.model);
      const show = !cat.match || cat.match(m);
      card.classList.toggle('is-hidden', !show);
      if (show && !reduced) { card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip'); }
    });
  });

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.model-card');
    if (card) openSheet(card.dataset.model);
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.model-card');
    if (card) { e.preventDefault(); openSheet(card.dataset.model); }
  });

  /* ═══════════════════════════════════════════════════════════ promos */
  $('#promoGrid').innerHTML = PROMOS.map((p, i) => `
    <article class="promo-card reveal" data-delay="${(i % 4) + 1}">
      <span class="promo-card__tag">${esc(p.tag)}</span>
      <div class="promo-card__icon"><span class="ms">${p.icon}</span></div>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.desc)}</p>
    </article>`).join('');

  $('#bankList').innerHTML = BANKS.map((b) => `<span>${esc(b)}</span>`).join('');
  $('#promoWindow').textContent = AGENT.promoWindow;

  /* ══════════════════════════════════════════════════════════ e-POWER */
  $('#epowerFlow').innerHTML = EPOWER_STEPS.map((s, i) => `
    <li class="reveal" data-delay="${i + 1}">
      <span class="ms">${s.icon}</span>
      <h4>${esc(s.title)}</h4>
      <p>${esc(s.desc)}</p>
    </li>`).join('');

  $('#epowerBenefits').innerHTML = EPOWER_BENEFITS.map((b, i) => `
    <div class="benefit reveal" data-delay="${(i % 3) + 1}">
      <span class="ms">${b.icon}</span>
      <div><h4>${esc(b.title)}</h4><p>${esc(b.desc)}</p></div>
    </div>`).join('');

  const kicks = MODELS.find((m) => m.id === 'kicks');
  $('#kicksQuickSpecs').innerHTML = [
    '280 Nm instant torque', 'No plug-in charging', 'e-Pedal one-pedal drive',
    `From ${peso(kicks.priceFrom)}`,
  ].map((t) => `<span>${esc(t)}</span>`).join('');

  $('#epowerCompare').innerHTML = `
    <thead><tr><th></th>${EPOWER_COMPARE.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${EPOWER_COMPARE.rows.map((r) =>
      `<tr>${r.map((c, i) => `<td${i === 0 ? '' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;

  /* ═════════════════════════════════════════════════════════ contact */
  const viberLink = `viber://chat?number=${encodeURIComponent(AGENT.mobileIntl)}`;
  const telLink = `tel:${AGENT.mobileIntl}`;
  const prettyPhone = AGENT.mobile.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(AGENT.mapQuery)}`;

  $('#cViber').href = viberLink;
  $('#cViberVal').textContent = prettyPhone;
  $('#cCall').href = telLink;
  $('#cCallVal').textContent = prettyPhone;
  $('#cMail').href = `mailto:${AGENT.email}`;
  $('#cMailVal').textContent = AGENT.email;
  $('#cMap').href = mapLink;
  $('#dockViber').href = viberLink;
  $('#dockCall').href = telLink;
  $('#drawerViber').href = viberLink;
  $('#closingViber').href = viberLink;

  $('#closingPoints').innerHTML = TESTIMONIAL_POINTS
    .map((p) => `<li><span class="ms">${p.icon}</span>${esc(p.label)}</li>`).join('');

  /* ════════════════════════════════════════════════════ quotation form */
  const qModel = $('#qModel');
  const qVariant = $('#qVariant');
  const qBank = $('#qBank');
  const qDp = $('#qDp');
  const qDpOut = $('#qDpOut');
  const financeBlock = $('#financeBlock');
  let pay = 'financing';
  let term = 36;

  qModel.innerHTML = '<option value="">Select a model…</option>' +
    MODELS.map((m) => `<option value="${m.id}">${esc(m.full)}</option>`).join('');
  qBank.innerHTML = BANK_RATES.map((b) => `<option>${esc(b.name)}</option>`).join('');

  const currentBank = () => BANK_RATES.find((b) => b.name === qBank.value) || BANK_RATES[0];

  /* Terms differ per bank — Security Bank starts at 36, RCBC and BPI reach 84.
     Rebuild the segmented control from whichever bank is selected, keeping the
     chosen term when the new bank also offers it. */
  function renderTerms() {
    const bank = currentBank();
    const terms = Object.keys(bank.aor).map(Number).sort((a, b) => a - b);
    if (!terms.includes(term)) term = terms.includes(36) ? 36 : terms[terms.length - 1];
    $('#qTerm').innerHTML = terms.map((t) => `
      <button type="button" class="seg__btn${t === term ? ' is-active' : ''}" data-term="${t}"
        role="radio" aria-checked="${t === term}">${t} mo</button>`).join('');
    $('#qBankNote').textContent = bank.note || '';
    $('#qBankNote').hidden = !bank.note;
  }

  function fillVariants() {
    const m = MODELS.find((x) => x.id === qModel.value);
    if (!m) {
      qVariant.innerHTML = '<option value="">Choose a model first</option>';
      return;
    }
    qVariant.innerHTML = m.variants.map((v, i) =>
      `<option value="${i}">${esc(v.name)}${v.price ? ' — ' + peso(v.price) : ' — ask for price'}</option>`).join('');
  }

  function currentPick() {
    const m = MODELS.find((x) => x.id === qModel.value);
    if (!m) return { m: null, v: null };
    const v = m.variants[+qVariant.value] || m.variants[0];
    return { m, v };
  }

  /* AOR is total add-on interest across the whole term, not per year. */
  function monthlyFor(loan, bank, months) {
    const aor = bank.aor[months];
    if (aor == null) return null;
    return (loan * (1 + aor / 100)) / months;
  }

  function renderEstimate() {
    const { m, v } = currentPick();
    const rows = $('#estRows');
    const heroLabel = $('#estHeroLabel');
    const heroValue = $('#estHeroValue');

    if (!m) {
      $('#estModel').textContent = '—';
      $('#estVariant').textContent = 'Select a model and variant';
      $('#estSrp').textContent = '—';
      rows.innerHTML = '';
      heroLabel.textContent = 'Estimated monthly';
      heroValue.textContent = '—';
      return;
    }

    $('#estModel').textContent = m.full;
    $('#estVariant').textContent = v.name;
    $('#estSrp').textContent = v.price ? peso(v.price) : 'Ask for price';

    const flip = (el) => { if (reduced) return; el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); };

    if (!v.price) {
      rows.innerHTML = '<div><span>Price</span><b>Message Sherill</b></div>';
      heroLabel.textContent = 'Latest price';
      heroValue.textContent = 'Ask me';
      flip($('#estHero'));
      return;
    }

    if (pay === 'cash') {
      rows.innerHTML = `
        <div><span>Payment</span><b>Straight cash</b></div>
        <div><span>Cash discount</span><b>Ask for this month's</b></div>
        ${v.lto ? `<div><span>3-year LTO registration</span><b>${peso(v.lto)}</b></div>` : ''}`;
      heroLabel.textContent = 'Cash-out (before discount)';
      heroValue.textContent = peso(v.price + (v.lto || 0));
    } else {
      const dpPct = +qDp.value;
      const dp = v.price * (dpPct / 100);
      const loan = v.price - dp;
      const bank = currentBank();
      const monthly = monthlyFor(loan, bank, term);
      rows.innerHTML = `
        <div><span>Down payment (${dpPct}%)</span><b>${peso(dp)}</b></div>
        <div><span>Amount financed</span><b>${peso(loan)}</b></div>
        <div><span>Term</span><b>${term} months</b></div>
        <div><span>${esc(bank.name)} add-on rate</span><b>${bank.aor[term].toFixed(2)}%</b></div>
        ${v.lto ? `<div><span>3-year LTO registration</span><b>${peso(v.lto)}</b></div>` : ''}`;
      heroLabel.textContent = `Estimated monthly · ${term} months`;
      heroValue.textContent = peso(monthly);
    }
    flip($('#estHero'));
  }

  qModel.addEventListener('change', () => { fillVariants(); renderEstimate(); });
  qVariant.addEventListener('change', renderEstimate);
  qBank.addEventListener('change', () => { renderTerms(); renderEstimate(); });

  function setDpFill() {
    const pct = ((qDp.value - qDp.min) / (qDp.max - qDp.min)) * 100;
    qDp.style.setProperty('--fill', pct + '%');
    qDpOut.textContent = qDp.value + '%';
  }
  qDp.addEventListener('input', () => { setDpFill(); renderEstimate(); });

  $('#qPayment').addEventListener('click', (e) => {
    const b = e.target.closest('.seg__btn');
    if (!b) return;
    pay = b.dataset.pay;
    $$('#qPayment .seg__btn').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-checked', String(on));
    });
    financeBlock.classList.toggle('is-collapsed', pay === 'cash');
    renderEstimate();
  });

  $('#qTerm').addEventListener('click', (e) => {
    const b = e.target.closest('.seg__btn');
    if (!b) return;
    term = +b.dataset.term;
    $$('#qTerm .seg__btn').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-checked', String(on));
    });
    renderEstimate();
  });

  $('#qTrade').addEventListener('change', (e) => {
    $('#qTradeField').classList.toggle('is-collapsed', !e.target.checked);
  });

  /* ---- message builder ------------------------------------------- */
  function validate() {
    let ok = true;
    [['#qName', 'name'], ['#qPhone', 'mobile number']].forEach(([sel]) => {
      const el = $(sel);
      const bad = !el.value.trim();
      el.classList.toggle('is-invalid', bad);
      if (bad) ok = false;
    });
    if (!qModel.value) { qModel.classList.add('is-invalid'); ok = false; }
    else qModel.classList.remove('is-invalid');
    if (!ok) toast('Please fill in your name, number and preferred model.');
    return ok;
  }

  function buildMessage() {
    const { m, v } = currentPick();
    const L = [];
    L.push(`Hi Sherill! I'd like a quotation.`);
    L.push('');
    L.push(`Name: ${$('#qName').value.trim()}`);
    L.push(`Mobile: ${$('#qPhone').value.trim()}`);
    L.push(`Model: ${m ? m.full : '—'}`);
    L.push(`Variant: ${v ? v.name : '—'}`);
    L.push(`SRP: ${v && v.price ? peso(v.price) : 'please advise'}`);
    if (pay === 'cash') {
      L.push('Payment: Cash — please send the cash discount computation.');
    } else {
      const dpPct = +qDp.value;
      const bank = currentBank();
      L.push(`Payment: Bank financing (${bank.name})`);
      L.push(`Down payment: ${dpPct}%${v && v.price ? ' — ' + peso(v.price * dpPct / 100) : ''}`);
      L.push(`Term: ${term} months`);
      if (v && v.price) {
        const est = monthlyFor(v.price * (1 - dpPct / 100), bank, term);
        if (est) L.push(`My estimate from your site: ${peso(est)}/month (${bank.aor[term].toFixed(2)}% add-on)`);
      }
    }
    L.push(`Trade-in: ${$('#qTrade').checked ? ($('#qTradeDetail').value.trim() || 'Yes — details to follow') : 'None'}`);
    const notes = $('#qNotes').value.trim();
    if (notes) { L.push(''); L.push(`Notes: ${notes}`); }
    L.push('');
    L.push('Sent from drive-with-sherill');
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

  $('#sendViber').addEventListener('click', async () => {
    if (!validate()) return;
    const msg = buildMessage();
    const copied = await copyText(msg);
    toast(copied ? 'Details copied — just paste in Viber 📋' : 'Opening Viber…');
    setTimeout(() => { location.href = viberLink; }, 450);
  });

  $('#sendSms').addEventListener('click', () => {
    if (!validate()) return;
    location.href = `sms:${AGENT.mobileIntl}${/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(buildMessage())}`;
  });

  $('#sendEmail').addEventListener('click', () => {
    if (!validate()) return;
    const { m } = currentPick();
    const subject = `Quotation request${m ? ' — ' + m.full : ''}`;
    location.href = `mailto:${AGENT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildMessage())}`;
  });

  $('#copyQuote').addEventListener('click', async () => {
    if (!validate()) return;
    toast(await copyText(buildMessage()) ? 'Copied to clipboard' : 'Could not copy — please select manually');
  });

  /* jump to the form with a model preselected */
  function prefillQuote(modelId, variantIndex) {
    qModel.value = modelId;
    fillVariants();
    if (variantIndex != null) qVariant.value = String(variantIndex);
    renderEstimate();
    closeSheet();
    $('#quote').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => { $('#qName').focus({ preventScroll: true }); }, reduced ? 0 : 620);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quote-model]');
    if (b) prefillQuote(b.dataset.quoteModel, b.dataset.quoteVariant ? +b.dataset.quoteVariant : null);
  });

  fillVariants();
  renderTerms();
  setDpFill();
  renderEstimate();

  /* ═════════════════════════════════════════════════════ model sheet */
  const sheet = $('#sheet');
  const sheetBody = $('#sheetBody');
  let lastFocus = null;

  function openSheet(id) {
    const m = MODELS.find((x) => x.id === id);
    if (!m) return;
    lastFocus = document.activeElement;

    const colorHTML = m.colorGroups.map((g) => `
      <div class="colorset">
        <p class="colorset__label">${esc(g.label)}</p>
        <div class="colorset__list">
          ${g.colors.map((c, i) => `
            <button class="swatch${i === 0 ? ' is-active' : ''}" data-hex="${c.hex}"${c.roof ? ` data-roof="${c.roof}"` : ''}>
              <i style="background:${c.roof ? `linear-gradient(180deg, ${c.roof} 38%, ${c.hex} 38%)` : c.hex}"></i>
              <span>${esc(c.name)}${c.extra ? ` <em>+${peso(c.extra)}</em>` : ''}</span>
            </button>`).join('')}
        </div>
      </div>`).join('');

    /* Real photos of stock on the floor, when Sherill has sent some.
       Deliberately NOT loading="lazy": this markup is only built when the user
       opens the sheet, so lazy saves nothing, and the observer never fires in
       here anyway — the sheet scrolls its own container, not the viewport, so
       the images sat at 0x0 forever. */
    const photosHTML = !m.photos ? '' : `
      <div class="sheet-block">
        <h4>${esc(m.photos.label)}</h4>
        ${m.photos.note ? `<p class="shots__note">${esc(m.photos.note)}</p>` : ''}
        <div class="shots">
          ${m.photos.shots.map((p) => `
            <figure class="shots__item">
              <img src="assets/models/photos/${p.src}.webp" alt="${esc(p.alt)}"
                   width="${p.w}" height="${p.h}" decoding="async" />
            </figure>`).join('')}
        </div>
      </div>`;

    sheetBody.innerHTML = `
      <div class="sheet-hero">
        <p class="sheet-hero__kicker">${esc(m.kicker)}</p>
        <h2 id="sheetTitle">${esc(m.full)}</h2>
        <p class="sheet-hero__tag">${esc(m.tagline)} ${m.sub ? `<br>${esc(m.sub)}` : ''}</p>
        <div class="sheet-hero__price"><small>Starts at</small><strong>${peso(m.priceFrom)}</strong></div>
      </div>

      <div class="sheet-block">
        <div class="turntable" data-turntable>
          <div class="turntable__stage">
            <img class="turntable__car" src="${cutSrc(m.id)}" alt="${esc(m.full)}" />
            <span class="turntable__shadow" aria-hidden="true"></span>
          </div>
        </div>
      </div>

      <div class="sheet-block">
        <h4>Highlights</h4>
        <div class="hl-grid">
          ${m.highlights.map((h) => `
            <div class="hl">
              <span class="ms">${h.icon}</span>
              <strong>${esc(h.title)}</strong>
              <span>${esc(h.desc)}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="sheet-block">
        <h4>Variants &amp; prices${m.ltoNote ? ` · ${esc(m.ltoNote)}` : ''}</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Variant</th><th>Transmission</th>${m.variants.some((v) => v.lto) ? '<th>LTO (3 yrs)</th>' : ''}<th>SRP (VAT incl.)</th><th></th></tr></thead>
            <tbody>
              ${m.variants.map((v, i) => `
                <tr>
                  <td class="name">${esc(v.name)}</td>
                  <td>${esc(v.trans || '—')}</td>
                  ${m.variants.some((x) => x.lto) ? `<td>${v.lto ? peso(v.lto) : '—'}</td>` : ''}
                  <td class="price">${v.price ? peso(v.price) : esc(v.note || 'Ask for price')}</td>
                  <td><button class="btn btn--sm btn--ghost" data-quote-model="${m.id}" data-quote-variant="${i}">Quote</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="sheet-block">
        <h4>Colors</h4>
        ${colorHTML}
      </div>

      ${photosHTML}

      ${m.why ? `
      <div class="sheet-block">
        <h4>Why choose the ${esc(m.name)}</h4>
        <ul class="why-list">
          ${m.why.map(([t, d]) => `<li><span class="ms">check_circle</span><div><strong>${esc(t)}</strong>${esc(d)}</div></li>`).join('')}
        </ul>
      </div>` : ''}

      <div class="sheet-block">
        <h4>Specifications</h4>
        <dl class="spec-list">
          ${m.specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
      </div>

      <div class="sheet-block">
        <div class="sheet-actions">
          <button class="btn btn--primary btn--lg" data-quote-model="${m.id}"><span class="ms">request_quote</span><span>Quote this ${esc(m.name)}</span></button>
          <a class="btn btn--ghost btn--lg" href="${viberLink}"><span class="ms">chat</span><span>Ask on Viber</span></a>
        </div>
      </div>`;

    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    sheetBody.scrollTop = 0;
    requestAnimationFrame(() => { sheetBody.scrollTop = 0; });
    $('.sheet__close').focus({ preventScroll: true });

  }

  /* bound once — the sheet body is reused for every model */
  sheetBody.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    $$('.swatch', sw.closest('.colorset__list')).forEach((s) => s.classList.remove('is-active'));
    sw.classList.add('is-active');
  });

  function closeSheet() {
    if (!sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    setTimeout(() => { if (!sheet.classList.contains('is-open')) sheetBody.innerHTML = ''; }, 600);
    lastFocus?.focus?.({ preventScroll: true });
  }

  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); closeDrawer(); }
  });

  /* ══════════════════════════════════════════════ hero showcase reel */
  (() => {
    const wrap = $('#showcase');
    const img = $('#showcaseImg');
    const nameEl = $('#showcaseName');
    const priceEl = $('#showcasePrice');
    const dotsEl = $('#showcaseDots');
    if (!wrap) return;

    let i = 0, timer = 0, visible = true;
    const DWELL = 4200;

    dotsEl.innerHTML = MODELS.map((m, n) =>
      `<button class="showcase__dot${n === 0 ? ' is-active' : ''}" data-i="${n}" aria-label="${esc(m.name)}"></button>`).join('');
    const dots = $$('.showcase__dot', dotsEl);

    /* decode ahead of time so the crossfade never lands on an empty frame */
    MODELS.forEach((m) => { const p = new Image(); p.src = shotSrc(m.id); });

    function show(n, instant) {
      i = (n + MODELS.length) % MODELS.length;
      const m = MODELS[i];
      dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
      const swap = () => {
        img.src = shotSrc(m.id);
        img.alt = m.full;
        nameEl.textContent = m.name;
        priceEl.textContent = `From ${peso(m.priceFrom)}`;
        wrap.classList.remove('is-swapping');
      };
      if (instant || reduced) return swap();
      wrap.classList.add('is-swapping');
      setTimeout(swap, 260);
    }

    function play() { stopReel(); if (!reduced && visible) timer = setInterval(() => show(i + 1), DWELL); }
    function stopReel() { clearInterval(timer); }

    dotsEl.addEventListener('click', (e) => {
      const d = e.target.closest('.showcase__dot');
      if (!d) return;
      show(+d.dataset.i);
      play();
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.showcase__dot')) return;
      openSheet(MODELS[i].id);
    });
    wrap.addEventListener('pointerenter', stopReel);
    wrap.addEventListener('pointerleave', play);

    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      visible ? play() : stopReel();
    }, { threshold: 0.15 }).observe(wrap);

    document.addEventListener('visibilitychange', () => (document.hidden ? stopReel() : play()));
    show(0, true);
    play();
  })();

  /* ═════════════════════════════════════════════════════════════ ready */
  watchReveals();
  onScroll();

  const done = () => {
    const pre = $('#preloader');
    if (!pre) return;
    pre.classList.add('is-done');
    setTimeout(() => pre.remove(), 800);
  };
  if (document.readyState === 'complete') done();
  else addEventListener('load', done);
  setTimeout(done, 2600);  // never trap the page behind a slow font
})();
