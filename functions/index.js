const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

// Load your service account key
const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
});

exports.gemini = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const apiKey = functions.config().gemini.key;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gemini failed" });
  }
});

exports.pushNotificationForwarder = functions.database
  .ref("/notifications/queue/{id}")
  .onCreate(async (snapshot, context) => {
    const payload = snapshot.val();

    console.log("[FN] Triggered pushNotificationForwarder id=" + snapshot.key);
    console.log("[FN] payload:", payload);

    if (!payload || !payload.title || !payload.body) {
      console.log("Invalid payload, skipping.");
      return null;
    }

    // Fetch FCM tokens
    const tokensSnap = await admin.database().ref("fcmTokens").once("value");
    if (!tokensSnap.exists()) {
      console.log("[FN] No fcmTokens found");
      return null;
    }

    const tokens = Object.keys(tokensSnap.val());
    console.log("[FN] Sending to " + tokens.length + " token(s)");

    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
    };

    try {
      await admin.messaging().sendToDevice(tokens, message);
      console.log("[FN] Notification sent!");

      await snapshot.ref.remove();
      return null;
    } catch (err) {
      console.error("[FN] Error sending FCM:", err);
      return null;
    }
  });
