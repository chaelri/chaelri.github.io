"use strict";
/* Sobra: payday projection. All data stays on the phone (localStorage). No server, no login. */

const KEY = "sobra.v1";
const uid = () => Math.random().toString(36).slice(2, 10);
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);

/* ---------- state ---------- */
const blank = () => ({
  v: 1, onboarded: false, savings: 0,
  income: [{ id: uid(), name: "Salary", a15: 0, a30: 0 }],
  bills: ["Rent", "Electricity", "Internet", "Phone"].map(n => ({ id: uid(), name: n, amt: 0, day: "15" })),
  spend: ["Groceries", "Transport", "Eating out", "Everything else"].map(n => ({ id: uid(), name: n, amt: 0 })),
  goals: [["Emergency fund", 50], ["Travel", 25], ["Treat yourself", 25]].map(([n, p]) => ({ id: uid(), name: n, pct: p })),
});
const sample = () => ({
  v: 1, onboarded: true, savings: 50000,
  income: [{ id: uid(), name: "Salary", a15: 20000, a30: 20000 }],
  bills: [["Rent", 8000, "15"], ["Internet", 1699, "15"], ["Phone plan", 599, "15"], ["Electricity", 2500, "30"], ["Water", 500, "30"], ["Subscriptions", 549, "30"], ["Insurance", 1200, "30"], ["Loan payment", 3000, "30"]]
    .map(([name, amt, day]) => ({ id: uid(), name, amt, day })),
  spend: [["Groceries", 6000], ["Transport", 3000], ["Eating out", 2500], ["Personal", 1500], ["Everything else", 1500]].map(([name, amt]) => ({ id: uid(), name, amt })),
  goals: [["Emergency fund", 40], ["Travel", 20], ["New gadget", 15], ["Investments", 25]].map(([name, pct]) => ({ id: uid(), name, pct })),
});
let mem = null;
function load() {
  try { const t = localStorage.getItem(KEY); if (t) { const d = JSON.parse(t); if (d && d.v === 1) return d; } } catch (e) {}
  return mem || blank();
}
function save() { mem = S; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
let S = load();
let wizStep = 0;
let tab = "home";

/* ---------- helpers ---------- */
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; };
const peso = n => (n < 0 ? "-" : "") + "₱" + Math.round(Math.abs(n)).toLocaleString("en-PH");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}

/* ---------- projection ---------- */
function paydays(n) {
  const out = [], today = new Date(); today.setHours(0, 0, 0, 0);
  let y = today.getFullYear(), m = today.getMonth();
  while (out.length < n) {
    const last = new Date(y, m + 1, 0).getDate();
    for (const half of ["15", "30"]) {
      const d = new Date(y, m, half === "15" ? 15 : Math.min(30, last));
      if (d >= today) out.push({ date: d, half });
    }
    m++; if (m > 11) { m = 0; y++; }
  }
  return out.slice(0, n);
}
function project() {
  const inc = h => S.income.reduce((a, i) => a + num(h === "15" ? i.a15 : i.a30), 0);
  const spendHalf = S.spend.reduce((a, s) => a + num(s.amt), 0) / 2;
  let bal = num(S.savings);
  const rows = paydays(24).map(p => {
    const income = inc(p.half);
    const bills = S.bills.filter(b => b.day === p.half).reduce((a, b) => a + num(b.amt), 0);
    const left = income - bills - spendHalf;
    bal += left;
    return { ...p, income, bills, spendHalf, left, bal };
  });
  const total = rows.reduce((a, r) => a + r.left, 0);
  return { rows, total, avg: total / 12, end: rows[rows.length - 1].bal };
}

/* ---------- views ---------- */
function chart(rows, start) {
  const W = 360, H = 96, vals = [start, ...rows.map(r => r.bal)];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
  const x = i => (i / (vals.length - 1)) * W, y = v => H - 12 - ((v - lo) / span) * (H - 28);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<polygon class="area" points="0,${H} ${pts.join(" ")} ${W},${H}"/><polyline class="ln" points="${pts.join(" ")}" vector-effect="non-scaling-stroke"/>`;
  return svg;
}

function viewHome() {
  const P = project();
  const hero = h("section", { class: "hero rise" },
    h("div", { class: "label" }, "In 12 months you could have"),
    h("div", { class: "big num" }, peso(P.end)),
    h("div", { class: "per num" }, P.avg >= 0 ? `+${peso(P.avg)} a month, from ${peso(num(S.savings))} today` : `${peso(P.avg)} a month. You are spending more than you earn.`),
    chart(P.rows, num(S.savings)));
  const next = h("section", { class: "card rise", style: "animation-delay:.08s" },
    h("div", { class: "sec-h" }, h("h2", null, "Next paydays")),
    h("div", { class: "list" }, P.rows.slice(0, 4).map(r =>
      h("div", { class: "row" },
        h("div", { class: "l" }, h("b", null, `${MON[r.date.getMonth()]} ${r.date.getDate()}`), h("span", { class: "num" }, `${peso(r.income)} in, ${peso(r.bills + r.spendHalf)} out`)),
        h("div", { class: "r num" + (r.left < 0 ? " short" : "") }, r.left < 0 ? `short ${peso(-r.left)}` : peso(r.left), h("span", null, r.left < 0 ? "this payday" : "sobra"))))));
  return h("div", { class: "stack" }, hero, next);
}

function viewGoals() {
  const P = project(), pos = Math.max(P.avg, 0);
  const sum = S.goals.reduce((a, g) => a + num(g.pct), 0);
  const card = h("section", { class: "card rise" },
    h("div", { class: "sec-h" }, h("h2", null, "Where your sobra goes"), h("span", { class: "label num" }, `${peso(pos)} a month`)),
    S.goals.map(g => {
      const m = pos * num(g.pct) / 100;
      return h("div", { class: "goal" },
        h("div", { class: "t" }, h("b", null, g.name || "Goal"), h("b", { class: "num" }, peso(m))),
        h("div", { class: "bar" }, h("i", { style: `width:${Math.min(num(g.pct), 100)}%` })),
        h("small", { class: "num" }, `${num(g.pct)}% of your sobra, ${peso(m * 12)} in a year`));
    }),
    Math.round(sum) !== 100 ? h("div", { class: "warnline" }, `Your goals add up to ${Math.round(sum)}%. Change them in Plan so they total 100%.`) : null);
  return h("div", { class: "stack" }, card);
}

/* editors (shared by Plan and the setup wizard) */
function pesoInput(val, on, label) {
  const i = h("input", { type: "text", inputmode: "decimal", value: num(val) ? String(num(val)) : "", placeholder: "0", "aria-label": label, oninput: e => { on(num(e.target.value)); } });
  return h("div", { class: "peso" }, i);
}
function nameInput(val, on, label) {
  return h("input", { type: "text", value: val, placeholder: "Name", "aria-label": label, oninput: e => on(e.target.value) });
}
function xBtn(on, label) { return h("button", { class: "x", "aria-label": label, onclick: on }, "×"); }

function billsEditor(rerender) {
  return h("div", { class: "erows" },
    S.bills.map(b => h("div", { class: "item" },
      h("div", { class: "erow bill" }, nameInput(b.name, v => { b.name = v; save(); }, "Bill name"), pesoInput(b.amt, v => { b.amt = v; save(); totals(); }, "Amount"), xBtn(() => { S.bills = S.bills.filter(x => x !== b); save(); rerender(); }, "Remove bill")),
      h("div", { class: "seg", role: "group", "aria-label": "Paid on" }, ["15", "30"].map(d => h("button", { "aria-pressed": String(b.day === d), onclick: () => { b.day = d; save(); rerender(); } }, `Paid on the ${d}th`))))),
    h("button", { class: "link", onclick: () => { S.bills.push({ id: uid(), name: "", amt: 0, day: "15" }); save(); rerender(); } }, "+ Add a bill"));
}
function spendEditor(rerender) {
  return h("div", { class: "erows" },
    S.spend.map(s => h("div", { class: "erow" }, nameInput(s.name, v => { s.name = v; save(); }, "Category"), pesoInput(s.amt, v => { s.amt = v; save(); totals(); }, "Monthly amount"), xBtn(() => { S.spend = S.spend.filter(x => x !== s); save(); rerender(); }, "Remove category"))),
    h("button", { class: "link", onclick: () => { S.spend.push({ id: uid(), name: "", amt: 0 }); save(); rerender(); } }, "+ Add a category"));
}
function totals() {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("tBills", peso(S.bills.reduce((a, b) => a + num(b.amt), 0)));
  set("tSpend", peso(S.spend.reduce((a, s) => a + num(s.amt), 0)));
  set("tIncome", peso(S.income.reduce((a, i) => a + num(i.a15) + num(i.a30), 0)));
  const sum = S.goals.reduce((a, g) => a + num(g.pct), 0), gl = document.getElementById("gSum");
  if (gl) { gl.textContent = Math.round(sum) === 100 ? "Total 100%" : `Total ${Math.round(sum)}%, it needs to be 100%`; gl.className = Math.round(sum) === 100 ? "okline" : "warnline"; }
}

function viewPlan() {
  const rr = () => render(true);
  const root = h("div", { class: "stack rise" });
  root.append(h("section", { class: "card stack" },
    h("h2", null, "Savings today"),
    h("label", { class: "field" }, h("span", { class: "label" }, "Money you already have set aside"), pesoInput(S.savings, v => { S.savings = v; save(); }, "Savings today"))));
  root.append(h("section", { class: "card stack" },
    h("h2", null, "Income, take-home per payday"),
    S.income.map(i => h("div", { class: "erows" },
      h("div", { class: "erow", style: "grid-template-columns:1fr 48px" }, nameInput(i.name, v => { i.name = v; save(); }, "Income name"), S.income.length > 1 ? xBtn(() => { S.income = S.income.filter(x => x !== i); save(); rr(); }, "Remove income") : h("span")),
      h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px" },
        h("label", { class: "field" }, h("span", { class: "label" }, "On the 15th"), pesoInput(i.a15, v => { i.a15 = v; save(); totals(); }, "Amount on the 15th")),
        h("label", { class: "field" }, h("span", { class: "label" }, "On the 30th"), pesoInput(i.a30, v => { i.a30 = v; save(); totals(); }, "Amount on the 30th"))))),
    h("button", { class: "link", onclick: () => { S.income.push({ id: uid(), name: "", a15: 0, a30: 0 }); save(); rr(); } }, "+ Add income"),
    h("div", { class: "total" }, h("span", null, "Per month"), h("span", { class: "num", id: "tIncome" }, peso(S.income.reduce((a, i) => a + num(i.a15) + num(i.a30), 0))))));
  root.append(h("section", { class: "card stack" }, h("h2", null, "Fixed bills"), billsEditor(rr),
    h("div", { class: "total" }, h("span", null, "Per month"), h("span", { class: "num", id: "tBills" }, peso(S.bills.reduce((a, b) => a + num(b.amt), 0))))));
  root.append(h("section", { class: "card stack" }, h("h2", null, "Spending budget, per month"), spendEditor(rr),
    h("div", { class: "total" }, h("span", null, "Per month"), h("span", { class: "num", id: "tSpend" }, peso(S.spend.reduce((a, s) => a + num(s.amt), 0))))));
  root.append(h("section", { class: "card stack" }, h("h2", null, "Goals, share of your sobra"),
    h("div", { class: "erows" },
      S.goals.map(g => h("div", { class: "erow", style: "grid-template-columns:1fr 96px 48px" }, nameInput(g.name, v => { g.name = v; save(); }, "Goal name"),
        h("div", { class: "peso", style: "--x:1" }, h("input", { type: "text", inputmode: "decimal", value: String(num(g.pct)), "aria-label": "Percent", style: "padding-left:16px", oninput: e => { g.pct = num(e.target.value); save(); totals(); } })),
        xBtn(() => { S.goals = S.goals.filter(x => x !== g); save(); rr(); }, "Remove goal"))),
      h("button", { class: "link", onclick: () => { S.goals.push({ id: uid(), name: "", pct: 0 }); save(); rr(); } }, "+ Add a goal")),
    h("div", { class: "okline", id: "gSum" })));
  root.append(h("section", { class: "card stack" }, h("h2", null, "Your data"),
    h("p", { class: "sub", style: "margin-top:0" }, "Everything is stored on this phone only. Save a backup file before you clear your browser or change phones."),
    h("div", { class: "actions" },
      h("button", { class: "btn line", onclick: exportData }, "Save a backup"),
      h("label", { class: "btn line", style: "cursor:pointer" }, "Restore a backup", h("input", { type: "file", accept: "application/json", style: "display:none", onchange: importData })),
      h("button", { class: "btn line", onclick: () => { if (confirm("Delete your plan and start again?")) { S = blank(); save(); wizStep = 0; render(); } } }, "Start over"))));
  queueMicrotask(totals);
  return root;
}

function exportData() {
  const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" })), download: "sobra-backup.json" });
  document.body.append(a); a.click(); a.remove(); toast("Backup saved");
}
function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); if (d.v !== 1 || !Array.isArray(d.bills)) throw 0; S = d; S.onboarded = true; save(); render(); toast("Backup restored"); } catch (x) { toast("That file is not a Sobra backup"); } };
  r.readAsText(f);
}

/* ---------- setup wizard ---------- */
function viewWizard() {
  const rr = () => render(true);
  if (wizStep === 0) {
    return h("div", { class: "welcome rise" },
      h("div", { class: "blob" }),
      h("h1", null, "Know what is left before you spend it."),
      h("p", { class: "sub", style: "margin-top:0" }, "Sobra projects every payday for the next 12 months, then shows where your leftover goes. It takes a minute to set up. Nothing leaves your phone."),
      h("div", { style: "display:flex;flex-direction:column;gap:8px;align-items:flex-start" },
        h("button", { class: "btn", onclick: () => { wizStep = 1; render(); } }, "Set up my plan"),
        h("button", { class: "link", onclick: () => { S = sample(); save(); render(); } }, "Look around with sample numbers")));
  }
  const steps = {
    1: { t: "What do you take home?", s: "Your pay after tax, on each payday.", body: () => {
      const i = S.income[0];
      return h("div", { class: "stack" },
        h("label", { class: "field" }, h("span", null, "On the 15th"), pesoInput(i.a15, v => { i.a15 = v; save(); }, "Take-home on the 15th")),
        h("label", { class: "field" }, h("span", null, "On the 30th"), pesoInput(i.a30, v => { i.a30 = v; save(); }, "Take-home on the 30th")),
        h("label", { class: "field" }, h("span", null, "Savings you have today"), pesoInput(S.savings, v => { S.savings = v; save(); }, "Savings today")));
    } },
    2: { t: "Your fixed bills", s: "Things that cost the same every month. Pick which payday covers each one.", body: () => billsEditor(rr) },
    3: { t: "Monthly spending", s: "A rough budget for the rest. You can change it any time.", body: () => spendEditor(rr) },
  }[wizStep];
  const last = wizStep === 3;
  return h("div", { class: "wiz rise" },
    h("div", null, h("div", { class: "prog" }, h("i", { style: `width:${wizStep * 33.34}%` })), h("div", { class: "step", style: "margin-top:8px" }, `${wizStep} of 3`)),
    h("div", { class: "body" }, h("div", null, h("h1", null, steps.t), h("p", { class: "sub" }, steps.s)), steps.body()),
    h("div", { class: "foot" }, h("div", { class: "nav" },
      h("button", { class: "btn line", onclick: () => { wizStep--; render(); } }, "Back"),
      h("button", { class: "btn", onclick: () => last ? finish() : (wizStep++, render()) }, last ? "See my projection" : "Next"))));
}
async function finish() {
  S.onboarded = true; save(); tab = "home";
  await go(() => render(), "building your plan");
}

/* ---------- render + tabs ---------- */
function render(keepScroll) {
  const v = $("#view"), top = v.scrollTop;
  document.body.classList.toggle("setup", !S.onboarded);
  v.replaceChildren(!S.onboarded ? viewWizard() : tab === "home" ? viewHome() : tab === "goals" ? viewGoals() : viewPlan());
  v.scrollTop = keepScroll ? top : 0;
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  const d = new Date(); $("#topNote").textContent = `${MON[d.getMonth()]} ${d.getDate()}`;
}
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));

/* curtain between big screen changes (Web Animations API, ignores OS reduce-motion on purpose) */
async function go(fn, msg) {
  const c = $("#curtain"), bar = $("#cbarI"); $("#cmsg").textContent = msg;
  const ease = "cubic-bezier(.7,0,.2,1)";
  await c.animate([{ transform: "translateY(101%)" }, { transform: "translateY(0)" }], { duration: 520, easing: ease, fill: "forwards" }).finished;
  fn(); bar.animate([{ width: "0%" }, { width: "100%" }], { duration: 700, fill: "forwards" }); await wait(780);
  await c.animate([{ transform: "translateY(0)" }, { transform: "translateY(-101%)" }], { duration: 600, easing: ease, fill: "forwards" }).finished;
  c.getAnimations().forEach(a => a.cancel());
}

render();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
