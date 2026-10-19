using System.Drawing.Drawing2D;
using static ClickFlow.Native;

namespace ClickFlow;

/// A topmost window that never takes focus (so typing steps keep their target), stays out of
/// Alt+Tab, and is left out of screen captures.
public class OverlayForm : Form
{
    protected readonly bool clickThrough;

    public OverlayForm(bool clickThrough)
    {
        this.clickThrough = clickThrough;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        DoubleBuffered = true;
        AutoScaleMode = AutoScaleMode.None;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
            if (clickThrough) cp.ExStyle |= WS_EX_LAYERED | WS_EX_TRANSPARENT;
            return cp;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // CLICKFLOW_ALLOW_CAPTURE=1 (dev only) lets screenshots of the HUD be taken.
        if (Environment.GetEnvironmentVariable("CLICKFLOW_ALLOW_CAPTURE") != "1") SetWindowDisplayAffinity(Handle, WDA_EXCLUDEFROMCAPTURE);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_MOUSEACTIVATE) { m.Result = MA_NOACTIVATE; return; }
        base.WndProc(ref m);
    }

    /// Shows without stealing focus and keeps it above everything.
    public void ShowNoActivate()
    {
        if (!Visible) { Show(); }
        ShowWindow(Handle, 4 /* SW_SHOWNOACTIVATE */);
    }

    public float DpiScale => DeviceDpi / 96f;
    public int S(float v) => (int)Math.Round(v * DpiScale);

    public static GraphicsPath Rounded(RectangleF r, float radius)
    {
        var p = new GraphicsPath();
        float d = Math.Min(radius * 2, Math.Min(r.Width, r.Height));
        if (d <= 0) { p.AddRectangle(r); return p; }
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}

/// Purple markers for Preview and show-only steps: where a click would land, or which area
/// would be read. Click-through.
public static class Ghost
{
    sealed class Marker : OverlayForm
    {
        public string Label = "";
        public bool Area;
        public Marker() : base(true)
        {
            BackColor = Color.Magenta;
            TransparencyKey = Color.Magenta;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.None;   // antialiased edges would blend with the colour key into a pink fringe
            var purple = Color.FromArgb(160, 90, 240);
            using var pen = new Pen(purple, S(3));
            using var font = new Font("Segoe UI Semibold", 12f * DpiScale, GraphicsUnit.Pixel);
            if (Area)
            {
                int pad = S(4);
                pen.DashStyle = DashStyle.Dash;
                g.DrawRectangle(pen, pad, pad + S(22), Width - 2 * pad - 1, Height - 2 * pad - S(22) - 1);
                var tag = new RectangleF(pad, 0, Math.Min(Width - 2 * pad, g.MeasureString(Label, font).Width + S(12)), S(20));
                using var b = new SolidBrush(purple);
                using var path = Rounded(tag, S(6));
                g.FillPath(b, path);
                TextRenderer.DrawText(g, Label, font, Rectangle.Round(tag), Color.White, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter | TextFormatFlags.EndEllipsis);
            }
            else
            {
                int c = S(30), r = S(16);
                g.DrawEllipse(pen, c - r, c - r, 2 * r, 2 * r);
                g.DrawLine(pen, c - r - S(8), c, c - r + S(6), c);
                g.DrawLine(pen, c + r - S(6), c, c + r + S(8), c);
                g.DrawLine(pen, c, c - r - S(8), c, c - r + S(6));
                g.DrawLine(pen, c, c + r - S(6), c, c + r + S(8));
                using var dot = new SolidBrush(purple);
                g.FillEllipse(dot, c - S(3), c - S(3), S(6), S(6));
                var size = g.MeasureString(Label, font);
                var tag = new RectangleF(c * 2 + S(2), c - S(11), size.Width + S(12), S(22));
                using var path = Rounded(tag, S(7));
                g.FillPath(dot, path);
                TextRenderer.DrawText(g, Label, font, Rectangle.Round(tag), Color.White, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            }
        }
    }

    static Marker? marker;

    static Marker Get()
    {
        if (marker == null || marker.IsDisposed) marker = new Marker();
        return marker;
    }

    public static void ShowPoint(Step step, int number)
    {
        var m = Get();
        m.Area = false;
        m.Label = $"{number} Â· {step.Type.WouldVerb()}";
        var p = step.Point;
        m.Location = new Point(p.X - m.S(30), p.Y - m.S(30));
        m.Size = new Size(m.S(330), m.S(60));
        m.ShowNoActivate();
        m.Invalidate();
    }

    public static void ShowArea(Step step, int number)
    {
        var m = Get();
        m.Area = true;
        m.Label = $"{number} Â· {step.Type.WouldVerb()}";
        var a = step.Area;
        int pad = m.S(4);
        m.Bounds = new Rectangle(a.X - pad, a.Y - pad - m.S(22), a.Width + 2 * pad, a.Height + 2 * pad + m.S(22));
        m.ShowNoActivate();
        m.Invalidate();
    }

    public static void Hide()
    {
        if (marker != null && !marker.IsDisposed) marker.Hide();
    }
}

/// A ring that expands and fades where each real click landed.
public sealed class ClickRing : OverlayForm
{
    readonly DateTime start = DateTime.Now;
    readonly System.Windows.Forms.Timer timer = new() { Interval = 16 };
    const double Life = 0.45;

    ClickRing() : base(true)
    {
        BackColor = Color.Magenta;
        TransparencyKey = Color.Magenta;
        timer.Tick += (_, _) =>
        {
            if ((DateTime.Now - start).TotalSeconds > Life) { timer.Stop(); Close(); return; }
            Invalidate();
        };
    }

    public static void Show(Point p)
    {
        var r = new ClickRing();
        int half = r.S(28);
        r.Bounds = new Rectangle(p.X - half, p.Y - half, half * 2, half * 2);
        r.ShowNoActivate();
        r.timer.Start();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        double t = Math.Min(1, (DateTime.Now - start).TotalSeconds / Life);
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.None;   // antialiased edges would blend with the colour key into a pink fringe
        float rad = (float)(S(6) + (Width / 2 - S(6)) * t) - S(3);
        using var pen = new Pen(Color.FromArgb(10, 132, 255), S(3));
        float c = Width / 2f;
        g.DrawEllipse(pen, c - rad, c - rad, rad * 2, rad * 2);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) timer.Dispose();
        base.Dispose(disposing);
    }
}
