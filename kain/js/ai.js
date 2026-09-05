// Everything that talks to Gemini (through our Cloud Run proxy).
//
// Cost discipline, because this runs on the shared free-tier key:
//   • Photos are downscaled to 768 px before they leave the phone, so one meal
//     is about one image tile instead of a 12 MP iPhone frame.
//   • Text-only jobs (exercise, typed meals) use flash-lite, not the vision model.
//   • One request per action, no streaming. Retries only when the model is
//     overloaded — never as a way to "shop" for a nicer answer.
//   • Answers come back as JSON and the arithmetic is done here, not by the
//     model — LLMs are good at recognising adobo, bad at adding columns.

import { PROXY, MODELS, VISION_MAX_EDGE, VISION_QUALITY, THUMB_MAX_EDGE, THUMB_QUALITY, DEFAULT_MET } from "./config.js";
import { num, round } from "./util.js";

/* --------------------------------------------------------- image prep --- */

async function drawScaled(file, maxEdge, quality) {
  // `from-image` applies the EXIF rotation, so portrait iPhone shots don't
  // reach Gemini lying on their side.
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * One decode, two renders: the 768 px frame we send to Gemini and the 400 px
 * thumbnail we keep on the entry forever. The original never leaves the phone.
 */
export async function prepImage(file) {
  const [vision, thumb] = await Promise.all([
    drawScaled(file, VISION_MAX_EDGE, VISION_QUALITY),
    drawScaled(file, THUMB_MAX_EDGE, THUMB_QUALITY),
  ]);
  return {
    dataUrl: vision,
    base64: vision.split(",")[1],
    mimeType: "image/jpeg",
    thumb,
  };
}

/* --------------------------------------------------------- proxy call --- */

const RETRYABLE = new Set([429, 500, 502, 503]);

/**
 * One POST to the proxy. The proxy hands Gemini's body straight through, so a
 * model outage arrives as HTTP 200 with an `error` object inside — that has to
 * be checked explicitly. Overload (503) is common on the free key, so each call
 * gets one retry on the same model and then one on a lighter fallback.
 */
async function callGemini({ model, fallback = null, parts, maxOutputTokens = 3000, temperature = 0.15 }) {
  const attempts = fallback ? [model, model, fallback] : [model, model];
  let lastError = null;

  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 700 * i));
    try {
      const res = await fetch(PROXY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "kain",
          model: attempts[i],
          contents: [{ role: "user", parts }],
          generationConfig: { temperature, maxOutputTokens, responseMimeType: "application/json" },
        }),
      });

      const data = res.ok ? await res.json() : null;
      if (!data) {
        lastError = new Error(`Proxy error ${res.status}`);
        if (!RETRYABLE.has(res.status)) throw lastError;
        continue;
      }

      if (data.error) {
        const code = data.error.code;
        lastError = new Error(
          code === 429
            ? "We've hit today's AI limit. Try again later or type it in."
            : "The AI is busy right now. One more try?"
        );
        if (!RETRYABLE.has(code)) throw new Error(data.error.message || "Gemini rejected that request.");
        continue;
      }

      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
      if (text.trim()) return text;

      lastError = new Error(
        cand?.finishReason === "MAX_TOKENS"
          ? "The answer got cut off. Try again."
          : "Gemini returned nothing. Try again in a moment."
      );
    } catch (err) {
      // A dropped connection is worth one more shot; a thrown non-retryable
      // error above is not.
      if (err.message && !/Proxy error|Gemini rejected/.test(err.message)) lastError = err;
      else throw err;
    }
  }
  throw lastError || new Error("Couldn't reach the AI.");
}

function parseJSON(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }
  throw new Error("Couldn't read the AI's answer.");
}

/* ------------------------------------------------------------ prompts --- */

const NUTRITION_RULES = `You are a meticulous Filipino nutritionist logging a meal for a couple in Metro Manila.

Estimate three numbers only: calories (kcal), sugar (g) and sodium (mg).

HOW TO ESTIMATE
1. Name the dish the way a Filipino would ("chicken adobo with rice", "Jollibee Chickenjoy 1pc with Jolly Spaghetti", "pandesal with kesong puti").
2. Read any packaging in the image — brand, flavour, size, and the Nutrition Facts panel if it is legible. A visible panel beats your memory: use it, and scale it by the servings actually eaten.
3. Break the meal into the components a person actually ate: rice, ulam, sauce, sides, drink, condiments. One line each.
4. Judge portions from what is in frame. Useful references: a dinner plate is ~26 cm, a rice cup mould is ~1 cup / 150 g cooked rice, a standard mug is ~240 ml, a tablespoon is ~15 ml, an adult palm is ~100 g of meat.
5. Filipino food is SALTY — never round sodium down out of politeness. Toyo, patis, bagoong, instant noodles, canned corned beef/sardines, hotdogs, tocino, longganisa, processed cheese, fast-food chicken and pancit are all high-sodium. A single restaurant ulam commonly carries 700–1,400 mg.
6. Sugar means total sugars, including what is in the sauce, the sweetened drink, the marinade (tocino, banana ketchup, teriyaki) and dessert. Sweetened iced tea, softdrinks, milk tea and juice usually dominate a meal's sugar.
7. If several people are clearly sharing, log only ONE person's portion and say so in "assumptions".
8. Never invent precision you don't have. Round kcal to the nearest 5, sodium to the nearest 10.

OUTPUT — return JSON only, no markdown, exactly this shape:
{
  "is_food": true,
  "title": "short dish name, max 6 words",
  "brand": "restaurant or product brand, or empty string",
  "confidence": "high" | "medium" | "low",
  "assumptions": "one sentence on the portions you assumed, or empty string",
  "items": [
    { "name": "component", "qty": "portion in plain words", "kcal": 0, "sugar_g": 0, "sodium_mg": 0 }
  ],
  "tip": "one short encouraging line, casual Taglish is fine, no emoji"
}
If the picture has no food in it at all, return {"is_food": false, "title": "", "items": [], "tip": ""}.`;

/**
 * Photo → breakdown. `hint` is the user's correction ("this is tapsilog, not
 * fried rice") and `previous` is the read being corrected, so the model fixes
 * its answer instead of starting from a blank slate.
 */
export async function analyzeMealPhoto({ base64, mimeType, hint = "", previous = null }) {
  const parts = [{ inline_data: { mime_type: mimeType, data: base64 } }];

  let prompt = NUTRITION_RULES;
  if (previous) {
    prompt += `\n\nYOUR PREVIOUS READING OF THIS SAME PHOTO:\n${JSON.stringify({
      title: previous.title,
      items: (previous.items || []).map((i) => ({ name: i.name, qty: i.qty })),
    })}`;
  }
  if (hint.trim()) {
    prompt += `\n\nTHE PERSON WHO ATE IT SAYS: "${hint.trim()}"
They were there and you were not. Treat this as fact — correct the dish name, the brand, the portions and the components to match it, and keep the numbers consistent with what they told you.`;
  }

  parts.push({ text: prompt });

  const raw = await callGemini({ model: MODELS.vision, fallback: MODELS.visionFallback, parts });
  return normalizeMeal(parseJSON(raw));
}

/** Typed meal, no photo — same contract, cheaper model. */
export async function analyzeMealText(description) {
  const prompt = `${NUTRITION_RULES}

There is no photo. The person typed what they ate:
"${description.trim()}"
Work only from that description. If a portion is not stated, assume one normal adult serving and say so in "assumptions".`;
  const raw = await callGemini({ model: MODELS.text, parts: [{ text: prompt }], maxOutputTokens: 1600 });
  return normalizeMeal(parseJSON(raw));
}

function normalizeMeal(data) {
  const items = (Array.isArray(data.items) ? data.items : [])
    .map((i) => ({
      name: String(i.name || "Item").slice(0, 80),
      qty: String(i.qty || "").slice(0, 60),
      kcal: Math.max(0, round(num(i.kcal), 1)),
      sugar_g: Math.max(0, round(num(i.sugar_g), 0.1)),
      sodium_mg: Math.max(0, round(num(i.sodium_mg), 1)),
    }))
    .filter((i) => i.name);

  return {
    isFood: data.is_food !== false && items.length > 0,
    title: String(data.title || "").slice(0, 80),
    brand: String(data.brand || "").slice(0, 60),
    confidence: ["high", "medium", "low"].includes(data.confidence) ? data.confidence : "medium",
    assumptions: String(data.assumptions || "").slice(0, 300),
    tip: String(data.tip || "").slice(0, 160),
    items,
  };
}

/** Sum the items — never trust the model's own addition. */
export function sumItems(items = []) {
  return items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + num(i.kcal),
      sugar_g: acc.sugar_g + num(i.sugar_g),
      sodium_mg: acc.sodium_mg + num(i.sodium_mg),
    }),
    { kcal: 0, sugar_g: 0, sodium_mg: 0 }
  );
}

/* ----------------------------------------------------------- exercise --- */

const EXERCISE_PROMPT = `Read one line of exercise a Filipino adult typed and turn it into structured data.

Return JSON only:
{
  "activity": "short name, e.g. Brisk walking",
  "minutes": 30,
  "met": 4.3,
  "steps": 0,
  "note": ""
}

Rules:
- "met" is the standard MET value for that activity's intensity (slow walk 2.8, brisk walk 4.3, jog 7.0, run 9.8, cycling casual 6.0, badminton 5.5, basketball 6.5, swimming 6.0, weights 5.0, HIIT 8.0, household chores 3.3, walking the dog 3.0, dancing 5.0).
- "minutes" is the duration they said. If they didn't say one, infer a sensible default for that activity and keep it modest (30).
- "steps" only if they actually mention a step count ("10k steps" → 10000), otherwise 0.
- Never return calories. Someone else does that maths.`;

export async function analyzeExercise(text) {
  const raw = await callGemini({
    model: MODELS.text,
    parts: [{ text: `${EXERCISE_PROMPT}\n\nThey typed: "${text.trim()}"` }],
    maxOutputTokens: 400,
    temperature: 0.1,
  });
  const d = parseJSON(raw);
  return {
    activity: String(d.activity || text).slice(0, 60),
    minutes: Math.max(0, Math.round(num(d.minutes, 30))),
    met: Math.max(1, num(d.met, DEFAULT_MET)),
    steps: Math.max(0, Math.round(num(d.steps, 0))),
    note: String(d.note || "").slice(0, 140),
  };
}

/* -------------------------------------------------------- burn maths ---- */

/** The textbook one: kcal/min = MET × 3.5 × kg / 200. */
export function burnFromMet({ met, minutes, weightKg }) {
  return Math.round((num(met, DEFAULT_MET) * 3.5 * num(weightKg, 60) * num(minutes)) / 200);
}

/** Walking is ~0.5 kcal per kg per km, and ~1,250 steps make a km. */
export function burnFromSteps({ steps, weightKg }) {
  return Math.round(num(steps) * num(weightKg, 60) * 0.0004);
}
