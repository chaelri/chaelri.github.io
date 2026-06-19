// Shared ticket markup + QR rendering. Used by print.html (the print sheet)
// and index.html (the admin "Print Tickets" card preview).

let _qrcodeMod = null;
async function qrcodeLib() {
  if (_qrcodeMod) return _qrcodeMod;
  const m = await import("https://esm.sh/qrcode-generator@1.4.4");
  _qrcodeMod = m.default;
  return _qrcodeMod;
}

export async function makeQrSvg(text, opts = {}) {
  const { cellSize = 4, margin = 1 } = opts;
  const QR = await qrcodeLib();
  const q = QR(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize, margin, scalable: true });
}

// Dark-navy body + yellow tape headline + white stub. `id` is the ECU-#### string.
export function ticketHtml(id, qrSvg) {
  return `
    <div class="ticket">
      <span class="ticket-perf-dot-top"></span>
      <span class="ticket-perf-dot-bot"></span>

      <div class="ticket-body">
        <img src="assets/elevate-east-ortigas.png" alt="Elevate East Ortigas"
             style="height:0.32in; width:auto; align-self:flex-start; display:block;" />

        <img src="assets/campus-unite-logo.png" alt="Campus UNITE — Elevate's 13th Anniversary"
             style="height:0.82in; width:auto; align-self:flex-start; display:block; margin-top:0.04in; max-width:100%; object-fit:contain;" />

        <div class="grid grid-cols-3" style="gap:0.08in; font-size:6.5pt; color:#cbd0ec; margin-top:auto; padding-bottom:0.04in;">
          <div>
            <div style="color:#f5d518; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; font-size:5.5pt;">When</div>
            <div style="color:#fff; font-weight:700; line-height:1.15;">Jul 17, 2026</div>
            <div style="color:#8b91b8;">Friday</div>
          </div>
          <div>
            <div style="color:#f5d518; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; font-size:5.5pt;">Time</div>
            <div style="color:#fff; font-weight:700; line-height:1.15;">3:00 PM</div>
            <div style="color:#8b91b8;">Doors 2:30</div>
          </div>
          <div>
            <div style="color:#f5d518; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; font-size:5.5pt;">Where</div>
            <div style="color:#fff; font-weight:700; line-height:1.15;">SM East Ortigas</div>
            <div style="color:#8b91b8;">3F Parking Lvl</div>
          </div>
        </div>
      </div>

      <div class="ticket-stub">
        <div class="qr-host" style="width:0.95in; height:0.95in; display:flex; align-items:center; justify-content:center;">${qrSvg}</div>
        <div style="text-align:center; width:100%;">
          <div style="font-size:5.5pt; text-transform:uppercase; letter-spacing:0.2em; font-weight:800; color:#666;">Ticket No.</div>
          <div style="font-family:'Bebas Neue', sans-serif; color:#e11d2c; font-size:0.3in; line-height:1; letter-spacing:0.01em; font-weight:800; white-space:nowrap;">${id}</div>
        </div>
      </div>
    </div>`;
}
