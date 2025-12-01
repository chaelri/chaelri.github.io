// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.pushNotificationForwarder = functions.database
  .ref("/notifications/queue/{id}")
  .onCreate(async (snapshot, context) => {
    const id = context.params.id || "<no-id>";
    console.log(`[FN] Triggered pushNotificationForwarder id=${id}`);

    try {
      const payload = snapshot.val();
      console.log("[FN] payload:", payload);

      if (!payload || !payload.title || !payload.body) {
        console.warn("[FN] Invalid payload, skipping:", payload);
        // Remove invalid payload so it doesn't spam logs (optional)
        // await snapshot.ref.remove();
        return null;
      }

      // Load all FCM tokens
      const tokensSnap = await admin.database().ref("fcmTokens").once("value");
      if (!tokensSnap.exists()) {
        console.warn("[FN] No fcmTokens found; nothing to send to.");
        return null;
      }

      const tokensObj = tokensSnap.val();
      const tokens = Object.keys(tokensObj);
      console.log(`[FN] Sending to ${tokens.length} token(s)`);

      const message = {
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
      };

      // send (returns response object)
      const response = await admin.messaging().sendToDevice(tokens, message);
      console.log("[FN] sendToDevice response:", JSON.stringify(response));

      // attempt to remove the queue item
      await snapshot.ref.remove();
      console.log(`[FN] removed queue item ${id}`);

      return null;
    } catch (err) {
      console.error("[FN] Exception in pushNotificationForwarder:", err);
      // Do not remove snapshot on unexpected errors so you can re-run tests.
      throw err; // let Cloud Functions mark the invocation as error
    }
  });
