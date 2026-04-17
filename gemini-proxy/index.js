// Minimal Gemini text proxy. No image gen, no push notifications, no
// Firestore, no grounding. Every route that could cost more than raw Gemini
// text tokens has been removed to keep this service cheap.
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

// Gemini text proxy — forwards the body (minus the `task` field) to the
// Gemini API. Uses the cheap flash-lite model regardless of task. No tools,
// no grounding, no retries.
app.post("/", async (req, res) => {
  try {
    const { task, ...geminiBody } = req.body || {};
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

// Health check
app.get("/", (req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server running on port", port));
