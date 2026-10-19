using System.Drawing.Drawing2D;
using static ClickFlow.Native;

namespace ClickFlow;

/// Floating target (for a point) or dashed box (for an area) that stays on top while you use
/// other apps (Alt+Tab freely). Drag it into place and press ✓; ✗ cancels.
public static class Placer
{
    static Form? active, bar;

    public static bool IsOpen => active != null;

    public static void PickPoint(Point start, Action<Point> done, Action? cancelled = null)
    {
        Close();
        var t = new TargetForm();
        var b = new BarForm();
        int half = t.S(32);
        t.Bounds = new Rectangle(start.X - half, start.Y - half, half * 2, half * 2);
        t.Moved += () => b.Follow(t.Bounds, $"{t.Center.X}, {t.Center.Y}");
        b.Confirm += () => { var p = t.Center; Close(); done(p); };
        b.Cancel += () => { Close(); cancelled?.Invoke(); };
        active = t; bar = b;
        t.ShowNoActivate();
        b.ShowNoActivate();
        b.Follow(t.Bounds, $"{t.Center.X}, {t.Center.Y}");
    }

    public static void PickArea(Rectangle start, Action<Rectangle> done, Action? cancelled = null)
    {
        Close();
        var box = new BoxForm();
        var b = new BarForm();
        box.Area = start;
        box.Moved += () => b.Follow(box.Bounds, $"{box.Area.Width} × {box.Area.Height} at {box.Area.X}, {box.Area.Y}");
        b.Confirm += () => { var a = box.Area; Close(); done(a); };
        b.Cancel += () => { Close(); cancelled?.Invoke(); };
        active = box; bar = b;
        box.ShowNoActivate();
        b.ShowNoActivate();
        b.Follow(box.Bounds, $"{start.Width} × {start.Height} at {start.X}, {start.Y}");
    }

    public static void Close()
    {
        active?.Close(); bar?.Close();
        active = bar = null;
    }

    static readonly Color Ink = Color.FromArgb(10, 132, 255);

    /// Target you drag; its centre is the point.
    sealed class TargetForm : OverlayForm
    {
        public event Action? Moved;
        Point grab;
        bool dragging;

        public TargetForm() : base(false)
        {
            BackColor = Color.Magenta;
            TransparencyKey = Color.Magenta;
            Cursor = Cursors.SizeAll;
        }

        public Point Center => new(Left + Width / 2, Top + Height / 2);

        protected override void OnMouseDown(MouseEventArgs e)
        {
            dragging = true;
            grab = new Point(Cursor.Position.X - Left, Cursor.Position.Y - Top);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            if (!dragging) return;
            var c = Cursor.Position;
            Location = new Point(c.X - grab.X, c.Y - grab.Y);
            Moved?.Invoke();
        }

        protected override void OnMouseUp(MouseEventArgs e) => dragging = false;

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            int c = Width / 2, r = S(18);
            // Key-coloured pixels click through, so a wide pale band gives the drag something to
            // hold while the centre stays see-through for aiming.
            using var band = new Pen(Color.FromArgb(214, 232, 255), S(12));
            using var white = new Pen(Color.White, S(5));
            using var pen = new Pen(Ink, S(2.5f));
            g.DrawEllipse(band, c - r, c - r, 2 * r, 2 * r);
            foreach (var p in new[] { white, pen })
            {
                g.DrawEllipse(p, c - r, c - r, 2 * r, 2 * r);
                g.DrawLine(p, c, c - r - S(10), c, c - S(5));
                g.DrawLine(p, c, c + S(5), c, c + r + S(10));
                g.DrawLine(p, c - r - S(10), c, c - S(5), c);
                g.DrawLine(p, c + S(5), c, c + r + S(10), c);
            }
            using var dot = new SolidBrush(Color.Red);
            g.FillRectangle(dot, c - 1, c - 1, 3, 3);
        }
    }

    /// A box whose inside is a hole (clicks go straight through it). Drag the top tab to move,
    /// the edges or corners to resize.
    sealed class BoxForm : OverlayForm
    {
        public event Action? Moved;
        int B => S(4);       // border
        int Tab => S(22);    // drag tab above the box

        public BoxForm() : base(false)
        {
            BackColor = Color.Magenta;
            TransparencyKey = Color.Magenta;
            MinimumSize = new Size(S(24), S(24) + Tab);
        }

        public Rectangle Area
        {
            get => new(Left + B, Top + Tab + B, Width - 2 * B, Height - Tab - 2 * B);
            set => Bounds = new Rectangle(value.X - B, value.Y - Tab - B, value.Width + 2 * B, value.Height + Tab + 2 * B);
        }

        protected override void OnMove(EventArgs e) { base.OnMove(e); Moved?.Invoke(); }
        protected override void OnResize(EventArgs e) { base.OnResize(e); Moved?.Invoke(); Invalidate(); }

        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            if (m.Msg != WM_NCHITTEST) return;
            var p = PointToClient(new Point((short)(m.LParam & 0xffff), (short)((m.LParam >> 16) & 0xffff)));
            int g = S(8);
            bool left = p.X < g, right = p.X >= Width - g, top = p.Y < Tab + g && p.Y >= Tab - 2, bottom = p.Y >= Height - g;
            if (p.Y < Tab) { m.Result = p.X < S(150) ? HTCAPTION : HTTRANSPARENT; return; }
            m.Result = (top, bottom, left, right) switch
            {
                (true, _, true, _) => HTTOPLEFT,
                (true, _, _, true) => HTTOPRIGHT,
                (_, true, true, _) => HTBOTTOMLEFT,
                (_, true, _, true) => HTBOTTOMRIGHT,
                (true, _, _, _) => HTTOP,
                (_, true, _, _) => HTBOTTOM,
                (_, _, true, _) => HTLEFT,
                (_, _, _, true) => HTRIGHT,
                _ => HTCLIENT,
            };
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            var box = new Rectangle(B / 2, Tab + B / 2, Width - B, Height - Tab - B);
            using var white = new Pen(Color.White, B);
            using var pen = new Pen(Ink, B) { DashStyle = DashStyle.Dash };
            g.DrawRectangle(white, box);
            g.DrawRectangle(pen, box);
            using var tab = new SolidBrush(Ink);
            var tr = new Rectangle(0, 0, Math.Min(Width, S(150)), Tab);
            g.FillRectangle(tab, tr);
            using var f = new Font("Segoe UI Semibold", 12 * DpiScale, GraphicsUnit.Pixel);
            TextRenderer.DrawText(g, "⠿ Drag to move", f, tr, Color.White, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            int h = S(9);
            using var handle = new SolidBrush(Color.White);
            foreach (var pt in new[] { new Point(0, Tab), new Point(Width - h, Tab), new Point(0, Height - h), new Point(Width - h, Height - h) })
            {
                g.FillRectangle(handle, pt.X, pt.Y, h, h);
                g.DrawRectangle(Pens.Black, pt.X, pt.Y, h - 1, h - 1);
            }
        }
    }

    /// ✓ / ✗ and the live coordinates, kept next to the target or box.
    sealed class BarForm : OverlayForm
    {
        public event Action? Confirm, Cancel;
        string label = "";
        Rectangle ok, cancel;

        public BarForm() : base(false)
        {
            BackColor = Color.FromArgb(32, 33, 38);
            Size = new Size(S(250), S(38));
            Region = new Region(Rounded(new RectangleF(0, 0, Width, Height), S(10)));
        }

        public void Follow(Rectangle target, string text)
        {
            label = text;
            var wa = Screen.FromRectangle(target).WorkingArea;
            int w = Math.Max(S(250), TextRenderer.MeasureText(text, Font).Width + S(110));
            if (Width != w) { Width = w; Region = new Region(Rounded(new RectangleF(0, 0, Width, Height), S(10))); }
            int x = Math.Clamp(target.Left + target.Width / 2 - Width / 2, wa.Left, wa.Right - Width);
            int y = target.Bottom + S(8);
            if (y + Height > wa.Bottom) y = Math.Max(wa.Top, target.Top - Height - S(8));
            Location = new Point(x, y);
            Invalidate();
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (ok.Contains(e.Location)) Confirm?.Invoke();
            else if (cancel.Contains(e.Location)) Cancel?.Invoke();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var f = new Font("Segoe UI", 12.5f * DpiScale, GraphicsUnit.Pixel);
            using var bf = new Font("Segoe UI", 15 * DpiScale, FontStyle.Bold, GraphicsUnit.Pixel);
            TextRenderer.DrawText(g, label, f, new Rectangle(S(12), 0, Width - S(100), Height), Color.White,
                TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
            int b = S(38);
            cancel = new Rectangle(Width - 2 * b - S(4), S(4), b, Height - S(8));
            ok = new Rectangle(Width - b - S(4), S(4), b, Height - S(8));
            using var green = new SolidBrush(Color.FromArgb(52, 199, 89));
            using var grey = new SolidBrush(Color.FromArgb(70, 72, 80));
            using (var p = Rounded(cancel, S(7))) g.FillPath(grey, p);
            using (var p = Rounded(ok, S(7))) g.FillPath(green, p);
            TextRenderer.DrawText(g, "✕", bf, cancel, Color.White, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            TextRenderer.DrawText(g, "✓", bf, ok, Color.White, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
        }
    }
}
