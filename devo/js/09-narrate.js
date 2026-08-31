/* ============================================================
   RETELL — the chapter as narration + dialogue
   ============================================================
   Lays the loaded chapter out as a screenplay: narration beats and speech
   bubbles with a circular avatar per speaker.

   The text is VERBATIM — narration as well as dialogue. The model is a
   typesetter, not a writer: it splits the chapter's existing words into
   beats, works out who is speaking, and drops the attribution clause that
   the bubble's own label replaces ("The Lord said to Gideon,"). It writes
   nothing of its own except the title and logline. An earlier version let it
   phrase narration itself and it quietly rewrote the chapter — "So 22,000
   men left that place" came back as "Twenty-two thousand men leave".

   Occupies the js/09 slot freed when the SOAP feature was deleted
   (DECISIONS #23), so the chunk order stays contiguous.

   Flow, because generation takes a few seconds:
     click → curtain wipes up over the reader → loading → beats fade in
   The curtain is one element that stays put for all three stages, so the
   screen never flashes between them.
============================================================ */

// Bumped whenever output shape changes — "narrate_" held rewritten prose,
// "narrate2_"/"narrate3_" held verses whose speech was never split out of the
// narration. Cached entries would otherwise keep serving the old shape for a
// week. Superseded keys expire on their own TTL and are never read again.
const _NR_CACHE_PREFIX = "narrate4_";
const _NR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days, same as the story cache

/* Bubble colours cycle per distinct speaker so two people in the same scene
   never share one. God/the Lord is pinned to index 0 so He reads consistently
   across every chapter rather than shifting with cast order. */
const _NR_SPEAKER_TONES = [
  { bg: "rgba(219, 39, 119, 0.16)", ring: "rgba(219, 39, 119, 0.45)", ink: "#ffb3d9", line: "#db2777" },
  { bg: "rgba(96, 165, 250, 0.15)", ring: "rgba(96, 165, 250, 0.45)", ink: "#a9cdff", line: "#3b82f6" },
  { bg: "rgba(52, 211, 153, 0.14)", ring: "rgba(52, 211, 153, 0.42)", ink: "#8ee9c4", line: "#0d9488" },
  { bg: "rgba(251, 191, 36, 0.15)", ring: "rgba(251, 191, 36, 0.45)", ink: "#ffd98a", line: "#d97706" },
  { bg: "rgba(167, 139, 250, 0.16)", ring: "rgba(167, 139, 250, 0.45)", ink: "#cbb4ff", line: "#7c3aed" },
  { bg: "rgba(248, 113, 113, 0.15)", ring: "rgba(248, 113, 113, 0.45)", ink: "#ffb0b0", line: "#e11d48" },
];

function _nrIsDivine(name) {
  return /^(the )?(lord|god|yahweh|jesus|christ|holy spirit|angel of the lord)$/i.test(
    String(name || "").trim(),
  );
}

function _nrToneFor(name, registry) {
  const key = String(name || "").trim().toLowerCase();
  if (!(key in registry)) {
    registry[key] = _nrIsDivine(name)
      ? 0
      : 1 + (Object.keys(registry).length % (_NR_SPEAKER_TONES.length - 1));
  }
  return _NR_SPEAKER_TONES[registry[key]];
}

/* Divine speakers get a mark instead of initials — "LO" for the Lord read as
   a username. A plain Latin cross: the crossbar sits above centre, ends are
   rounded, nothing ornamental. Inline SVG rather than a Material ligature so
   a missing glyph can never render as a literal word inside the circle. */
const _NR_CROSS_SVG = `<svg class="nr-cross" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2.5 V21.5 M5.5 8.6 H18.5"
        stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>
</svg>`;

function _nrInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  // Drop a leading article so "The Lord" reads as L, not TL.
  if (parts.length > 1 && /^the$/i.test(parts[0])) parts.shift();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function _nrEsc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/* Speech inside speech — "So say to the men, “If you are very afraid…”" — is
   a second voice and shouldn't sit in the bubble as raw punctuation. Runs
   AFTER _nrEsc: curly marks pass through escaping untouched, which is exactly
   what makes it safe to regex for them without escaping our own markup.
   Deliberately inline, not pulled onto its own line: these are usually mid
   sentence ("If I say, “…,” then take him"), and breaking them out would cut
   the sentence in half. Colour matches the reader's nested quotes so inner
   speech reads the same way throughout the app. */
function _nrMarkInnerQuotes(escaped) {
  return String(escaped)
    .replace(/“([^”]+)”/g, '<span class="nr-inner">“$1”</span>')
    .replace(/‘([^’]+)’/g, '<span class="nr-inner">‘$1’</span>')
    // Straight quotes as a fallback. The prompt forbids swapping the curly
    // marks for these, but the model does it anyway often enough that inner
    // speech would otherwise silently lose its colour. `"` is `&quot;` by the
    // time it reaches here, since this runs after escaping.
    .replace(/&quot;([^&]+?)&quot;/g, '<span class="nr-inner">&quot;$1&quot;</span>');
}

/* ── Speech extraction (the safety net) ────────────────────────────────────
   The prompt tells the model to split a verse where narration meets speech.
   It complies most of the time and then quietly doesn't — one verse becomes a
   bubble while the next leaves the speech sitting in a narration beat. No
   amount of extra prompt wording fixed that reliably, so the split is done
   here instead, deterministically, after the model has answered.

   The model still does the part only it can do: deciding the beat order and
   naming speakers it can infer. This pass only rescues what it missed. */
const _NR_SAY_VERBS =
  "said|says|say|told|tells|replied|replies|answered|answers|asked|asks|" +
  "shouted|shouts|cried|cries|called|calls|announced|declared|spoke|speaks|promised|warned";

// Subjects that carry no name. Resolved against the first proper noun in the
// same beat before the split is allowed.
const _NR_PRONOUNS = /^(he|she|they|it|we|you|i)$/i;

// Words that open a sentence and would otherwise be mistaken for a name.
const _NR_NOT_NAMES = new Set([
  "when", "so", "but", "then", "and", "after", "now", "the", "a", "an", "this",
  "that", "these", "those", "at", "in", "on", "for", "as", "if", "while",
  "before", "because", "there", "here", "one", "some", "all", "his", "her",
  "their", "its", "he", "she", "they", "it",
]);

function _nrFirstProperNoun(text) {
  const words = String(text || "").match(/[A-Z][a-z'’]+/g) || [];
  return words.find((w) => !_NR_NOT_NAMES.has(w.toLowerCase())) || null;
}

/* Reads the tail of the narration that runs up to a quote and works out who
   is about to speak. Returns null when it can't tell — and null means DON'T
   split, because a bubble labelled with the wrong speaker is worse than one
   that stayed as narration. */
function _nrReadAttribution(before, wholeBeat) {
  const tail = String(before || "");
  const m = tail.match(
    new RegExp(
      `([A-Z][\\w'’]*(?:\\s+[\\w'’]+){0,3}|\\b(?:He|She|They|It)\\b)\\s+(?:${_NR_SAY_VERBS})\\b([^,]*),?\\s*$`,
      "i",
    ),
  );
  if (!m) return null;

  let speaker = m[1].trim().replace(/^(and|so|but|then|when)\s+/i, "");
  const toMatch = (m[2] || "").match(/\bto\s+([\w'’ ]+?)\s*$/i);
  const to = toMatch ? toMatch[1].trim() : "";

  if (_NR_PRONOUNS.test(speaker)) {
    // "He shouted to his men" — the name is usually earlier in the same beat.
    const named = _nrFirstProperNoun(wholeBeat);
    if (!named) return null;
    speaker = named;
  }

  return {
    speaker,
    to,
    // Everything before the attribution clause stays narration.
    narration: tail.slice(0, m.index).trim(),
  };
}

const _NR_QUOTE_RE = /“([^”]*)”|‘([^’]*)’|"([^"]*)"/g;

function _nrSplitSpeech(beats) {
  const out = [];

  for (const beat of beats) {
    if (beat.type !== "narration" || !beat.text) {
      out.push(beat);
      continue;
    }

    const text = String(beat.text);
    _NR_QUOTE_RE.lastIndex = 0;
    let cursor = 0;
    let produced = false;
    let match;

    while ((match = _NR_QUOTE_RE.exec(text)) !== null) {
      const quoted = match[1] ?? match[2] ?? match[3] ?? "";
      if (!quoted.trim()) continue;

      const before = text.slice(cursor, match.index);
      const attr = _nrReadAttribution(before, text);
      if (!attr) continue; // unattributable — leave this quote where it is

      if (attr.narration) {
        out.push({ type: "narration", text: attr.narration, verses: beat.verses });
      }
      out.push({
        type: "dialogue",
        speaker: attr.speaker,
        to: attr.to,
        text: quoted.trim(),
        verses: beat.verses,
      });
      cursor = match.index + match[0].length;
      produced = true;
    }

    if (!produced) {
      out.push(beat);
      continue;
    }
    const rest = text.slice(cursor).trim();
    if (rest) out.push({ type: "narration", text: rest, verses: beat.verses });
  }

  return out;
}

/* Verse tags on a beat become the same chips used in reflection questions, so
   tapping one opens the peek sheet instead of leaving the retelling. */
function _nrVerseChip(ref) {
  const clean = String(ref || "").trim();
  if (!clean) return "";
  const first = (clean.match(/\d+/) || [])[0];
  if (!first) return "";
  const label = /[-–,]/.test(clean) ? `vv. ${clean}` : `v. ${clean}`;
  return `<a href="#${first}" class="reflection-link nr-chip">${_nrEsc(label)}</a>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   SCENE STAGE — the chapter drawn as stick figures
   ══════════════════════════════════════════════════════════════════════════
   Small illustrated panels dropped into the retelling at the moments the
   chapter turns, so a reader can SEE the scene as well as read it.

   This is NOT image generation. The model never emits SVG, never emits a
   coordinate, and never draws anything. It directs: it picks a pose from a
   fixed vocabulary for each person on stage, places them left-to-right, and
   names the scenery. Everything visible is drawn here, from hand-authored
   joint positions. The model cannot produce a broken figure because it has no
   way to describe one — an unknown pose falls back to `stand`, an unknown
   prop is dropped, and x is clamped to the stage.

   The figure model is the one from wedding100/index.html:724 — a pose is nine
   joints, and two poses interpolate into a loop via SMIL. Same idea, larger
   vocabulary, and the actors are tinted with the speaker colours the bubbles
   already use, so Gideon's figure is the same blue as Gideon's speech.
══════════════════════════════════════════════════════════════════════════ */

const _NR_SCENE_PREFIX = "nrscene1_";

/* Stage geometry. Figures are authored in a 50×80 box with the feet at y=74
   and are anchored by their feet, so a pose that crouches sinks rather than
   floating. */
const _NR_STAGE_W = 320;
const _NR_STAGE_H = 150;
const _NR_GROUND = 124;

/* Nine joints, flattened to 18 numbers so the pose table reads as a grid.
   Order: head, shoulder, pelvis, left hand, right hand, left knee, left foot,
   right knee, right foot. */
const _NR_JOINTS = ["h", "s", "p", "lh", "rh", "lk", "lf", "rk", "rf"];

function _nrPose(flat) {
  const o = {};
  _NR_JOINTS.forEach((k, i) => (o[k] = [flat[i * 2], flat[i * 2 + 1]]));
  return o;
}

/* Every pose is two frames: `a` is the read pose, `b` is where it moves to.
   For a still pose `b` is a breath; for an action it's the other half of the
   stride, the strike landing, the flame of effort. Figures face RIGHT as
   authored — facing left mirrors the whole group about its own anchor.

                    h       s       p      lh      rh      lk      lf      rk      rf  */
const _NR_POSE_TABLE = {
  stand: {
    a: [25,12, 25,20, 25,46, 17,36, 33,36, 21,60, 18,74, 29,60, 32,74],
    b: [25,11, 25,19, 25,46, 17,35, 33,35, 21,60, 18,74, 29,60, 32,74],
  },
  speak: {
    a: [25,12, 25,20, 25,46, 17,37, 36,24, 21,60, 19,74, 29,60, 31,74],
    b: [25,12, 25,20, 25,46, 17,36, 39,20, 21,60, 19,74, 29,60, 31,74],
  },
  point: {
    a: [25,12, 25,20, 25,46, 18,38, 42,22, 21,60, 19,74, 29,60, 32,74],
    b: [25,12, 25,20, 25,46, 18,38, 45,21, 21,60, 19,74, 29,60, 32,74],
  },
  raise: {
    a: [25,12, 25,20, 25,46, 13,6,  37,6,  21,60, 19,74, 29,60, 31,74],
    b: [25,11, 25,19, 25,46, 10,2,  40,2,  21,60, 19,74, 29,60, 31,74],
  },
  reach: {
    a: [25,12, 25,20, 25,46, 40,28, 42,23, 21,60, 19,74, 29,60, 31,74],
    b: [25,12, 25,20, 25,46, 43,26, 45,21, 21,60, 19,74, 29,60, 31,74],
  },
  carry: {
    a: [25,13, 25,21, 25,47, 36,33, 38,30, 21,60, 19,74, 29,60, 31,74],
    b: [25,12, 25,20, 25,47, 36,32, 38,29, 21,60, 19,74, 29,60, 31,74],
  },
  lift: {
    a: [25,14, 25,22, 25,47, 16,8,  34,8,  20,60, 18,74, 30,60, 32,74],
    b: [25,15, 25,23, 25,48, 16,11, 34,11, 20,61, 18,74, 30,61, 32,74],
  },
  walk: {
    a: [25,12, 25,20, 25,46, 17,38, 33,36, 30,60, 32,74, 21,60, 17,74],
    b: [25,12, 25,20, 25,46, 33,36, 17,38, 21,60, 17,74, 30,60, 32,74],
  },
  run: {
    a: [27,13, 26,21, 24,46, 13,30, 37,34, 33,58, 38,72, 19,62, 13,70],
    b: [27,13, 26,21, 24,46, 37,34, 13,30, 19,62, 13,70, 33,58, 38,72],
  },
  flee: {
    a: [27,12, 25,20, 24,46, 11,22, 14,29, 32,58, 38,72, 18,62, 12,70],
    b: [27,12, 25,20, 24,46, 14,29, 11,22, 18,62, 12,70, 32,58, 38,72],
  },
  fight: {
    a: [25,13, 25,21, 25,46, 14,34, 38,10, 18,60, 13,74, 33,60, 37,74],
    b: [26,14, 25,22, 25,46, 14,34, 42,20, 18,60, 13,74, 33,60, 37,74],
  },
  kneel: {
    a: [25,28, 25,36, 25,62, 19,52, 31,52, 33,74, 13,72, 37,74, 17,72],
    b: [25,29, 25,37, 25,62, 19,53, 31,53, 33,74, 13,72, 37,74, 17,72],
  },
  bow: {
    a: [38,34, 33,31, 25,48, 37,46, 40,44, 22,60, 20,74, 30,60, 31,74],
    b: [40,38, 34,33, 25,48, 39,50, 42,48, 22,60, 20,74, 30,60, 31,74],
  },
  prostrate: {
    a: [40,68, 33,70, 16,71, 54,72, 54,67, 10,72, 4,74,  10,74, 4,70],
    b: [40,69, 33,71, 16,71, 55,73, 55,69, 10,72, 4,74,  10,74, 4,70],
  },
  weep: {
    a: [27,20, 25,29, 25,50, 21,25, 32,23, 21,62, 19,74, 29,62, 31,74],
    b: [27,22, 25,30, 25,50, 21,27, 32,25, 21,62, 19,74, 29,62, 31,74],
  },
  sit: {
    a: [25,32, 25,40, 25,62, 18,54, 32,54, 38,64, 41,74, 36,66, 39,74],
    b: [25,31, 25,39, 25,62, 18,53, 32,53, 38,64, 41,74, 36,66, 39,74],
  },
  lie: {
    a: [40,66, 33,68, 16,69, 36,74, 38,62, 9,70,  3,72,  9,73,  3,74],
    b: [40,67, 33,69, 16,69, 36,74, 38,64, 9,70,  3,72,  9,73,  3,74],
  },
  work: {
    a: [36,32, 32,32, 25,48, 40,54, 38,51, 22,60, 20,74, 30,60, 31,74],
    b: [35,28, 31,29, 25,48, 39,46, 37,43, 22,60, 20,74, 30,60, 31,74],
  },
  // Standing and leaning over a table rather than seated: a seated figure
  // needs a stool under it or it reads as floating, and that's two pieces of
  // furniture to get right instead of one.
  write: {
    a: [37,28, 31,34, 24,50, 44,47, 47,45, 22,62, 19,74, 29,62, 31,74],
    b: [37,29, 31,35, 24,50, 44,47, 42,46, 22,62, 19,74, 29,62, 31,74],
  },
  drink: {
    a: [29,34, 27,42, 25,60, 26,39, 36,57, 35,68, 33,74, 18,68, 16,74],
    b: [29,36, 27,43, 25,61, 27,41, 36,58, 35,68, 33,74, 18,68, 16,74],
  },
  fall: {
    a: [36,22, 33,28, 26,48, 44,16, 40,34, 20,62, 13,72, 28,64, 24,74],
    b: [39,27, 35,32, 26,49, 47,21, 43,38, 20,62, 13,72, 28,64, 24,74],
  },
};

const _NR_POSE_NAMES = Object.keys(_NR_POSE_TABLE);

/* Poses that carry something the figure alone can't show. Drawn from the hand
   that holds it, in the actor's own colour. */
const _NR_POSE_HELD = {
  fight: (j) => `<line x1="${j.rh[0]}" y1="${j.rh[1]}" x2="${j.rh[0] + 3}" y2="${j.rh[1] - 15}" stroke-width="1.6"/>`,
  work:  (j) => `<line x1="${j.rh[0] - 2}" y1="${j.rh[1] - 8}" x2="${j.lh[0] + 3}" y2="${j.lh[1] + 3}" stroke-width="1.4"/>`,
  carry: (j) => `<rect x="${(j.lh[0] + j.rh[0]) / 2 - 6}" y="${(j.lh[1] + j.rh[1]) / 2 - 5}" width="12" height="11" rx="1.5" stroke-width="1.4" fill="none"/>`,
  lift:  (j) => `<rect x="${(j.lh[0] + j.rh[0]) / 2 - 12}" y="${(j.lh[1] + j.rh[1]) / 2 - 7}" width="24" height="7" rx="1.5" stroke-width="1.4" fill="none"/>`,
  write: () => `<line x1="33" y1="50" x2="64" y2="50" stroke-width="1.7"/>
    <line x1="36" y1="50" x2="36" y2="74" stroke-width="1.4"/>
    <line x1="61" y1="50" x2="61" y2="74" stroke-width="1.4"/>
    <path d="M42,49 l14,-2" stroke-width="1.2" opacity="0.75"/>`,
};

function _nrReduceMotion() {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/* Emits nothing when the joint doesn't move — most poses only shift two or
   three joints, and a still figure would otherwise carry sixteen no-op
   timelines. Across a chapter of scenes that's the difference between a few
   dozen running animations and a few hundred. */
function _nrAv(attr, from, to, dur, begin) {
  if (String(from) === String(to)) return "";
  return `<animate attributeName="${attr}" values="${from};${to};${from}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>`;
}

/* One figure. `b` is null for a still figure (reduced motion, or a face in a
   crowd) — then every joint is drawn at its `a` value with no timelines. */
function _nrFigure(a, b, dur, begin) {
  const A = (attr, j, i) => (b ? _nrAv(attr, a[j][i], b[j][i], dur, begin) : "");
  const pts = (p) => `${p.p} ${p.lk} ${p.lf}`;
  const ptsR = (p) => `${p.p} ${p.rk} ${p.rf}`;

  return (
    // Head. Filled so limbs passing behind it don't read as crossing through.
    `<circle cx="${a.h[0]}" cy="${a.h[1]}" r="4.6" fill="var(--nr-fig-fill)" stroke-width="1.9">${A("cx", "h", 0)}${A("cy", "h", 1)}</circle>` +
    // Spine.
    `<line x1="${a.s[0]}" y1="${a.s[1]}" x2="${a.p[0]}" y2="${a.p[1]}" stroke-width="2.1">${A("x1", "s", 0)}${A("y1", "s", 1)}${A("x2", "p", 0)}${A("y2", "p", 1)}</line>` +
    // Arms, shoulder to hand.
    `<line x1="${a.s[0]}" y1="${a.s[1]}" x2="${a.lh[0]}" y2="${a.lh[1]}" stroke-width="1.8">${A("x1", "s", 0)}${A("y1", "s", 1)}${A("x2", "lh", 0)}${A("y2", "lh", 1)}</line>` +
    `<line x1="${a.s[0]}" y1="${a.s[1]}" x2="${a.rh[0]}" y2="${a.rh[1]}" stroke-width="1.8">${A("x1", "s", 0)}${A("y1", "s", 1)}${A("x2", "rh", 0)}${A("y2", "rh", 1)}</line>` +
    // Legs as pelvis→knee→foot polylines so the knee actually bends.
    `<polyline points="${pts(a)}" fill="none" stroke-width="1.8">${b ? _nrAv("points", pts(a), pts(b), dur, begin) : ""}</polyline>` +
    `<polyline points="${ptsR(a)}" fill="none" stroke-width="1.8">${b ? _nrAv("points", ptsR(a), ptsR(b), dur, begin) : ""}</polyline>`
  );
}

/* An actor: the figure, plus whatever the pose holds, plus a halo when the
   speaker is divine — the same test the bubbles use to swap initials for a
   cross, so the two views agree on who God is. */
function _nrActor(act, tone, idx) {
  const poseName = _NR_POSE_TABLE[act.pose] ? act.pose : "stand";
  const spec = _NR_POSE_TABLE[poseName];
  const still = _nrReduceMotion() || act.still;
  const a = _nrPose(spec.a);
  const b = still ? null : _nrPose(spec.b);

  // Staggered so a crowd breathes out of step instead of in formation.
  const dur = (2.6 + (idx % 3) * 0.35).toFixed(2);
  const begin = ((idx % 4) * -0.45).toFixed(2);

  const held = _NR_POSE_HELD[poseName]?.(a) || "";
  const halo = act.divine
    ? `<circle cx="${a.h[0]}" cy="${a.h[1]}" r="9" fill="none" stroke-width="1" opacity="0.5" stroke-dasharray="2.5 3.5">
         <animateTransform attributeName="transform" type="rotate" from="0 ${a.h[0]} ${a.h[1]}" to="360 ${a.h[0]} ${a.h[1]}" dur="14s" repeatCount="indefinite"/>
       </circle>`
    : "";

  const s = act.scale;
  const face = act.facing === "left" ? -1 : 1;
  // Anchors the figure by its feet at (x, GROUND): local (25,74) → (0,0),
  // scaled, then dropped on the ground line. Mirroring is about that same
  // anchor, so a figure turning round doesn't slide sideways.
  return `<g class="nr-fig" transform="translate(${act.px},${_NR_GROUND}) scale(${(face * s).toFixed(3)},${s.toFixed(3)}) translate(-25,-74)"
             stroke="${tone.line}" stroke-linecap="round" stroke-linejoin="round" opacity="${act.opacity}">
    ${halo}${_nrFigure(a, b, dur, begin)}${held}
  </g>`;
}

/* Scenery. Each is drawn in stage coordinates, standing on the ground line,
   in `currentColor` so the whole set re-inks for light mode from one CSS rule
   instead of nineteen hard-coded hex values. */
const _NR_PROPS = {
  tree: (x) => `<line x1="${x}" y1="${_NR_GROUND}" x2="${x}" y2="92"/>
    <path d="M${x - 21},95 C${x - 33},64 ${x - 17},40 ${x},40 C${x + 17},40 ${x + 33},64 ${x + 21},95 Z" fill="none"/>`,
  rock: (x) => `<path d="M${x - 19},${_NR_GROUND} Q${x - 17},106 ${x - 4},103 Q${x + 15},101 ${x + 19},${_NR_GROUND}" fill="none"/>`,
  mountain: (x) => `<path d="M${x - 52},${_NR_GROUND} L${x - 14},58 L${x + 2},80 L${x + 20},42 L${x + 56},${_NR_GROUND}" fill="none" opacity="0.55"/>`,
  water: (x) => `<path d="M${x - 40},114 q10,-6 20,0 t20,0 t20,0 t20,0" fill="none"/>
    <path d="M${x - 32},${_NR_GROUND} q10,-6 20,0 t20,0 t20,0" fill="none"/>`,
  fire: (x) => `<path d="M${x},88 C${x - 13},104 ${x - 11},${_NR_GROUND} ${x},${_NR_GROUND} C${x + 11},${_NR_GROUND} ${x + 13},104 ${x},88 Z" fill="none">
      <animate attributeName="d" dur="1.6s" repeatCount="indefinite"
        values="M${x},88 C${x - 13},104 ${x - 11},${_NR_GROUND} ${x},${_NR_GROUND} C${x + 11},${_NR_GROUND} ${x + 13},104 ${x},88 Z;M${x},76 C${x - 10},100 ${x - 13},${_NR_GROUND} ${x},${_NR_GROUND} C${x + 13},${_NR_GROUND} ${x + 9},98 ${x},76 Z;M${x},88 C${x - 13},104 ${x - 11},${_NR_GROUND} ${x},${_NR_GROUND} C${x + 11},${_NR_GROUND} ${x + 13},104 ${x},88 Z"/>
    </path>`,
  tent: (x) => `<path d="M${x - 30},${_NR_GROUND} L${x},64 L${x + 30},${_NR_GROUND} Z" fill="none"/>
    <path d="M${x},${_NR_GROUND} L${x - 9},104 L${x},92 L${x + 9},104 Z" fill="none"/>`,
  altar: (x) => `<rect x="${x - 19}" y="98" width="38" height="26" rx="2" fill="none"/>
    <path d="M${x},76 C${x - 8},88 ${x - 7},98 ${x},98 C${x + 7},98 ${x + 8},88 ${x},76 Z" fill="none"/>`,
  boat: (x) => `<path d="M${x - 33},108 Q${x},${_NR_GROUND + 2} ${x + 33},108 Z" fill="none"/>
    <line x1="${x}" y1="108" x2="${x}" y2="56"/>
    <path d="M${x + 2},60 L${x + 22},102 L${x + 2},102 Z" fill="none"/>`,
  sheep: (x) => `<ellipse cx="${x}" cy="108" rx="16" ry="10.5" fill="none"/>
    <circle cx="${x + 18}" cy="99" r="5.5" fill="none"/>
    <line x1="${x - 9}" y1="118" x2="${x - 9}" y2="${_NR_GROUND}"/><line x1="${x + 8}" y1="118" x2="${x + 8}" y2="${_NR_GROUND}"/>`,
  sword: (x) => `<line x1="${x}" y1="${_NR_GROUND}" x2="${x}" y2="72"/>
    <line x1="${x - 11}" y1="83" x2="${x + 11}" y2="83"/>`,
  staff: (x) => `<path d="M${x},${_NR_GROUND} L${x},72 q0,-11 11,-11" fill="none"/>`,
  jar: (x) => `<path d="M${x - 8},98 h16 M${x - 13},102 q-5,13 0,22 h26 q5,-9 0,-22 Z" fill="none"/>`,
  scroll: (x) => `<rect x="${x - 17}" y="102" width="34" height="22" rx="3" fill="none"/>
    <line x1="${x - 17}" y1="108" x2="${x + 17}" y2="108"/>`,
  gate: (x) => `<line x1="${x - 22}" y1="${_NR_GROUND}" x2="${x - 22}" y2="64"/>
    <line x1="${x + 22}" y1="${_NR_GROUND}" x2="${x + 22}" y2="64"/>
    <line x1="${x - 29}" y1="64" x2="${x + 29}" y2="64"/>`,
  star: (x) => `<path d="M${x},20 L${x + 4},32 L${x + 16},36 L${x + 4},40 L${x},52 L${x - 4},40 L${x - 16},36 L${x - 4},32 Z" fill="none">
      <animate attributeName="opacity" values="0.35;1;0.35" dur="3.4s" repeatCount="indefinite"/>
    </path>`,
  cloud: (x) => `<path d="M${x - 30},46 q0,-12 12,-12 q4,-11 16,-11 q14,0 16,12 q12,0 12,11 z" fill="none" opacity="0.7"/>`,
};

const _NR_PROP_NAMES = Object.keys(_NR_PROPS);

/* The horizon. Everything else stands on the line this draws. */
const _NR_SETTINGS = {
  field: () => `<line x1="0" y1="${_NR_GROUND}" x2="${_NR_STAGE_W}" y2="${_NR_GROUND}"/>
    ${[24, 78, 150, 214, 286].map((x) => `<line x1="${x}" y1="${_NR_GROUND}" x2="${x - 2}" y2="${_NR_GROUND - 5}" opacity="0.55"/>`).join("")}`,
  desert: () => `<line x1="0" y1="${_NR_GROUND}" x2="${_NR_STAGE_W}" y2="${_NR_GROUND}"/>
    <path d="M0,116 q46,-11 92,0 t92,0 t92,0" fill="none" opacity="0.35"/>`,
  water: () => `<line x1="0" y1="${_NR_GROUND}" x2="${_NR_STAGE_W}" y2="${_NR_GROUND}" opacity="0.45"/>
    <path d="M0,${_NR_GROUND + 8} q10,-6 20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0" fill="none" opacity="0.6"/>`,
  mountain: () => `<path d="M0,${_NR_GROUND} L44,78 L74,96 L112,66 L152,98 L196,74 L232,100 L272,80 L320,${_NR_GROUND}" fill="none" opacity="0.32"/>
    <line x1="0" y1="${_NR_GROUND}" x2="${_NR_STAGE_W}" y2="${_NR_GROUND}"/>`,
  indoors: () => `<line x1="0" y1="${_NR_GROUND}" x2="${_NR_STAGE_W}" y2="${_NR_GROUND}"/>
    <path d="M14,${_NR_GROUND} L14,76 Q14,62 28,62 Q42,62 42,76 L42,${_NR_GROUND}" fill="none" opacity="0.5"/>
    <rect x="268" y="58" width="38" height="30" rx="1.5" opacity="0.5"/>
    <line x1="287" y1="58" x2="287" y2="88" opacity="0.35"/>
    <line x1="268" y1="73" x2="306" y2="73" opacity="0.35"/>`,
  night: () => `<line x1="0" y1="${_NR_GROUND}" x2="${_NR_STAGE_W}" y2="${_NR_GROUND}"/>
    ${[[38, 34], [96, 22], [158, 40], [214, 26], [278, 36], [66, 54]]
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.5" opacity="0.7"><animate attributeName="opacity" values="0.2;0.9;0.2" dur="${(2.8 + i * 0.6).toFixed(1)}s" repeatCount="indefinite"/></circle>`)
      .join("")}`,
};

const _NR_SETTING_NAMES = Object.keys(_NR_SETTINGS);

function _nrClampX(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

// Stage x runs 0–100 in the model's terms; the margin keeps a figure at the
// far edge from being clipped in half.
function _nrStageX(pct) {
  return Math.round(26 + (pct / 100) * (_NR_STAGE_W - 52));
}

/* Props that ARE the backdrop rather than objects standing in it. These are
   meant to run behind and through everything, so they're exempt from the
   spacing pass below. */
const _NR_BACKDROP_PROPS = new Set(["water", "mountain", "cloud", "star"]);

/* Nudges a prop off anything already placed. The model picks x for people and
   scenery independently and nothing stops it putting the scroll exactly where
   the writer stands — which drew a box around his legs, since props render
   behind the figures. Walking the prop out to a clear gap is enough; the
   staging stays roughly where it was asked for. */
function _nrPushClear(x, occupied, gap) {
  for (let i = 0; i < 6; i++) {
    const hit = occupied.find((o) => Math.abs(o - x) < gap);
    if (hit === undefined) break;
    x = Math.max(22, Math.min(_NR_STAGE_W - 22, x < hit ? hit - gap : hit + gap));
  }
  return x;
}

/* Builds one panel. Every value that reaches the SVG is either looked up in a
   table above or forced through Number — nothing the model wrote is
   interpolated into markup as-is except the caption, which is escaped. */
function _nrSceneSVG(scene, tones) {
  const setting = _NR_SETTINGS[scene.setting] ? scene.setting : "field";

  // Actors sorted by x so overlapping figures stack left-to-right rather than
  // in whatever order the model listed them.
  const actors = (Array.isArray(scene.actors) ? scene.actors : [])
    .slice(0, 4)
    .filter((act) => act && act.name)
    .map((act) => ({ ...act, x: _nrClampX(act.x, 50) }))
    .sort((a, b) => a.x - b.x);

  // Resolved before the props so the props can be placed around them. A crowd
  // is three figures wide, so it claims more of the stage than its centre.
  const taken = actors.flatMap((act) => {
    const cx = _nrStageX(act.x);
    return act.crowd ? [cx - 25, cx, cx + 23] : [cx];
  });

  const props = (Array.isArray(scene.props) ? scene.props : [])
    .slice(0, 4)
    .filter((p) => p && _NR_PROPS[p.kind])
    .map((p) => {
      let px = _nrStageX(_nrClampX(p.x, 50));
      if (!_NR_BACKDROP_PROPS.has(p.kind)) {
        px = _nrPushClear(px, taken, 46);
        taken.push(px); // and off each other
      }
      return _NR_PROPS[p.kind](px);
    })
    .join("");

  const drawn = actors
    .map((act, i) => {
      const tone = _nrToneFor(act.name, tones);
      const divine = _nrIsDivine(act.name);
      const facing = act.facing === "left" ? "left" : "right";
      const base = { ...act, facing, divine };

      if (!act.crowd) {
        return _nrActor({ ...base, px: _nrStageX(act.x), scale: 1, opacity: 1 }, tone, i);
      }
      // A crowd is three figures, not one — "22,000 men" has to read as more
      // than a person. The two behind are smaller, dimmer and still, so the
      // group has depth without three sets of timelines fighting for
      // attention.
      const cx = _nrStageX(act.x);
      return [
        _nrActor({ ...base, px: cx - 25, scale: 0.76, opacity: 0.4, still: true }, tone, i),
        _nrActor({ ...base, px: cx + 23, scale: 0.85, opacity: 0.55, still: true }, tone, i + 1),
        _nrActor({ ...base, px: cx, scale: 1, opacity: 1 }, tone, i + 2),
      ].join("");
    })
    .join("");

  const cast = actors
    .map((act) => {
      const tone = _nrToneFor(act.name, tones);
      return `<span class="nr-scene-name" style="color:${tone.line}">${_nrEsc(act.name)}</span>`;
    })
    .join("");

  return `<figure class="nr-pageable nr-scene">
    <svg class="nr-scene-svg" viewBox="0 0 ${_NR_STAGE_W} ${_NR_STAGE_H}" role="img"
         aria-label="${_nrEsc(scene.caption || "Scene")}" preserveAspectRatio="xMidYMax meet">
      <g class="nr-scenery" fill="none" stroke="currentColor" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round">${_NR_SETTINGS[setting]()}${props}</g>
      ${drawn}
    </svg>
    ${scene.caption ? `<figcaption class="nr-scene-cap">${_nrEsc(scene.caption)}</figcaption>` : ""}
    ${cast ? `<div class="nr-scene-cast">${cast}</div>` : ""}
  </figure>`;
}

function _nrBuildScenePrompt(book, chapter, versesText) {
  return `You are the director of a simple stick-figure storyboard for one chapter of the Bible. You do not draw. You choose, from fixed lists, who is on stage and what they are doing. An illustrator draws exactly what you specify and can draw nothing else.

Book: ${book} — Chapter: ${chapter}

Return ONLY a JSON array, no markdown fence, no commentary:

[
  {
    "verse": 1,
    "caption": "Elkanah brings his family to worship",
    "setting": "field",
    "props": [{"kind": "altar", "x": 78}],
    "actors": [
      {"name": "Elkanah", "pose": "walk", "x": 30, "facing": "right"},
      {"name": "his family", "pose": "walk", "x": 52, "facing": "right", "crowd": true}
    ]
  }
]

HOW MANY: 3 to 6 scenes for the whole chapter. Pick the moments where the chapter actually turns — a journey begins, someone speaks with God, a battle joins, a decision lands. Do not illustrate every verse. A short chapter gets 3.

"verse" — the verse the scene happens at, digits only. Scenes must be in ascending verse order, and the first should be at or near verse 1.

"caption" — 4 to 9 words, lowercase, plainly saying what is happening in the picture. Not a title, not a lesson, not a quote. "the men drink from their hands", not "Faith Tested at the Spring".

"setting" — EXACTLY ONE OF: ${_NR_SETTING_NAMES.join(", ")}.

"props" — 0 to 3 items. Each is {"kind": ..., "x": 0-100}. "kind" must be EXACTLY ONE OF: ${_NR_PROP_NAMES.join(", ")}. Anything not on this list cannot be drawn — leave it out rather than substituting a word of your own. x is the horizontal position on stage: 0 is the far left, 100 the far right.

"actors" — 1 to 4. Each has:
  - "name": who they are, named the way the chapter names them ("Hannah", "The Lord", "the priests"). This must MATCH the speaker names in the chapter exactly where the same person appears, because each person keeps one colour throughout.
  - "pose": EXACTLY ONE OF: ${_NR_POSE_NAMES.join(", ")}.
  - "x": 0-100, horizontal position. Space actors out — do not stack two at the same x.
  - "facing": "left" or "right". People who are talking to each other must face each other: the one on the left faces right, the one on the right faces left.
  - "crowd": true when this actor is a group rather than one person (an army, a family, the people). Optional, defaults to false.

The "write" pose already comes with its own table and a page on it. Give that scene NO props at all — a scroll or a jar next to it just makes a second box beside the table.

CHOOSING A POSE — the vocabulary is small on purpose, so pick the closest honest fit:
  stand, speak, point, raise (arms up — praise, surrender, victory), reach, carry, lift
  walk, run, flee, fight, fall
  kneel, bow, prostrate (face down on the ground), weep, sit, lie (asleep or dead)
  work (bent to a task — building, digging, harvesting), write (at a table), drink

IF THE CHAPTER IS A LETTER OR A TEACHING WITH LITTLE ACTION:
This is the case most often done badly, so read this twice.

Draw the writer at his table AT MOST ONCE, only as the opening scene, and only if the chapter actually opens by naming him. Never again after that. Five scenes of the same man in the same room is a failure even if every one of them is accurate.

A letter still points at plenty you can draw. Look for:
  - An event the writer remembers. "We were with him on the holy mountain" is a mountain, a voice, men on their faces — draw THAT, not Peter recalling it.
  - A picture the writer uses to explain himself: a runner, a farmer, a soldier, a shepherd, a builder, a fire, a seed, a race, a body. If he reaches for an image, stage the image.
  - The readers doing the thing he is telling them to do. "Be kind to one another" is two people, not a man dictating.
  - Something in the writer's own situation that the chapter mentions — a prison, a journey, a person he is sending.

Vary the setting across the scenes. If every scene you have chosen says "indoors", you have taken the easy option and must go back and find the pictures the chapter is actually made of.

RULES:
- Draw what the verse SAYS, not what it means. If the chapter does not say anyone knelt, nobody kneels.
- God, the Lord and angels are actors like anyone else — name them "The Lord" or "an angel" and give them a pose. They are drawn with a mark that sets them apart.
- Never put more than 4 actors on stage. Use "crowd" for a group instead of listing people.
- No text of your own anywhere except "caption".

CHAPTER:
${versesText}`;
}

function _nrParseScenes(raw) {
  const text = String(raw || "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("no JSON array in response");
  const list = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(list)) throw new Error("scenes not an array");

  return list
    .map((s) => ({ ...s, verse: parseInt(s?.verse, 10) }))
    .filter((s) => s.verse > 0 && Array.isArray(s.actors) && s.actors.length)
    .sort((a, b) => a.verse - b.verse)
    .slice(0, 6);
}

/* Same shape as _fetchPassageSections: cached, non-blocking, and a failure
   just means no pictures. The retelling has to read correctly on its own. */
async function _nrFetchScenes(book, chapter, versesText) {
  if (!versesText) return null;
  const key = `${_NR_SCENE_PREFIX}${book}_${chapter}`;

  const cached = await _nrGetCached(key);
  if (cached) return cached;

  try {
    const raw = await callGemini(
      _nrBuildScenePrompt(book, chapter, versesText),
      // Six scenes of structured JSON, and a little warmth in the staging is
      // welcome here in a way it never is in the verbatim beats.
      { maxOutputTokens: 1600, temperature: 0.4 },
    );
    const scenes = _nrParseScenes(raw);
    if (!scenes.length) throw new Error("no usable scenes");
    _nrPutCached(key, scenes);
    return scenes;
  } catch (err) {
    console.warn("[retell scenes]", err);
    return null;
  }
}

function _nrBuildPrompt(book, chapter, versesText) {
  return `You are laying out one chapter of the Bible as a screenplay: the chapter's own words, split into narration and speech bubbles. You do NOT rewrite the chapter. You re-format it.

Book: ${book} — Chapter: ${chapter}

Return ONLY a JSON object, no markdown fence, no commentary:

{
  "title": "a short scene title, max 6 words",
  "logline": "one sentence naming what this chapter is really about",
  "beats": [
    { "type": "narration", "text": "...", "verses": "1-3" },
    { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "...", "verses": "2" }
  ]
}

BEAT TYPES:
- "narration" — the chapter's own narrative text, outside of anyone's speech.
- "dialogue" — someone speaks. Needs "speaker". Add "to" when the chapter makes the listener clear.

YOU ARE NOT A WRITER HERE. YOU ARE A TYPESETTER.

Every word of every "text" must be copied VERBATIM from the passage below. You are not retelling the chapter, summarising it, modernising it, or improving it. You are splitting the text that already exists into beats and labelling who is speaking. The reader is going to compare this against the verse — if a single word differs, you have failed.

FORBIDDEN, no exceptions:
- Rewording anything. "So 22,000 men left that place and they went home" must appear exactly like that — NOT "Twenty-two thousand men leave".
- Changing numerals to words or words to numerals. "22,000" stays "22,000". "ten" stays "ten".
- Changing tense. If the chapter says "left", you write "left" — never "leave".
- Compressing two sentences into one, or dropping a clause because it seems repetitive.
- Adding a connecting phrase, a scene-setting line, or any sentence of your own.

A VERSE IS NOT A BEAT. THIS IS THE PART MOST OFTEN GOT WRONG.

One verse very often contains narration AND speech. You must split it at the boundary. Scan the passage for quotation marks — every opening mark starts speech, every closing mark ends it:
- Text OUTSIDE quotation marks → narration beat.
- Text INSIDE quotation marks → dialogue beat.
Both beats carry the same "verses" number. That is expected and correct.

If a verse contains a quotation mark and you emit it as a single narration beat, you have failed. Speech never stays inside a narration beat.

The order inside a verse can go either way and you must handle both:
- speech first, then narration ("…you may go." So 22,000 men left…)
- narration first, then speech (So Gideon took the men… The Lord said, 'Put the men…')

ONE EXCEPTION — quotes INSIDE someone's speech stay in their bubble. When the Lord says: If I say, "This man should go with you," then take him — that inner quote is part of what the Lord is saying. It does NOT become its own bubble and it does NOT get its own speaker. Leave it in the sentence exactly as written.

THE ONLY EDITS YOU MAY MAKE:
1. Split the text into beats, in the order it already appears — splitting WITHIN a verse wherever narration meets speech.
2. When speech goes into a dialogue bubble, drop its surrounding quote marks — the bubble is the quote.
3. When speech goes into a bubble, drop ONLY the attribution clause that introduces it ("The Lord said to Gideon,", "Gideon said to them,") — the bubble's speaker name already carries it. Everything else in that verse stays as narration.
4. Split one long speech into consecutive dialogue beats by the same speaker.

WORKED EXAMPLE — if the passage contained:
  v2 The Lord said to Gideon, 'You have too many men in your army.'
  v3 So say to the men, "If you are very afraid of the battle, you may go." ' So 22,000 men left that place and they went home. But 10,000 soldiers remained with Gideon.

CORRECT output beats:
  { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "You have too many men in your army.", "verses": "2" }
  { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "So say to the men, \\"If you are very afraid of the battle, you may go.\\"", "verses": "3" }
  { "type": "narration", "text": "So 22,000 men left that place and they went home. But 10,000 soldiers remained with Gideon.", "verses": "3" }

Note the third beat: copied character for character. That is the standard for every beat.

WORKED EXAMPLE 2 — narration first, then speech, inside ONE verse:
  v5 So Gideon took the men to the spring of water. The Lord said to Gideon, 'Put the men who use their tongues to drink like a dog in one group.'

CORRECT:
  { "type": "narration", "text": "So Gideon took the men to the spring of water.", "verses": "5" }
  { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "Put the men who use their tongues to drink like a dog in one group.", "verses": "5" }

WRONG (this is the most common failure — the whole verse dumped into narration because it happens to start with narration):
  { "type": "narration", "text": "So Gideon took the men to the spring of water. The Lord said to Gideon, 'Put the men who use their tongues to drink like a dog in one group.'", "verses": "5" }

KEEP QUOTATION MARKS AS THEY ARE. If the passage uses ' and ' , do not swap them for " and " . Copy the characters you were given.

REMAINING RULES:

A. COVER EVERYTHING. Work through the chapter start to finish. Every verse's text must appear in some beat — nothing skipped, nothing merged away. Because you are copying rather than compressing, a long chapter simply produces more beats.

B. NAME THE SPEAKER AS THE CHAPTER DOES ("The Lord", "Gideon", "The men of Ephraim"). If a group speaks, name the group. Never use "Narrator" — narration beats have no speaker.

C. "verses" is the verse or range that beat came from, digits only ("7" or "12-14").

D. No verse numbers inside "text", no markdown, no headers, no bullets.

E. "title" and "logline" are the ONLY places you write your own words.

PASSAGE:
${versesText}`;
}

/* The model occasionally wraps the JSON in a fence or adds a sentence before
   it despite the instruction, so pull the outermost object rather than
   trusting the whole response to parse. */
function _nrParse(raw) {
  const text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  const data = JSON.parse(text.slice(start, end + 1));
  if (!data || !Array.isArray(data.beats) || !data.beats.length) {
    throw new Error("no beats in response");
  }
  data.beats = _nrSplitSpeech(data.beats);
  return data;
}

function _nrRenderBeats(data, sections, scenes) {
  const tones = {};
  let lastSpeaker = null;

  // Same section headings the reader shows, from the same cache — a chapter
  // titled in one place is titled identically in the other. Sorted and
  // consumed as the beats walk past their start verse.
  const pending = (Array.isArray(sections) ? [...sections] : [])
    .map((s) => ({ verse: parseInt(s?.verse, 10), title: String(s?.title || "").trim() }))
    .filter((s) => s.verse && s.title)
    .sort((a, b) => a.verse - b.verse);

  // Scenes ride the same rail as headings — a queue consumed as the beats
  // walk past the verse each one belongs to, so a panel lands at the moment
  // it illustrates rather than at a fixed interval.
  const pendingScenes = (Array.isArray(scenes) ? [...scenes] : []).sort(
    (a, b) => a.verse - b.verse,
  );

  const html = data.beats
    .map((beat, i) => {
      const delay = `style="animation-delay:${Math.min(i * 55, 900)}ms"`;
      const chip = _nrVerseChip(beat.verses);

      // Emit every heading this beat has reached. A beat covering "9-12"
      // consumes a section starting at 9 AND one starting at 11 — otherwise a
      // heading whose verse falls inside a multi-verse beat is dropped.
      const beatVerse = parseInt(String(beat.verses || "").match(/\d+/)?.[0], 10);
      let headings = "";
      while (pending.length && beatVerse && pending[0].verse <= beatVerse) {
        const sec = pending.shift();
        headings += `<h3 class="nr-pageable nr-heading" ${delay}>${_nrEsc(sec.title)}</h3>`;
        lastSpeaker = null; // a new section restarts the speaker run
      }

      // After the heading, so a section reads title → picture → words.
      while (pendingScenes.length && beatVerse && pendingScenes[0].verse <= beatVerse) {
        headings += _nrSceneSVG(pendingScenes.shift(), tones);
      }

      if (beat.type === "dialogue" && beat.text) {
        const speaker = beat.speaker || "Someone";
        const tone = _nrToneFor(speaker, tones);
        // Consecutive bubbles from one speaker drop the avatar and name so a
        // long speech reads as one continuous turn instead of a stutter.
        const isRun = speaker === lastSpeaker;
        lastSpeaker = speaker;
        const to = beat.to ? `<span class="nr-to">to ${_nrEsc(beat.to)}</span>` : "";
        const divine = _nrIsDivine(speaker);
        const mark = divine ? _NR_CROSS_SVG : _nrEsc(_nrInitials(speaker));
        return headings + `<div class="nr-pageable nr-line nr-line-say ${isRun ? "nr-run" : ""}" ${delay}>
          <div class="nr-avatar ${divine ? "nr-avatar-divine" : ""}" style="background:${tone.bg};border-color:${tone.ring};color:${tone.ink}">
            ${isRun ? "" : mark}
          </div>
          <div class="nr-bubble-wrap">
            ${isRun ? "" : `<div class="nr-who" style="color:${tone.ink}">${_nrEsc(speaker)}${to}</div>`}
            <div class="nr-bubble" style="background:${tone.bg};border-color:${tone.ring}">
              ${_nrMarkInnerQuotes(_nrEsc(beat.text))}
              ${chip}
            </div>
          </div>
        </div>`;
      }

      if (beat.type === "beat" && beat.text) {
        lastSpeaker = null;
        return headings + `<div class="nr-pageable nr-line nr-turn" ${delay}>${_nrEsc(beat.text)}</div>`;
      }

      if (!beat.text) return "";
      lastSpeaker = null;
      return headings + `<div class="nr-pageable nr-line nr-narr" ${delay}>
        <p>${_nrMarkInnerQuotes(_nrEsc(beat.text))}</p>
        ${chip}
      </div>`;
    })
    .join("");

  return `
    ${data.logline ? `<p class="nr-pageable nr-logline">${_nrEsc(data.logline)}</p>` : ""}
    ${html}
    <div class="nr-pageable nr-end">
      <span>End of ${_nrEsc(data.title || "the chapter")}</span>
    </div>`;
}

async function _nrGetCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const wrapped = JSON.parse(raw);
    if (!wrapped || Date.now() - (wrapped.t || 0) > _NR_CACHE_TTL) return null;
    return wrapped.d;
  } catch {
    return null;
  }
}

function _nrPutCached(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
  } catch {
    /* quota — the retelling regenerates next time, which is fine */
  }
}

/* ── Pagination ────────────────────────────────────────────────────────────
   The retelling reads as a sequence of screens rather than one long scroll.
   Beats are measured once at their natural height and grouped into pages that
   fit the viewport, so a page break never lands mid-bubble.

   Measurement has to happen with every beat visible — a hidden element has no
   height — so the order is: render all, measure all, then hide all but the
   current page. */
let _nrPages = [];
let _nrPageIdx = 0;

function _nrPaginate(keepIndex = 0) {
  const scroll = document.getElementById("nrScroll");
  const pager = document.getElementById("nrPager");
  if (!scroll) return;

  const items = [...scroll.querySelectorAll(".nr-pageable")];
  if (!items.length) {
    _nrPages = [];
    if (pager) pager.hidden = true;
    return;
  }

  items.forEach((el) => el.style.removeProperty("display"));

  const cs = getComputedStyle(scroll);
  const avail =
    scroll.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

  // A zero height means the overlay hasn't been laid out yet (measured during
  // the rise, or while still display:none). Paginating against it puts every
  // beat on its own page — 58 pages for one chapter — so retry instead.
  if (avail <= 0) {
    setTimeout(() => _nrPaginate(keepIndex), 160);
    return;
  }

  _nrPages = [];
  let page = [];
  let pageTop = null;

  items.forEach((el) => {
    const top = el.offsetTop;
    if (pageTop === null) pageTop = top;
    // Break BEFORE the element that would overflow, never through it. The
    // `page.length` guard means a single beat taller than the screen still
    // gets its own page rather than an empty one — that page scrolls.
    if (page.length && top + el.offsetHeight - pageTop > avail) {
      _nrPages.push(page);
      page = [];
      pageTop = top;
    }
    page.push(el);
  });
  if (page.length) _nrPages.push(page);

  if (pager) pager.hidden = _nrPages.length < 2;
  _nrGoToPage(Math.min(keepIndex, _nrPages.length - 1));
}

function _nrGoToPage(idx) {
  const scroll = document.getElementById("nrScroll");
  if (!scroll || !_nrPages.length) return;

  _nrPageIdx = Math.max(0, Math.min(idx, _nrPages.length - 1));

  _nrPages.forEach((pg, p) =>
    pg.forEach((el) => {
      el.style.display = p === _nrPageIdx ? "" : "none";
    }),
  );

  // Replay the stagger for the page you just landed on — otherwise only the
  // first page ever animates and later pages just appear.
  _nrPages[_nrPageIdx].forEach((el, k) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.removeProperty("animation");
    el.style.animationDelay = `${Math.min(k * 55, 500)}ms`;
  });

  scroll.scrollTop = 0;
  // Only a page holding one oversized beat needs to scroll; everything else
  // is locked so the screen can't drift half a beat out of frame.
  scroll.classList.toggle(
    "nr-scrollable-page",
    scroll.scrollHeight > scroll.clientHeight + 2,
  );

  const ind = document.getElementById("nrPageInd");
  if (ind) ind.textContent = `${_nrPageIdx + 1} / ${_nrPages.length}`;
  const prev = document.getElementById("nrPrev");
  const next = document.getElementById("nrNext");
  if (prev) prev.disabled = _nrPageIdx === 0;
  if (next) next.disabled = _nrPageIdx >= _nrPages.length - 1;
}

let _nrResizeTimer = null;
window.addEventListener("resize", () => {
  if (!_nrOpen || !_nrPages.length) return;
  clearTimeout(_nrResizeTimer);
  // Debounced because iOS fires resize continuously as the URL bar collapses.
  // Re-paginating keeps the beat you were on, so a rotation doesn't lose your
  // place — the page number would be meaningless at a new width.
  _nrResizeTimer = setTimeout(() => {
    const anchor = _nrPages[_nrPageIdx]?.[0];
    _nrPaginate(0);
    if (anchor) {
      const found = _nrPages.findIndex((pg) => pg.includes(anchor));
      if (found > -1) _nrGoToPage(found);
    }
  }, 220);
});

let _nrOpen = false;

/* One transient blip — a cold Cloud Run container, a rate limit, a dropped
   packet, or the model closing its JSON badly — used to be the whole feature
   failing. `callGemini` has no retry of its own, so a single non-200 threw
   straight through to "Couldn't retell this chapter."

   Same answer the daily Proverb card arrived at (DECISIONS #24): keep trying.
   A retelling costs ~2k output tokens, so the ceiling is lower than the
   Proverb's six — four attempts over roughly five seconds, which covers a
   cold start and a rate limit without burning budget on a chapter that is
   genuinely never going to parse.

   `onAttempt` reports progress into the loading copy. A silent spinner that
   sits there for eight seconds reads as frozen; saying it's on attempt 2 of 4
   is both honest and calmer than an error the user has to act on. */
async function _nrFetchBeats(bookName, payload, cacheKey, onAttempt) {
  const cached = await _nrGetCached(cacheKey);
  if (cached) return cached;

  const MAX_TRIES = 4;
  let lastErr;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // Offline is not a failure to spend an attempt on — wait for the radio to
    // come back instead, so a lift or a tunnel resumes rather than erroring.
    if (navigator.onLine === false) {
      await new Promise((resolve) => {
        window.addEventListener("online", resolve, { once: true });
      });
    }

    try {
      const raw = await callGemini(
        _nrBuildPrompt(bookName, payload.chapter, payload.versesText),
        // Long chapters produce a lot of beats, and a truncated JSON object
        // fails to parse outright rather than degrading — so give it room.
        // Near-zero temperature: this is a copy-and-split task, so any
        // creative sampling shows up as the model "improving" a sentence.
        { maxOutputTokens: 8192, temperature: 0.1 },
      );
      const data = _nrParse(raw);
      _nrPutCached(cacheKey, data);
      return data;
    } catch (err) {
      lastErr = err;
      console.warn(`[retell] attempt ${attempt + 1}/${MAX_TRIES}`, err);
      if (attempt === MAX_TRIES - 1) break;
      onAttempt?.(attempt + 2, MAX_TRIES);
      await new Promise((r) => setTimeout(r, Math.min(6000, 800 * 1.8 ** attempt)));
    }
  }

  throw lastErr;
}

/* The chapter currently on stage, so the Try-again button can re-run it
   without the caller having to hold state. */
let _nrCurrent = null;

async function openNarrate() {
  const payload = window.__aiPayload;
  if (!payload || !payload.versesText) {
    alert("Load a passage first.");
    return;
  }
  if (_nrOpen) return;
  _nrOpen = true;

  const overlay = document.getElementById("narrateOverlay");
  const scroll = document.getElementById("nrScroll");
  const titleEl = document.getElementById("nrTitle");
  if (!overlay || !scroll) return;

  const bookName = BIBLE_META[payload.book]?.name || payload.book;
  titleEl.textContent = `${bookName} ${payload.chapter}`;

  // Stage 1 — curtain wipes up over the reader, then the shell fades in
  // behind it. Both live on the same element so there's no flash between.
  overlay.hidden = false;
  document.body.classList.add("nr-locked");
  // Reopening during the close animation would otherwise slide straight back
  // down: the falling class is still on the element.
  overlay.classList.remove("nr-falling");
  // Force a reflow between un-hiding and adding the class. Going straight from
  // display:none to the end state in the same frame means the browser has no
  // start value to interpolate from and the overlay just appears, unanimated.
  void overlay.offsetWidth;
  overlay.classList.add("nr-rising");

  _nrCurrent = { payload, bookName };
  await _nrLoadRetell();
}

/* Everything after the curtain: fetch, render, or fail. Separated from
   openNarrate so Try-again can re-run it in place.

   It used to close the overlay and reopen it 260ms later, which never worked:
   closeNarrate only clears _nrOpen inside its transitionend handler, and the
   fall takes 520ms, so the reopen always landed while _nrOpen was still true
   and returned at the guard. Tapping Try again just shut the retelling. */
async function _nrLoadRetell() {
  if (!_nrCurrent) return;
  const { payload, bookName } = _nrCurrent;

  const scroll = document.getElementById("nrScroll");
  const pager = document.getElementById("nrPager");
  if (!scroll) return;

  // The pager belongs to the chapter that WAS on screen. Left alone it keeps
  // reporting "1 / 9" over a loading spinner or an error, and its arrows page
  // a list of beats that is no longer in the DOM.
  _nrPages = [];
  _nrPageIdx = 0;
  if (pager) pager.hidden = true;

  // Stage 2 — loading. Shown immediately so the wait is never a blank screen.
  const loadingHTML = (sub) => `<div class="nr-loading">
    ${sparkleLoaderHTML("Retelling this chapter…")}
    <p class="nr-loading-sub" id="nrLoadingSub">${sub}</p>
  </div>`;
  scroll.innerHTML = loadingHTML(
    `Reading all ${_nrEsc(bookName)} ${_nrEsc(payload.chapter)}, finding who speaks.`,
  );

  const cacheKey = `${_NR_CACHE_PREFIX}${payload.book}_${payload.chapter}`;

  // Started BEFORE the beats are awaited so all three calls are in flight at
  // once. Awaiting them after the beats resolved made a cold chapter pay the
  // two latencies back to back — the decorators are independent of the beats
  // and there's nothing to gain by holding them.
  //
  // Key headings by book ID, not payload.book — that's the uppercased NAME
  // ("JUDGES"), while the reader keys by ID ("JDG"). Passing it straight
  // through gave the two views separate caches, so each generated its own
  // wording and the same chapter had different section titles depending on
  // where you looked.
  const sectionsP = _fetchPassageSections(
    _bookNameToId(payload.book) || payload.book,
    payload.chapter,
    payload.versesText,
  ).catch(() => null);
  const scenesP = _nrFetchScenes(
    payload.book,
    payload.chapter,
    payload.versesText,
  ).catch(() => null);

  try {
    const data = await _nrFetchBeats(bookName, payload, cacheKey, (n, of) => {
      const sub = document.getElementById("nrLoadingSub");
      if (sub) sub.textContent = `That didn't come through — trying again (${n} of ${of}).`;
    });

    // Stage 3 — swap loading for the scroll. The beats stagger themselves in
    // via animation-delay, so the screen fills rather than snapping.
    // Headings and the storyboard only decorate the retelling, so neither is
    // allowed to fail it. Whichever comes back is used; whichever doesn't is
    // simply absent, and the beats read exactly as they did before either
    // existed. Both are usually already cached, in which case these resolve
    // instantly and cost nothing.
    const [sections, scenes] = await Promise.all([sectionsP, scenesP]);

    // The reader may have closed the overlay while we were waiting; rendering
    // into it now would leave the next open showing a stale chapter.
    if (!_nrOpen) return;

    scroll.innerHTML = _nrRenderBeats(data, sections, scenes);
    _nrPageIdx = 0;
    // Wait a frame so fonts and wrapping have settled — measuring mid-layout
    // gives heights that are wrong by a line or two and pages break oddly.
    // The timeout is the fallback that actually matters: rAF does not run in a
    // background tab, and generation takes long enough that the app often IS
    // backgrounded when this lands. Without it the retelling falls back to one
    // long scroll and the pager never appears. Re-paginating is idempotent.
    requestAnimationFrame(() => _nrPaginate(0));
    setTimeout(() => _nrPaginate(_nrPageIdx), 120);
  } catch (err) {
    console.warn("[retell] gave up", err);
    if (!_nrOpen) return;
    scroll.innerHTML = `<div class="nr-loading">
      <p class="nr-error">Couldn't retell this chapter.</p>
      <button type="button" class="nr-retry" id="nrRetry">Try again</button>
    </div>`;
  }
}

function closeNarrate() {
  const overlay = document.getElementById("narrateOverlay");
  if (!overlay) return;
  overlay.classList.remove("nr-rising");
  overlay.classList.add("nr-falling");
  _nrOpen = false;
  _nrCurrent = null;
  const done = () => {
    // A reopen during the 520ms fall would otherwise be hidden out from under
    // itself when this fires.
    if (_nrOpen) return;
    overlay.hidden = true;
    overlay.classList.remove("nr-falling");
    document.body.classList.remove("nr-locked");
    // Drop the element references — they belong to markup that gets replaced
    // on the next open, and holding them would pin a dead DOM tree in memory.
    _nrPages = [];
    _nrPageIdx = 0;
  };
  // transitionend can be missed if the tab backgrounds mid-close; the timeout
  // guarantees the overlay never stays stuck over the reader.
  overlay.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 700);
}

document.addEventListener("click", (e) => {
  if (e.target.closest?.("#nrClose")) closeNarrate();
  if (e.target.closest?.("#nrRetry")) _nrLoadRetell();
  if (e.target.closest?.("#nrPrev")) _nrGoToPage(_nrPageIdx - 1);
  if (e.target.closest?.("#nrNext")) _nrGoToPage(_nrPageIdx + 1);

  // Verse chips open the peek sheet. Without this they'd fall through to the
  // global `a[href^="#"]` delegate in js/05-render-init.js, which would
  // smooth-scroll the reader hidden BEHIND this overlay — a scroll you can't
  // see, leaving the chip looking dead.
  const chip = e.target.closest?.("#narrateOverlay a.nr-chip");
  if (chip) {
    e.preventDefault();
    e.stopPropagation();
    const ref =
      chip.textContent.replace(/[^0-9,\-–\s]/g, "").trim() ||
      chip.getAttribute("href")?.replace("#", "");
    if (ref) openVersePeek(ref, chip);
  }
});
document.addEventListener("keydown", (e) => {
  if (!_nrOpen) return;
  if (e.key === "Escape") closeNarrate();
  if (e.key === "ArrowRight") _nrGoToPage(_nrPageIdx + 1);
  if (e.key === "ArrowLeft") _nrGoToPage(_nrPageIdx - 1);
});
