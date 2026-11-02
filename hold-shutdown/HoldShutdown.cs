// HoldShutdown - hold a mouse button for N seconds to shut the PC down.
// A ring animation follows the cursor while you hold. Skipped while VALORANT runs.
// Starts in TEST mode (no real shutdown) unless launched with --armed.
// Build: powershell -File build.ps1   (uses the .NET Framework csc, C# 5 syntax only)
//
// Args: --armed            real shutdown (default is test mode)
//       --button right|middle|x1|x2   (default x1 = back side button)
//       --seconds 5

using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        bool created;
        Mutex mutex = new Mutex(true, "HoldShutdown.SingleInstance", out created);
        if (!created) return;
        if (args.Length == 2 && args[0] == "--preview") { Overlay.Preview(args[1]); return; }
        Native.SetProcessDPIAware();
        Application.EnableVisualStyles();
        Application.Run(new App(Config.Parse(args)));
        GC.KeepAlive(mutex);
    }
}

class Config
{
    public string Button = "x1";
    public double Seconds = 5.0;
    public double ShowDelay = 0.35; // don't flash the ring on normal clicks
    public bool Test = true;

    public static Config Parse(string[] args)
    {
        Config c = new Config();
        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i].ToLowerInvariant();
            if (a == "--armed") c.Test = false;
            else if (a == "--test") c.Test = true;
            else if (a == "--button" && i + 1 < args.Length) c.Button = args[++i].ToLowerInvariant();
            else if (a == "--seconds" && i + 1 < args.Length) c.Seconds = double.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture);
        }
        return c;
    }
}

class App : ApplicationContext
{
    static readonly string[] GameProcesses = { "VALORANT-Win64-Shipping", "VALORANT" };

    readonly Config cfg;
    readonly Overlay overlay = new Overlay();
    readonly EdgeGlow edge = new EdgeGlow();
    double blinkPhase;
    readonly NotifyIcon tray = new NotifyIcon();
    readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer();
    readonly System.Threading.Timer gameCheck;
    readonly Stopwatch held = new Stopwatch();
    readonly Stopwatch done = new Stopwatch();
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly Native.HookProc hookProc;
    IntPtr hook;

    volatile bool gameRunning;
    bool holding, fired, paused;
    double alpha, shownProgress;
    ToolStripMenuItem testItem, pauseItem;

    public App(Config cfg)
    {
        this.cfg = cfg;
        hookProc = HookCallback;
        hook = Native.SetWindowsHookEx(14 /*WH_MOUSE_LL*/, hookProc, Native.GetModuleHandle(null), 0);

        gameCheck = new System.Threading.Timer(delegate { gameRunning = IsGameRunning(); }, null, 0, 2000);

        anim.Interval = 15;
        anim.Tick += delegate { Tick(); };

        BuildTray();
    }

    static bool IsGameRunning()
    {
        foreach (string name in GameProcesses)
        {
            Process[] p = Process.GetProcessesByName(name);
            bool any = p.Length > 0;
            foreach (Process x in p) x.Dispose();
            if (any) return true;
        }
        return false;
    }

    void BuildTray()
    {
        ContextMenuStrip menu = new ContextMenuStrip();
        testItem = new ToolStripMenuItem("Test mode (no real shutdown)");
        testItem.Checked = cfg.Test;
        testItem.Click += delegate { cfg.Test = !cfg.Test; testItem.Checked = cfg.Test; UpdateTrayText(); };
        pauseItem = new ToolStripMenuItem("Paused");
        pauseItem.Click += delegate { paused = !paused; pauseItem.Checked = paused; UpdateTrayText(); };
        ToolStripMenuItem exit = new ToolStripMenuItem("Exit");
        exit.Click += delegate { Quit(); };
        menu.Items.Add(testItem);
        menu.Items.Add(pauseItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exit);

        using (Bitmap b = new Bitmap(32, 32))
        {
            using (Graphics g = Graphics.FromImage(b))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (Pen p = new Pen(Color.FromArgb(0, 220, 255), 4))
                {
                    p.StartCap = p.EndCap = LineCap.Round;
                    g.DrawArc(p, 5, 5, 22, 22, -50, 280);
                    g.DrawLine(p, 16, 3, 16, 14);
                }
            }
            tray.Icon = Icon.FromHandle(b.GetHicon());
        }
        tray.ContextMenuStrip = menu;
        tray.Visible = true;
        UpdateTrayText();
        tray.ShowBalloonTip(3000, "Hold Shutdown",
            "Hold " + ButtonName() + " for " + cfg.Seconds + "s. " + (cfg.Test ? "TEST mode: no real shutdown." : "ARMED: will really shut down."),
            ToolTipIcon.Info);
    }

    string ButtonName()
    {
        switch (cfg.Button)
        {
            case "middle": return "middle click";
            case "x1": return "back side button";
            case "x2": return "forward side button";
            default: return "right click";
        }
    }

    void UpdateTrayText()
    {
        string s = "Hold Shutdown - " + (paused ? "paused" : cfg.Test ? "TEST mode" : "ARMED");
        tray.Text = s;
    }

    // ---- input -------------------------------------------------------------

    IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            Native.MSLLHOOKSTRUCT d = (Native.MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
            bool injected = (d.flags & 1) != 0;
            if (!injected)
            {
                int msg = wParam.ToInt32();
                int x = (int)(d.mouseData >> 16) & 0xFFFF;
                bool down = false, up = false;
                switch (cfg.Button)
                {
                    case "middle": down = msg == 0x207; up = msg == 0x208; break;
                    case "x1": down = msg == 0x20B && x == 1; up = msg == 0x20C && x == 1; break;
                    case "x2": down = msg == 0x20B && x == 2; up = msg == 0x20C && x == 2; break;
                    default: down = msg == 0x204; up = msg == 0x205; break;
                }
                if (down) OnDown();
                else if (up) OnUp();
            }
        }
        return Native.CallNextHookEx(hook, nCode, wParam, lParam);
    }

    void OnDown()
    {
        if (paused || gameRunning || done.IsRunning) return;
        holding = true;
        fired = false;
        held.Restart();
        anim.Start();
    }

    void OnUp()
    {
        holding = false;
        held.Stop();
    }

    // ---- animation ---------------------------------------------------------

    void Tick()
    {
        double t = clock.Elapsed.TotalSeconds;
        Point cur = Cursor.Position;

        if (done.IsRunning)
        {
            double dt = done.Elapsed.TotalSeconds;
            if (dt > 1.8) alpha = Math.Max(0, alpha - 0.08);
            overlay.Render(cur, 1.0, alpha, t, cfg.Test ? Overlay.Mode.TestDone : Overlay.Mode.ShuttingDown, 0, cfg.Test);
            Blink(cur, 1.0, cfg.Test ? 3.0 : 8.0);
            if (alpha <= 0 && dt > 1.8) { done.Reset(); Hide(); }
            return;
        }

        if (holding && gameRunning) holding = false;

        if (holding)
        {
            double h = held.Elapsed.TotalSeconds;
            if (h < cfg.ShowDelay) return;
            alpha = Math.Min(1, alpha + 0.12);
            shownProgress = Math.Min(1, h / cfg.Seconds);
            if (h >= cfg.Seconds && !fired)
            {
                fired = true;
                holding = false;
                Fire();
                return;
            }
            overlay.Render(cur, shownProgress, alpha, t, Overlay.Mode.Charging, Math.Max(0, cfg.Seconds - h), cfg.Test);
            Blink(cur, shownProgress, 1.2 + 6.0 * shownProgress);
        }
        else
        {
            // released early: ring rewinds and fades
            alpha = Math.Max(0, alpha - 0.1);
            shownProgress = Math.Max(0, shownProgress - 0.06);
            if (alpha <= 0) { Hide(); return; }
            overlay.Render(cur, shownProgress, alpha, t, Overlay.Mode.Charging, cfg.Seconds * (1 - shownProgress), cfg.Test);
            Blink(cur, shownProgress, 1.2 + 6.0 * shownProgress);
        }
    }

    // red screen-edge blink: gets brighter and faster as the hold fills up
    void Blink(Point cur, double p, double hz)
    {
        blinkPhase += 2 * Math.PI * hz * anim.Interval / 1000.0;
        double wave = 0.5 + 0.5 * Math.Sin(blinkPhase);
        double level = alpha * (0.2 + 0.8 * p) * (0.25 + 0.75 * wave);
        edge.Show(cur, level);
    }

    void Hide()
    {
        anim.Stop();
        edge.HideGlow();
        blinkPhase = 0;
        alpha = 0;
        shownProgress = 0;
        overlay.HideOverlay();
    }

    void Fire()
    {
        done.Restart();
        alpha = 1;
        if (cfg.Test) return;
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("shutdown", "/s /t 1");
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            Process.Start(psi);
        }
        catch (Exception e)
        {
            tray.ShowBalloonTip(4000, "Hold Shutdown", "Shutdown failed: " + e.Message, ToolTipIcon.Error);
        }
    }

    void Quit()
    {
        if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook);
        gameCheck.Dispose();
        tray.Visible = false;
        tray.Dispose();
        overlay.Dispose();
        edge.Dispose();
        ExitThread();
    }
}

// Full-screen red edge glow on the monitor under the cursor. Rendered once per
// screen size; blinking only changes the window's constant alpha (cheap on 4K).
class EdgeGlow : Form
{
    Rectangle bounds = Rectangle.Empty;
    bool visible;

    public EdgeGlow()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        IntPtr h = Handle;
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x80000 | 0x20 | 0x8 | 0x80 | 0x08000000;
            return cp;
        }
    }

    public void Show(Point cursor, double level)
    {
        Rectangle b = Screen.FromPoint(cursor).Bounds;
        byte alpha = (byte)Math.Max(0, Math.Min(255, (int)(level * 255)));
        if (b != bounds)
        {
            bounds = b;
            RenderGlow(alpha);
        }
        else
        {
            Native.BLENDFUNCTION blend = new Native.BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = alpha, AlphaFormat = 1 };
            Native.UpdateLayeredWindowAlpha(Handle, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, ref blend, 2);
        }
        Native.SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        if (!visible) { Native.ShowWindow(Handle, 4); visible = true; }
    }

    public void HideGlow()
    {
        if (visible) { Native.ShowWindow(Handle, 0); visible = false; }
    }

    void RenderGlow(byte alpha)
    {
        int w = bounds.Width, h = bounds.Height;
        int t = Math.Max(40, Math.Min(w, h) / 14); // glow depth
        using (Bitmap bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                Color edge = Color.FromArgb(210, 255, 84, 112);
                Color clear = Color.FromArgb(0, 255, 84, 112);
                // top, bottom, left, right gradients
                using (LinearGradientBrush lb = new LinearGradientBrush(new Rectangle(0, 0, w, t), edge, clear, LinearGradientMode.Vertical))
                    g.FillRectangle(lb, 0, 0, w, t);
                using (LinearGradientBrush lb = new LinearGradientBrush(new Rectangle(0, h - t, w, t), clear, edge, LinearGradientMode.Vertical))
                    g.FillRectangle(lb, 0, h - t, w, t);
                using (LinearGradientBrush lb = new LinearGradientBrush(new Rectangle(0, 0, t, h), edge, clear, LinearGradientMode.Horizontal))
                    g.FillRectangle(lb, 0, 0, t, h);
                using (LinearGradientBrush lb = new LinearGradientBrush(new Rectangle(w - t, 0, t, h), clear, edge, LinearGradientMode.Horizontal))
                    g.FillRectangle(lb, w - t, 0, t, h);
                // hard bright line right at the edge
                using (Pen p = new Pen(Color.FromArgb(230, 255, 110, 140), 4))
                    g.DrawRectangle(p, 3, 3, w - 6, h - 6);
            }

            IntPtr screenDc = Native.GetDC(IntPtr.Zero);
            IntPtr memDc = Native.CreateCompatibleDC(screenDc);
            IntPtr hBmp = bmp.GetHbitmap(Color.FromArgb(0));
            IntPtr old = Native.SelectObject(memDc, hBmp);
            try
            {
                Native.SIZE size = new Native.SIZE { cx = w, cy = h };
                Native.POINT src = new Native.POINT { x = 0, y = 0 };
                Native.POINT dst = new Native.POINT { x = bounds.X, y = bounds.Y };
                Native.BLENDFUNCTION blend = new Native.BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = alpha, AlphaFormat = 1 };
                Native.UpdateLayeredWindow(Handle, screenDc, ref dst, ref size, memDc, ref src, 0, ref blend, 2);
            }
            finally
            {
                Native.SelectObject(memDc, old);
                Native.DeleteObject(hBmp);
                Native.DeleteDC(memDc);
                Native.ReleaseDC(IntPtr.Zero, screenDc);
            }
        }
    }
}

class Overlay : Form
{
    public enum Mode { Charging, TestDone, ShuttingDown }

    const int S = 260;
    bool visible;

    public Overlay()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Size = new Size(S, S);
        IntPtr h = Handle; // force handle creation
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            // layered | transparent (click-through) | topmost | toolwindow | noactivate
            cp.ExStyle |= 0x80000 | 0x20 | 0x8 | 0x80 | 0x08000000;
            return cp;
        }
    }

    public static void Preview(string path)
    {
        using (Overlay o = new Overlay())
        using (Bitmap strip = new Bitmap(S * 4, S))
        using (Graphics sg = Graphics.FromImage(strip))
        {
            sg.Clear(Color.FromArgb(60, 70, 90));
            double[] ps = { 0.15, 0.55, 0.92, 1 };
            for (int i = 0; i < 4; i++)
                using (Bitmap b = new Bitmap(S, S))
                using (Graphics g = Graphics.FromImage(b))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                    o.Draw(g, ps[i], 1, 1.3 + i, i == 3 ? Mode.TestDone : Mode.Charging, 5 * (1 - ps[i]), true);
                    sg.DrawImage(b, i * S, 0);
                }
            strip.Save(path);
        }
    }

    public void HideOverlay()
    {
        if (visible) { Native.ShowWindow(Handle, 0); visible = false; }
    }

    static Color A(Color c, double a) { return Color.FromArgb(Math.Max(0, Math.Min(255, (int)(c.A * a))), c.R, c.G, c.B); }

    static Color Lerp(Color a, Color b, double t)
    {
        return Color.FromArgb(
            (int)(a.R + (b.R - a.R) * t),
            (int)(a.G + (b.G - a.G) * t),
            (int)(a.B + (b.B - a.B) * t));
    }

    public void Render(Point cursor, double progress, double alpha, double time, Mode mode, double remaining, bool test)
    {
        using (Bitmap bmp = new Bitmap(S, S, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.Clear(Color.Transparent);
                Draw(g, progress, alpha, time, mode, remaining, test);
            }
            Push(bmp, cursor.X - S / 2, cursor.Y - S / 2);
        }
        if (!visible) { Native.ShowWindow(Handle, 4 /*SW_SHOWNOACTIVATE*/); visible = true; }
    }

    // Cozy "little planet" style: sticker outlines, cream + pastel, a sleepy planet face.
    static readonly Color Navy = Color.FromArgb(34, 38, 75);
    static readonly Color Cream = Color.FromArgb(255, 246, 228);
    static readonly Color Sky = Color.FromArgb(142, 197, 255);
    static readonly Color SkyDeep = Color.FromArgb(104, 160, 240);
    static readonly Color Sun = Color.FromArgb(255, 212, 92);
    static readonly Color Rose = Color.FromArgb(255, 122, 156);
    static readonly Color Mint = Color.FromArgb(126, 222, 170);

    static GraphicsPath RoundRect(float x, float y, float w, float h, float r)
    {
        GraphicsPath p = new GraphicsPath();
        float d = r * 2;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + w - d, y, d, d, 270, 90);
        p.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        p.AddArc(x, y + h - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static GraphicsPath StarPath(float cx, float cy, float r, double rot, int points, float inner)
    {
        GraphicsPath p = new GraphicsPath();
        PointF[] pts = new PointF[points * 2];
        for (int i = 0; i < pts.Length; i++)
        {
            double ang = rot + i * Math.PI / points - Math.PI / 2;
            float rr = (i % 2 == 0) ? r : r * inner;
            pts[i] = new PointF(cx + (float)(Math.Cos(ang) * rr), cy + (float)(Math.Sin(ang) * rr));
        }
        p.AddPolygon(pts);
        return p;
    }

    void Draw(Graphics g, double p, double a, double time, Mode mode, double remaining, bool test)
    {
        float c = S / 2f;
        bool doneMode = mode != Mode.Charging;
        Color fill = mode == Mode.TestDone ? Mint : Lerp(Sun, Rose, p);

        // gentle float; wobbles faster near the end
        bool urgent = mode == Mode.Charging && remaining < 1.2 && p > 0;
        float bob = (float)Math.Sin(time * (urgent ? 14 : 3)) * (urgent ? 2.2f : 1.5f);

        // twinkling sparkles
        double[] sAng = { -2.4, -0.7, 0.5, 2.6 };
        float[] sRad = { 84, 88, 82, 86 };
        for (int i = 0; i < sAng.Length; i++)
        {
            float tw = (float)(0.55 + 0.45 * Math.Sin(time * 3.2 + i * 1.7));
            float sx = c + (float)(Math.Cos(sAng[i]) * sRad[i]);
            float sy = c + (float)(Math.Sin(sAng[i]) * sRad[i]);
            using (GraphicsPath sp = StarPath(sx, sy, 6.5f * tw, 0, 4, 0.32f))
            using (SolidBrush sb = new SolidBrush(A(Color.FromArgb(235, Cream), a * tw)))
                g.FillPath(sb, sp);
        }

        // soft backdrop so it reads on any wallpaper
        using (SolidBrush bd = new SolidBrush(A(Color.FromArgb(120, Navy), a)))
            g.FillEllipse(bd, c - 70, c - 70, 140, 140);

        // orbit track (sticker: navy outline under cream)
        float rr = 56;
        RectangleF orbit = new RectangleF(c - rr, c - rr, rr * 2, rr * 2);
        using (Pen o = new Pen(A(Navy, a), 15)) g.DrawEllipse(o, orbit);
        using (Pen t = new Pen(A(Color.FromArgb(255, Cream), a), 10)) g.DrawEllipse(t, orbit);

        // progress fill
        float sweep = (float)(360 * p);
        if (sweep > 1)
        {
            using (Pen pf = new Pen(A(fill, a), 10))
            {
                pf.StartCap = pf.EndCap = LineCap.Round;
                g.DrawArc(pf, orbit, -90, sweep);
            }
        }

        // little star riding the orbit
        double ha = (-90 + Math.Max(sweep, 0)) * Math.PI / 180;
        float hx = c + (float)(Math.Cos(ha) * rr), hy = c + (float)(Math.Sin(ha) * rr);
        using (GraphicsPath st = StarPath(hx, hy, 11, time * 1.5, 5, 0.5f))
        {
            using (Pen so = new Pen(A(Navy, a), 3.5f)) { so.LineJoin = LineJoin.Round; g.DrawPath(so, st); }
            using (SolidBrush sf = new SolidBrush(A(Sun, a))) g.FillPath(sf, st);
        }

        // the planet
        float pr = 31, py = c + bob;
        RectangleF planet = new RectangleF(c - pr, py - pr, pr * 2, pr * 2);
        using (GraphicsPath pp = new GraphicsPath())
        {
            pp.AddEllipse(planet);
            using (LinearGradientBrush lg = new LinearGradientBrush(planet, A(Sky, a), A(SkyDeep, a), 60f))
                g.FillPath(lg, pp);
            // craters
            using (SolidBrush cr = new SolidBrush(A(Color.FromArgb(70, 255, 255, 255), a)))
            {
                g.FillEllipse(cr, c + 12, py - 22, 9, 7);
                g.FillEllipse(cr, c - 22, py + 10, 7, 6);
            }
            using (Pen po = new Pen(A(Navy, a), 3.5f)) g.DrawPath(po, pp);
        }

        // face: eyes get sleepier as the hold fills, closed when done
        double sleepy = doneMode ? 1 : Math.Max(0, (p - 0.55) / 0.45);
        using (Pen fp = new Pen(A(Navy, a), 2.6f))
        using (SolidBrush fb = new SolidBrush(A(Navy, a)))
        using (SolidBrush blush = new SolidBrush(A(Color.FromArgb(150, Rose), a)))
        {
            fp.StartCap = fp.EndCap = LineCap.Round;
            float ey = py - 1;
            for (int s = -1; s <= 1; s += 2)
            {
                float ex = c + s * 11;
                if (sleepy >= 0.95)
                    g.DrawArc(fp, ex - 4.5f, ey - 3, 9, 6, 20, 140);          // closed, content
                else
                {
                    float eh = 8f * (float)(1 - sleepy * 0.75);
                    g.FillEllipse(fb, ex - 3, ey - eh / 2, 6, eh);
                }
                g.FillEllipse(blush, ex - 5 + s * 3, py + 6, 9, 5);
            }
            g.DrawArc(fp, c - 4, py + 3, 8, 6, 20, 140);                     // small smile
        }

        // floating z's once asleep
        if (doneMode)
        {
            using (Font zf = new Font("Segoe UI Black", 12, FontStyle.Regular, GraphicsUnit.Pixel))
            {
                for (int i = 0; i < 2; i++)
                {
                    double ph = (time * 0.7 + i * 0.5) % 1.0;
                    using (SolidBrush zb = new SolidBrush(A(Cream, a * (1 - ph))))
                        g.DrawString("z", zf, zb, c + 22 + (float)(ph * 10) + i * 4, py - 36 - (float)(ph * 22));
                }
            }
        }

        // pill label
        string label;
        if (mode == Mode.TestDone) label = "test ok  good night";
        else if (mode == Mode.ShuttingDown) label = "good night";
        else label = remaining.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + (test ? "  test" : "");
        using (Font lf = new Font("Segoe UI Black", 12, FontStyle.Regular, GraphicsUnit.Pixel))
        {
            SizeF ts = g.MeasureString(label, lf);
            float pw = ts.Width + 20, ph = 24, px = c - pw / 2, pyy = c + 78;
            using (GraphicsPath pill = RoundRect(px, pyy, pw, ph, ph / 2))
            {
                using (SolidBrush pb = new SolidBrush(A(Cream, a))) g.FillPath(pb, pill);
                using (Pen po = new Pen(A(Navy, a), 3f)) g.DrawPath(po, pill);
            }
            StringFormat sf = new StringFormat();
            sf.Alignment = StringAlignment.Center;
            sf.LineAlignment = StringAlignment.Center;
            using (SolidBrush lb = new SolidBrush(A(Navy, a)))
                g.DrawString(label, lf, lb, new RectangleF(px, pyy + 1, pw, ph), sf);
        }
    }

    void Push(Bitmap bmp, int x, int y)
    {
        IntPtr screenDc = Native.GetDC(IntPtr.Zero);
        IntPtr memDc = Native.CreateCompatibleDC(screenDc);
        IntPtr hBmp = bmp.GetHbitmap(Color.FromArgb(0));
        IntPtr old = Native.SelectObject(memDc, hBmp);
        try
        {
            Native.SIZE size = new Native.SIZE { cx = bmp.Width, cy = bmp.Height };
            Native.POINT src = new Native.POINT { x = 0, y = 0 };
            Native.POINT dst = new Native.POINT { x = x, y = y };
            Native.BLENDFUNCTION blend = new Native.BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
            Native.UpdateLayeredWindow(Handle, screenDc, ref dst, ref size, memDc, ref src, 0, ref blend, 2 /*ULW_ALPHA*/);
            // keep above everything, including other topmost windows that popped up
            Native.SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        }
        finally
        {
            Native.SelectObject(memDc, old);
            Native.DeleteObject(hBmp);
            Native.DeleteDC(memDc);
            Native.ReleaseDC(IntPtr.Zero, screenDc);
        }
    }
}

static class Native
{
    public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
    [StructLayout(LayoutKind.Sequential)]
    public struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr dwExtraInfo; }

    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int idHook, HookProc fn, IntPtr hMod, uint threadId);
    [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] public static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hDC, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
    [DllImport("user32.dll")]
    public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
        IntPtr hdcSrc, ref POINT pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
    // alpha-only update: null dst/size/src keeps the existing bitmap
    [DllImport("user32.dll", EntryPoint = "UpdateLayeredWindow")]
    public static extern bool UpdateLayeredWindowAlpha(IntPtr hwnd, IntPtr hdcDst, IntPtr pptDst, IntPtr psize,
        IntPtr hdcSrc, IntPtr pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
}
