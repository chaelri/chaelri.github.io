// Claude plan usage as a Windows tray icon: the session % is drawn on the icon, click it for a small card.
// Same data source as the macOS menu bar app: GET /api/oauth/usage with the Claude Code OAuth token.
// Build: build.ps1 (csc, no dependencies).
using System;
using System.Collections;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Program
{
    const int PollMs = 5 * 60 * 1000;
    // Claude-ish dark palette
    static readonly Color Bg = Color.FromArgb(0x1F, 0x1E, 0x1D), Line = Color.FromArgb(0x3A, 0x38, 0x35), Track = Color.FromArgb(0x3A, 0x38, 0x35);
    static readonly Color Ink = Color.FromArgb(0xF5, 0xF4, 0xEE), Muted = Color.FromArgb(0xA3, 0xA0, 0x96);
    static readonly Color Clay = Color.FromArgb(0xD9, 0x77, 0x57), Rust = Color.FromArgb(0xB4, 0x41, 0x2A);

    static NotifyIcon ni;
    static System.Windows.Forms.Timer timer;
    static Icon currentIcon;
    static Control inv; // UI-thread marshaller
    static Popup popup;
    static string lastError;
    static bool busy;
    static DateTime lastOk = DateTime.MinValue;
    static ArrayList rows = new ArrayList(); // each: object[] { label, percent(double), resetsAt(DateTime?) }

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern bool DestroyIcon(IntPtr h);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int val, int size);

    [STAThread]
    static void Main()
    {
        bool created;
        using (var mutex = new Mutex(true, "ClaudeUsageTray", out created))
        {
            if (!created) return;
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            inv = new Control(); inv.CreateControl(); IntPtr unused = inv.Handle;

            popup = new Popup();
            ni = new NotifyIcon { Visible = true, Text = "Claude usage" };
            ni.MouseUp += delegate(object s, MouseEventArgs e) { popup.Toggle(); };

            SetIcon("...", Clay);
            timer = new System.Windows.Forms.Timer { Interval = PollMs };
            timer.Tick += delegate { Refresh(); };
            timer.Start();
            Refresh();
            Application.Run();
            ni.Visible = false;
        }
    }

    // ---------- data ----------
    static void Refresh()
    {
        busy = true; if (popup != null) popup.Invalidate();
        ThreadPool.QueueUserWorkItem(delegate
        {
            string err = null; ArrayList newRows = new ArrayList();
            try
            {
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", ".credentials.json");
                if (!File.Exists(path)) throw new Exception("No Claude login found. Run `claude` once.");
                var ser = new JavaScriptSerializer();
                var cred = (System.Collections.Generic.Dictionary<string, object>)ser.DeserializeObject(File.ReadAllText(path));
                var oauth = (System.Collections.Generic.Dictionary<string, object>)cred["claudeAiOauth"];
                string token = (string)oauth["accessToken"]; // re-read every time, Claude Code rotates it

                var req = (HttpWebRequest)WebRequest.Create("https://api.anthropic.com/api/oauth/usage");
                req.Headers["Authorization"] = "Bearer " + token;
                req.Headers["anthropic-beta"] = "oauth-2025-04-20";
                req.UserAgent = "claude-usage-tray";
                req.Timeout = 15000;
                string body;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8)) body = sr.ReadToEnd();

                var root = (System.Collections.Generic.Dictionary<string, object>)ser.DeserializeObject(body);
                if (root.ContainsKey("limits") && root["limits"] is object[])
                {
                    foreach (object o in (object[])root["limits"])
                    {
                        var d = (System.Collections.Generic.Dictionary<string, object>)o;
                        string kind = (string)d["kind"]; double pct = Convert.ToDouble(d["percent"]);
                        string label = kind == "session" ? "Session · 5 hr" : kind == "weekly_all" ? "Weekly · all models" : "Weekly";
                        if (kind == "weekly_scoped" && d.ContainsKey("scope") && d["scope"] is System.Collections.Generic.Dictionary<string, object>)
                        {
                            var sc = (System.Collections.Generic.Dictionary<string, object>)d["scope"];
                            if (sc.ContainsKey("model") && sc["model"] is System.Collections.Generic.Dictionary<string, object>)
                            {
                                object nm = ((System.Collections.Generic.Dictionary<string, object>)sc["model"])["display_name"];
                                if (nm != null) label = "Weekly · " + nm;
                            }
                        }
                        newRows.Add(new object[] { label, pct, ParseTime(d.ContainsKey("resets_at") ? d["resets_at"] : null) });
                    }
                }
                else
                {
                    AddFlat(root, "five_hour", "Session · 5 hr", newRows);
                    AddFlat(root, "seven_day", "Weekly · all models", newRows);
                }
                if (newRows.Count == 0) throw new Exception("Unexpected response from the usage endpoint.");
            }
            catch (WebException we)
            {
                var hr = we.Response as HttpWebResponse;
                err = (hr != null && (int)hr.StatusCode == 401) ? "Login expired. Run `claude` once to refresh it." : "Network error: " + we.Message;
            }
            catch (Exception ex) { err = ex.Message; }

            inv.BeginInvoke((Action)delegate
            {
                busy = false;
                if (err == null) { rows = newRows; lastError = null; lastOk = DateTime.Now; }
                else lastError = err;
                Paint();
                popup.Relayout();
            });
        });
    }

    static void AddFlat(System.Collections.Generic.Dictionary<string, object> root, string key, string label, ArrayList into)
    {
        if (!root.ContainsKey(key) || !(root[key] is System.Collections.Generic.Dictionary<string, object>)) return;
        var d = (System.Collections.Generic.Dictionary<string, object>)root[key];
        if (d["utilization"] == null) return;
        into.Add(new object[] { label, Convert.ToDouble(d["utilization"]), ParseTime(d.ContainsKey("resets_at") ? d["resets_at"] : null) });
    }

    static DateTime? ParseTime(object o)
    {
        if (o == null) return null;
        DateTimeOffset t;
        if (DateTimeOffset.TryParse(o.ToString(), out t)) return t.LocalDateTime;
        return null;
    }

    // ---------- tray icon + tooltip ----------
    static void Paint()
    {
        if (rows.Count == 0)
        {
            SetIcon("!", Rust);
            ni.Text = Trunc(lastError ?? "Claude usage");
            return;
        }
        int p = (int)Math.Round((double)((object[])rows[0])[1]);
        SetIcon(p.ToString(), p >= 85 ? Rust : Clay);
        var sb = new StringBuilder();
        foreach (object[] r in rows) { if (sb.Length > 0) sb.Append("  "); sb.Append(Short((string)r[0])).Append(' ').Append(Math.Round((double)r[1])).Append('%'); }
        ni.Text = Trunc(sb.ToString() + (lastError != null ? "  (stale)" : ""));
    }
    static string Short(string label) { return label.StartsWith("Session") ? "5h" : label.StartsWith("Weekly · all") ? "wk" : label.Replace("Weekly · ", ""); }
    static string Trunc(string s) { return s.Length > 120 ? s.Substring(0, 120) : s; }

    // big, bold digits that fill the icon: tile in Claude clay, white glyph path centred by its real bounds
    static void SetIcon(string text, Color bg)
    {
        int size = Math.Max(16, SystemInformation.SmallIconSize.Width);
        using (var bmp = new Bitmap(size, size))
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);
            using (var tile = RoundRect(new RectangleF(0, 0, size, size), size * 0.22f))
            using (var br = new SolidBrush(bg)) g.FillPath(br, tile);
            using (var gp = new GraphicsPath())
            {
                gp.AddString(text, new FontFamily("Segoe UI"), (int)FontStyle.Bold, 100f, new PointF(0, 0), StringFormat.GenericTypographic);
                RectangleF gb = gp.GetBounds();
                float k = Math.Min(size * 0.86f / gb.Width, size * 0.68f / gb.Height);
                using (var m = new System.Drawing.Drawing2D.Matrix())
                {
                    m.Translate(-(gb.X + gb.Width / 2f), -(gb.Y + gb.Height / 2f));
                    m.Scale(k, k, MatrixOrder.Append);
                    m.Translate(size / 2f, size / 2f, MatrixOrder.Append);
                    gp.Transform(m);
                }
                using (var pen = new Pen(Color.White, Math.Max(0.6f, size * 0.035f)) { LineJoin = LineJoin.Round })
                {
                    g.FillPath(Brushes.White, gp);
                    g.DrawPath(pen, gp); // a hair of stroke makes thin digits read as bold at 16-24 px
                }
            }
            IntPtr h = bmp.GetHicon();
            Icon old = currentIcon;
            currentIcon = (Icon)Icon.FromHandle(h).Clone();
            DestroyIcon(h);
            ni.Icon = currentIcon;
            if (old != null) old.Dispose();
        }
    }

    static GraphicsPath RoundRect(RectangleF r, float radius)
    {
        var p = new GraphicsPath(); float d = radius * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); return p;
    }

    static string Fmt(DateTime t)
    {
        TimeSpan d = t - DateTime.Now;
        string rel = d.TotalMinutes < 1 ? "now" : d.TotalHours < 1 ? "in " + (int)d.TotalMinutes + "m"
            : d.TotalDays < 1 ? "in " + (int)d.TotalHours + "h " + d.Minutes + "m" : "in " + (int)d.TotalDays + "d " + d.Hours + "h";
        string when = d.TotalHours < 20 ? t.ToString("h:mm tt") : t.ToString("ddd h:mm tt");
        return when + " · " + rel;
    }

    // ---------- the card shown on click ----------
    class Popup : Form
    {
        float s = 1f;
        int hiddenAt;
        Rectangle[] hit = new Rectangle[3]; // refresh, usage, quit
        int hover = -1;
        static readonly string[] Names = { "Refresh", "Usage", "Quit" };

        public Popup()
        {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
            BackColor = Bg; DoubleBuffered = true; KeyPreview = true;
            KeyDown += delegate(object o, KeyEventArgs e) { if (e.KeyCode == Keys.Escape) Hide(); };
        }
        protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x80; return cp; } } // tool window: no alt-tab entry
        protected override void OnDeactivate(EventArgs e) { base.OnDeactivate(e); hiddenAt = Environment.TickCount; Hide(); }

        public void Toggle()
        {
            if (Visible) { Hide(); return; }
            if (Environment.TickCount - hiddenAt < 250) return; // the click that closed it also hit the icon
            Relayout();
            Rectangle wa = Screen.FromPoint(Cursor.Position).WorkingArea;
            int x = Math.Min(Math.Max(wa.Left + 8, Cursor.Position.X - Width / 2), wa.Right - Width - 8);
            Location = new Point(x, wa.Bottom - Height - 8);
            Show(); Activate();
            int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4); // Win11 rounded corners
        }

        public void Relayout()
        {
            using (var g = CreateGraphics()) s = g.DpiX / 96f;
            int rowsN = Math.Max(1, rows.Count);
            int h = P(16) + (lastError != null ? P(44) : 0) + rowsN * P(76) + P(52);
            Size = new Size(P(360), h);
            Invalidate();
        }
        int P(float v) { return (int)Math.Round(v * s); }
        Font F(float px) { return new Font("Segoe UI", px * s, FontStyle.Regular, GraphicsUnit.Pixel); }
        Font FB(float px) { return new Font("Segoe UI", px * s, FontStyle.Bold, GraphicsUnit.Pixel); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            int pad = P(20), w = Width, y = P(16);
            var fmtL = new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap };
            var fmtR = new StringFormat { Alignment = StringAlignment.Far };
            using (var f14 = F(14)) using (var f16b = FB(16)) using (var f13 = F(13))
            {
                if (lastError != null)
                {
                    using (var br = new SolidBrush(Clay)) g.DrawString(lastError, f14, br, new RectangleF(pad, y, w - pad * 2, P(40)));
                    y += P(44);
                }
                foreach (object[] r in rows)
                {
                    double pct = (double)r[1]; DateTime? t = (DateTime?)r[2];
                    using (var br = new SolidBrush(Muted)) g.DrawString((string)r[0], f14, br, new RectangleF(pad, y, w - pad * 2 - P(70), P(22)), fmtL);
                    using (var br = new SolidBrush(Ink)) g.DrawString(Math.Round(pct) + "%", f16b, br, new RectangleF(pad, y - P(2), w - pad * 2, P(24)), fmtR);
                    var track = new RectangleF(pad, y + P(28), w - pad * 2, P(8));
                    using (var gp = RoundRect(track, track.Height / 2)) using (var br = new SolidBrush(Track)) g.FillPath(br, gp);
                    float fw = (float)Math.Max(0, Math.Min(100, pct)) / 100f * track.Width;
                    if (fw >= 1)
                    {
                        fw = Math.Max(fw, track.Height);
                        using (var gp = RoundRect(new RectangleF(track.X, track.Y, fw, track.Height), track.Height / 2)) using (var br = new SolidBrush(pct >= 85 ? Rust : Clay)) g.FillPath(br, gp);
                    }
                    using (var br = new SolidBrush(Muted)) g.DrawString(t.HasValue ? "resets " + Fmt(t.Value) : "reset time unknown", f13, br, pad, y + P(44));
                    y += P(76);
                }
                // footer
                using (var pen = new Pen(Line)) g.DrawLine(pen, pad, y, w - pad, y);
                using (var br = new SolidBrush(Muted)) g.DrawString(busy ? "Updating..." : lastOk == DateTime.MinValue ? "Not updated yet" : "Updated " + lastOk.ToString("h:mm tt"), f13, br, pad, y + P(16));
                int rx = w - pad;
                for (int i = 2; i >= 0; i--)
                {
                    SizeF sz = g.MeasureString(Names[i], f14);
                    int bw = (int)sz.Width + P(8), bx = rx - bw;
                    hit[i] = new Rectangle(bx, y + P(10), bw, P(30));
                    using (var br = new SolidBrush(hover == i ? Clay : Ink)) g.DrawString(Names[i], f14, br, bx + P(4), y + P(15));
                    rx = bx - P(10);
                }
            }
            using (var pen = new Pen(Line)) g.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            int h = -1; for (int i = 0; i < 3; i++) if (hit[i].Contains(e.Location)) h = i;
            if (h != hover) { hover = h; Cursor = h >= 0 ? Cursors.Hand : Cursors.Default; Invalidate(); }
        }
        protected override void OnMouseLeave(EventArgs e) { if (hover != -1) { hover = -1; Invalidate(); } }
        protected override void OnMouseUp(MouseEventArgs e)
        {
            if (hover == 0) Program.Refresh(); // plain Refresh() would be Control.Refresh (a repaint) and do nothing
            else if (hover == 1) { Hide(); System.Diagnostics.Process.Start("https://claude.ai/settings/usage"); }
            else if (hover == 2) Application.Exit();
        }
    }
}
