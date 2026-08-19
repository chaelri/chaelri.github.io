/* ==========================================================================
   apps-script.gs — the inbox half of sherill/register/.

   This is NOT part of the deployed site. It's pasted into a Google Apps Script
   project bound to a Google Sheet (see README.md in this folder). It serves two
   front doors that both land in the same place:

     · the Google Form (Charlie's pick) — built by createLeadForm() below, with
       an onFormSubmit trigger that emails every answer out
     · the register page on her site — POSTs JSON to the deployed web app

   Either way it:

     1. appends a row to the sheet — the running list of leads, sortable,
        filterable, exportable
     2. emails the full lead to Sherill and Charlie right away, with the
        customer's own address as reply-to so replying goes straight to them
     3. optionally emails the customer a short "got it" acknowledgement

   Runs on the free Gmail quota (100 recipients/day for a consumer account),
   which is far more than a booth day produces.
   ========================================================================== */

/* ─────────────────────────────────────────────────────────────── config ── */

/** One entry per sales agent this script serves. Each gets their own Google
    Form, their own spreadsheet, and their own inbox — a lead for one is never
    emailed to the other, and neither is emailed to Charlie (he owns the script,
    which is a different thing from being on the distribution list).

    `sheetId` empty means "the spreadsheet this script is bound to". Victor's is
    a separate file, so his carries an id. `formTitle` is how a submission is
    matched back to its agent — see agentForForm(). */
var AGENTS = {
  sherill: {
    name: 'Sherill Obillo',
    role: 'Nissan Marketing Professional · Nissan Quezon Avenue',
    mobile: '0977 809 3768',
    site: 'https://drive-with-sherill.vercel.app',
    recipients: ['sherillf20@gmail.com'],
    sheetId: '',
    formTitle: 'Register your interest — Sherill Obillo · Nissan Quezon Avenue',
  },
  victor: {
    name: 'Victor Alvear',
    role: 'Nissan Marketing Professional · Nissan Quezon Avenue',
    mobile: '0917 652 4422',
    site: '',
    recipients: ['vicalvear13@gmail.com'],
    sheetId: '',
    formTitle: 'Register your interest — Victor Alvear · Nissan Quezon Avenue',
  },
};

/** The agent the register page on drive-with-sherill posts to. */
var WEB_APP_AGENT = 'sherill';

/** Send the customer a short acknowledgement when they leave an email. */
var SEND_ACK = true;

/** A lead posted with { test: true }, or any submission while FORM_TEST_ONLY is
    on, goes here only and is subject-tagged [TEST], with no acknowledgement to
    the "customer". That's how the whole path gets exercised without putting a
    fake lead in anyone's real inbox. */
var TEST_RECIPIENT = 'charliecayno@gmail.com';

/** Leave empty when this script is bound to a Sheet (Extensions → Apps
    Script). Only set it if you run the script standalone — then paste the
    spreadsheet id out of its URL. */
var SHEET_ID = '';
var SHEET_NAME = 'Leads';

function agent(key) {
  var a = AGENTS[key];
  if (!a) throw new Error('Unknown agent: ' + key);
  return a;
}

var HEADERS = [
  'Received', 'Event', 'Name', 'Mobile', 'Email', 'City / area',
  'Company', 'Role', 'Interested in', 'Plan', 'Timeline', 'Units', 'Notes', 'Source',
];

/* ──────────────────────────────────────────────────────────── endpoints ── */

/** Health check — open the /exec URL in a browser and you should see
    {"ok":true,"service":"drive-with-sherill register"}. */
function doGet() {
  return json({ ok: true, service: 'drive-with-sherill register' });
}

function doPost(e) {
  try {
    var body = e && e.postData ? e.postData.contents : '';
    var d = JSON.parse(body || '{}');

    /* honeypot — the register page keeps an off-screen "website" field that
       only a bot fills in. Answer 200 so it doesn't retry, but store nothing. */
    if (d.website) return json({ ok: true });

    if (!String(d.name || '').trim() || !String(d.mobile || '').trim()) {
      return json({ ok: false, error: 'name and mobile are required' });
    }

    var lead = {
      received: new Date(),
      event: str(d.eventName) || str(d.event),
      name: str(d.name),
      mobile: str(d.mobile),
      email: str(d.email),
      city: str(d.city),
      company: str(d.company),
      role: str(d.role),
      models: Array.isArray(d.models) ? d.models.map(str).join(', ') : str(d.models),
      plan: str(d.plan),
      timeline: str(d.timeline),
      units: str(d.units),
      notes: str(d.notes),
      source: str(d.source),
    };

    var isTest = d.test === true;
    var who = agent(WEB_APP_AGENT);
    appendRow(lead);
    notify(lead, isTest, who);
    if (SEND_ACK && !isTest && isEmail(lead.email)) acknowledge(lead, who);

    return json({ ok: true });
  } catch (err) {
    /* Log it so a failure is visible in the Apps Script executions view rather
       than silently swallowed — the page falls back to copy-only either way. */
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

/* ────────────────────────────────────────────────────────────── storage ── */

function sheet() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
  if (!ss) throw new Error('No spreadsheet — bind this script to a Sheet or set SHEET_ID.');
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function appendRow(l) {
  sheet().appendRow([
    l.received, l.event, l.name, l.mobile, l.email, l.city,
    l.company, l.role, l.models, l.plan, l.timeline, l.units, l.notes, l.source,
  ]);
}

/* ───────────────────────────────────────────────────────────────── mail ── */

function notify(l, isTest, who) {
  var subject = (isTest ? '[TEST] ' : '') + 'New lead — ' + l.name
    + (l.models ? ' (' + l.models + ')' : '')
    + (l.event ? ' · ' + l.event : '');

  var rows = [
    ['Name', l.name],
    ['Mobile', l.mobile],
    ['Email', l.email],
    ['City / area', l.city],
    ['Company', l.company],
    ['Role', l.role],
    ['Interested in', l.models],
    ['Plan', l.plan],
    ['Timeline', l.timeline],
    ['Units', l.units],
    ['Notes', l.notes],
    ['Event', l.event],
    ['Received', Utilities.formatDate(l.received, 'Asia/Manila', 'MMM d, yyyy · h:mm a') + ' PHT'],
  ].filter(function (r) { return r[1]; });

  var html = ''
    + '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17181c;max-width:560px">'
    + '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c3002f;font-weight:700">'
    +   'New registration' + (l.event ? ' · ' + escapeHtml(l.event) : '') + '</p>'
    + '<h2 style="margin:0 0 16px;font-size:22px">' + escapeHtml(l.name) + '</h2>'
    + '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">'
    + rows.map(function (r) {
        return '<tr>'
          + '<td style="padding:7px 12px 7px 0;color:#6b7280;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eef0f3">'
          + escapeHtml(r[0]) + '</td>'
          + '<td style="padding:7px 0;font-weight:600;border-bottom:1px solid #eef0f3">'
          + escapeHtml(String(r[1])).replace(/\n/g, '<br>') + '</td></tr>';
      }).join('')
    + '</table>'
    + '<p style="margin:18px 0 0;font-size:13px">'
    +   '<a href="tel:' + escapeHtml(l.mobile.replace(/\s+/g, '')) + '" style="color:#c3002f;font-weight:600">Call ' + escapeHtml(l.mobile) + '</a>'
    +   (isEmail(l.email) ? ' &nbsp;·&nbsp; <a href="mailto:' + escapeHtml(l.email) + '" style="color:#c3002f;font-weight:600">Email them</a>' : '')
    + '</p>'
    + '<p style="margin:22px 0 0;font-size:11.5px;color:#9aa0a6">Sent by the registration form on drive-with-sherill. Also logged in the Leads sheet.</p>'
    + '</div>';

  var options = {
    name: 'drive-with-sherill',
    htmlBody: html,
    body: rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'),
  };
  /* Replying to the notification then reaches the customer directly. */
  if (isEmail(l.email)) options.replyTo = l.email;

  var to = isTest ? TEST_RECIPIENT : who.recipients.join(',');
  MailApp.sendEmail(to, subject, options.body, options);
}

function acknowledge(l, who) {
  var first = l.name.split(/\s+/)[0];
  var html = ''
    + '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17181c;max-width:520px;font-size:15px;line-height:1.6">'
    + '<p>Hi ' + escapeHtml(first) + ',</p>'
    + '<p>Thank you for registering'
    +   (l.event ? ' at <strong>' + escapeHtml(l.event) + '</strong>' : '')
    +   '. I\'ve got your details and I\'ll get back to you shortly with the price list, '
    +   'the running promo and a monthly estimate'
    +   (l.models ? ' for the ' + escapeHtml(l.models) : '') + '.</p>'
    + '<p>If you\'d like to talk sooner, just reply to this email or message me at '
    +   '<strong>' + escapeHtml(who.mobile) + '</strong> — I\'m quickest on Viber.</p>'
    + '<p style="margin-top:22px">' + escapeHtml(who.name) + '<br>'
    +   '<span style="color:#6b7280;font-size:13px">' + escapeHtml(who.role) + '</span><br>'
    +   (who.site
          ? '<a href="' + who.site + '" style="color:#c3002f;font-size:13px">'
            + who.site.replace(/^https:\/\//, '') + '</a>'
          : '')
    +   '</p>'
    + '</div>';

  MailApp.sendEmail(l.email, 'Thanks for registering — ' + who.name + ', Nissan Quezon Avenue', '', {
    name: who.name + ' · Nissan Quezon Avenue',
    htmlBody: html,
    replyTo: who.recipients[0],
  });
}

/* ──────────────────────────────────────────────────────────────── utils ── */

function str(v) { return v == null ? '' : String(v).trim(); }
function isEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(v)); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor to check the sheet + both emails work
    without going through the page. */
function selfTest() {
  var lead = {
    received: new Date(),
    event: 'Self test',
    name: 'Test Lead',
    mobile: '0917 123 4567',
    email: '',
    city: 'Quezon City',
    company: '',
    role: '',
    models: 'X-Trail',
    plan: 'Bank financing',
    timeline: 'Within this month',
    units: '',
    notes: 'Ignore — this row came from selfTest().',
    source: 'selfTest',
  };
  appendRow(lead);
  notify(lead, true);
}


/* ══════════════════════════════════════════════════════ the Google Form ══
   Run createLeadForm() ONCE from the editor. It builds the form, files its
   responses into this same spreadsheet, and installs the onFormSubmit trigger
   that emails the answers to Sherill and Charlie.

   Why a trigger at all: Google Forms' own "get email notifications for new
   responses" only reaches the form owner, and the mail says "you have a new
   response" with a link — no answers in it. Sherill would have to open a
   spreadsheet to find out who wants a Terra. The trigger sends the whole lead
   in the body, with the customer's address as reply-to. */

var FORM_TEST_ONLY = false;   /* true = form submissions email Charlie only */

/** Question titles. Used to build the form and to read responses back, so they
    must match — change them here and re-run createLeadForm(). */
var Q = {
  name: 'Name',
  mobile: 'Mobile number',
  email: 'Email address',
  city: 'City / area',
  company: 'Company name',
  role: 'Role / position',
  models: 'What vehicle(s) are you interested in?',
  plan: 'How do you plan to buy?',
  timeline: 'When do you need it?',
  units: 'How many units?',
  notes: 'Anything else I should know?',
};

var MODEL_CHOICES = [
  'Almera', 'KICKS e-POWER', 'Livina', 'X-Trail e-POWER',
  'Terra', 'Navara', 'Urvan', 'Patrol Royale',
  'Fleet / special build (ambulance, service unit)', 'Not sure yet',
];

/** Builds (or rebuilds) one agent's form. Pass an agent key: 'sherill',
    'victor'. If that agent has no sheetId, a new spreadsheet is created for
    them and its id is logged — paste it into AGENTS so a later re-run files
    into the same file instead of making another one. */
function createLeadForm(agentKey) {
  var who = agent(agentKey || WEB_APP_AGENT);

  var ss;
  if (who.sheetId) {
    ss = SpreadsheetApp.openById(who.sheetId);
  } else if (agentKey && agentKey !== WEB_APP_AGENT) {
    ss = SpreadsheetApp.create('drive-with-' + agentKey + ' — leads');
  } else {
    ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
  }

  var form = FormApp.create(who.formTitle)
    .setDescription(
      'Leave your details and I\'ll get back to you with the price list, the running '
      + 'promo and a monthly estimate — no obligation.\n\n'
      + who.name + ' · ' + who.role + ' · ' + who.mobile + '\n'
      + 'Independent personal page of a Nissan sales professional. Not an official '
      + 'Nissan Philippines website.')
    .setConfirmationMessage(
      'Salamat! Nasa inbox ko na ang details mo — I\'ll message you shortly. '
      + 'Need it sooner? Viber or text me at ' + who.mobile + '. — ' + who.name.split(' ')[0])
    .setCollectEmail(false)          /* signing in kills booth conversion */
    .setLimitOneResponsePerUser(false)
    .setAllowResponseEdits(false)
    .setProgressBar(false);

  form.addTextItem().setTitle(Q.name).setRequired(true);
  form.addTextItem().setTitle(Q.mobile).setHelpText('e.g. 0917 123 4567').setRequired(true);
  form.addTextItem().setTitle(Q.email);
  form.addTextItem().setTitle(Q.city).setHelpText('e.g. Quezon City');
  form.addTextItem().setTitle(Q.company).setHelpText('Only if this is for a company or fleet');
  form.addTextItem().setTitle(Q.role);

  form.addCheckboxItem().setTitle(Q.models).setChoiceValues(MODEL_CHOICES);
  form.addMultipleChoiceItem().setTitle(Q.plan)
    .setChoiceValues(['Bank financing', 'Cash', 'Not sure yet']);
  form.addMultipleChoiceItem().setTitle(Q.timeline)
    .setChoiceValues(['Within this month', 'In 1–3 months', 'In 3–6 months', 'Still canvassing']);
  form.addTextItem().setTitle(Q.units).setHelpText('Leave blank if just one');
  form.addParagraphTextItem().setTitle(Q.notes)
    .setHelpText('e.g. trading in a 2019 Almera, or I need the unit before December');

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  /* Replace only THIS form's trigger. Deleting every onLeadFormSubmit trigger
     would silently unhook the other agent's form. */
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'onLeadFormSubmit'
        && existing[i].getTriggerSourceId() === form.getId()) {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('onLeadFormSubmit').forForm(form).onFormSubmit().create();

  var out = {
    agent: who.name,
    liveUrl: form.getPublishedUrl(),
    shortUrl: form.shortenFormUrl(form.getPublishedUrl()),
    editUrl: form.getEditUrl(),
    sheetUrl: ss.getUrl(),
    sheetId: ss.getId(),
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function createSherillForm() { return createLeadForm('sherill'); }
function createVictorForm() { return createLeadForm('victor'); }

/** Matches a submission back to its agent by the form's title. Titles are set
    from AGENTS[key].formTitle, so this stays true as long as nobody renames a
    form in the Forms UI. Unknown title falls back to the web app's agent. */
function agentForForm(e) {
  var title = '';
  try {
    if (e && e.source && e.source.getTitle) title = e.source.getTitle();
  } catch (err) { /* ignore — fall through to the default */ }
  for (var key in AGENTS) {
    if (AGENTS[key].formTitle === title) return AGENTS[key];
  }
  return agent(WEB_APP_AGENT);
}

/** Fires on every Google Form submission.

    The event object has TWO shapes and they are not interchangeable: a trigger
    installed on the FORM gives e.response (a FormResponse), while one installed
    on the SPREADSHEET gives e.namedValues. This one is installed on the form —
    reading e.namedValues there yields undefined and mails a blank lead, which
    is exactly what happened on the first try. Both are handled below. */
function onLeadFormSubmit(e) {
  try {
    var who = agentForForm(e);
    var answers = {};
    if (e && e.namedValues) {
      for (var k in e.namedValues) {
        answers[k] = [].concat(e.namedValues[k]).join(', ');
      }
    } else if (e && e.response && e.response.getItemResponses) {
      var irs = e.response.getItemResponses();
      for (var i = 0; i < irs.length; i++) {
        var r = irs[i].getResponse();
        answers[irs[i].getItem().getTitle()] = Array.isArray(r) ? r.join(', ') : String(r == null ? '' : r);
      }
    }
    var v = function (title) { return String(answers[title] || '').trim(); };

    var lead = {
      received: new Date(),
      event: 'Google Form',
      name: v(Q.name),
      mobile: v(Q.mobile),
      email: v(Q.email),
      city: v(Q.city),
      company: v(Q.company),
      role: v(Q.role),
      models: v(Q.models),
      plan: v(Q.plan),
      timeline: v(Q.timeline),
      units: v(Q.units),
      notes: v(Q.notes),
      source: who.formTitle,
    };

    /* The form's own responses tab already holds the row, so this only mails. */
    notify(lead, FORM_TEST_ONLY, who);
    if (SEND_ACK && !FORM_TEST_ONLY && isEmail(lead.email)) acknowledge(lead, who);
  } catch (err) {
    console.error(err);
  }
}
