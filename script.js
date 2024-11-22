const CLIENT_ID =
  "592377088765-u37g75l0vf6p0747cn1mk8s58j2l1m3j.apps.googleusercontent.com"; // Replace with your OAuth 2.0 Client ID
const API_KEY = "AIzaSyC_i8UR1fhAR4j7Jby4Ygl54boXkt8gtaE";
const DISCOVERY_DOC =
  "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

const spreadsheetId = "1j0XDgYXpxc0SHVY99GBkLdEB4ngfLDqZKRNvK259j7o";
const range = "Chalee's 💸!A1"; // Cell to update
const button = document.getElementById("counterButton");
const responseElement = document.getElementById("response");

let gapiInitialized = false;
let authInstance;

// Load GAPI and initialize the client
function loadGapiClient() {
  gapi.load("client:auth2", async () => {
    await gapi.client.init({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      discoveryDocs: [DISCOVERY_DOC],
      scope: SCOPES,
    });

    gapiInitialized = true;
    authInstance = gapi.auth2.getAuthInstance();
  });
}

// Authenticate the user
async function authenticate() {
  if (!gapiInitialized) {
    responseElement.textContent = "GAPI not initialized. Please refresh.";
    return;
  }

  if (!authInstance.isSignedIn.get()) {
    await authInstance.signIn();
  }
}

// Function to get the current value
async function getCurrentValue() {
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId,
    range: range,
  });

  return parseInt(response.result.values?.[0]?.[0] || "0", 10);
}

// Function to update the cell value
async function updateValue(newValue) {
  const response = await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId,
    range: range,
    valueInputOption: "RAW",
    resource: {
      values: [[newValue]],
    },
  });

  if (response.status === 200) {
    responseElement.textContent = `Updated to ${newValue}`;
  } else {
    responseElement.textContent = "Error updating the value";
  }
}

// Button click handler
button.addEventListener("click", async () => {
  try {
    await authenticate(); // Ensure the user is authenticated
    const currentValue = await getCurrentValue();
    const newValue = currentValue + 1;
    await updateValue(newValue);
  } catch (error) {
    responseElement.textContent = `Error: ${error.message}`;
  }
});

// Initialize GAPI on page load
loadGapiClient();
