/* ==========================================================================
   poster.js — renders a shareable all-in-DP promo poster onto a canvas.

   Why a canvas and not a styled DOM node screenshotted by hand: Sherill posts
   these to Facebook and Viber, and both want a real image file at a known
   size. Canvas gives an exact 1080-px export with no html2canvas dependency
   and no font-substitution surprises.

   Every figure on the poster comes from js/data.js — DP_PROMO, the variant's
   `promoDp` and AGENT. Nothing is typed in here, so a promo update in the
   data file reprints every poster correctly.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const canvas = $('#poster');
  const ctx = canvas.getContext('2d');

  const pesoFull = (n) => '₱' + n.toLocaleString('en-PH');
  /* 88000 → "88K", 688000 → "688K", 1250000 → "1.25M". The headline number is
     the whole point of the poster, so it has to stay short enough to be huge. */
  const short = (n) => (n >= 1e6
    ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
    : Math.round(n / 1000) + 'K');

  const THEMES = {
    dark: {
      bg1: '#0b0b0d', bg2: '#1a1013', glow: 'rgba(195,0,47,.5)',
      txt: '#ffffff', txt2: 'rgba(255,255,255,.72)', txt3: 'rgba(255,255,255,.44)',
      rule: 'rgba(255,255,255,.14)',
      chipBg: 'rgba(255,255,255,.07)', chipLine: 'rgba(255,255,255,.14)',
      dpBg: '#c3002f', dpTxt: '#ffffff',
      srpBg: 'rgba(255,255,255,.07)', srpLine: 'rgba(255,255,255,.16)',
      shadow: 'rgba(0,0,0,.55)',
    },
    light: {
      bg1: '#f4f6f8', bg2: '#dfe5ea', glow: 'rgba(195,0,47,.16)',
      txt: '#0d0f12', txt2: 'rgba(13,15,18,.72)', txt3: 'rgba(13,15,18,.5)',
      rule: 'rgba(13,15,18,.14)',
      chipBg: 'rgba(13,15,18,.05)', chipLine: 'rgba(13,15,18,.12)',
      dpBg: '#c3002f', dpTxt: '#ffffff',
      srpBg: 'rgba(13,15,18,.05)', srpLine: 'rgba(13,15,18,.14)',
      shadow: 'rgba(0,0,0,.22)',
    },
  };

  /* Every vertical measurement lives here rather than being sprinkled through
     draw() as `tall ? a : b`. The square canvas is genuinely tight — at 1080
     square there is no room for the perk chips once the car and the headline
     number have taken their share, so it drops them and the story format
     keeps them. Change a number here, not in the drawing code. */
  const SIZES = {
    square: {
      w: 1080, h: 1080, pad: 72,
      name: 38, dealer: 19, model: 64, tag: 28, tagLines: 1,
      carH: 280, gapCar: 24, boxH: 224, gapBox: 26, bigNum: 126,
      perks: false, variant: 22, footName: 30, footSub: 19, footFine: 17,
    },
    story: {
      w: 1080, h: 1920, pad: 84,
      name: 44, dealer: 22, model: 82, tag: 34, tagLines: 2,
      carH: 620, gapCar: 60, boxH: 330, gapBox: 56, bigNum: 180,
      perks: true, variant: 28, footName: 36, footSub: 23, footFine: 19,
    },
  };

  const PERKS = [
    'Low all-in down payment',
    'Flexible financing options',
    'Free trade-in evaluation',
    'Available for test drive',
  ];

  let theme = 'dark';
  let size = 'square';

  /* ── data: only units that actually carry a promo figure ───────────────── */
  const promoModels = MODELS
    .map((m) => ({ m, variants: m.variants.filter((v) => v.promoDp != null) }))
    .filter((x) => x.variants.length);

  const fmtDate = (iso) => {
    const [y, mo, d] = iso.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const dpPromoRunning = () => {
    const t = new Date();
    const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return d >= DP_PROMO.start && d <= DP_PROMO.end;
  };

  /* ── image cache: the transparent studio cut-outs the main site uses ───── */
  const imgCache = new Map();
  function loadCut(id) {
    if (imgCache.has(id)) return imgCache.get(id);
    const p = new Promise((resolve) => {
      const img = new Image();
      /* Same-origin, but be explicit — a tainted canvas would break export. */
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `../assets/models/cut/${id}.webp`;
    });
    imgCache.set(id, p);
    return p;
  }

  /* ── canvas helpers ────────────────────────────────────────────────────── */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const font = (weight, px, spacing = 0) => {
    ctx.font = `${weight} ${px}px Inter, -apple-system, sans-serif`;
    ctx.letterSpacing = `${spacing}px`;
  };

  /* Draws `text` across at most `maxLines`, shrinking until it fits `maxW`.
     Returns the y baseline after the last line. */
  function wrapText(text, x, y, maxW, lineH, maxLines = 2) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    return y + (lines.length - 1) * lineH;
  }

  /* Object-fit: contain, centred in the given box. */
  function drawContain(img, bx, by, bw, bh) {
    const s = Math.min(bw / img.width, bh / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
  }

  /* ── the poster ────────────────────────────────────────────────────────── */
  async function draw() {
    const pick = currentPick();
    if (!pick) return;
    const { m, v } = pick;
    const T = THEMES[theme];
    const L = SIZES[size];
    const { w: W, h: H, pad: PAD } = L;
    const tall = size === 'story';

    canvas.width = W;
    canvas.height = H;

    const inner = W - PAD * 2;

    /* background */
    const bg = ctx.createLinearGradient(0, 0, W * .35, H);
    bg.addColorStop(0, T.bg1);
    bg.addColorStop(1, T.bg2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* one warm glow behind where the car sits */
    const gy = tall ? H * .44 : H * .46;
    const glow = ctx.createRadialGradient(W * .5, gy, 0, W * .5, gy, W * .72);
    glow.addColorStop(0, T.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    /* ── header: her name, not a manufacturer lockup ── */
    let y = PAD + L.name + 6;
    ctx.fillStyle = T.txt;
    font(800, L.name, -0.6);
    ctx.fillText(AGENT.name.toUpperCase(), PAD, y);

    y += L.dealer + 11;
    ctx.fillStyle = T.txt3;
    font(600, L.dealer, 3.2);
    ctx.fillText(AGENT.dealer.toUpperCase(), PAD, y);

    /* promo pill, right-aligned on the header line */
    if (dpPromoRunning()) {
      const label = 'THIS MONTH ONLY';
      font(800, 19, 2.6);
      const pw = ctx.measureText(label).width + 44;
      const ph = 50;
      const px = W - PAD - pw, py = PAD;
      ctx.fillStyle = T.dpBg;
      roundRect(px, py, pw, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = T.dpTxt;
      ctx.fillText(label, px + 22, py + 33);
    }

    /* ── model name ── */
    y += L.model + 20;
    ctx.fillStyle = T.txt;
    font(800, L.model, -1.6);
    ctx.fillText(m.full.toUpperCase(), PAD, y);

    y += L.tag + 14;
    ctx.fillStyle = T.txt2;
    font(400, L.tag, 0);
    const headline = $('#pHeadline').value.trim() || m.tagline;
    y = wrapText(headline, PAD, y, inner, L.tag + 12, L.tagLines);

    /* ── the car ── */
    const carTop = y + L.gapCar;
    const img = await loadCut(m.id);
    if (img) {
      ctx.save();
      ctx.shadowColor = T.shadow;
      ctx.shadowBlur = 60;
      ctx.shadowOffsetY = 26;
      drawContain(img, PAD - 20, carTop, inner + 40, L.carH);
      ctx.restore();
    }

    /* ── the headline number ── */
    let by = carTop + L.carH + L.gapBox;
    const boxH = L.boxH;
    const showSrp = $('#pShowSrp').checked && !!v.price;
    const gap = 22;
    const dpW = showSrp ? Math.round(inner * .58) : inner;

    /* all-in DP block */
    ctx.fillStyle = T.dpBg;
    roundRect(PAD, by, dpW, boxH, 30);
    ctx.fill();

    ctx.textAlign = 'center';
    const dpCx = PAD + dpW / 2;

    ctx.fillStyle = 'rgba(255,255,255,.82)';
    font(700, 23, 3.4);
    ctx.fillText('STARTS AT', dpCx, by + 52);

    ctx.fillStyle = '#fff';
    font(900, L.bigNum, -3);
    ctx.fillText(short(v.promoDp), dpCx, by + boxH * .72);

    ctx.fillStyle = 'rgba(255,255,255,.9)';
    font(700, tall ? 27 : 22, 2.4);
    ctx.fillText('ALL-IN DOWNPAYMENT', dpCx, by + boxH - 30);

    /* SRP block */
    if (showSrp) {
      const sx = PAD + dpW + gap;
      const sw = inner - dpW - gap;
      ctx.fillStyle = T.srpBg;
      roundRect(sx, by, sw, boxH, 30);
      ctx.fill();
      ctx.strokeStyle = T.srpLine;
      ctx.lineWidth = 2;
      roundRect(sx, by, sw, boxH, 30);
      ctx.stroke();

      const scx = sx + sw / 2;
      ctx.fillStyle = T.txt3;
      font(700, 23, 3.4);
      ctx.fillText('SRP', scx, by + 52);

      ctx.fillStyle = T.txt;
      font(800, tall ? 56 : 44, -1.2);
      ctx.fillText(pesoFull(v.price), scx, by + boxH * .62);

      ctx.fillStyle = T.txt3;
      font(500, 21, 0);
      ctx.fillText('VAT inclusive', scx, by + boxH - 30);
    }

    ctx.textAlign = 'left';
    by += boxH + 30;

    /* Footer geometry is measured up from the bottom edge, so work it out
       before the variant line — that line hangs off the rule rather than off
       the flow, which is what stopped it colliding with the footer.
       Four stacked rows, and nothing shares a baseline with a long neighbour:
       the phone row is the only one with a right-hand item, because the fine
       print underneath is wide enough to run into anything beside it. */
    const fineLH = L.footFine + 6;
    const fineY = H - PAD - fineLH;          // baseline of fine-print line 1
    const subY = fineY - 22;                 // "Call or Viber · email"
    const nameY = subY - L.footSub - 12;     // phone number
    const ruleY = nameY - L.footName - 22;

    /* ── variant line, tucked just above the rule ── */
    ctx.fillStyle = T.txt2;
    font(500, L.variant, 0);
    ctx.fillText(v.name, PAD, ruleY - 22);

    /* ── perk ticks (story only — the square has no room left) ── */
    if (L.perks) {
      const cols = 2;
      const colW = (inner - 20) / cols;
      const chipH = 74;
      PERKS.forEach((p, i) => {
        const cx = PAD + (i % cols) * (colW + 20);
        const cy = by + Math.floor(i / cols) * (chipH + 14);
        ctx.fillStyle = T.chipBg;
        roundRect(cx, cy, colW, chipH, chipH / 2);
        ctx.fill();
        ctx.strokeStyle = T.chipLine;
        ctx.lineWidth = 2;
        roundRect(cx, cy, colW, chipH, chipH / 2);
        ctx.stroke();

        /* hand-drawn check — no icon font dependency inside the canvas */
        const kx = cx + 34, ky = cy + chipH / 2;
        ctx.strokeStyle = T.dpBg;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(kx - 10, ky + 1);
        ctx.lineTo(kx - 3, ky + 8);
        ctx.lineTo(kx + 11, ky - 9);
        ctx.stroke();

        ctx.fillStyle = T.txt2;
        font(500, 26, 0);
        ctx.fillText(p, cx + 62, ky + 9);
      });
    }

    /* ── footer: pinned to the bottom, never stacked after the flow above ── */
    ctx.strokeStyle = T.rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, ruleY);
    ctx.lineTo(W - PAD, ruleY);
    ctx.stroke();

    ctx.fillStyle = T.txt;
    font(700, L.footName, 0);
    ctx.fillText(AGENT.mobile.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3'), PAD, nameY);

    /* Right-hand item on the phone row only — measured so it can never run
       into the number beside it. */
    const until = dpPromoRunning() ? `Promo until ${fmtDate(DP_PROMO.end)}` : 'Ask for this month’s promo';
    ctx.textAlign = 'right';
    ctx.fillStyle = T.txt3;
    font(600, L.footSub, 0);
    ctx.fillText(until, W - PAD, nameY);
    ctx.textAlign = 'left';

    ctx.fillStyle = T.txt3;
    font(500, L.footSub, 0);
    ctx.fillText('Call or Viber  ·  ' + AGENT.email, PAD, subY);

    font(400, L.footFine, 0);
    wrapText(
      'SRP and promo subject to change  ·  Subject to bank approval  ·  Independent sales page, not an official Nissan Philippines website',
      PAD, fineY, inner, fineLH, 2,
    );
  }

  /* ── selection plumbing ────────────────────────────────────────────────── */
  const pModel = $('#pModel');
  const pVariant = $('#pVariant');

  function currentPick() {
    const entry = promoModels.find((x) => x.m.id === pModel.value);
    if (!entry) return null;
    const v = entry.variants[+pVariant.value] || entry.variants[0];
    return { m: entry.m, v };
  }

  function fillVariants() {
    const entry = promoModels.find((x) => x.m.id === pModel.value);
    if (!entry) return;
    pVariant.innerHTML = entry.variants
      .map((v, i) => `<option value="${i}">${v.name} — ${pesoFull(v.promoDp)} all-in</option>`)
      .join('');
  }

  function updateHint() {
    const pick = currentPick();
    if (!pick) return;
    const yrs = DP_PROMO.terms.map((t) => t / 12);
    $('#dpHint').innerHTML =
      `<strong>${pesoFull(pick.v.promoDp)}</strong> all-in — down payment, chattel and insurance together, `
      + `on ${yrs[0]}-to-${yrs[yrs.length - 1]}-year terms at ${DP_PROMO.basisPct}% approval.`;
  }

  function refresh() {
    updateHint();
    draw();
  }

  pModel.innerHTML = promoModels.map((x) => `<option value="${x.m.id}">${x.m.full}</option>`).join('');
  fillVariants();

  pModel.addEventListener('change', () => { fillVariants(); refresh(); });
  pVariant.addEventListener('change', refresh);
  $('#pHeadline').addEventListener('input', draw);
  $('#pShowSrp').addEventListener('change', draw);

  $$('#pTheme .seg__btn').forEach((b) => b.addEventListener('click', () => {
    theme = b.dataset.theme;
    $$('#pTheme .seg__btn').forEach((x) => x.classList.toggle('is-active', x === b));
    draw();
  }));
  $$('#pSize .seg__btn').forEach((b) => b.addEventListener('click', () => {
    size = b.dataset.size;
    $$('#pSize .seg__btn').forEach((x) => x.classList.toggle('is-active', x === b));
    draw();
  }));

  /* ── toast ── */
  let toastT;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-up');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('is-up'), 2600);
  }

  /* ── export ────────────────────────────────────────────────────────────── */
  const fileName = () => {
    const { m, v } = currentPick();
    const slug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${m.id}-${slug}-${short(v.promoDp).toLowerCase()}-allin.png`;
  };

  $('#pDownload').addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.click();
      /* Revoke on the next tick — Safari drops the download if it goes early. */
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Saved to your downloads');
    }, 'image/png');
  });

  $('#pCopy').addEventListener('click', () => {
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Poster copied — paste it into Messenger or Viber');
      } catch {
        toast('Copy is blocked here — use Download PNG instead');
      }
    }, 'image/png');
  });

  $('#pCaption').addEventListener('click', async () => {
    const { m, v } = currentPick();
    const yrs = DP_PROMO.terms.map((t) => t / 12);
    const caption = [
      `${m.full} — ${pesoFull(v.promoDp)} ALL-IN DOWNPAYMENT`,
      '',
      `${v.name}`,
      v.price ? `SRP ${pesoFull(v.price)} (VAT inclusive)` : '',
      '',
      `All-in means down payment, chattel mortgage and insurance together — on ${yrs[0]} to ${yrs[yrs.length - 1]} year terms.`,
      dpPromoRunning() ? `Promo runs until ${fmtDate(DP_PROMO.end)}. Subject to bank approval.` : 'Message me for this month’s promo.',
      '',
      `${AGENT.name} · ${AGENT.dealer}`,
      `Call or Viber ${AGENT.mobile}`,
    ].filter((l) => l !== '').join('\n');
    try {
      await navigator.clipboard.writeText(caption);
      toast('Caption copied');
    } catch {
      toast('Could not copy the caption');
    }
  });

  /* ── boot ──────────────────────────────────────────────────────────────── */
  $('#windowLabel').textContent = dpPromoRunning()
    ? `${DP_PROMO.label} · until ${fmtDate(DP_PROMO.end)}`
    : `${DP_PROMO.label} · ended ${fmtDate(DP_PROMO.end)}`;

  if (!dpPromoRunning()) {
    $('#saveHint').textContent = 'This promo window has closed — update DP_PROMO in js/data.js before posting these.';
  }

  /* Inter has to be resident before the first paint or the canvas falls back
     to a system face and every measurement shifts. */
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(refresh);
})();
