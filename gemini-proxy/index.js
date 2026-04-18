// Minimal Gemini text proxy. No image gen, no push notifications, no
// Firestore, no grounding. Every route that could cost more than raw Gemini
// text tokens has been removed to keep this service cheap.
import express from "express";
import fetch from "node-fetch";
import { Readable } from "stream";

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

// Gemini text proxy — forwards to flash-lite with latency-optimized config.
// If the caller passes { stream: true } in the body, we pipe Server-Sent
// Events from Gemini back to the client as they arrive (typically first
// token in ~200-400ms instead of waiting ~2s for the whole response).
app.post("/", async (req, res) => {
  try {
    const { task, stream, ...geminiBody } = req.body || {};

    // Merge in performance-tuned defaults unless caller already set them.
    geminiBody.generationConfig = {
      temperature: 0.4,
      maxOutputTokens: 2048,
      ...(geminiBody.generationConfig || {}),
      thinkingConfig: {
        thinkingBudget: 0,
        ...((geminiBody.generationConfig || {}).thinkingConfig || {}),
      },
    };

    const endpoint = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:${endpoint}key=${process.env.GEMINI_API_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (stream) {
      // Pipe SSE chunks through without buffering. Using Readable.fromWeb to
      // convert node-fetch's Web ReadableStream to a Node stream — this flows
      // through Express + Cloud Run reliably (the for-await approach was
      // getting buffered somewhere in the chain and the client never saw
      // chunks until the response ended).
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      Readable.fromWeb(r.body).pipe(res);
    } else {
      const data = await r.json();
      res.json(data);
    }
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Gemini request failed" });
    else res.end();
  }
});

// Health check — also acts as the warm-up target hit from the devo app on
// page load to keep the Cloud Run container alive and skip cold starts.
app.get("/", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server running on port", port));
