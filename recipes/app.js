/* Lutong Bahay — renders every view from data.js.
   Adding a recipe means editing data.js only; the drawings below are picked
   automatically from the words in each ingredient and step. */

(function () {
  'use strict';

  // ---------------------------------------------------------------- drawings

  var ICONS = {
    pork:     '<path d="M3.6 12.4c0-3.5 3.4-5.9 7.9-5.9s8.9 1.9 8.9 5.4-3.6 5.4-8.1 5.4-8.7-1.4-8.7-4.9z"/><path d="M7.4 11.4c1.6.9 3.5 1.3 5.5 1.2"/>',
    water:    '<path d="M12 3.6c3.5 3.9 5.4 6.5 5.4 8.9a5.4 5.4 0 0 1-10.8 0c0-2.4 1.9-5 5.4-8.9z"/>',
    onion:    '<path d="M12 6.6c3 2.8 4.7 4.9 4.7 7.1a4.7 4.7 0 0 1-9.4 0c0-2.2 1.7-4.3 4.7-7.1z"/><path d="M12 6.6V3.4c1.2-.6 2.2-.3 2.9.6"/><path d="M9.9 9.5c-.7 1.4-1 2.8-.9 4.1M14.1 9.5c.7 1.4 1 2.8.9 4.1"/>',
    garlic:   '<path d="M12 5.6c3.1 3 4.9 5.3 4.9 7.6a4.9 4.9 0 0 1-9.8 0c0-2.3 1.8-4.6 4.9-7.6z"/><path d="M12 5.6V3.2"/><path d="M10.1 13.2c0 1.6.7 2.9 1.9 3.9 1.2-1 1.9-2.3 1.9-3.9"/>',
    ginger:   '<path d="M4.6 12.7c0-1.9 1.5-3.2 3.3-3.2 1 0 1.7-.5 2.2-1.3.9-1.2 2.5-1.4 3.6-.4.8.7 1.6.9 2.5.7 1.7-.3 2.9 1.2 2.5 2.8-.2 1-.9 1.6-1.8 1.9-1 .3-1.6.9-1.9 1.7-.7 1.6-2.6 2-3.9.9-.8-.7-1.6-.8-2.5-.6-1.8.4-3.4-.9-3.4-2.5z"/>',
    pepper:   '<circle cx="8.6" cy="10" r="2"/><circle cx="14.5" cy="9.1" r="1.6"/><circle cx="11.6" cy="14.4" r="2.3"/>',
    banana:   '<path d="M6.1 6.9c-.8 5.3 3.1 9.4 8.5 9 2.3-.2 4.2-1.3 5.4-2.9-2.4 1-5.1.9-7.2-.4-2.4-1.4-3.8-3.6-3.9-6.2"/><path d="M6.1 6.9c-.1-1 .6-1.8 1.6-1.8"/>',
    potato:   '<ellipse cx="12" cy="12" rx="7.3" ry="5.1" transform="rotate(-12 12 12)"/><circle cx="9.6" cy="11" r=".7" fill="currentColor" stroke="none"/><circle cx="13.4" cy="13" r=".7" fill="currentColor" stroke="none"/><circle cx="13.9" cy="10.1" r=".55" fill="currentColor" stroke="none"/>',
    corn:     '<path d="M12 3.7c2.5 1.6 3.9 4.3 3.9 7.9s-1.4 6.3-3.9 7.9c-2.5-1.6-3.9-4.3-3.9-7.9s1.4-6.3 3.9-7.9z"/><path d="M9.3 8.4h5.4M9.1 11.8h5.8M9.3 15.2h5.4M12 4.6v14"/>',
    cabbage:  '<circle cx="12" cy="12" r="7.4"/><path d="M12 4.6c-2.3 2-3.5 4.5-3.5 7.4s1.2 5.4 3.5 7.4M12 4.6c2.3 2 3.5 4.5 3.5 7.4s-1.2 5.4-3.5 7.4"/>',
    leaf:     '<path d="M19.2 4.8c0 7-4.3 11.4-10.5 11.4H5.2C5.2 9.2 9.5 4.8 15.7 4.8h3.5z"/><path d="M6.4 19.2c2-4.9 5-8.1 9.4-9.9"/>',
    salt:     '<path d="M8.4 9.6h7.2l.9 9.4H7.5z"/><path d="M9.6 9.6c0-2 1.1-3.4 2.4-3.4s2.4 1.4 2.4 3.4"/><circle cx="10.9" cy="12.7" r=".6" fill="currentColor" stroke="none"/><circle cx="13.2" cy="14.5" r=".6" fill="currentColor" stroke="none"/><circle cx="12" cy="16.4" r=".6" fill="currentColor" stroke="none"/>',
    tamarind: '<path d="M4.4 11.6c3.1-3.6 6.8-4.3 11-2.2 1.9 1 3.3 2.5 4.2 4.5-3.3 3-7 3.5-11 1.4-1.8-1-3.2-2.3-4.2-3.7z"/><circle cx="9.2" cy="11.9" r="1"/><circle cx="13.4" cy="12.9" r="1"/>',
    citrus:   '<circle cx="12" cy="12" r="7.3"/><path d="M12 4.7v14.6M5.8 8.4l12.4 7.2M5.8 15.6l12.4-7.2"/>',
    tomato:   '<circle cx="12" cy="13.6" r="6.3"/><path d="M9.3 6.6c1 1.2 2.2 1.3 2.7.7.5.6 1.7.5 2.7-.7"/><path d="M12 7.3v1.3"/>',
    radish:   '<path d="M12 9.1c3.3 0 5.3 2.3 4.8 4.9-.5 2.5-2.5 4.4-4.8 4.4s-4.3-1.9-4.8-4.4c-.5-2.6 1.5-4.9 4.8-4.9z"/><path d="M12 9.1V5.8"/><path d="M12 5.8c-1-1.3-2.3-1.6-3.5-1 .4 1.3 1.7 2.1 3.5 2M12 5.8c1-1.3 2.3-1.6 3.5-1-.4 1.3-1.7 2.1-3.5 2"/>',
    beans:    '<path d="M4.6 15.4c4.1-1.5 7.2-4.6 8.7-8.7M7.2 17.6c4.5-1.7 7.9-5.2 9.6-10"/>',
    okra:     '<path d="M12 4.9c2.1 2.4 3.3 5.3 3.3 8.5 0 3-1.2 5-3.3 5s-3.3-2-3.3-5c0-3.2 1.2-6.1 3.3-8.5z"/><path d="M12 5.2v13M9.7 8.6c1.5.8 3.1.8 4.6 0"/>',
    chili:    '<path d="M8.2 8.7c4.4 0 7.8 3 7.8 6.4 0 2-1.4 3.4-3.3 3.4-3.6 0-6.4-3.3-6.4-7.3"/><path d="M8.2 8.7 7.2 5.8c1.2-.7 2.3-.5 3.2.6"/>',
    rice:     '<path d="M4.6 11.2h14.8c0 4.3-3.3 7.3-7.4 7.3s-7.4-3-7.4-7.3z"/><path d="M8.2 8.4c.6-.9 1.5-1.2 2.5-.8M12.6 7.7c.6-.9 1.5-1.2 2.5-.8"/>',
    gourd:    '<path d="M12 6.1c1.5 0 2.3 1.1 2.3 2.3 0 1-.6 1.7-.6 2.5 0 1.4 2.1 2.3 2.1 4.4 0 2-1.7 3.3-3.8 3.3s-3.8-1.3-3.8-3.3c0-2.1 2.1-3 2.1-4.4 0-.8-.6-1.5-.6-2.5 0-1.2.8-2.3 2.3-2.3z"/>',
    squash:   '<ellipse cx="12" cy="13.4" rx="7.3" ry="5.4"/><path d="M12 8v10.8M8.7 8.9c-1 1.3-1.5 2.8-1.5 4.5s.5 3.1 1.5 4.5M15.3 8.9c1 1.3 1.5 2.8 1.5 4.5s-.5 3.1-1.5 4.5"/><path d="M12 8V5.7"/>',
    ampalaya: '<path d="M8.1 4.8c4.3 1.6 7.2 5.3 7.8 10.1.2 1.9-1 3.3-2.5 3.3-3.7 0-6.8-4.3-6.8-9.1 0-2 .6-3.3 1.5-4.3z"/><path d="M9.6 7.6c1.3 1 2.5 2.3 3.3 3.9M8.6 11c1.2.8 2.1 1.7 2.9 2.9"/>',
    eggplant: '<path d="M15.4 8.6c1.9 2 1.9 5.3 0 7.4-2.5 2.7-6.4 2.9-8.3 1s-1.5-5.8 1-8.4c2.1-2.1 5.4-2.1 7.3 0z"/><path d="M15.4 8.6 17.8 6.2M14 7.2c.4-1.4 1.5-2.3 2.9-2.5-.2 1.4-1.2 2.5-2.5 2.9"/>',
    carrot:   '<path d="M13.7 10.3 5.7 18.3c2.9.6 5.8-.2 7.9-2.3s2.9-5 2.3-7.9z"/><path d="M15.4 8.6 17.8 6.2M14.4 7.6c0-1.4.8-2.5 1.9-2.9.4 1.4 0 2.7-1 3.5M16.4 9.6c1.4-.4 2.7 0 3.5 1-1.2.8-2.5 1-3.7.4"/>',
    bellpep:  '<path d="M12 8.2c1.5-1.2 3.8-1 5.2.6 1.5 1.7 1.5 4.8-.2 6.9-1.3 1.7-3.3 2.5-5 2.5s-3.7-.8-5-2.5c-1.7-2.1-1.7-5.2-.2-6.9 1.4-1.6 3.7-1.8 5.2-.6z"/><path d="M12 8.2V5.8c1-.6 1.9-.4 2.5.4"/>',
    peas:     '<path d="M4.9 12.1c2.7-3.9 7.7-5.4 12.2-3.5-1.2 4.4-5.4 7.1-9.9 6.2"/><circle cx="9.1" cy="11.6" r="1.3"/><circle cx="12.6" cy="10.7" r="1.3"/><circle cx="15.7" cy="10.3" r="1.1"/>',
    oil:      '<path d="M10.1 4.7h3.8v2.5l2.9 4.2v6.9c0 .7-.6 1.2-1.2 1.2H8.4c-.7 0-1.2-.6-1.2-1.2v-6.9l2.9-4.2z"/><path d="M12 12.4c1.1 1.3 1.7 2.3 1.7 3 0 .9-.8 1.7-1.7 1.7s-1.7-.8-1.7-1.7c0-.7.6-1.7 1.7-3z"/>',
    can:      '<rect x="6.7" y="5.9" width="10.6" height="12.6" rx="1.5"/><path d="M6.7 9.3h10.6M6.7 15.3h10.6"/>',
    coconut:  '<circle cx="12" cy="12" r="7.3"/><circle cx="9.7" cy="9.8" r=".85" fill="currentColor" stroke="none"/><circle cx="13.6" cy="9.4" r=".85" fill="currentColor" stroke="none"/><path d="M9.7 13.4c1.4 1.2 3.1 1.2 4.5-.1"/>',
    beef:     '<path d="M4.2 11.8c0-3.4 3.4-5.6 7.8-5.6s8.6 1.8 8.6 5.2-3.4 5.4-7.8 5.4-8.6-1.6-8.6-5z"/><path d="M13.5 9.6c1.2 0 2 .8 2 1.9 0 1-.6 1.8-1.6 2"/>',
    chicken:  '<path d="M9.6 19.2c-2.6 0-4.6-2-4.6-4.5 0-3.4 3-6.2 3-8.6 0-1.2-.5-1.8-.5-1.8 2.6 0 4.4 1.8 4.4 4.1 0 1.6-.8 2.6-.8 3.6 0 1 .8 1.6 2 1.6 2 0 3.4 1.4 3.4 3.2 0 1.4-1.1 2.4-2.6 2.4z"/>',
    fish:     '<path d="M3.4 12c3-3.6 6.2-5.4 9.6-5.4 3.2 0 5.8 1.8 7.6 5.4-1.8 3.6-4.4 5.4-7.6 5.4-3.4 0-6.6-1.8-9.6-5.4z"/><path d="M3.4 12 6 9.2M3.4 12 6 14.8"/><circle cx="15.6" cy="10.8" r=".8" fill="currentColor" stroke="none"/>',
    shrimp:   '<path d="M18.5 8.4c-4.6 0-8.4 1.6-8.4 5.2 0 2.6 2 4.4 4.8 4.4 3 0 5-2 5-4.8"/><path d="M10.1 13.6c-2.4 0-4.4-1.4-4.4-3.4M18.5 8.4l1.8-2.2M16.4 8.6c-.4-1.2-1.4-2-2.6-2.2"/>',
    pot:      '<path d="M4.6 9.8h14.8v4.4c0 2.6-2.1 4.6-4.6 4.6H9.2c-2.5 0-4.6-2-4.6-4.6z"/><path d="M4.6 12H2.8M19.4 12h1.8M9 7c-.8-.8-.8-1.8 0-2.6M12 7c-.8-.8-.8-1.8 0-2.6M15 7c-.8-.8-.8-1.8 0-2.6"/>',
    flame:    '<path d="M12 3.8c.6 2.6 2 3.6 3.4 5.2 1.2 1.4 2 2.9 2 4.7a5.4 5.4 0 0 1-10.8 0c0-2.2 1.4-3.4 2-5 .6 1 1.2 1.5 2 1.7-.4-2.6.2-4.8 1.4-6.6z"/>',
    pan:      '<path d="M3.4 11.4h11.4v2.4c0 2.2-1.8 4-4 4H7.4c-2.2 0-4-1.8-4-4z"/><path d="M14.8 12.6h5.8"/><path d="M8 8.6c-.7-.7-.7-1.7 0-2.4M11 8.6c-.7-.7-.7-1.7 0-2.4"/>',
    knife:    '<path d="M4.6 15.4 13.8 6.2c1-1 2.2-1.6 3.6-1.8-.2 1.4-.8 2.6-1.8 3.6l-9.2 9.2z"/><path d="M6.4 17.2 4 19.6"/>',
    spoon:    '<path d="M14.6 4.8c1.8 1.8 1.8 4.6 0 6.4s-4.6 1.8-6.4 0 0-4.6 1.8-6.4 2.8-1.8 4.6 0z"/><path d="M9.6 12.6 4.8 19"/>',
    clock:    '<circle cx="12" cy="12" r="7.6"/><path d="M12 7.6V12l3 1.8"/>',
    bowl:     '<path d="M3.8 11.4h16.4c0 4.2-3.6 7.4-8.2 7.4s-8.2-3.2-8.2-7.4z"/><path d="M12 11.4c0-2.2-2.4-2.4-2.4-4.2 0-1.2 1-2 2.4-2"/>',
    dot:      '<circle cx="12" cy="12" r="3.1"/>'
  };

  // first keyword found in the line wins, so order matters
  var ING_MAP = [
    ['tomato sauce','can'], ['tomato paste','can'], ['kasim','pork'], ['pork','pork'],
    ['beef','beef'], ['chicken','chicken'], ['bangus','fish'], ['fish','fish'],
    ['hipon','shrimp'], ['shrimp','shrimp'], ['hugas bigas','rice'], ['rice','rice'],
    ['gata','coconut'], ['coconut','coconut'], ['sampalok','tamarind'], ['kamias','tamarind'],
    ['calamansi','citrus'], ['tomato','tomato'], ['onion','onion'], ['garlic','garlic'],
    ['ginger','ginger'], ['luya','ginger'], ['peppercorn','pepper'], ['saba','banana'],
    ['potato','potato'], ['patatas','potato'], ['corn','corn'], ['repolyo','cabbage'],
    ['cabbage','cabbage'], ['pechay','leaf'], ['kangkong','leaf'], ['malunggay','leaf'],
    ['bay leaves','leaf'], ['dahon','leaf'], ['labanos','radish'], ['sitaw','beans'],
    ['beans','beans'], ['okra','okra'], ['siling','chili'], ['chili','chili'],
    ['sayote','gourd'], ['papaya','gourd'], ['kalabasa','squash'], ['squash','squash'],
    ['ampalaya','ampalaya'], ['talong','eggplant'], ['eggplant','eggplant'],
    ['carrot','carrot'], ['bell pepper','bellpep'], ['peas','peas'], ['oil','oil'],
    ['vinegar','oil'], ['suka','oil'], ['salt','salt'], ['asin','salt'], ['water','water']
  ];

  var STEP_MAP = [
    ['blanch','pot'], ['boil','pot'], ['saut','pan'], ['sear','pan'], ['fry','pan'],
    ['grill','flame'], ['simmer','flame'], ['heat','flame'],
    ['mash','spoon'], ['skim','spoon'], ['stir','spoon'],
    ['chop','knife'], ['slice','knife'], ['trim','knife'], ['cut','knife'], ['peel','knife'],
    ['marinate','clock'], ['rest','clock'], ['cover','clock'], ['chill','clock'],
    ['taste','salt'], ['season','salt'],
    ['serve','bowl'], ['pour','bowl'], ['drain','bowl'],
    ['add','leaf']
  ];

  function pick(text, table) {
    var t = text.toLowerCase();
    for (var i = 0; i < table.length; i++) if (t.indexOf(table[i][0]) !== -1) return table[i][1];
    return null;
  }

  function icon(name) {
    return name ? '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] + '</svg>' : '<span class="ic" aria-hidden="true"></span>';
  }

  // ------------------------------------------------------------------ helpers

  var recipes = window.RECIPES || [];
  var categories = window.CATEGORIES || [];
  var bySlug = {};
  recipes.forEach(function (r) { bySlug[r.slug] = r; });

  var home = document.getElementById('home');
  var view = document.getElementById('recipe');
  var car = document.getElementById('carousel');
  var cnav = document.getElementById('cnav');
  var chips = document.getElementById('chips');
  var topbar = document.getElementById('topbar');
  var topbarTitle = document.getElementById('topbar-title');
  var loadbar = document.getElementById('loadbar');
  var loadfill = loadbar.firstElementChild;
  var prev = document.getElementById('cprev');
  var next = document.getElementById('cnext');
  var slow = window.matchMedia('(prefers-reduced-motion: reduce)');

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // ------------------------------------------------------------------ loading

  var loadAt = 0, loadEnd;

  function loadStart() {
    clearTimeout(loadEnd);
    loadAt = Date.now();
    loadbar.classList.add('on');
    loadfill.style.transition = 'none';
    loadfill.style.transform = 'scaleX(0)';
    void loadfill.offsetWidth;
    loadfill.style.transition = '';
    loadfill.style.transform = 'scaleX(.75)';
  }

  function loadDone() {
    var wait = Math.max(0, 340 - (Date.now() - loadAt));
    loadEnd = setTimeout(function () {
      loadfill.style.transform = 'scaleX(1)';
      loadEnd = setTimeout(function () {
        loadbar.classList.remove('on');
        loadEnd = setTimeout(function () {
          loadfill.style.transition = 'none';
          loadfill.style.transform = 'scaleX(0)';
        }, 280);
      }, 240);
    }, wait);
  }

  // ------------------------------------------------------------------ carousel

  var slides = [], SET = 0, glide, raf, settle;

  function snap(on) { car.style.scrollSnapType = on ? '' : 'none'; }
  function targetLeft(i) {
    var el = slides[i];
    return el.offsetLeft - car.offsetLeft - (car.clientWidth - el.offsetWidth) / 2;
  }

  function current() {
    var mid = car.scrollLeft + car.clientWidth / 2, best = 0, dist = Infinity;
    slides.forEach(function (el, i) {
      var c = el.offsetLeft - car.offsetLeft + el.offsetWidth / 2;
      var d = Math.abs(c - mid);
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  }

  function setActive(i) {
    slides.forEach(function (el, n) { el.classList.toggle('is-active', n === i); });
  }

  function jumpTo(i) {
    if (!slides.length) return;
    cancelAnimationFrame(glide);
    snap(false);
    car.scrollLeft = Math.round(targetLeft(i));
    snap(true);
    setActive(i);
  }

  function normalize() {
    if (!SET || slides.length <= SET) return current();
    var i = current();
    var j = i < SET ? i + SET : (i >= SET * 2 ? i - SET : i);
    if (j !== i) jumpTo(j);
    return j;
  }

  function tweenTo(x, ms) {
    cancelAnimationFrame(glide);
    x = Math.round(x);
    var from = car.scrollLeft, delta = x - from, t0 = performance.now();
    if (!delta) return;
    snap(false);
    if (slow.matches) { car.scrollLeft = x; snap(true); return; }
    ms = ms || 620;
    (function frame(t) {
      var k = Math.min(1, ((t || t0) - t0) / ms);
      var e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      car.scrollLeft = from + delta * e;
      if (k < 1) { glide = requestAnimationFrame(frame); }
      else { car.scrollLeft = x; glide = 0; snap(true); normalize(); }
    })(t0);
  }

  function step(dir) { if (slides.length > 1) tweenTo(targetLeft(normalize() + dir)); }

  car.addEventListener('scroll', function () {
    if (!raf) raf = requestAnimationFrame(function () { raf = 0; setActive(current()); });
    clearTimeout(settle);
    settle = setTimeout(function () { if (!glide) normalize(); }, 160);
  }, { passive: true });

  prev.addEventListener('click', function () { step(-1); autoRestart(); });
  next.addEventListener('click', function () { step(1); autoRestart(); });
  window.addEventListener('resize', function () { if (slides.length) jumpTo(current()); });

  // ------------------------------------------------------------------ autoplay

  var AUTO_MS = 5000, timer = null;

  function autoPlay() {
    if (timer || slow.matches || home.hidden || document.hidden || slides.length < 2) return;
    timer = setInterval(function () { step(1); }, AUTO_MS);
  }

  function autoPause() { clearInterval(timer); timer = null; }
  function autoRestart() { autoPause(); autoPlay(); }

  car.addEventListener('mouseenter', autoPause);
  car.addEventListener('mouseleave', autoPlay);
  car.addEventListener('focusin', autoPause);
  car.addEventListener('focusout', autoPlay);
  car.addEventListener('touchstart', autoPause, { passive: true });
  car.addEventListener('touchend', function () { setTimeout(autoRestart, 2500); }, { passive: true });
  document.addEventListener('visibilitychange', function () { document.hidden ? autoPause() : autoPlay(); });

  // ------------------------------------------------------------------ home

  var activeCat = 'all';

  function listFor(cat) {
    return cat === 'all' ? recipes : recipes.filter(function (r) { return r.category === cat; });
  }

  function slideHTML(r, first) {
    return '<a class="slide" href="#' + r.slug + '">' +
      '<span class="shot"><img src="' + r.photo + '" alt="' + esc(r.short) + '" width="1100" height="733" ' +
      (first ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async"></span>' +
      '<span class="slide-body">' +
        '<span class="pick-name">' + r.title + '</span>' +
        '<span class="pick-meta">' + esc(r.time) + ' · serves ' + esc(r.serves) + '</span>' +
        '<span class="pick-ing">' + esc(r.keys) + '</span>' +
      '</span></a>';
  }

  function buildCarousel(list) {
    autoPause();
    cancelAnimationFrame(glide);
    car.innerHTML = '';
    slides = [];
    SET = 0;

    if (!list.length) {
      car.innerHTML = '<div class="empty-state">' + icon('bowl') +
        '<p>Wala pang naka-save dito. Ito ang susunod na idadagdag.</p></div>';
      cnav.hidden = true;
      return;
    }

    var html = list.map(function (r, i) { return slideHTML(r, i === 0); }).join('');
    // clone the set before and after so the loop never hits an edge
    car.innerHTML = list.length > 1 ? html + html + html : html;
    slides = Array.prototype.slice.call(car.children);
    SET = list.length;

    if (list.length > 1) {
      Array.prototype.forEach.call(car.children, function (el, i) {
        if (i < SET || i >= SET * 2) el.tabIndex = -1;
      });
      cnav.hidden = false;
      jumpTo(SET);
    } else {
      cnav.hidden = true;
      setActive(0);
    }
    autoPlay();
  }

  function buildChips() {
    var html = '<button class="chip" type="button" data-cat="all" aria-pressed="true">Lahat ' +
      '<span class="n">' + recipes.length + '</span></button>';
    categories.forEach(function (c) {
      var n = listFor(c.id).length;
      html += '<button class="chip' + (n ? '' : ' empty') + '" type="button" data-cat="' + c.id +
        '" aria-pressed="false">' + c.label + ' <span class="n">' + n + '</span></button>';
    });
    chips.innerHTML = html;
  }

  chips.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    activeCat = b.dataset.cat;
    Array.prototype.forEach.call(chips.children, function (c) {
      c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
    });
    buildCarousel(listFor(activeCat));
  });

  // ------------------------------------------------------------------ recipe

  function recipeHTML(r) {
    var ings = r.ingredients.map(function (line) {
      return '<li><label><input type="checkbox">' + icon(pick(line, ING_MAP)) +
        '<span class="txt">' + line + '</span></label></li>';
    }).join('');

    var steps = r.steps.map(function (line) {
      return '<li><label><input type="checkbox">' + icon(pick(line, STEP_MAP)) +
        '<span class="txt">' + line + '</span></label></li>';
    }).join('');

    var notes = (r.notes || []).map(function (n) { return '<p class="note">' + n + '</p>'; }).join('');

    var credit = r.credit ? '<p class="credit">Photo: ' + esc(r.credit.by) + ' · ' + esc(r.credit.license) +
      ' · <a href="' + r.credit.url + '" target="_blank" rel="noopener">Wikimedia Commons</a></p>' : '';

    return '<figure class="hero"><img src="' + r.photo + '" alt="' + esc(r.short) +
        '" width="1100" height="733" decoding="async"></figure>' +
      '<h2 tabindex="-1">' + r.title + '</h2>' +
      '<p class="meta"><span class="mi" aria-hidden="true">schedule</span>' + esc(r.time) +
        '<span class="mi" aria-hidden="true">restaurant</span>serves ' + esc(r.serves) + '</p>' +
      '<div class="cols">' +
        '<section>' +
          '<div class="sec-head"><h3 class="label"><span class="mi" aria-hidden="true">shopping_basket</span>Ingredients</h3>' +
          '<button class="reset" type="button">I-reset</button></div>' +
          '<ul class="ing">' + ings + '</ul>' +
        '</section>' +
        '<section>' +
          '<div class="sec-head"><h3 class="label"><span class="mi" aria-hidden="true">soup_kitchen</span>Method</h3>' +
          '<button class="reset" type="button">I-reset</button></div>' +
          '<ol class="steps">' + steps + '</ol>' +
        '</section>' +
      '</div>' + notes + credit +
      '<a class="backlink" href="#">Balik sa listahan</a>';
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.reset');
    if (!b) return;
    b.closest('section').querySelectorAll('input[type=checkbox]').forEach(function (c) { c.checked = false; });
  });

  // ------------------------------------------------------------------ routing

  function show(slug) {
    var r = bySlug[slug];

    home.hidden = !!r;
    view.hidden = !r;
    topbar.hidden = !r;
    topbarTitle.textContent = r ? r.short : '';
    document.title = r ? r.short + ' — Lutong Bahay' : 'Lutong Bahay';

    window.scrollTo(0, 0);

    if (r) {
      loadStart();
      view.innerHTML = recipeHTML(r);
      view.classList.remove('view-enter');
      void view.offsetWidth;
      view.classList.add('view-enter');

      var fig = view.querySelector('.hero');
      var img = fig.querySelector('img');
      if (img.complete && img.naturalWidth) { loadDone(); }
      else {
        fig.classList.add('is-loading');
        var settled = function () { fig.classList.remove('is-loading'); loadDone(); };
        img.addEventListener('load', settled, { once: true });
        img.addEventListener('error', settled, { once: true });
      }

      view.querySelector('h2').focus({ preventScroll: true });
      autoPause();
    } else {
      view.innerHTML = '';
      autoPlay();
    }
  }

  function route() { show(location.hash.replace(/^#\/?/, '')); }

  window.addEventListener('hashchange', route);
  document.getElementById('back').addEventListener('click', function () {
    if (history.length > 1) history.back(); else location.hash = '';
  });

  // ------------------------------------------------------------------ boot

  buildChips();
  buildCarousel(listFor('all'));
  route();
})();
