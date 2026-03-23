import express from "express";
import fetch from "node-fetch";
import webPush from "web-push";
import { Firestore } from "@google-cloud/firestore";

const app = express();
app.use(express.json());

// CORS for all routes
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

// ── Firestore (uses default credentials on Cloud Run) ──
const db = new Firestore();
const subsCollection = db.collection("push-subscriptions");

// ── VAPID setup ──
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
webPush.setVapidDetails("mailto:devotion@chaelri.app", VAPID_PUBLIC, VAPID_PRIVATE);

// ── Existing Gemini proxy ──
app.post("/", async (req, res) => {
  try {
    // Strip non-Gemini fields (e.g. "task") before forwarding
    const { task, ...geminiBody } = req.body;
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Gemini request failed" });
  }
});

// ── Subscribe to push notifications ──
app.post("/subscribe", async (req, res) => {
  try {
    const { subscription, name, notes, lastPassage } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: "Missing subscription" });

    // Use endpoint hash as doc ID (stable across re-subscribes)
    const docId = Buffer.from(subscription.endpoint).toString("base64url").slice(-64);
    await subsCollection.doc(docId).set({
      subscription,
      name: name || "Friend",
      notes: notes || "",
      lastPassage: lastPassage || "",
      updatedAt: Date.now(),
      lastVisit: Date.now(),
    }, { merge: true });

    res.json({ ok: true });
  } catch (e) {
    console.error("Subscribe error:", e);
    res.status(500).json({ error: "Subscribe failed" });
  }
});

// ── Unsubscribe ──
app.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });

    const docId = Buffer.from(endpoint).toString("base64url").slice(-64);
    await subsCollection.doc(docId).delete();
    res.json({ ok: true });
  } catch (e) {
    console.error("Unsubscribe error:", e);
    res.status(500).json({ error: "Unsubscribe failed" });
  }
});

// ── Send daily reminders (called by Cloud Scheduler) ──
app.post("/send-reminder", async (req, res) => {
  try {
    const snapshot = await subsCollection.get();
    if (snapshot.empty) return res.json({ sent: 0 });

    let sent = 0;
    let failed = 0;

    // Determine time of day in PHT for prompt tone
    const phtHour = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })).getHours();
    const timeSlot = phtHour < 11 ? "morning" : phtHour < 17 ? "midday" : "evening";

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const { subscription, name, notes, lastPassage } = data;

      // Skip if user visited in the last 2 hours (they're already using the app)
      if (data.lastVisit && Date.now() - data.lastVisit < 2 * 60 * 60 * 1000) continue;

      // Generate time-aware personalized nudge
      let body = "Take a moment to draw near to God today.";
      try {
        const hasContext = (notes && notes.trim().length > 10) || lastPassage;
        const passageCtx = lastPassage ? `They last read ${lastPassage}.` : "";
        const notesCtx = notes ? `Their recent reflections/notes: "${notes.slice(0, 300)}"` : "";

        let prompt;
        if (timeSlot === "morning") {
          prompt = hasContext
            ? `You are a warm Christian friend sending a MORNING push notification to ${name}. ${passageCtx} ${notesCtx}. Write ONE sentence (max 20 words) giving them something specific from their reading or reflections to carry into their day. Like "Remember what you reflected on about..." or reference their last passage. Warm, casual, personal. No emojis, no guilt. Reply with ONLY the sentence.`
            : `Send ONE warm morning push notification (max 15 words) to ${name} encouraging them to start their day in God's word. Casual, caring. No emojis. Reply with ONLY the sentence.`;
        } else if (timeSlot === "midday") {
          prompt = hasContext
            ? `You are a caring Christian friend sending a MIDDAY push notification to ${name}. ${passageCtx} ${notesCtx}. Write ONE sentence (max 20 words) reminding them of something specific they can APPLY RIGHT NOW from their recent reflections or reading. Be practical and specific. Like "That thing you wrote about X — try putting that into practice this afternoon." Warm, casual. No emojis, no guilt. Reply with ONLY the sentence.`
            : `Send ONE warm midday push notification (max 15 words) to ${name} gently reminding them to spend time in God's word today. Casual, caring. No emojis. Reply with ONLY the sentence.`;
        } else {
          prompt = hasContext
            ? `You are a thoughtful Christian friend sending an EVENING push notification to ${name}. ${passageCtx} ${notesCtx}. Write ONE sentence (max 20 words) inviting them to reflect on their day through the lens of what they've been reading or studying. Reference their specific notes or passage. Warm, reflective tone. No emojis, no guilt. Reply with ONLY the sentence.`
            : `Send ONE warm evening push notification (max 15 words) to ${name} inviting them to end their day with God's word. Casual, caring. No emojis. Reply with ONLY the sentence.`;
        }

        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" +
            process.env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        const geminiData = await geminiRes.json();
        const msg = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (msg && msg.length < 100) body = msg;
      } catch {}

      // Send push
      try {
        await webPush.sendNotification(subscription, JSON.stringify({
          title: "Devotion",
          body,
        }));
        sent++;
      } catch (pushErr) {
        // 410 Gone or 404 = subscription expired, clean up
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await doc.ref.delete();
        }
        failed++;
      }
    }

    res.json({ sent, failed, total: snapshot.size });
  } catch (e) {
    console.error("Send reminder error:", e);
    res.status(500).json({ error: "Send failed" });
  }
});

// ── Test notification (reuses send-reminder logic but ignores lastVisit) ──
app.post("/test-push", async (req, res) => {
  try {
    const phtHour = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })).getHours();
    const timeSlot = phtHour < 11 ? "morning" : phtHour < 17 ? "midday" : "evening";
    const snapshot = await subsCollection.get();
    let sent = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const { subscription, name, notes, lastPassage } = data;

      let body = "Take a moment to draw near to God today.";
      try {
        const hasContext = (notes && notes.trim().length > 10) || lastPassage;
        const passageCtx = lastPassage ? `They last read ${lastPassage}.` : "";
        const notesCtx = notes ? `Their recent reflections/notes: "${notes.slice(0, 300)}"` : "";
        const prompt = hasContext
          ? `You are a warm Christian friend sending a ${timeSlot} push notification to ${name}. ${passageCtx} ${notesCtx}. Write ONE sentence (max 20 words) that references something specific from their reading, notes, or reflections. Be warm, personal, casual. No emojis, no guilt. Reply with ONLY the sentence.`
          : `Send ONE warm ${timeSlot} push notification (max 15 words) to ${name} encouraging them to spend time in God's word. Casual, caring. No emojis. Reply with ONLY the sentence.`;
        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + process.env.GEMINI_API_KEY,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
        );
        const geminiData = await geminiRes.json();
        const msg = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (msg && msg.length < 100) body = msg;
      } catch {}

      try {
        await webPush.sendNotification(subscription, JSON.stringify({ title: "Devotion", body }));
        sent++;
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) await doc.ref.delete();
      }
    }
    res.json({ sent, total: snapshot.size });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: remove subscriber by name ──
app.post("/admin-remove", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const snapshot = await subsCollection.get();
    let removed = 0;
    for (const doc of snapshot.docs) {
      if (doc.data().name === name) {
        await doc.ref.delete();
        removed++;
      }
    }
    res.json({ removed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: broadcast announcement to all or specific subscribers ──
app.post("/broadcast", async (req, res) => {
  try {
    const { title, body, targets } = req.body;
    if (!body) return res.status(400).json({ error: "Missing body" });

    const snapshot = await subsCollection.get();
    let sent = 0, failed = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // If targets specified, only send to those names
      if (targets && targets.length > 0) {
        if (!targets.includes(data.name)) continue;
      }
      try {
        await webPush.sendNotification(data.subscription, JSON.stringify({
          title: title || "Devotion",
          body,
        }));
        sent++;
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) await doc.ref.delete();
        failed++;
      }
    }
    res.json({ sent, failed, total: snapshot.size });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: list all subscribers ──
app.get("/admin-stats", async (req, res) => {
  try {
    const snapshot = await subsCollection.orderBy("updatedAt", "desc").get();
    const subscribers = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        name: d.name || "Unknown",
        notes: d.notes || "",
        lastPassage: d.lastPassage || "",
        lastVisit: d.lastVisit || 0,
        updatedAt: d.updatedAt || 0,
      };
    });
    res.json({ total: subscribers.length, subscribers });
  } catch (e) {
    console.error("Admin stats error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ──
app.get("/", (req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server running on port", port));
