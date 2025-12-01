const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.pushNotificationForwarder = functions.database
  .ref("/notifications/queue/{id}")
  .onCreate(async (snapshot, context) => {
    const payload = snapshot.val();

    if (!payload || !payload.title || !payload.body) {
      console.log("Invalid payload, skipping:", payload);
      return null;
    }

    // Load all FCM tokens
    const tokensSnap = await admin.database().ref("fcmTokens").once("value");
    if (!tokensSnap.exists()) return null;

    const tokens = Object.keys(tokensSnap.val());

    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {}, // optional data payload
    };

    // Send the notification
    await admin.messaging().sendToDevice(tokens, message);

    // Remove it from queue
    await snapshot.ref.remove();

    return null;
  });
