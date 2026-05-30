// Program Details form — captures every TBD from the ceremony + reception
// program docs. Auto-saves to Firebase (/collaterals/_details) so Charlie &
// Karla see each other's edits live.

import { fbGet, fbSet, fbSubscribe } from "../shared/firebase-sync.js";

const DETAILS_KEY = "_details";

// Unanswered cells in the wedding planning sheet
// (https://docs.google.com/spreadsheets/d/1AhowIveOjjVy73F6_x4c5ajsZXJE5wpu-tuLGQYIQzk).
//
// Each item maps to a single row in a named tab. `cols` lists the columns
// being written; the form renders one input per column. The destination
// caption ("→ SONGLIST · B19:C19") is computed from { tab, row, cols } so
// nothing drifts between the UI and the future sync-to-sheet script.
//
// Add/remove items as the sheet evolves — the form rebuilds from this list.
const SHEET_QUESTIONS = [
  {
    section: "Songs",
    icon: "queue_music",
    meta: "SONGLIST tab · title in B, link in C",
    items: [
      { id: "song-intro-sponsors",               tab: "SONGLIST", row: 12, cols: ["B", "C"], label: "Introduction of Principal Sponsors & Other Guests", placeholders: ["Song title", "Spotify / TikTok / YouTube link (optional)"] },
      { id: "song-first-dance-first-song",       tab: "SONGLIST", row: 19, cols: ["B", "C"], label: "First Dance / First Song",                          placeholders: ["Song title", "Link (optional)"] },
      { id: "song-money-dance",                  tab: "SONGLIST", row: 20, cols: ["B", "C"], label: "Money Dance / Prosperity Box",                      placeholders: ["Song title", "Link (optional)"] },
      { id: "song-game-2",                       tab: "SONGLIST", row: 21, cols: ["B", "C"], label: "Game #2 (optional)",                                placeholders: ["Song title", "Link (optional)"] },
      { id: "song-bride-relatives-intermission", tab: "SONGLIST", row: 22, cols: ["B", "C"], label: "Bride's Relatives Intermission",                    placeholders: ["Song title", "Link (optional)"] },
      { id: "song-groom-relatives-intermission", tab: "SONGLIST", row: 23, cols: ["B", "C"], label: "Groom's Relatives Intermission & Garter Ceremony",  placeholders: ["Song title", "Link (optional)"] },
      { id: "song-messages-for-couple",          tab: "SONGLIST", row: 24, cols: ["B", "C"], label: "Messages for the Couple (MOH, BFFs)",               placeholders: ["Song title", "Link (optional)"] },
      { id: "song-bouquet-catching",             tab: "SONGLIST", row: 25, cols: ["B", "C"], label: "Bouquet Catching",                                  placeholders: ["Song title", "Link (optional)"] },
      { id: "song-message-from-couple",          tab: "SONGLIST", row: 29, cols: ["B", "C"], label: "Message from the Couple",                           placeholders: ["Song title", "Link (optional)"] },
      { id: "song-closing",                      tab: "SONGLIST", row: 30, cols: ["B", "C"], label: "Closing",                                           placeholders: ["Song title", "Link (optional)"] },
    ],
  },
  {
    section: "Ceremony / photoshoot checklist",
    icon: "checklist",
    meta: "CHECKLIST tab · status in column C",
    items: [
      { id: "ck-candle-long",       tab: "CHECKLIST", row: 2,  cols: ["C"], label: "Candle long (2 pcs)",     placeholders: ["e.g. ready / ordered / not yet"] },
      { id: "ck-unity-candle",      tab: "CHECKLIST", row: 3,  cols: ["C"], label: "Unity candle",            placeholders: ["status"] },
      { id: "ck-veil",              tab: "CHECKLIST", row: 4,  cols: ["C"], label: "Veil",                    placeholders: ["status"] },
      { id: "ck-arras",             tab: "CHECKLIST", row: 5,  cols: ["C"], label: "Arras",                   placeholders: ["status"] },
      { id: "ck-cord",              tab: "CHECKLIST", row: 6,  cols: ["C"], label: "Cord",                    placeholders: ["status"] },
      { id: "ck-bible",             tab: "CHECKLIST", row: 7,  cols: ["C"], label: "Bible",                   placeholders: ["status"] },
      { id: "ck-wedding-vows",      tab: "CHECKLIST", row: 8,  cols: ["C"], label: "Wedding vows",            placeholders: ["status"] },
      { id: "ck-wedding-rings",     tab: "CHECKLIST", row: 9,  cols: ["C"], label: "Wedding rings",           placeholders: ["status"] },
      { id: "ck-copy-invitation",   tab: "CHECKLIST", row: 10, cols: ["C"], label: "Copy of invitation",      placeholders: ["status"] },
      { id: "ck-entourage-flowers", tab: "CHECKLIST", row: 11, cols: ["C"], label: "Entourage flowers",       placeholders: ["status"] },
      { id: "ck-wedding-wands",     tab: "CHECKLIST", row: 12, cols: ["C"], label: "Wedding wands",           placeholders: ["status"] },
      { id: "ck-bubble-guns",       tab: "CHECKLIST", row: 13, cols: ["C"], label: "Bubble guns (2)",         placeholders: ["status"] },
    ],
  },
  {
    section: "Reception checklist",
    icon: "celebration",
    meta: "CHECKLIST tab · status in column C",
    items: [
      { id: "ck-money-prosperity-box",  tab: "CHECKLIST", row: 16, cols: ["C"], label: "Money / prosperity box",          placeholders: ["status"] },
      { id: "ck-money-envelopes",       tab: "CHECKLIST", row: 17, cols: ["C"], label: "Money envelopes / pins / clips",  placeholders: ["status"] },
      { id: "ck-prizes",                tab: "CHECKLIST", row: 18, cols: ["C"], label: "Prizes",                          placeholders: ["status"] },
      { id: "ck-pens",                  tab: "CHECKLIST", row: 19, cols: ["C"], label: "Pens",                            placeholders: ["status"] },
      { id: "ck-souvenirs-sponsors",    tab: "CHECKLIST", row: 20, cols: ["C"], label: "Souvenirs for sponsors",          placeholders: ["status"] },
      { id: "ck-souvenirs-guest",       tab: "CHECKLIST", row: 21, cols: ["C"], label: "Souvenirs for guests",            placeholders: ["status"] },
    ],
  },
  {
    section: "Bride's essentials for photoshoot",
    icon: "favorite",
    meta: "CHECKLIST tab · status in column C",
    items: [
      { id: "ck-bride-robe",            tab: "CHECKLIST", row: 23, cols: ["C"], label: "Robe",            placeholders: ["status"] },
      { id: "ck-bride-gown",            tab: "CHECKLIST", row: 24, cols: ["C"], label: "Gown",            placeholders: ["status"] },
      { id: "ck-bride-shoes",           tab: "CHECKLIST", row: 25, cols: ["C"], label: "Shoes",           placeholders: ["status"] },
      { id: "ck-bride-sandals",         tab: "CHECKLIST", row: 26, cols: ["C"], label: "Sandals",         placeholders: ["status"] },
      { id: "ck-bride-engagement-ring", tab: "CHECKLIST", row: 27, cols: ["C"], label: "Engagement ring", placeholders: ["status"] },
      { id: "ck-bride-earrings",        tab: "CHECKLIST", row: 28, cols: ["C"], label: "Earrings",        placeholders: ["status"] },
      { id: "ck-bride-bouquet",         tab: "CHECKLIST", row: 29, cols: ["C"], label: "Bridal bouquet",  placeholders: ["status"] },
      { id: "ck-bride-perfume",         tab: "CHECKLIST", row: 30, cols: ["C"], label: "Perfume",         placeholders: ["status"] },
    ],
  },
  {
    section: "Groom's essentials",
    icon: "person",
    meta: "CHECKLIST tab · status in column C",
    items: [
      { id: "ck-groom-suit",        tab: "CHECKLIST", row: 32, cols: ["C"], label: "Suit",        placeholders: ["status"] },
      { id: "ck-groom-shoes",       tab: "CHECKLIST", row: 33, cols: ["C"], label: "Shoes",       placeholders: ["status"] },
      { id: "ck-groom-belt",        tab: "CHECKLIST", row: 34, cols: ["C"], label: "Belt",        placeholders: ["status"] },
      { id: "ck-groom-watch",       tab: "CHECKLIST", row: 35, cols: ["C"], label: "Watch",       placeholders: ["status"] },
      { id: "ck-groom-perfume",     tab: "CHECKLIST", row: 36, cols: ["C"], label: "Perfume",     placeholders: ["status"] },
      { id: "ck-groom-boutonniere", tab: "CHECKLIST", row: 37, cols: ["C"], label: "Boutonniere", placeholders: ["status"] },
    ],
  },
  {
    section: "Couple's bag kit",
    icon: "luggage",
    meta: "CHECKLIST tab · status in column C",
    items: [
      { id: "ck-bag-tissue",       tab: "CHECKLIST", row: 39, cols: ["C"], label: "Tissue",                          placeholders: ["status"] },
      { id: "ck-bag-wet-wipes",    tab: "CHECKLIST", row: 40, cols: ["C"], label: "Wet wipes",                       placeholders: ["status"] },
      { id: "ck-bag-alcohol",      tab: "CHECKLIST", row: 41, cols: ["C"], label: "Alcohol",                         placeholders: ["status"] },
      { id: "ck-bag-candy-mint",   tab: "CHECKLIST", row: 42, cols: ["C"], label: "Candy / mint",                    placeholders: ["status"] },
      { id: "ck-bag-water",        tab: "CHECKLIST", row: 43, cols: ["C"], label: "Bottled water (straw for bride)", placeholders: ["status"] },
      { id: "ck-bag-mini-fan",     tab: "CHECKLIST", row: 44, cols: ["C"], label: "Mini electric fan",               placeholders: ["status"] },
      { id: "ck-bag-sanitary",     tab: "CHECKLIST", row: 45, cols: ["C"], label: "Sanitary napkin (bride)",         placeholders: ["status"] },
    ],
  },
  {
    section: "Suppliers — missing phone numbers",
    icon: "call",
    meta: "SUPPLIER'S LIST tab · phone in column D",
    items: [
      { id: "sup-catering-phone",   tab: "SUPPLIER'S LIST", row: 3,  cols: ["D"], label: "Catering — phone (Sac B Catering, Ms. Jean Rachel Luna)", placeholders: ["09xx-xxx-xxxx"] },
      { id: "sup-sounds-phone",     tab: "SUPPLIER'S LIST", row: 6,  cols: ["D"], label: "Sounds / Lights / Prod / Tech — phone (Kuya Marco)",      placeholders: ["09xx-xxx-xxxx"] },
      { id: "sup-photo-video-phone",tab: "SUPPLIER'S LIST", row: 8,  cols: ["D"], label: "Photo & video team — phone (Jath and Yhen PV)",           placeholders: ["09xx-xxx-xxxx"] },
      { id: "sup-cake-phone",       tab: "SUPPLIER'S LIST", row: 9,  cols: ["D"], label: "Cake — phone (Sac B Catering)",                            placeholders: ["09xx-xxx-xxxx"] },
      { id: "sup-venue-phone",      tab: "SUPPLIER'S LIST", row: 10, cols: ["D"], label: "Venue bldg admin — phone (Kuya Kester Catindig)",          placeholders: ["09xx-xxx-xxxx"] },
      { id: "sup-crew-meal-phone",  tab: "SUPPLIER'S LIST", row: 16, cols: ["D"], label: "Crew meal — phone (CCF host team)",                        placeholders: ["09xx-xxx-xxxx"] },
    ],
  },
  {
    section: "Suppliers — missing arrival times",
    icon: "schedule",
    meta: "SUPPLIER'S LIST tab · arrival in column E",
    items: [
      { id: "sup-sounds-arrival",       tab: "SUPPLIER'S LIST", row: 6,  cols: ["E"], label: "Sounds / Lights / Prod / Tech — arrival", placeholders: ["e.g. 5:00 AM"] },
      { id: "sup-photo-video-arrival",  tab: "SUPPLIER'S LIST", row: 8,  cols: ["E"], label: "Photo & video team — arrival",            placeholders: ["e.g. 5:00 AM"] },
      { id: "sup-cake-arrival",         tab: "SUPPLIER'S LIST", row: 9,  cols: ["E"], label: "Cake — arrival",                          placeholders: ["e.g. 10:00 AM"] },
      { id: "sup-venue-arrival",        tab: "SUPPLIER'S LIST", row: 10, cols: ["E"], label: "Venue bldg admin — arrival",              placeholders: ["e.g. 4:30 AM"] },
      { id: "sup-selfie-mirror1-arrival",tab: "SUPPLIER'S LIST", row: 11, cols: ["E"], label: "Selfie mirror #1 — arrival",             placeholders: ["e.g. 11:00 AM"] },
      { id: "sup-grazing-arrival",      tab: "SUPPLIER'S LIST", row: 12, cols: ["E"], label: "Grazing table #1 — arrival",              placeholders: ["e.g. 11:00 AM"] },
      { id: "sup-photoman-arrival",     tab: "SUPPLIER'S LIST", row: 13, cols: ["E"], label: "Photoman — arrival",                      placeholders: ["e.g. 11:00 AM"] },
      { id: "sup-selfie-mirror2-arrival",tab: "SUPPLIER'S LIST", row: 14, cols: ["E"], label: "Selfie mirror #2 — arrival",             placeholders: ["e.g. 11:00 AM"] },
      { id: "sup-guest-gift-arrival",   tab: "SUPPLIER'S LIST", row: 15, cols: ["E"], label: "Guest gift — arrival",                    placeholders: ["e.g. 11:00 AM"] },
      { id: "sup-crew-meal-arrival",    tab: "SUPPLIER'S LIST", row: 16, cols: ["E"], label: "Crew meal — arrival",                     placeholders: ["e.g. 11:00 AM"] },
    ],
  },
];

// Flat list — convenient for both rendering and sync logic.
const SHEET_ITEMS = SHEET_QUESTIONS.flatMap((g) => g.items);

// Build the destination caption shown under each question.
function destLabel(item) {
  const first = `${item.cols[0]}${item.row}`;
  const last  = `${item.cols[item.cols.length - 1]}${item.row}`;
  const range = item.cols.length === 1 ? first : `${first}:${last}`;
  return `→ ${item.tab} · ${range}`;
}

// Field id used for each column input. id-row-col matches the on-disk
// state shape so existing answers persist through this refactor.
function fieldIdFor(item, colIdx) {
  if (item.cols.length === 1) return item.id;
  // For song-* items the old shape used "-title" / "-link" suffixes — keep
  // those names so existing answers (e.g. "First Dance" title/link) survive.
  if (item.id.startsWith("song-") && item.cols[colIdx] === "B") return `${item.id}-title`;
  if (item.id.startsWith("song-") && item.cols[colIdx] === "C") return `${item.id}-link`;
  return `${item.id}-${item.cols[colIdx].toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Field definitions (the source of truth for the form)
// ---------------------------------------------------------------------------
const GROUPS = [
  {
    id: "ceremony-people",
    title: "Ceremony — People & Flow",
    fields: [
      { id: "officiant",                label: "Officiating Minister",                 type: "text",     hint: "Pastor / minister leading the ceremony" },
      { id: "honoringParentsSpeaker",   label: "Honoring Parents — speaker(s)",        type: "text" },
      { id: "communionDuringCeremony",  label: "Communion / Lord's Supper during ceremony?", type: "select",
        options: ["", "Yes — couple only", "Yes — couple + congregation", "No", "Still deciding"] },
    ],
  },
  {
    id: "ceremony-music",
    title: "Ceremony — Music",
    fields: [
      { id: "welcomingMusic1",          label: "Welcoming guests — instrumental #1",   type: "text",     hint: "Plays as guests arrive" },
      { id: "welcomingMusic2",          label: "Welcoming guests — instrumental #2",   type: "text" },
      { id: "chargingPSMusic",          label: "Ceremony music — notes & clarifications", type: "textarea",
        hint: "Bridal march, entourage track, charging of PS — anything beyond the SONGLIST sheet" },
    ],
  },
  {
    id: "ceremony-setup",
    title: "Ceremony — Setup at CCF East Ortigas",
    fields: [
      { id: "entranceArch",             label: "Entrance arch with curtain",           type: "select",   options: ["", "Yes — supplier provides", "Yes — venue provides", "No / not applicable", "Still deciding"] },
      { id: "aisleRunner",               label: "Aisle runner / carpet",                type: "text",    hint: "Color + supplier" },
      { id: "symbolsTableProvider",      label: "Symbols table — provided by",          type: "text" },
      { id: "candleStylingProvider",     label: "Candle holder & styling — provided by",type: "text" },
    ],
  },
  {
    id: "ceremony-pictorial",
    title: "Ceremony — Pictorial extras (altar, 11:00 AM)",
    fields: [
      { id: "pictorialExtras",          label: "Additional friend groups to include",  type: "textarea", hint: "e.g. HS friends, college blockmates, D-group, workmates — one group per line" },
    ],
  },

  {
    id: "reception-people",
    title: "Reception — People",
    fields: [
      { id: "host",                     label: "Host",                                 type: "text",     default: "Bryan Bustillo" },
      { id: "receptionOpeningPrayer",   label: "Opening Prayer at reception — who leads", type: "text" },
      { id: "brideIntermissionPerformer", label: "Bride's relatives intermission — performer", type: "text" },
      { id: "groomIntermissionPerformer", label: "Groom's relatives intermission — performer", type: "text" },
    ],
  },
  {
    id: "reception-music",
    title: "Reception — Music & Moments",
    fields: [
      { id: "firstDanceChoreo",         label: "First dance — choreographed?",         type: "select",   options: ["", "Yes — with choreo", "No — freestyle", "Still deciding"] },
      { id: "cocktailMusic",            label: "Cocktail hour music (12:00–12:30 PM)", type: "text",     hint: "Background music as guests arrive at reception" },
      { id: "bouquetTossSong",          label: "Bouquet toss song",                    type: "text" },
      { id: "closingSong",              label: "Closing song / song number",           type: "text",     hint: "Upbeat — guests get up and dance" },
      { id: "exitDance",                label: "Flash-mob exit dance — yes/no + song", type: "textarea", hint: "e.g. Yes — APT. by Bruno Mars × Rosé" },
      { id: "memoryVideoStatus",        label: "Memory video / AVP — status",          type: "text",     hint: "Who edits + when it plays" },
    ],
  },
  {
    id: "reception-games",
    title: "Reception — Games & Prizes",
    fields: [
      { id: "coupleTriviaPrizes",       label: "Game prizes — overall concept",        type: "textarea", hint: "Charlie's note: luxury-paper-bag DIY (Chanel → tsinelas, etc.), 2× of everything distributed across games" },
      { id: "bringMeToJerusalemPrizes", label: "Bring Me to Jerusalem — items + prize",type: "textarea" },
      { id: "preProgramGamePrizes",     label: "Pre-program game prizes",              type: "textarea", hint: "Name That Tune / Trivia during cocktail hour" },
    ],
  },
  {
    id: "reception-experience",
    title: "Reception — Guest Experience",
    fields: [
      { id: "dressCodeGuests",          label: "Dress code for guests",                type: "text",     hint: "Formal? Semi-formal? Theme colors?" },
      { id: "sendOffStyle",             label: "Send-off style (end of reception)",    type: "select",
        options: ["", "Sparklers", "Bubbles", "Petals", "Confetti", "Guests holding sparklers (tunnel)", "No formal send-off", "Still deciding"] },
    ],
  },

  {
    id: "couple-trivia",
    title: "Couple Story (for host & games)",
    fields: [
      { id: "endearment",               label: "What you call each other",             type: "text",     hint: "babe / bub / etc." },
      { id: "petNames",                 label: "Pet names (if any)",                   type: "text" },
      { id: "whereTheyMet",             label: "Where you met",                        type: "text" },
      { id: "bfgfAnniversary",          label: "BF/GF anniversary",                    type: "text",     hint: "Date you became official" },
      { id: "yearsTogether",            label: "Years together (by wedding day)",      type: "text" },
      { id: "proposalLocation",         label: "Where he proposed",                    type: "text" },
      { id: "proposalDate",             label: "Date of proposal",                     type: "text" },
      { id: "firstDateSpot",            label: "First date location",                  type: "text" },
      { id: "memorableTrip",            label: "Most memorable trip together",         type: "text" },
      { id: "favoriteSnack",            label: "Favorite shared snack / drink",        type: "text" },
      { id: "charlieJob",               label: "Charlie's work / day job",             type: "text" },
      { id: "karlaJob",                 label: "Karla's work / day job",               type: "text" },
      { id: "firstILoveYou",            label: "First 'I love you' — who + where",     type: "text" },
      { id: "favoriteShow",             label: "Favorite shared show / movie",         type: "text" },
      { id: "insideJoke",               label: "Inside joke / shared catchphrase",     type: "text" },
      { id: "lifeVerse",                label: "Couple's life verse / Bible passage",  type: "text",     hint: "Mentioned by host or printed on monogram" },
      { id: "honeymoonDestination",     label: "Honeymoon destination (private if you want)", type: "text" },
      { id: "otherFunFacts",            label: "Other fun facts for the host",         type: "textarea" },
    ],
  },

  {
    id: "wellwishers",
    title: "Well-wishers (designated program speakers)",
    fields: [
      { id: "wellWishersSpecial",       label: "Designated speakers",                  type: "textarea", hint: "Best Man, Maid of Honor, special guests, etc." },
    ],
  },

  {
    id: "suppliers",
    title: "Suppliers to acknowledge at closing",
    fields: [
      { id: "supplierCatering",         label: "Catering",                             type: "text" },
      { id: "supplierCake",             label: "Cake",                                 type: "text" },
      { id: "supplierSound",            label: "Sound / DJ",                           type: "text" },
      { id: "supplierPhoto",            label: "Photographer (formal)",                type: "text",     hint: "e.g. Jath & Yen" },
      { id: "supplierPhotoman",         label: "Photoman (roving / candid)",           type: "text",     hint: "e.g. MI6 — sponsored by Ninong Melvin + Ninang Jerdin Catanghal" },
      { id: "supplierVideo",            label: "Videographer",                         type: "text" },
      { id: "supplierSDE",              label: "Same-Day Edit team",                   type: "text" },
      { id: "supplierHMUA",             label: "HMUA",                                 type: "text" },
      { id: "supplierFlorist",          label: "Florist / stylist",                    type: "text" },
      { id: "supplierLights",           label: "Lights / LED wall",                    type: "text" },
      { id: "supplierPhotobooth",       label: "Photobooth (or 'none')",               type: "text" },
      { id: "supplierGown",             label: "Bride's gown — designer / supplier",   type: "text" },
      { id: "supplierTuxBarong",        label: "Groom's tux / barong — supplier",      type: "text" },
      { id: "supplierRings",            label: "Wedding rings — jeweler",              type: "text" },
      { id: "supplierBridalCar",        label: "Bridal car / transportation",          type: "text" },
      { id: "supplierOther",            label: "Other suppliers + special thanks",     type: "textarea" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Suggestion chips — clickable presets per field.
// Songs lean recent (2023–2026); worship first (CCF wedding), then pop/OPM/solemn.
// Text fields: chip click REPLACES the value. Textarea: chip APPENDS as a new line.
// ---------------------------------------------------------------------------
const SUGGESTIONS = {
  // ----- Ceremony — People & Flow
  officiant: [
    "Pastor Julius Rayala",
    "CCF East Ortigas pastor on duty",
    "Family pastor / D-group leader",
  ],
  honoringParentsSpeaker: [
    "Couple together",
    "Charlie speaks to both sets of parents",
    "Karla speaks to both sets of parents",
    "Officiant on the couple's behalf",
  ],

  // ----- Ceremony — Music (lean recent worship)
  welcomingMusic1: [
    "Goodness of God — Bethel piano instrumental",
    "Build My Life — Pat Barrett (piano instrumental)",
    "Same God — Elevation Worship (piano instrumental)",
    "Holy Forever — Chris Tomlin (piano instrumental)",
    "House of the Lord — Phil Wickham (piano instrumental)",
    "The Piano Guys — Hymns medley",
  ],
  welcomingMusic2: [
    "Million Little Miracles — Maverick City × UPPERROOM (instrumental)",
    "Gratitude — Brandon Lake (piano instrumental)",
    "I Speak Jesus — Charity Gayle (instrumental)",
    "Praise — Elevation Worship (instrumental)",
    "The Blessing — Kari Jobe (violin instrumental)",
    "Way Maker — Sinach (piano instrumental)",
  ],
  chargingPSMusic: [
    "Bridal march: Goodness of God (bride only)",
    "Entourage: James Wong — Still × Oceans × Goodness of God × How Great Is Our God × What A Beautiful Name",
    "Charging of PS: violin instrumental (TBD)",
    "Recessional: I Get to Love You — Ruelle",
  ],

  // ----- Ceremony — Setup (aisle runner with COLOR chips per Charlie's ask)
  aisleRunner: [
    "Burgundy / wine — Sac B Catering",
    "Cream / ivory — Sac B Catering",
    "White carpet — Sac B Catering",
    "Sage green — Sac B Catering",
    "Blush pink — Sac B Catering",
    "Terracotta — Sac B Catering",
    "Eucalyptus path (no runner)",
    "Petals scattered (no runner)",
  ],
  symbolsTableProvider: [
    "Sac B Catering (styling)",
    "Florist — James Patacsil + Heleaena Luv Romantico",
    "CCF East Ortigas (venue-provided)",
    "Couple supplies",
  ],
  candleStylingProvider: [
    "Sac B Catering (styling)",
    "Florist — James Patacsil + Heleaena Luv Romantico",
    "CCF East Ortigas (venue-provided)",
    "Couple supplies",
  ],

  // ----- Pictorial extras
  pictorialExtras: [
    "Charlie's HS friends",
    "Karla's HS friends",
    "Charlie's college blockmates",
    "Karla's college blockmates",
    "Karla's Aventus workmates",
    "Karla's D-group + downline",
    "Couples group",
    "CCF churchmates",
  ],

  // ----- Reception — People
  host: [
    "Bryan Bustillo",
  ],
  receptionOpeningPrayer: [
    "Christian Ilao (PS)",
    "Joshua Obillo (PS)",
    "Best Man — Charles Michael Cayno",
    "Officiating Minister — Pastor Julius Rayala",
    "Family pastor / D-group leader",
  ],
  brideIntermissionPerformer: [
    "Alman & Jharmaine — joint performance",
    "Karla solo song number",
    "Karla's siblings — joint message",
    "MOH + bridesmaids tribute",
  ],
  groomIntermissionPerformer: [
    "Alman & Jharmaine — joint performance",
    "Groomsmen dance number",
    "Charlie solo song number",
    "Best Man comedy bit",
  ],

  // ----- Reception — Music & Moments
  cocktailMusic: [
    "Acoustic worship covers playlist",
    "Lo-fi worship beats",
    "Norah Jones / Michael Bublé jazz lounge",
    "James Wong Christian mashup (looped)",
    "Bossa nova worship covers",
  ],
  bouquetTossSong: [
    "Single Ladies — Beyoncé",
    "Marry You — Bruno Mars",
    "Wannabe — Spice Girls",
    "Can't Get Enough of Your Love — Barry White",
    "Hot in Herre — Nelly",
  ],
  // Upbeat 80s / disco / dance party hits per Charlie's "tayoy magsayaw" brief
  closingSong: [
    "Dancing Queen — ABBA",
    "September — Earth, Wind & Fire",
    "I Wanna Dance With Somebody — Whitney Houston",
    "YMCA — Village People",
    "Footloose — Kenny Loggins",
    "Sweet Caroline — Neil Diamond",
    "Don't Stop Believin' — Journey",
    "Living on a Prayer — Bon Jovi",
    "I Will Survive — Gloria Gaynor",
    "Uptown Funk — Bruno Mars",
    "Can't Stop the Feeling — Justin Timberlake",
    "Pamilya Ko — KZ Tandingan",
  ],
  exitDance: [
    "Yes — Apt. by Bruno Mars × ROSÉ",
    "Yes — Magnetic by ILLIT",
    "Yes — Espresso by Sabrina Carpenter",
    "Yes — Pantropiko by BINI",
    "Yes — Pamilya Ko by KZ Tandingan",
    "Skip — couple exits to upbeat playlist instead",
  ],
  memoryVideoStatus: [
    "Edited by couple — plays during cocktail hour",
    "Edited by Jath & Yen — plays during dinner",
    "Edited by couple — plays before SDE",
    "Not yet started — Jath & Yen confirming timeline",
  ],

  // ----- Reception — Games & Prizes
  coupleTriviaPrizes: [
    "Luxury-paper-bag DIY (Chanel → tsinelas, Penshoppe → Pen, Dior → Rexona, Power Mac → Mac apple, EO → Efficascent, SM → Sinigang Mix, Champion → powder, Lego → Ligo sardines, Starbucks → Kopiko, Regatta → gata)",
    "Tiered cash: ₱100 / ₱200 / ₱500 across all games",
    "Mini gift bags + cash per correct answer",
  ],
  bringMeToJerusalemPrizes: [
    "Same luxury-paper-bag DIY pool (2× of everything distributed across games)",
    "₱100 cash per item brought, ₱500 bonus for completing the list",
    "Mystery gift bag per item",
  ],
  preProgramGamePrizes: [
    "Name That Tune — luxury-paper-bag DIY (smaller tier)",
    "Name That Tune — 5 sets of ₱500 cash",
    "Trivia warm-up — 10 sets of ₱100 cash",
  ],

  // ----- Reception — Guest Experience
  dressCodeGuests: [
    "Semi-formal — burgundy / sage / cream encouraged",
    "Formal — long gown / coat & tie",
    "Garden formal",
    "Cocktail attire",
    "No theme — come as you are",
  ],

  // ----- Couple Story (for host & games)
  endearment: [
    "Bubu (Karla) & Dudu (Charlie)",
    "Bebi",
    "Love",
    "Babe",
    "Mahal",
  ],
  petNames: [
    "Bubu, Dudu",
    "Bebi",
    "Babe / Love",
    "(none — just first names)",
  ],
  whereTheyMet: [
    "Church / CCF", "College", "Mutual friend", "D-group / Lifegroup", "Work",
  ],
  proposalLocation: [
    "Burger King (Charlie's actual answer)",
    "Tagaytay", "Baguio", "At home", "Beach getaway", "Surprise restaurant",
  ],
  firstDateSpot: [
    "Antipolo",
    "Coffee shop", "SM / mall date", "Picnic at the park", "Movie date",
  ],
  memorableTrip: [
    "Baguio",
    "Tagaytay weekend",
    "Beach (Boracay / Palawan / La Union)",
    "Hong Kong / Japan / Korea trip",
    "Engagement trip",
  ],
  favoriteSnack: [
    "Mocha",
    "Boba / milk tea",
    "Korean street food (tteokbokki + cheese)",
    "Coffee + pandesal",
    "Sushi / Japanese",
  ],
  charlieJob: [
    "Senior Salesforce LWC developer (Azur Technology)",
    "Software engineer",
    "Web developer",
  ],
  karlaJob: [
    "Aventus",
    "Real estate (Aventus)",
    "Sales / business development",
  ],
  firstILoveYou: [
    "Charlie said it first — at our first date in Antipolo",
    "Karla said it first — at home",
    "We said it together",
    "Charlie said it first — November 1, 2024 when we made it official",
  ],
  favoriteShow: [
    "How I Met Your Mother",
    "Friends",
    "Stranger Things",
    "Studio Ghibli films",
    "K-drama marathon nights",
    "Anime — Anohana / Towa no Yuugure",
  ],
  insideJoke: [
    "Bubu & Dudu (Bubududu) inside joke",
    "Couple meme / catchphrase only we get",
    "Pet phrase from a movie / show we love",
  ],
  lifeVerse: [
    "Ecclesiastes 4:9–12 — Two are better than one",
    "Joshua 24:15 — As for me and my household, we will serve the Lord",
    "1 Corinthians 13:4–7 — Love is patient, love is kind",
    "Proverbs 3:5–6 — Trust in the Lord with all your heart",
    "Jeremiah 29:11 — For I know the plans I have for you",
    "Philippians 4:13 — I can do all things through Christ",
  ],
  honeymoonDestination: [
    "Local — Boracay / Palawan / Siargao",
    "Japan",
    "Korea",
    "Bali",
    "Europe",
    "Surprise destination",
    "Private — keeping it to ourselves",
  ],
  otherFunFacts: [
    "Charlie codes for fun — built this collaterals studio himself",
    "Karla works in real estate — Aventus",
    "We're both CCF kids",
    "Our shared hobby — playing games together",
    "We have a couples-group barkada",
  ],

  // ----- Well-wishers (trimmed to just designated speakers)
  wellWishersSpecial: [
    "Best Man — Charles Michael Cayno",
    "Maid of Honor — Heleaena Luv Romantico",
    "Camille & Mitzi — Bridesmaids",
    "D-group / Lifegroup leader",
    "Couples-group barkada",
  ],

  // ----- Suppliers (chips reflect Charlie's actual answers + common picks)
  supplierCatering:  ["Sac B Catering"],
  supplierCake:      ["Sac B Catering"],
  supplierSound:     ["CCF Tech Team"],
  supplierPhoto:     ["Jath & Yen"],
  supplierPhotoman:  ["MI6 — sponsored by Ninong Melvin + Ninang Jerdin Catanghal"],
  supplierVideo:     ["Jath & Yen"],
  supplierSDE:       ["Jath & Yen"],
  supplierHMUA:      ["Beyouthiful by Niks"],
  supplierFlorist:   ["James Patacsil + Heleaena Luv Romantico"],
  supplierLights:    ["CCF Tech Team"],
  supplierPhotobooth:["none — Photoman MI6 covers candids"],
  supplierOther: [
    "M&M Coordination Team — actual on-the-day coordinator",
    "Therese Galasa — CCF church coordinator (special thanks)",
    "Ate Carmela & Kuya Alexis — wedding-planning help",
    "Christian & Maui Ilao — D-group leaders of the newly-wed",
  ],
  supplierGown: [
    "Veluz Reyes",
    "Hannah Kong",
    "Mak Tumang",
    "Custom — local designer (TBD)",
    "Rented from a bridal shop",
  ],
  supplierTuxBarong: [
    "Francis Libiran",
    "Custom-tailored barong",
    "John Pradel",
    "Rented suit",
  ],
  supplierRings: [
    "Suy Jewelry",
    "Janrey Jewelry",
    "Gold & Honey",
    "Family heirloom rings",
    "Custom-designed by couple",
  ],
  supplierBridalCar: [
    "Vintage car rental",
    "Family-owned car",
    "Borrowed from a friend",
    "Bridal car supplier (TBD)",
  ],
};

// Flatten for quick lookups + progress math.
const ALL_FIELDS = GROUPS.flatMap((g) => g.fields.map((f) => ({ ...f, _group: g.id })));
const TOTAL = ALL_FIELDS.length;

// ---------------------------------------------------------------------------
// State (local mirror of the remote object)
// ---------------------------------------------------------------------------
let state = {};

function applyDefaults(s) {
  for (const f of ALL_FIELDS) {
    if (f.default !== undefined && (s[f.id] === undefined || s[f.id] === "")) {
      s[f.id] = f.default;
    }
  }
  return s;
}

function isFilled(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fieldEl(f) {
  const val = state[f.id] ?? "";
  const filled = isFilled(val);
  let control = "";
  if (f.type === "textarea") {
    control = `<textarea data-field="${f.id}" rows="2">${escapeHtml(val)}</textarea>`;
  } else if (f.type === "select") {
    const opts = (f.options || []).map((o) => {
      const label = o === "" ? "— select —" : o;
      const sel = o === val ? "selected" : "";
      return `<option value="${escapeHtml(o)}" ${sel}>${escapeHtml(label)}</option>`;
    }).join("");
    control = `<select data-field="${f.id}">${opts}</select>`;
  } else {
    control = `<input type="text" data-field="${f.id}" value="${escapeHtml(val)}" />`;
  }

  let chipsHtml = "";
  const chips = SUGGESTIONS[f.id];
  if (chips && f.type !== "select") {
    const mode = f.type === "textarea" ? "append" : "replace";
    chipsHtml = `
      <div class="chip-row" data-mode="${mode}">
        <span class="chip-label">ideas:</span>
        ${chips.map((s) => `<button type="button" class="chip" data-suggest="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}
      </div>`;
  }

  return `
    <div class="field ${filled ? "filled" : ""}" data-field-wrap="${f.id}">
      <label><span class="dot"></span>${escapeHtml(f.label)}</label>
      ${control}
      ${f.hint ? `<div class="hint">${escapeHtml(f.hint)}</div>` : ""}
      ${chipsHtml}
    </div>`;
}

function groupCounter(group) {
  const total = group.fields.length;
  const filled = group.fields.filter((f) => isFilled(state[f.id])).length;
  let cls = "pending";
  if (filled === total) cls = "full";
  else if (filled > 0) cls = "partial";
  return { html: `<span class="group-counter ${cls}">${filled} / ${total}</span>`, filled, total, cls };
}

function renderForm() {
  const root = document.getElementById("form-root");
  root.innerHTML = GROUPS.map((g) => {
    const c = groupCounter(g);
    // Default: open the first 2 groups, collapse the rest so first paint isn't a wall.
    const openAttr = GROUPS.indexOf(g) < 2 ? "open" : "";
    return `
      <details class="group" data-group="${g.id}" ${openAttr}>
        <summary>
          <span>${escapeHtml(g.title)}</span>
          ${c.html}
        </summary>
        <div class="group-body">
          ${g.fields.map(fieldEl).join("")}
        </div>
      </details>`;
  }).join("");

  // Wire input handlers
  root.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("input", onFieldChange);
    el.addEventListener("change", onFieldChange);
  });
  // Wire suggestion-chip clicks
  root.querySelectorAll(".chip").forEach((el) => {
    el.addEventListener("click", onChipClick);
  });
  renderProgress();
}

function onChipClick(e) {
  e.preventDefault();
  e.stopPropagation(); // don't bubble into the to-do item's collapse handler
  const chip = e.currentTarget;
  // Chips live in two places: the main form (.field[data-field-wrap]) AND the
  // inline to-do editor (.todo-item[data-todo]). Find whichever container
  // wraps this chip and grab its <input/textarea> by data-field.
  const wrap = chip.closest("[data-field-wrap], [data-todo]");
  if (!wrap) return;
  const input = wrap.querySelector("[data-field]");
  if (!input) return;
  const mode = chip.parentElement.dataset.mode || "replace";
  const text = chip.dataset.suggest;
  if (mode === "append") {
    const cur = (input.value || "").trim();
    input.value = cur ? `${cur}\n${text}` : text;
  } else {
    input.value = text;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

function renderProgress() {
  const filled = ALL_FIELDS.filter((f) => isFilled(state[f.id])).length;
  const pct = Math.round((filled / TOTAL) * 100);
  document.getElementById("dp-fill").style.width = pct + "%";
  document.getElementById("dp-pct").textContent = pct + "%";
  document.getElementById("dp-summary").textContent = `${filled} of ${TOTAL} fields filled`;

  // Refresh per-group counters and per-field dots without re-rendering inputs
  // (so the user doesn't lose focus while typing).
  for (const g of GROUPS) {
    const detailsEl = document.querySelector(`[data-group="${g.id}"]`);
    if (!detailsEl) continue;
    const counterEl = detailsEl.querySelector(".group-counter");
    const { filled, total, cls } = groupCounter(g);
    if (counterEl) {
      counterEl.className = `group-counter ${cls}`;
      counterEl.textContent = `${filled} / ${total}`;
    }
  }
  for (const f of ALL_FIELDS) {
    const wrap = document.querySelector(`[data-field-wrap="${f.id}"]`);
    if (!wrap) continue;
    wrap.classList.toggle("filled", isFilled(state[f.id]));
  }
  renderTodo();
  renderPreviews();
}

// Pinned "still to fill" card — every empty field is a chip that expands
// into an inline editor on click. No scroll required.
const _expandedTodos = new Set();

function shortTagFor(groupId) {
  const g = GROUPS.find((gg) => gg.id === groupId);
  if (!g) return "";
  const m = g.title.match(/^([^—]+)—\s*(.+)$/);
  return m ? m[2].trim() : g.title;
}

let _lastTodoKey = "";

function renderTodo() {
  const card = document.getElementById("todo-card");
  const list = document.getElementById("todo-list");
  const countEl = document.getElementById("todo-count");
  const pluralEl = document.getElementById("todo-plural");
  if (!card || !list) return;

  // Show every still-empty field PLUS any field that's currently expanded
  // (even if just filled in) so the user can finish editing without the DOM
  // rebuilding under their cursor. Expanded-but-filled items collapse the
  // next time the user explicitly clicks to close them.
  const visible = ALL_FIELDS.filter(
    (f) => !isFilled(state[f.id]) || _expandedTodos.has(f.id),
  );
  // Use visible-set + expanded-set as the rebuild signature.
  const key = visible.map((f) => f.id).join("|") + "::" + [..._expandedTodos].sort().join("|");
  if (key === _lastTodoKey) return;
  _lastTodoKey = key;
  // Count only the genuinely-empty fields for the header pill.
  const emptiesOnly = visible.filter((f) => !isFilled(state[f.id]));

  if (visible.length === 0) {
    card.hidden = false;
    countEl.textContent = "0";
    pluralEl.textContent = "s";
    list.innerHTML = `<div class="todo-empty">
        <span class="material-symbols-outlined" style="font-size:18px">check_circle</span>
        Everything's filled in. 🎉 Nice work.
      </div>`;
    return;
  }
  card.hidden = false;
  countEl.textContent = String(emptiesOnly.length);
  pluralEl.textContent = emptiesOnly.length === 1 ? "" : "s";

  list.innerHTML = visible.map((f) => todoItemHtml(f)).join("");

  list.querySelectorAll(".todo-item").forEach((el) => {
    el.addEventListener("click", onTodoClick);
  });
  // Re-wire any inline editor inputs (when an item starts expanded after a re-render)
  list.querySelectorAll(".todo-edit [data-field]").forEach((el) => {
    el.addEventListener("input", onFieldChange);
    el.addEventListener("change", onFieldChange);
  });
  list.querySelectorAll(".todo-edit .chip").forEach((el) => {
    el.addEventListener("click", onChipClick);
  });
}

function todoItemHtml(f) {
  const expanded = _expandedTodos.has(f.id);
  const filled = isFilled(state[f.id]);
  const editor = expanded ? inlineEditorHtml(f) : "";
  const status = filled
    ? `<span class="material-symbols-outlined" style="font-size:14px;color:#4f6630;margin-left:auto">check_circle</span>`
    : "";
  return `
    <div class="todo-item ${expanded ? "editing" : ""} ${filled ? "filled" : ""}" data-todo="${f.id}">
      <span class="group-tag">${escapeHtml(shortTagFor(f._group))}</span>
      <span class="todo-chip-label">${escapeHtml(f.label)}</span>
      ${status}
      <div class="todo-edit">${editor}</div>
    </div>`;
}

function inlineEditorHtml(f) {
  const val = state[f.id] ?? "";
  let control = "";
  if (f.type === "textarea") {
    control = `<textarea data-field="${f.id}" rows="2">${escapeHtml(val)}</textarea>`;
  } else if (f.type === "select") {
    const opts = (f.options || []).map((o) => {
      const label = o === "" ? "— select —" : o;
      const sel = o === val ? "selected" : "";
      return `<option value="${escapeHtml(o)}" ${sel}>${escapeHtml(label)}</option>`;
    }).join("");
    control = `<select data-field="${f.id}">${opts}</select>`;
  } else {
    control = `<input type="text" data-field="${f.id}" value="${escapeHtml(val)}" placeholder="Type your answer…" />`;
  }
  let chips = "";
  const list = SUGGESTIONS[f.id];
  if (list && f.type !== "select") {
    const mode = f.type === "textarea" ? "append" : "replace";
    chips = `<div class="chip-row" data-mode="${mode}">
        ${list.map((s) => `<button type="button" class="chip" data-suggest="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}
      </div>`;
  }
  return `
    ${control}
    ${f.hint ? `<div class="hint">${escapeHtml(f.hint)}</div>` : ""}
    ${chips}
    <div class="save-status" data-save="${f.id}">tap a suggestion or type — auto-saves</div>
  `;
}

function onTodoClick(e) {
  // Don't toggle when the user clicks inside the editor (input, textarea, chip)
  if (e.target.closest(".todo-edit")) return;
  const item = e.currentTarget;
  const id = item.dataset.todo;
  if (_expandedTodos.has(id)) {
    _expandedTodos.delete(id);
  } else {
    _expandedTodos.add(id);
  }
  renderTodo();
  if (_expandedTodos.has(id)) {
    // Focus the newly rendered input
    setTimeout(() => {
      const input = document.querySelector(`.todo-item[data-todo="${id}"] [data-field]`);
      if (input) input.focus();
    }, 30);
  }
}

// ---------------------------------------------------------------------------
// Polish overrides — render messy working-notes as clean program text in the
// preview panes WITHOUT modifying the Firebase data (Charlie's raw answers
// stay intact in the form). Each override receives the raw value and returns
// the polished display string.
// ---------------------------------------------------------------------------
const POLISH = {
  aisleRunner: () => "Color TBD — Sac B Catering (styling)",
  symbolsTableProvider: () => "Sac B Catering",
  candleStylingProvider: () => "Sac B Catering",
  chargingPSMusic: () => "Violin instrumental — TBD",
  closingSong: () =>
    "TBD — upbeat 80s / disco selection (e.g. Dancing Queen · September · YMCA · Sweet Caroline)",
  exitDance: () => "TBD — upbeat (e.g. APT. by Bruno Mars × ROSÉ)",
  bringMeToJerusalemPrizes: () =>
    "Same luxury-paper-bag DIY pool (2× of everything, distributed across games)",
  coupleTriviaPrizes: () =>
    "Luxury-paper-bag DIY pool — Chanel → tsinelas · Penshoppe → pens · Dior → Rexona sachet · Power Mac → Mac apple · EO → Efficascent · SM → Sinigang Mix · Champion → powder · Lego → Ligo sardines · Starbucks → Kopiko · Regatta → gata",
  preProgramGamePrizes: () =>
    "Name That Tune — prize pool TBD (smaller tier of the luxury-bag pool)",
  prosperityBoxNote: () =>
    "Cash envelopes — coordinator collects discreetly (no front-stage queue)",
  wellWishersSpecial: () =>
    "Maid of Honor — Heleaena Luv Romantico\nCamille & Mitzi — Bridesmaids",
  endearment: () =>
    "Bubu (Karla) & Dudu (Charlie) — first endearment 'Bebi', also call each other 'Love'",
  petNames: () => "Bubu, Dudu",
  yearsTogether: () => "Since November 1, 2024 (~1 year 8 months by wedding day)",
  bfgfAnniversary: () => "November 1, 2024",
  supplierPhoto: () => "Jath & Yen (formal photography)",
  supplierPhotobooth: () =>
    "None — Photoman MI6 covers candids (sponsored by Ninong Melvin & Ninang Jerdin Catanghal)",
  supplierOther: () =>
    "M&M Coordination Team — actual on-the-day coordinator\nTherese Galasa — CCF church coordinator (special thanks)\nAte Carmela & Kuya Alexis — wedding-planning support\nChristian & Maui Ilao — D-group leaders of the newly-wed",
  honoringParentsSpeaker: () => "Charlie & Karla together",
  otherFunFacts: (raw) => (raw || "").trim() || "—",
  pictorialExtras: (raw) =>
    (raw || "").trim() || "(none — default pictorial sequence only)",
};

// Read state for the preview, applying POLISH if defined for that key.
function display(key, fallback = "TBD") {
  const raw = (state[key] || "").trim();
  const override = POLISH[key];
  if (override) {
    const out = override(raw);
    return out && out.trim() ? out : fallback;
  }
  return raw || fallback;
}

function tbdSpan(label) {
  return `<span class="tbd">${escapeHtml(label)}</span>`;
}

function v(key, fallback = null) {
  // For the preview, mark missing OR raw-only (no polish) blank with a TBD pill.
  const raw = (state[key] || "").trim();
  const override = POLISH[key];
  if (override) return escapeHtml(override(raw));
  if (raw) return escapeHtml(raw);
  return fallback ? escapeHtml(fallback) : tbdSpan("TBD");
}

// ---------------------------------------------------------------------------
// Preview renderers — ceremony + reception in their final program shapes
// ---------------------------------------------------------------------------
const PRINCIPAL_SPONSORS = [
  ["Mr. Joshua Obillo", "Mrs. Mary Grace Francisco"],
  ["Mr. Clettes Obillo", "Mrs. Sherill Obillo"],
  ["Mr. Zhardo Nofiel", "Mrs. Cristina Nofiel"],
  ["Mr. Amante Andal", "Mrs. Aylene Andal"],
  ["Mr. Vanie Madrazo", "Mrs. Judith Zamora"],
  ["Mr. Christian Ilao", "Mrs. Maui Rochelle Ilao"],
  ["Mr. Alexis Perez", "Mrs. Carmela Perez"],
  ["Mr. Melvin Catanghal", "Mrs. Jerdin Catanghal"],
  ["Mr. Kharl John Rayala", "Mrs. Jael Rayala"],
  ["Mr. Aldine Mercado", "Mrs. Sharmaine Mercado"],
  ["Mr. Ivan Gomez", "Mrs. Sheniah Gomez"],
];
const GROOMSMEN_BRIDESMAIDS = [
  ["King David Gomez", "Camille Grace Cayabyab"],
  ["James Patacsil", "Mitzi Marzan"],
  ["Peter Carl Pardo", "Angelica Macalalad"],
  ["Matt Joshua Cabezas", "Quiana Anneliese Bernardo"],
  ["Albert Kobe Serrano", "Alyssa Moira Mangubat"],
  ["Eutemio Josef Romantico", "Diane Faith Adviento"],
];

function renderCeremonyPreview() {
  const root = document.getElementById("preview-ceremony-body");
  if (!root) return;

  const pictorialExtrasRaw = display("pictorialExtras", "");
  const extras = (pictorialExtrasRaw || "")
    .split("\n").map((s) => s.trim()).filter(Boolean);

  root.innerHTML = `
    <div class="prog">
      <div class="prog-title">CHARLIE AND KARLA'S WEDDING CEREMONY</div>
      <div class="prog-subtitle">July 2, 2026  ·  10:00 AM  ·  CCF East Ortigas</div>
      <div class="prog-credits">Officiating Minister: ${v("officiant", "Pastor Julius Rayala")}  ·  OTD: M&M Coordination Team</div>

      <div class="prog-h">WELCOMING GUESTS</div>
      <p><b>Music:</b></p>
      <ul>
        <li>${v("welcomingMusic1")}</li>
        <li>${v("welcomingMusic2")}</li>
      </ul>

      <div class="prog-h">SINGSPIRATION — 9:45 AM</div>
      <p class="note">Before the processional starts</p>
      <p>Music: GOODNESS OF GOD instrumental (5 mins)</p>

      <div class="prog-divider">—  10:00 AM CEREMONY STARTS  —</div>

      <p><b>PROCESSIONAL MUSIC (entourage)</b></p>
      <p>James Wong — Still × Oceans × Goodness of God × How Great Is Our God × What A Beautiful Name</p>
      <p class="note" style="font-size:0.78rem">→ <a href="https://open.spotify.com/track/3ONiW6sQywR1J8y1Io8Qto" target="_blank" rel="noopener">open.spotify.com/track/3ONiW6sQywR1J8y1Io8Qto</a></p>

      <div class="prog-h">PROCESSIONAL ORDER</div>
      <div class="lineup-row"><span class="lineup-role">Officiating Minister:</span> ${v("officiant", "Pastor Julius Rayala")}</div>
      <div class="lineup-row"><span class="lineup-role">Groom's Parents:</span> Mr. Fernando Cayno & Mrs. Arlene Cayno</div>
      <br>
      <div class="lineup-row"><span class="lineup-role">Groom:</span> MR. CHARLIE MICHAEL CAYNO</div>
      <div class="lineup-row"><span class="lineup-role">Best Man:</span> Mr. Charles Michael Cayno</div>
      <br>
      <p><b>Principal Sponsors: 11 pairs</b></p>
      <ul>
        ${PRINCIPAL_SPONSORS.map(([m, w]) => `<li>${escapeHtml(m)}  &  ${escapeHtml(w)}</li>`).join("")}
      </ul>

      <p><b>Secondary Sponsors</b></p>
      <div class="lineup-row"><span class="lineup-role">Candle:</span> Mr. Vince Francisco & Ms. Chloe Obillo</div>
      <div class="lineup-row"><span class="lineup-role">Veil:</span> Mr. Rainer John Alabado & Ms. Cayla Ochoa</div>
      <div class="lineup-row"><span class="lineup-role">Cord:</span> Mr. Peter Pardo & Ms. Angelica Macalalad</div>

      <p style="margin-top:10px"><b>Special Secondary Sponsors</b></p>
      <div class="lineup-row" style="padding-left:14px">Mr. Joshua Obillo  &  Mr. Clettes Obillo</div>

      <p style="margin-top:10px"><b>Groomsmen & Bridesmaids</b></p>
      <ul>
        ${GROOMSMEN_BRIDESMAIDS.map(([g, b]) => `<li>Mr. ${escapeHtml(g)}  &  Ms. ${escapeHtml(b)}</li>`).join("")}
      </ul>

      <p><b>Bearers of the Symbols</b></p>
      <div class="lineup-row"><span class="lineup-role">Ring:</span> Pierce Raven Francisco</div>
      <div class="lineup-row"><span class="lineup-role">Coin:</span> Annika Merana & Cy Matthieu Cayno</div>
      <div class="lineup-row"><span class="lineup-role">Bible:</span> Lance Ailen Grey Francisco</div>

      <p style="margin-top:10px"><b>Flower Girls</b></p>
      <ul>
        <li>Sienna Bri Catanghal</li>
        <li>Shehani Hiraya Gomez</li>
        <li>Minea Obillo</li>
      </ul>
      <p><b>Flower Boy:</b> Jonathan Primo Manalo</p>

      <p style="margin-top:10px"><span class="lineup-role">Maid of Honor:</span> Ms. Heleaena Luv Romantico</p>
      <p><span class="lineup-role">Bride's Parents:</span> Mr. Wilfredo Romantico & Mrs. Honey Dawn Romantico</p>

      <p class="note" style="text-align:center;margin-top:8px">(PARENTS WILL STOP AT THE MIDDLE AND WILL WAIT FOR THE BRIDE)</p>

      <p style="text-align:center;margin-top:8px"><b>BRIDAL MARCH SONG: GOODNESS OF GOD (instrumental — bride only)</b></p>
      <p><span class="lineup-role">Bride:</span> MRS. KARLA SOFIA ROMANTICO-CAYNO</p>

      <div class="prog-h" style="text-align:center;margin-top:18px">CHARLIE AND KARLA'S CEREMONY PROPER</div>
      <p class="note" style="text-align:center;font-size:0.82rem">Liturgy led by Pastor Julius Rayala (welcome, prayer, scripture, message, testimony, and pronouncement all part of his portion).</p>

      <ul style="list-style:none;padding-left:0">
        <li><b>INTRODUCTION AND DECLARATION OF PURPOSE</b><br><span class="note">Background: bridal-march instrumental continues</span></li>
        <li style="margin-top:6px"><b>PASTOR'S WELCOME, PRAYER, SCRIPTURE & MESSAGE</b><br><span class="note">All led by Pastor Julius Rayala</span></li>
        <li style="margin-top:6px"><b>HONORING PARENTS</b><br><span class="note">${v("honoringParentsSpeaker", "Charlie & Karla together")}</span></li>
        <li style="margin-top:6px"><b>AFFIRMATION OF LOVE / VOWS</b><br><span class="note">Background (low volume): GOODNESS OF GOD instrumental</span></li>
        <li style="margin-top:6px"><b>RING · COIN · BIBLE · VEIL · CORD CEREMONIES</b></li>
        <li style="margin-top:6px"><b>CHARGING OF PRINCIPAL SPONSORS</b><br><span class="note">Music: ${v("chargingPSMusic")}</span></li>
        <li style="margin-top:6px"><b>CONTRACT SIGNING + REMOVAL OF CORD & VEIL</b></li>
        <li style="margin-top:6px"><b>UNITY CANDLE CEREMONY</b><br><span class="note">Music: THE BLESSING violin instrumental</span></li>
        <li style="margin-top:6px"><b>PRAYER OF DEDICATION</b></li>
        <li style="margin-top:6px"><b>PRONOUNCEMENT & PRESENTATION OF NEWLY WEDS</b><br><span class="note">Recessional: I GET TO LOVE YOU instrumental</span></li>
      </ul>

      <div class="prog-h">CEREMONY SETUP</div>
      <ul>
        <li><b>Entrance arch with curtain:</b> ${v("entranceArch")}</li>
        <li><b>Aisle runner / carpet:</b> ${v("aisleRunner")}</li>
        <li><b>Symbols table — by:</b> ${v("symbolsTableProvider")}</li>
        <li><b>Candle holder & styling — by:</b> ${v("candleStylingProvider")}</li>
        <li>Podium / pulpit facing the couple and audience</li>
        <li>Couple facing the audience and Pastor Julius</li>
      </ul>

      <div class="prog-h">PICTORIAL AFTER CEREMONY  ·  ALTAR PHOTOSHOOT 11:00 AM</div>
      <ul>
        <li>Bride and Groom</li>
        <li>Bride and Groom with Pastor Julius Rayala</li>
        <li>Bride and Groom with Bride's immediate family</li>
        <li>Bride and Groom with Bride's relatives</li>
        <li>Bride and Groom with Groom's immediate family</li>
        <li>Bride and Groom with Groom's relatives</li>
        <li>Bride and Groom with Principal Sponsors</li>
        <li>Bride and Groom with Best Man and Maid of Honor</li>
        <li>Bride and Groom with Groomsmen and Bridesmaids</li>
        <li>Bride and Groom with Secondary Sponsors</li>
        <li>Bride and Groom with Flower Girls, Flower Boy, and Bearers</li>
      </ul>

      ${extras.length ? `
        <p class="note">If time permits — extra friend groups to include:</p>
        <ul>
          ${extras.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}
        </ul>
      ` : ""}

      <div class="prog-divider">—  RECESSIONAL: 11:20 AM  —</div>
      <p class="note" style="text-align:center">(Guests proceed to the reception venue — CCF East Ortigas)</p>
    </div>
  `;
}

function renderReceptionPreview() {
  const root = document.getElementById("preview-reception-body");
  if (!root) return;

  const cateringSupplier = v("supplierCatering");
  const cakeSupplier = v("supplierCake");
  const closing = v("closingSong");
  const exitD = v("exitDance");
  const recPrayer = v("receptionOpeningPrayer", "Christian Ilao");
  const bridePerf = v("brideIntermissionPerformer");
  const groomPerf = v("groomIntermissionPerformer");
  const speakers = v("wellWishersSpecial");

  const tableRows = [
    ["12:00 – 12:30 PM",
     "REGISTRATION / COCKTAIL HOUR\nRETOUCH TIME\nPRE-PROGRAMME GAMES",
     "Cocktail playlist\nc/o CCF Tech Team",
     `Waiters serve cocktails / appetizers (${cateringSupplier})\nGrazing table, milk tea station\nPhotoman (MI6) roving\nPre-prog game: NAME THAT TUNE`],
    ["12:30 – 12:35 PM",
     "INTRODUCTION OF HOST\nACKNOWLEDGE GUESTS, PS, PARENTS",
     "c/o CCF Tech Team",
     "Host (Bryan Bustillo) welcomes guests\nPS and parents acknowledged while seated"],
    ["12:35 – 12:40 PM",
     "TEAM BRIDE — ENTRANCE",
     "Entrance: CRAZY IN LOVE (Homecoming) — Beyoncé\nDance: OPALITE",
     "Bridesmaids dance entrance"],
    ["12:40 – 12:45 PM",
     "TEAM GROOM — ENTRANCE",
     "Entrance: BANG BANG BANG — BIGBANG\nDance: HAWAK MO ANG BEAT",
     "Groomsmen dance entrance"],
    ["12:45 – 12:55 PM",
     "ENTRANCE OF THE NEWLY-WEDS",
     "SEPTEMBER — Earth, Wind & Fire",
     "MR. CHARLIE & MRS. KARLA CAYNO\nLights low → spotlight on couple"],
    ["12:55 – 1:00 PM",
     "OPENING PRAYER\nWEDDING TRADITIONS (intro)",
     "c/o CCF Tech Team",
     `Led by: ${recPrayer}`],
    ["1:00 – 1:03 PM",
     "MOTHER-AND-SON DANCE", "MA PA",
     "Mother of the Groom: Mrs. Arlene Cayno"],
    ["1:03 – 1:05 PM",
     "FATHER-AND-DAUGHTER DANCE", "BECAUSE YOU LOVED ME — Celine Dion",
     "Father of the Bride: Mr. Wilfredo Romantico"],
    ["1:05 – 1:10 PM",
     "FIRST DANCE",
     "I GET TO LOVE YOU — Ruelle\n(WITH choreo — confirmed)",
     "EC to assist couple onto dance floor"],
    ["1:10 – 1:45 PM",
     "MEAL TIME / PHOTO-OP PER TABLE",
     "Light dinner background playlist",
     `Catering: ${cateringSupplier}\nCoor: silent queueing per table`],
    ["1:45 – 1:50 PM",
     "MONETARY GIFT — Cash envelopes\n(replaces Prosperity Box)",
     "Soft instrumental",
     v("prosperityBoxNote")],
    ["1:50 – 2:00 PM",
     "CAKE CUTTING / WINE TOASTING (BM / MOH)",
     "c/o CCF Tech Team",
     `Cake: ${cakeSupplier}\nToast: Best Man Charles Michael Cayno + MOH Heleaena Luv Romantico`],
    ["2:00 – 2:05 PM",
     "TRIVIA GAME (LEDWALL)",
     "Game show stinger",
     "Hosted by Bryan Bustillo\nPrizes: luxury-paper-bag DIY pool"],
    ["2:05 – 2:10 PM",
     "BRING ME TO JERUSALEM",
     "High-energy bring-me playlist",
     v("bringMeToJerusalemPrizes")],
    ["2:10 – 2:20 PM",
     "BRIDE'S RELATIVES — INTERMISSION",
     "c/o performer",
     `Performance by: ${bridePerf}`],
    ["2:20 – 2:30 PM",
     "GROOM'S RELATIVES — INTERMISSION",
     "c/o performer",
     `Performance by: ${groomPerf}\n(Garter ceremony removed by couple)`],
    ["2:30 – 2:35 PM",
     "SDE — SAME DAY EDIT",
     "SDE soundtrack (c/o Jath & Yen)",
     "Lights off; AVP on LED wall"],
    ["2:35 – 2:40 PM",
     "MESSAGE FROM THE NEWLY-WEDS\nWELL-WISHERS",
     "Soft instrumental",
     `Couple's thank-you message\nWell-wishers: ${speakers}`],
    ["2:40 – 2:45 PM",
     "CLOSING SONG NUMBER / GROUP PICTURE",
     closing,
     "Group photo on stage / dance floor"],
    ["2:45 – 3:00 PM",
     "CLOSING REMARKS / SOCIALS",
     exitD,
     "Host closing remarks\nSupplier acknowledgements\nParty time + socials"],
  ];

  const trivia = [
    ["Endearment", v("endearment")],
    ["Pet names", v("petNames")],
    ["Where they met", v("whereTheyMet")],
    ["BF/GF anniversary", v("bfgfAnniversary")],
    ["Years together", v("yearsTogether")],
    ["Where he proposed", v("proposalLocation")],
    ["Date of proposal", v("proposalDate")],
    ["First date location", v("firstDateSpot")],
    ["Most memorable trip", v("memorableTrip")],
    ["Favorite shared snack / drink", v("favoriteSnack")],
    ["Charlie's day job", v("charlieJob")],
    ["Karla's day job", v("karlaJob")],
    ["First 'I love you'", v("firstILoveYou")],
    ["Favorite show / movie", v("favoriteShow")],
    ["Inside joke / catchphrase", v("insideJoke")],
    ["Life verse", v("lifeVerse")],
    ["Honeymoon destination", v("honeymoonDestination")],
    ["Other fun facts", v("otherFunFacts")],
  ];

  const suppliers = [
    ["Catering", v("supplierCatering")],
    ["Cake", v("supplierCake")],
    ["Sound / DJ", v("supplierSound")],
    ["Photographer (formal)", v("supplierPhoto")],
    ["Photoman (roving)", v("supplierPhotoman", "MI6 — sponsored by Catanghal")],
    ["Videographer", v("supplierVideo")],
    ["Same-Day Edit", v("supplierSDE")],
    ["HMUA", v("supplierHMUA")],
    ["Florist / stylist", v("supplierFlorist")],
    ["Lights / LED wall", v("supplierLights")],
    ["Photobooth", v("supplierPhotobooth")],
    ["Bride's gown", v("supplierGown")],
    ["Groom's tux / barong", v("supplierTuxBarong")],
    ["Wedding rings", v("supplierRings")],
    ["Bridal car", v("supplierBridalCar")],
    ["OTD Coordinator", "M&M Coordination Team"],
    ["CCF Church Coordinator", "Therese Galasa"],
  ];

  root.innerHTML = `
    <div class="prog">
      <div class="prog-title">RECEPTION PROGRAM</div>
      <div class="prog-hashtags">#CharlieKARLAng2026   ·   #CAYNOmoreLoveThanThis</div>
      <div class="prog-subtitle">July 2, 2026  ·  12:30 PM  ·  CCF East Ortigas</div>
      <div class="prog-credits">Host: ${v("host", "Bryan Bustillo")}  ·  OTD: M&M Coordination Team  ·  130 pax (non-traditional)</div>

      <div class="prog-kv"><b>GROOM:</b> Charlie Michael Cayno (Charlie · "Dudu")</div>
      <div class="prog-kv"><b>BRIDE:</b> Karla Sofia Romantico-Cayno (Karla · "Bubu")</div>

      <table class="prog-table">
        <thead>
          <tr><th>EST TIME</th><th>PROGRAM</th><th>MUSIC</th><th>ACTIVITIES</th></tr>
        </thead>
        <tbody>
          ${tableRows.map(([t, p, m, a]) => `
            <tr>
              <td class="multiline">${t}</td>
              <td class="multiline">${p}</td>
              <td class="multiline">${m}</td>
              <td class="multiline">${a}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="prog-h">COUPLE TRIVIA POOL  ·  for host & games</div>
      ${trivia.map(([k, val]) => `<div class="prog-kv"><b>${escapeHtml(k)}:</b> ${val}</div>`).join("")}

      <div class="prog-h">SUPPLIERS TO ACKNOWLEDGE</div>
      ${suppliers.map(([k, val]) => `<div class="prog-kv"><b>${escapeHtml(k)}:</b> ${val}</div>`).join("")}

      <div class="prog-h">SPECIAL THANKS</div>
      <p style="white-space:pre-line">${v("supplierOther")}</p>

      <div class="prog-h">NOTES FOR M&M COORDINATION</div>
      <ul>
        <li>SDE c/o Jath & Yen at 2:30 PM slot</li>
        <li>Non-traditional reception — flexible flow; coordinator may swap intermissions if performers run late</li>
        <li>Couple game and prosperity box REMOVED per couple's preference; cash envelopes collected discreetly instead</li>
        <li>Garter ceremony dropped from the program (no song needed)</li>
        <li>First dance has choreography — please cue the song precisely</li>
        <li>All transitions and music cues handled by CCF Tech Team</li>
      </ul>
    </div>
  `;
}

function renderPreviews() {
  renderCeremonyPreview();
  renderReceptionPreview();
}

// ---------------------------------------------------------------------------
// Save (debounced, via firebase-sync's internal debouncer)
// ---------------------------------------------------------------------------
let saveTimer = null;
let isRemoteUpdate = false; // skip echoing remote pushes back

function onFieldChange(e) {
  const id = e.target.dataset.field;
  state[id] = e.target.value;
  // Mirror the value to the OTHER editor (main form ↔ inline to-do) so both
  // surfaces stay consistent. Skip whichever one fired the event.
  document.querySelectorAll(`[data-field="${id}"]`).forEach((other) => {
    if (other === e.target) return;
    if (other.value !== e.target.value) other.value = e.target.value;
  });
  // Per-field save status (used by the inline editor)
  const statusEl = document.querySelector(`.save-status[data-save="${id}"]`);
  if (statusEl) {
    statusEl.textContent = "saving…";
    statusEl.className = "save-status saving";
  }
  setSyncPill("saving", "saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      fbSet(DETAILS_KEY, state);
      setTimeout(() => {
        setSyncPill("saved", "saved · syncs to both of us");
        if (statusEl) {
          statusEl.textContent = "saved · syncs to both of us";
          statusEl.className = "save-status saved";
        }
      }, 500);
    } catch (err) {
      console.warn(err);
      setSyncPill("err", "save failed");
      if (statusEl) {
        statusEl.textContent = "save failed";
        statusEl.className = "save-status err";
      }
    }
  }, 300);
  // Re-render the to-do panel ONLY if a field just got filled or emptied
  // (otherwise it would steal focus while typing). renderProgress() handles
  // the rest of the UI updates (counters, dots, previews).
  renderProgress();
}

// Render every section in SHEET_QUESTIONS into #sheet-questions. Each section
// becomes a collapsible <details>; each question is a card with one input per
// column plus a small destination caption ("→ SONGLIST · B19:C19"). All
// inputs share the onFieldChange pipeline, so values land in Firebase the
// same way the rest of the form does.
function renderSheetQuestions() {
  const root = document.getElementById("sheet-questions");
  if (!root) return;
  root.innerHTML = SHEET_QUESTIONS.map((g) => {
    const total  = g.items.length;
    const filled = g.items.filter(isItemFilled).length;
    return `
      <details class="sheet-section" data-section="${escapeHtml(g.section)}">
        <summary>
          <span class="sheet-section-head">
            <span class="material-symbols-outlined">${escapeHtml(g.icon || "list_alt")}</span>
            <span class="sheet-section-title">${escapeHtml(g.section)}</span>
          </span>
          <span class="sheet-section-counter ${filled === total ? "done" : ""}">${filled} / ${total}</span>
        </summary>
        <div class="sheet-section-meta">${escapeHtml(g.meta)}</div>
        <div class="sheet-q-list">
          ${g.items.map(renderItemCard).join("")}
        </div>
      </details>
    `;
  }).join("");
  root.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("input", onFieldChange);
  });
  // Keep the per-card "filled" tint + per-section counter in sync as the user
  // types. We hook the section root so we don't add per-input listeners.
  root.addEventListener("input", (e) => {
    if (!e.target.dataset?.field) return;
    const card    = e.target.closest(".sheet-q");
    const section = e.target.closest(".sheet-section");
    if (card) {
      const itemId = card.dataset.q;
      const item   = SHEET_ITEMS.find((x) => x.id === itemId);
      if (item) card.classList.toggle("filled", isItemFilled(item));
    }
    if (section) {
      const sec = SHEET_QUESTIONS.find((x) => x.section === section.dataset.section);
      const counter = section.querySelector(".sheet-section-counter");
      if (sec && counter) {
        const filled = sec.items.filter(isItemFilled).length;
        counter.textContent = `${filled} / ${sec.items.length}`;
        counter.classList.toggle("done", filled === sec.items.length);
      }
    }
  });
}

function isItemFilled(item) {
  // A question counts as answered when its first (primary) column has text.
  // For songs that's the title; for status rows that's the status text.
  const primaryField = fieldIdFor(item, 0);
  return String(state[primaryField] || "").trim().length > 0;
}

function renderItemCard(item) {
  const filled = isItemFilled(item);
  const inputs = item.cols.map((_, i) => {
    const fid = fieldIdFor(item, i);
    const val = state[fid] || "";
    const ph  = item.placeholders?.[i] || "";
    return `<input type="text" data-field="${fid}" value="${escapeHtml(val)}"
                   placeholder="${escapeHtml(ph)}"/>`;
  }).join("");
  const colsClass = item.cols.length > 1 ? " sheet-q-row-multi" : "";
  return `
    <div class="sheet-q${filled ? " filled" : ""}" data-q="${escapeHtml(item.id)}">
      <div class="sheet-q-label">${escapeHtml(item.label)}</div>
      <div class="sheet-q-row${colsClass}">${inputs}</div>
      <div class="sheet-q-dest">${escapeHtml(destLabel(item))}</div>
    </div>
  `;
}

function setSyncPill(kind, text) {
  const pill = document.getElementById("sync-pill");
  pill.className = `sync-pill ${kind}`;
  document.getElementById("sync-pill-text").textContent = text;
}

// ---------------------------------------------------------------------------
// Live remote → local
// ---------------------------------------------------------------------------
function mergeRemoteIntoState(remote) {
  if (!remote || typeof remote !== "object") return;
  // Don't clobber a field the user is currently typing in.
  const active = document.activeElement;
  const activeId = active && active.dataset ? active.dataset.field : null;
  for (const k of Object.keys(remote)) {
    if (k === activeId) continue;
    state[k] = remote[k];
  }
  // Re-render inputs to reflect remote changes (focused field is preserved by
  // the activeId check above; we still need to update non-focused inputs).
  document.querySelectorAll("[data-field]").forEach((el) => {
    const id = el.dataset.field;
    if (id === activeId) return;
    const v = state[id] ?? "";
    if (el.tagName === "SELECT") {
      el.value = v;
    } else if (el.value !== v) {
      el.value = v;
    }
  });
  renderProgress();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  setSyncPill("", "loading…");
  try {
    const remote = await fbGet(DETAILS_KEY);
    state = applyDefaults(remote && typeof remote === "object" ? { ...remote } : {});
  } catch (e) {
    console.warn("fbGet _details failed", e);
    state = applyDefaults({});
  }
  renderForm();
  setSyncPill("saved", "synced");

  // Free-text notes box lives outside the form schema but still rides the
  // same field-save pipeline (onFieldChange writes to state + Firebase,
  // mergeRemoteIntoState updates any [data-field] on remote changes).
  const notesEl = document.getElementById("notes-for-claude");
  if (notesEl) {
    notesEl.value = state["notes-for-claude"] || "";
    notesEl.addEventListener("input", onFieldChange);
  }

  renderSheetQuestions();

  // To-do card collapse toggle
  const collapseBtn = document.getElementById("todo-collapse");
  const todoCard = document.getElementById("todo-card");
  if (collapseBtn && todoCard) {
    collapseBtn.addEventListener("click", () => {
      const isCollapsed = todoCard.classList.toggle("collapsed");
      collapseBtn.setAttribute("aria-expanded", String(!isCollapsed));
    });
  }

  // Live sync for any future remote writes.
  fbSubscribe(DETAILS_KEY, (remote) => {
    isRemoteUpdate = true;
    mergeRemoteIntoState(remote);
    isRemoteUpdate = false;
  });
})();
