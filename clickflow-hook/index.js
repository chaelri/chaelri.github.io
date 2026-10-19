// clickflow-hook: POST anything → saved under /clickflow/messages in the test RTDB →
// the exact payload is posted to the #clickflow Discord channel. The webhook URL only
// exists in this service's env (DISCORD_WEBHOOK_URL), never in the repo or a client.
import http from 'node:http';

const DB = 'https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app';
const PATH = 'clickflow/messages';
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const MAX_BODY = 64 * 1024;
const DISCORD_LIMIT = 1900;

const db = (p, opts = {}) =>
  fetch(`${DB}/${p}.json`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async (r) => {
    if (!r.ok) throw new Error(`RTDB ${r.status}: ${await r.text()}`);
    return r.json();
  });

// The exact thing received: JSON is shown as JSON, text as text.
function render(data) {
  return typeof data === 'string' ? data : '```json\n' + JSON.stringify(data, null, 2) + '\n```';
}

async function sendToDiscord(id, record) {
  const text = render(record.data);
  const payload = { allowed_mentions: { parse: [] } };   // a payload can never ping @everyone
  let res;
  if (text.length <= DISCORD_LIMIT) {
    payload.content = text;
    res = await fetch(`${WEBHOOK}?wait=true`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } else {
    // Too long for a message: attach it whole instead of cutting it.
    const form = new FormData();
    payload.content = `New entry \`${id}\` (${text.length} chars, attached)`;
    form.append('payload_json', JSON.stringify(payload));
    const isText = typeof record.data === 'string';
    form.append('files[0]', new Blob([isText ? record.data : JSON.stringify(record.data, null, 2)]),
      isText ? `${id}.txt` : `${id}.json`);
    res = await fetch(`${WEBHOOK}?wait=true`, { method: 'POST', body: form });
  }
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  const msg = await res.json();
  await db(`${PATH}/${id}`, { method: 'PATCH', body: JSON.stringify({ delivered: true, discordMessageId: msg.id }) });
}

// Delivers every entry not yet sent: anything written straight into RTDB, or a send that failed.
let sweeping = null;
async function sweep() {
  if (sweeping) return sweeping;
  sweeping = (async () => {
    const all = (await db(`${PATH}`, { method: 'GET' })) || {};
    // Skip fresh entries: their own request is still delivering them.
    const cutoff = Date.now() - 30_000;
    const pending = Object.entries(all).filter(([, r]) =>
      r && !r.delivered && 'data' in r && !(Date.parse(r.receivedAt) > cutoff));
    let sent = 0;
    for (const [id, r] of pending) {   // keys are push ids, so this is arrival order
      try { await sendToDiscord(id, r); sent++; } catch (e) { console.error('deliver', id, e.message); }
    }
    return { pending: pending.length, sent };
  })().finally(() => { sweeping = null; });
  return sweeping;
}

const reply = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
};

http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/sweep') return reply(res, 200, { ok: true, ...(await sweep()) });
    if (req.method === 'GET') return reply(res, 200, { ok: true, usage: 'POST a JSON body (or plain text) to /' });
    if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'POST only' });
    if (!WEBHOOK) return reply(res, 500, { ok: false, error: 'DISCORD_WEBHOOK_URL not set' });

    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) return reply(res, 413, { ok: false, error: 'Body over 64 KB' });
    }
    if (!raw.trim()) return reply(res, 400, { ok: false, error: 'Empty body' });
    let data = raw;
    if ((req.headers['content-type'] || '').includes('json') || /^[\[{"]/.test(raw.trim())) {
      try { data = JSON.parse(raw); } catch { return reply(res, 400, { ok: false, error: 'Invalid JSON' }); }
    }

    const record = { data, receivedAt: new Date().toISOString(), delivered: false };
    const { name: id } = await db(PATH, { method: 'POST', body: JSON.stringify(record) });

    let delivered = true, error;
    try { await sendToDiscord(id, record); } catch (e) { delivered = false; error = e.message; console.error(e); }
    sweep().catch((e) => console.error('sweep', e.message));   // retry anything left over
    reply(res, delivered ? 200 : 202, { ok: true, id, delivered, ...(error && { error }) });
  } catch (e) {
    console.error(e);
    reply(res, 500, { ok: false, error: e.message });
  }
}).listen(process.env.PORT || 8080);
