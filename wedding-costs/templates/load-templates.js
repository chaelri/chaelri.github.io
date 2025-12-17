async function load(id, path) {
  const res = await fetch(path);
  document.getElementById(id).innerHTML = await res.text();
}

await load("tpl-header", "./templates/header.html");
await load("tpl-costs", "./templates/costs.html");
await load("tpl-checklist", "./templates/checklist.html");
await load("tpl-guests", "./templates/guests.html");
await load("tpl-modals", "./templates/modals.html");
