// Claude plan usage as a Windows tray icon: the session % is drawn on the icon itself.
// Same data source as the macOS menu bar app: GET /api/oauth/usage with the Claude Code OAuth token.
// Build: build.ps1 (csc, no dependencies).
using System;
using System.Collections;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Program
{
    const int PollMs = 5 * 60 * 1000;
    static NotifyIcon ni;
    static ContextMenuStrip menu;
    static System.Windows.Forms.Timer timer;
    static Icon currentIcon;
    static Control inv; // UI-thread marshaller
    static string lastError;
    static DateTime lastOk = DateTime.MinValue;
    static ArrayList rows = new ArrayList(); // each: object[] { label, percent(double), resetsAt(DateTime?) }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern bool DestroyIcon(IntPtr h);

    [STAThread]
    static void Main()
    {
        bool created;
        using (var mutex = new Mutex(true, "ClaudeUsageTray", out created))
        {
            if (!created) return;
            Application.EnableVisualStyles();
            inv = new Control(); inv.CreateControl(); IntPtr unused = inv.Handle;
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2

            menu = new ContextMenuStrip();
            ni = new NotifyIcon { Visible = true, ContextMenuStrip = menu, Text = "Claude usage" };
            ni.MouseUp += delegate(object s, MouseEventArgs e)
            {
                if (e.Button != MouseButtons.Left) return;
                BuildMenu();
                typeof(NotifyIcon).GetMethod("ShowContextMenu", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(ni, null);
            };
            menu.Opening += delegate { BuildMenu(); };

            SetIcon("...", Color.FromArgb(0xD9, 0x77, 0x57));
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
                if (err == null) { rows = newRows; lastError = null; lastOk = DateTime.Now; }
                else lastError = err;
                Paint();
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
            SetIcon("!", Color.FromArgb(0xB4, 0x41, 0x2A));
            ni.Text = Trunc(lastError ?? "Claude usage");
            return;
        }
        double session = (double)((object[])rows[0])[1];
        int p = (int)Math.Round(session);
        Color c = p >= 85 ? Color.FromArgb(0xB4, 0x41, 0x2A) : Color.FromArgb(0xD9, 0x77, 0x57); // Claude clay orange, deeper rust when nearly full
        SetIcon(p.ToString(), c);
        var sb = new StringBuilder();
        foreach (object[] r in rows) { if (sb.Length > 0) sb.Append("  "); sb.Append(Short((string)r[0])).Append(' ').Append(Math.Round((double)r[1])).Append('%'); }
        ni.Text = Trunc(sb.ToString() + (lastError != null ? "  (stale)" : ""));
    }

    static string Short(string label) { return label.StartsWith("Session") ? "5h" : label.StartsWith("Weekly · all") ? "wk" : label.Replace("Weekly · ", ""); }
    static string Trunc(string s) { return s.Length > 120 ? s.Substring(0, 120) : s; }

    static void SetIcon(string text, Color bg)
    {
        int size = Math.Max(16, SystemInformation.SmallIconSize.Width) * 2; // draw 2x, Windows scales it down smoothly
        using (var bmp = new Bitmap(size, size))
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.Clear(Color.Transparent);
            using (var path = RoundRect(new Rectangle(0, 0, size - 1, size - 1), size / 4))
            using (var br = new SolidBrush(bg)) g.FillPath(br, path);
            // draw the digits as a path, measure the real glyph bounds, scale to fit, and centre exactly in the tile
            using (var gp = new GraphicsPath())
            {
                gp.AddString(text, new FontFamily("Segoe UI"), (int)FontStyle.Bold, 100f, new PointF(0, 0), StringFormat.GenericTypographic);
                RectangleF gb = gp.GetBounds();
                float k = Math.Min(size * 0.82f / gb.Width, size * 0.62f / gb.Height);
                using (var m = new Matrix())
                {
                    m.Translate(-(gb.X + gb.Width / 2f), -(gb.Y + gb.Height / 2f));
                    m.Scale(k, k, MatrixOrder.Append);
                    m.Translate(size / 2f, size / 2f, MatrixOrder.Append);
                    gp.Transform(m);
                }
                g.FillPath(Brushes.White, gp);
            }
            IntPtr h = bmp.GetHicon();
            Icon old = currentIcon;
            currentIcon = (Icon)Icon.FromHandle(h).Clone();
            DestroyIcon(h);
            ni.Icon = currentIcon;
            if (old != null) old.Dispose();
        }
    }

    static GraphicsPath RoundRect(Rectangle r, int radius)
    {
        var p = new GraphicsPath(); int d = radius * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); return p;
    }

    // ---------- menu ----------
    static void BuildMenu()
    {
        menu.Items.Clear();
        if (lastError != null)
        {
            var e = menu.Items.Add(lastError); e.Enabled = false;
            menu.Items.Add("-");
        }
        foreach (object[] r in rows)
        {
            var head = menu.Items.Add(string.Format("{0}   {1}%", r[0], Math.Round((double)r[1])));
            head.Font = new Font(head.Font, FontStyle.Bold); head.Enabled = false; head.ForeColor = Color.Black;
            DateTime? t = (DateTime?)r[2];
            var sub = menu.Items.Add(t.HasValue ? "resets " + Fmt(t.Value) : "reset time unknown"); sub.Enabled = false;
        }
        if (rows.Count > 0) menu.Items.Add("-");
        var upd = menu.Items.Add(lastOk == DateTime.MinValue ? "Not updated yet" : "Updated " + lastOk.ToString("h:mm tt")); upd.Enabled = false;
        menu.Items.Add("Refresh", null, delegate { Refresh(); });
        menu.Items.Add("Usage settings...", null, delegate { System.Diagnostics.Process.Start("https://claude.ai/settings/usage"); });
        menu.Items.Add("-");
        menu.Items.Add("Quit", null, delegate { Application.Exit(); });
    }

    static string Fmt(DateTime t)
    {
        TimeSpan d = t - DateTime.Now;
        string rel = d.TotalMinutes < 1 ? "now" : d.TotalHours < 1 ? "in " + (int)d.TotalMinutes + "m"
            : d.TotalDays < 1 ? "in " + (int)d.TotalHours + "h " + d.Minutes + "m" : "in " + (int)d.TotalDays + "d " + d.Hours + "h";
        string when = d.TotalHours < 20 ? t.ToString("h:mm tt") : t.ToString("ddd h:mm tt");
        return when + " · " + rel;
    }
}
