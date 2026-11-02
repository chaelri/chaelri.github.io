// HoldShutdown - hold a mouse button for N seconds to shut the PC down.
// A ring animation follows the cursor while you hold. Skipped while VALORANT runs.
// Starts in TEST mode (no real shutdown) unless launched with --armed.
// Build: powershell -File build.ps1   (uses the .NET Framework csc, C# 5 syntax only)
//
// Args: --armed            real shutdown (default is test mode)
//       --button right|middle|x1|x2   (default right = mouse button 2)
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
        Native.SetProcessDPIAware();
        Application.EnableVisualStyles();
        Application.Run(new App(Config.Parse(args)));
        GC.KeepAlive(mutex);
    }
}

class Config
{
    public string Button = "right";
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
                Color edge = Color.FromArgb(230, 255, 30, 50);
                Color clear = Color.FromArgb(0, 255, 30, 50);
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
                using (Pen p = new Pen(Color.FromArgb(255, 255, 70, 85), 6))
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

    void Draw(Graphics g, double p, double a, double time, Mode mode, double remaining, bool test)
    {
        float c = S / 2f;
        Color cool = Color.FromArgb(0, 220, 255);
        Color hot = Color.FromArgb(255, 60, 90);
        Color col;
        if (mode == Mode.TestDone) col = Color.FromArgb(70, 230, 140);
        else if (mode == Mode.ShuttingDown) col = hot;
        else col = Lerp(cool, hot, p);

        // final-second urgency pulse: the ring breathes and shockwaves go out
        bool urgent = mode == Mode.Charging && remaining < 1.2 && p > 0;
        float breathe = urgent ? (float)(Math.Sin(time * 18) * 2.5) : 0f;

        // shockwaves
        if (urgent || mode != Mode.Charging)
        {
            for (int i = 0; i < 2; i++)
            {
                double ph = (time * (mode == Mode.Charging ? 1.6 : 1.0) + i * 0.5) % 1.0;
                float r = 74 + (float)(ph * 48);
                using (Pen sw = new Pen(A(Color.FromArgb(150, col), a * (1 - ph)), 2.5f))
                    g.DrawEllipse(sw, c - r, c - r, r * 2, r * 2);
            }
        }

        // backdrop disc
        float br = 72 + breathe;
        using (GraphicsPath gp = new GraphicsPath())
        {
            gp.AddEllipse(c - br, c - br, br * 2, br * 2);
            using (PathGradientBrush pg = new PathGradientBrush(gp))
            {
                pg.CenterColor = A(Color.FromArgb(215, 10, 12, 18), a);
                pg.SurroundColors = new Color[] { A(Color.FromArgb(150, 18, 22, 32), a) };
                g.FillPath(pg, gp);
            }
        }

        // rotating outer tick ring (lights up with progress)
        int ticks = 36;
        double spin = time * (40 + 260 * p);
        for (int i = 0; i < ticks; i++)
        {
            double ang = (i * 360.0 / ticks + spin) * Math.PI / 180;
            bool lit = (double)i / ticks < p;
            float r1 = 84 + breathe, r2 = lit ? 94 + breathe : 90 + breathe;
            using (Pen tp = new Pen(A(lit ? Color.FromArgb(220, col) : Color.FromArgb(50, 255, 255, 255), a), lit ? 2.5f : 1.5f))
            {
                tp.StartCap = tp.EndCap = LineCap.Round;
                g.DrawLine(tp,
                    c + (float)(Math.Cos(ang) * r1), c + (float)(Math.Sin(ang) * r1),
                    c + (float)(Math.Cos(ang) * r2), c + (float)(Math.Sin(ang) * r2));
            }
        }

        // track
        float rr = 60;
        RectangleF ring = new RectangleF(c - rr, c - rr, rr * 2, rr * 2);
        using (Pen track = new Pen(A(Color.FromArgb(40, 255, 255, 255), a), 9))
            g.DrawEllipse(track, ring);

        // progress arc with glow
        float sweep = (float)(360 * p);
        if (sweep > 0.5f)
        {
            float[] widths = { 26, 18, 9 };
            int[] alphas = { 35, 70, 255 };
            for (int i = 0; i < widths.Length; i++)
            {
                using (Pen pp = new Pen(A(Color.FromArgb(alphas[i], col), a), widths[i]))
                {
                    pp.StartCap = pp.EndCap = LineCap.Round;
                    g.DrawArc(pp, ring, -90, sweep);
                }
            }
            // bright head
            double ha = (-90 + sweep) * Math.PI / 180;
            float hx = c + (float)(Math.Cos(ha) * rr), hy = c + (float)(Math.Sin(ha) * rr);
            using (SolidBrush hb = new SolidBrush(A(Color.FromArgb(255, 255, 255, 255), a)))
                g.FillEllipse(hb, hx - 4.5f, hy - 4.5f, 9, 9);
        }

        // center text
        StringFormat sf = new StringFormat();
        sf.Alignment = StringAlignment.Center;
        sf.LineAlignment = StringAlignment.Center;
        string big, small;
        if (mode == Mode.TestDone) { big = "TEST OK"; small = "would shut down now"; }
        else if (mode == Mode.ShuttingDown) { big = "BYE"; small = "shutting down"; }
        else { big = remaining.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture); small = test ? "TEST  hold to shut down" : "hold to shut down"; }

        using (Font fb = new Font("Segoe UI Semibold", mode == Mode.Charging ? 24 : 17, FontStyle.Bold, GraphicsUnit.Pixel))
        using (Font fs = new Font("Segoe UI", 9.5f, FontStyle.Regular, GraphicsUnit.Pixel))
        using (SolidBrush tb = new SolidBrush(A(Color.FromArgb(255, 245, 248, 255), a)))
        using (SolidBrush sb = new SolidBrush(A(Color.FromArgb(190, col), a)))
        {
            // power glyph above the number
            if (mode == Mode.Charging)
            {
                using (Pen pw = new Pen(A(Color.FromArgb(200, col), a), 2.2f))
                {
                    pw.StartCap = pw.EndCap = LineCap.Round;
                    g.DrawArc(pw, c - 7, c - 33, 14, 14, -55, 290);
                    g.DrawLine(pw, c, c - 36, c, c - 27);
                }
            }
            g.DrawString(big, fb, tb, new RectangleF(0, c - 16, S, 32), sf);
            g.DrawString(small, fs, sb, new RectangleF(0, c + 14, S, 16), sf);
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
