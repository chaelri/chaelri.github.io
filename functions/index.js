const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.notifyNextStep = functions.database
  .ref("/nextSteps/{id}")
  .onCreate(async (snapshot, context) => {

    const data = snapshot.val();
    const message = {
      notification: {
        title: "New Step Added",
        body: data.text || "A new step was added."
      }
    };

    const tokensSnap = await admin.database().ref("fcmTokens").once("value");
    if (!tokensSnap.exists()) return null;

    const tokens = Object.keys(tokensSnap.val());

    return admin.messaging().sendToDevice(tokens, message);
  });
