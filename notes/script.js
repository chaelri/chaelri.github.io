// --- CONFIGURATION ---
const CLIENT_ID = "668755364170-3uiq2nrlmb4b91hf5o5junu217b4eeef.apps.googleusercontent.com";
const API_KEY = "AIzaSyD9Q5MJl6-SSd1Ye4rB8_HQVGMFoFhCg2g";
const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

let tokenClient;
let calendar;
let notes = JSON.parse(localStorage.getItem("my-custom-notes") || "[]");

// 1. Initialize App
document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek",
    },
    events: getFormattedNotes(),
    dateClick: function (info) {
      openNoteModal(info.dateStr);
    },
  });
  calendar.render();
  renderNotesSidebar();

  // Load Google Scripts
  gapi.load("client", async () => {
    await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] });
  });
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: "", // defined at login
  });
});

// 2. Google Auth Logic
async function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw resp;
    document.getElementById("signout_button").classList.remove("hidden");
    document.getElementById("auth_button").innerHTML = "Syncing...";
    await fetchGoogleEvents();
  };
  tokenClient.requestAccessToken({ prompt: "consent" });
}

async function fetchGoogleEvents() {
  const response = await gapi.client.calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    showDeleted: false,
    singleEvents: true,
    maxResults: 50,
    orderBy: "startTime",
  });

  const gEvents = response.result.items.map((event) => ({
    id: event.id,
    title: `📅 ${event.summary}`,
    start: event.start.dateTime || event.start.date,
    backgroundColor: "#dbeafe",
    textColor: "#1e40af",
    className: "google-event",
  }));

  calendar.addEventSource(gEvents);
  document.getElementById("auth_button").innerHTML = "Google Synced ✅";
}

// 3. Notes Logic (LocalStorage)
function openNoteModal(date = new Date().toISOString().split("T")[0]) {
  document.getElementById("noteTitle").value = "";
  document.getElementById("noteBody").value = "";
  document.getElementById("modalDateDisplay").innerText = date;
  document.getElementById("noteModal").dataset.date = date;
  document.getElementById("noteModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("noteModal").classList.add("hidden");
}

function saveNote() {
  const title = document.getElementById("noteTitle").value;
  const body = document.getElementById("noteBody").value;
  const date = document.getElementById("noteModal").dataset.date;

  if (!title) return alert("Please enter a title");

  const newNote = { id: Date.now().toString(), title, body, date };
  notes.push(newNote);
  localStorage.setItem("my-custom-notes", JSON.stringify(notes));

  calendar.addEvent({
    id: newNote.id,
    title: `📝 ${title}`,
    start: date,
    backgroundColor: "#fef08a",
    textColor: "#854d0e",
  });

  renderNotesSidebar();
  closeModal();
}

function renderNotesSidebar() {
  const list = document.getElementById("notesList");
  list.innerHTML = notes
    .slice()
    .reverse()
    .map(
      (n) => `
        <div class="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer group">
            <div class="flex justify-between items-start mb-1">
                <h4 class="font-bold text-sm text-slate-800">${n.title}</h4>
                <span class="text-[10px] font-bold text-blue-500 uppercase">${n.date}</span>
            </div>
            <p class="text-xs text-gray-400 line-clamp-2">${n.body}</p>
        </div>
    `
    )
    .join("");
}

function getFormattedNotes() {
  return notes.map((n) => ({
    id: n.id,
    title: `📝 ${n.title}`,
    start: n.date,
    backgroundColor: "#fef08a",
    textColor: "#854d0e",
  }));
}
