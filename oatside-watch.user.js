// ==UserScript==
// @name         Oatside Stock Watcher (Shopee)
// @namespace    https://chaelri.github.io/
// @version      1.0.0
// @description  Watches the Oatside Official Store on Shopee and pings when the 1L carton or 200ml carton is back in stock.
// @author       Charlie
// @match        https://shopee.ph/oatsideph*
// @run-at       document-end
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const SHOP_ID = '1335585484';
  const PRODUCTS = [
    {
      id: '1L',
      itemid: '24534926366',
      label: '1L Carton (6×1L) — ₱720',
      buyUrl: 'https://shopee.ph/OATSIDE-Barista-Blend-Original-Oat-Milk-1L-(Carton)-6x1L-i.1335585484.24534926366',
    },
    {
      id: '200ml',
      itemid: '28408260181',
      label: '200ml Carton (24pcs) — ₱696',
      buyUrl: 'https://shopee.ph/OATSIDE-Barista-Blend-Original-Oat-Milk-200ml-(24pcs-Carton)-i.1335585484.28408260181',
    },
  ];

  const MIN_DELAY_MS = 4 * 60 * 1000;   // 4 min
  const MAX_DELAY_MS = 12 * 60 * 1000;  // 12 min
  const FIRST_SCAN_MS = 9000;           // let the SPA hydrate before scanning

  const rand  = (a, b) => Math.floor(a + Math.random() * (b - a));
  const fmt   = (d)    => d.toLocaleTimeString('en-PH', { hour12: false });

  function findCard(itemid) {
    const link = document.querySelector(`a[href*=".${SHOP_ID}.${itemid}"]`);
    if (!link) return null;
    let card = link;
    for (let i = 0; i < 6 && card.parentElement; i++) card = card.parentElement;
    return card;
  }

  function checkStock(p) {
    const card = findCard(p.itemid);
    if (!card) return { ok: false };
    const text = (card.innerText || '').toLowerCase();
    return { ok: true, soldOut: /sold\s*out|out of stock/.test(text) };
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch (_) {}
  }

  function notify(p) {
    GM_notification({
      title: '🥛 Oatside in stock!',
      text: `${p.label} just restocked. Click to buy now.`,
      timeout: 0,
      onclick: () => GM_openInTab(p.buyUrl, { active: true }),
    });
    GM_openInTab(p.buyUrl, { active: true });
    beep();
    setTimeout(beep, 1500);
    setTimeout(beep, 3000);
  }

  function badge(html) {
    let el = document.getElementById('__oat_badge');
    if (!el) {
      el = document.createElement('div');
      el.id = '__oat_badge';
      Object.assign(el.style, {
        position: 'fixed', bottom: '14px', right: '14px', zIndex: 999999,
        background: 'rgba(20,20,20,0.92)', color: '#fff', padding: '10px 14px',
        borderRadius: '10px', font: '13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)', maxWidth: '320px',
        pointerEvents: 'auto', userSelect: 'none',
      });
      document.body.appendChild(el);
    }
    el.innerHTML = html;
  }

  function runScan() {
    if (/verify\/traffic/i.test(location.href)) {
      badge('<b>Oatside watch</b><br>⚠️ Shopee asked for verification.<br>Open <a style="color:#7fd" href="https://shopee.ph/oatsideph">the shop page</a> manually, confirm you\'re human, then refresh.');
      return;
    }

    const lines = [];
    for (const p of PRODUCTS) {
      const r = checkStock(p);
      const prev = GM_getValue('oat_state_' + p.id, 'unknown');
      const now  = !r.ok ? 'missing' : (r.soldOut ? 'soldOut' : 'inStock');
      GM_setValue('oat_state_' + p.id, now);

      const tag = now === 'inStock' ? '✅ IN STOCK'
                : now === 'soldOut' ? '🚫 sold out'
                : '❓ not on page';
      lines.push(`<div>${p.label.split(' — ')[0]}: <b>${tag}</b></div>`);

      if (prev === 'soldOut' && now === 'inStock') {
        notify(p);
      }
    }

    const delay  = rand(MIN_DELAY_MS, MAX_DELAY_MS);
    const nextAt = new Date(Date.now() + delay);
    badge(
      `<b style="font-size:14px">Oatside watch</b>` +
      lines.join('') +
      `<div style="margin-top:6px;opacity:.7;font-size:11px">last ${fmt(new Date())} · next ~${fmt(nextAt)}</div>`
    );

    setTimeout(() => location.reload(), delay);
  }

  setTimeout(runScan, FIRST_SCAN_MS);
})();
