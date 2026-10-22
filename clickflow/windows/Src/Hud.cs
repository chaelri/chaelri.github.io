using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace ClickFlow;

/// The floating run panel: previous / current / next step, the phase bar, Stop (and Skip in
/// Preview). Never takes focus, so a typing step keeps its target. Drag it anywhere; it moves
/// out of the way by itself if a click is about to land on it.
public sealed class Hud : OverlayForm
{
    public static readonly Hud Shared = new();

    enum Mode { Hidden, Run, Recording, Summary }
    Mode mode = Mode.Hidden;
    RunSummary? summary;
    readonly System.Windows.Forms.Timer frame = new() { Interval = 16 };
    readonly System.Windows.Forms.Timer summaryHold = new() { Interval = 2200 };
    Point? anchor;          // top-centre, once placed or dragged
    Point? dodgedFrom;
    Point dragStart, dragOrigin;
    bool dragging;
    Rectangle stopButton, skipButton;
    string hover = "";

    static readonly Color Bg = Color.FromArgb(32, 33, 38), Card = Color.FromArgb(44, 46, 53), Text1 = Color.FromArgb(242, 242, 245),
        Text2 = Color.FromArgb(160, 163, 172), Text3 = Color.FromArgb(105, 108, 118), Accent = Color.FromArgb(10, 132, 255),
        Purple = Color.FromArgb(160, 110, 245), Red = Color.FromArgb(235, 72, 66), Green = Color.FromArgb(52, 199, 89),
        Orange = Color.FromArgb(255, 159, 10), Track = Color.FromArgb(62, 64, 72);

    Hud() : base(false)
    {
        BackColor = Bg;
        frame.Tick += (_, _) => { if (Visible) Invalidate(); };
        summaryHold.Tick += (_, _) =>
        {
            summaryHold.Stop();
            if (mode == Mode.Summary) HideHud();
        };
        Recorder.Shared.Changed += () =>
        {
            if (Recorder.Shared.IsRecording) { mode = Mode.Recording; Place(); }
            else if (mode == Mode.Recording) HideHud();
        };
    }

    int W => S(470);

    int HeightFor()
    {
        switch (mode)
        {
            case Mode.Recording: return S(78);
            case Mode.Summary:
                return S(summary?.Output != null || summary?.OutputImage != null ? 132 : summary?.Reason != null ? 92 : 74);
            default:
                var st = Runner.Shared.Status;
                return S(st?.LastImage != null || st?.LastOutput != null ? 252 : 196);
        }
    }

    // ---------- showing ----------

    public void ShowRun()
    {
        summaryHold.Stop();
        mode = Mode.Run;
        Place();
    }

    public void ShowSummary(RunSummary s)
    {
        if (Recorder.Shared.IsRecording) return;
        summary = s;
        mode = Mode.Summary;
        Place();
        // Hold the "Done" card for a moment so the end of the run is legible.
        summaryHold.Stop();
        summaryHold.Start();
    }

    void HideHud()
    {
        mode = Mode.Hidden;
        frame.Stop();
        Hide();
    }

    void Place()
    {
        if (anchor == null)
        {
            var wa = Screens.At(Native.CursorPos()).WorkingArea;
            anchor = new Point(wa.Left + wa.Width / 2, wa.Top + S(14));
        }
        var a = dodgedFrom == null ? anchor.Value : Location + new Size(Width / 2, 0);
        int w = W, h = HeightFor();
        Bounds = new Rectangle(a.X - w / 2, a.Y, w, h);
        Region = new Region(Rounded(new RectangleF(0, 0, w, h), S(14)));
        ShowNoActivate();
        frame.Start();
        Invalidate();
    }

    /// Moves the panel out of the way when a click is about to land on it.
    public bool Dodge(Point p)
    {
        if (!Visible) return false;
        var b = Bounds;
        b.Inflate(4, 4);
        if (!b.Contains(p)) return false;
        dodgedFrom = Location;
        var wa = Screen.FromRectangle(Bounds).WorkingArea;
        int y = Top - wa.Top < wa.Bottom - Bottom ? wa.Bottom - Height - S(14) : wa.Top + S(14);
        Location = new Point(Left, y);
        Update();
        return true;
    }

    public void Undodge()
    {
        if (dodgedFrom is { } p) Location = p;
        dodgedFrom = null;
    }

    // ---------- input ----------

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        if (stopButton.Contains(e.Location))
        {
            if (mode == Mode.Recording) Recorder.Shared.Stop(); else Runner.Shared.EmergencyStop();
            return;
        }
        if (skipButton.Contains(e.Location)) { Runner.Shared.SkipStep(); return; }
        dragging = true;
        dragStart = Cursor.Position;
        dragOrigin = Location;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (dragging)
        {
            var c = Cursor.Position;
            Location = new Point(dragOrigin.X + c.X - dragStart.X, dragOrigin.Y + c.Y - dragStart.Y);
            anchor = new Point(Left + Width / 2, Top);
            return;
        }
        var h = stopButton.Contains(e.Location) ? "stop" : skipButton.Contains(e.Location) ? "skip" : "";
        if (h != hover) { hover = h; Cursor = h.Length > 0 ? Cursors.Hand : Cursors.Default; Invalidate(); }
    }

    protected override void OnMouseUp(MouseEventArgs e) => dragging = false;

    // ---------- drawing ----------

    Font F(float px, FontStyle style = FontStyle.Regular, string family = "Segoe UI") => new(family, px * DpiScale, style, GraphicsUnit.Pixel);

    void Txt(Graphics g, string s, Font f, Color c, Rectangle r, TextFormatFlags extra = 0) =>
        TextRenderer.DrawText(g, s, f, r, c, TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | extra);

    void Bar(Graphics g, Rectangle r, double f, Color c)
    {
        using var track = new SolidBrush(Track);
        using var tp = Rounded(r, r.Height / 2f);
        g.FillPath(track, tp);
        if (f <= 0) return;
        var fr = new RectangleF(r.X, r.Y, Math.Max(r.Height, (float)(r.Width * Math.Min(1, f))), r.Height);
        using var fill = new SolidBrush(c);
        using var fp = Rounded(fr, r.Height / 2f);
        g.FillPath(fill, fp);
    }

    Rectangle Button(Graphics g, string label, Rectangle r, Color fill, bool hot)
    {
        using var b = new SolidBrush(hot ? ControlPaint.Light(fill, 0.25f) : fill);
        using var p = Rounded(r, S(8));
        g.FillPath(b, p);
        using var f = F(12.5f, FontStyle.Bold);
        Txt(g, label, f, Color.White, r, TextFormatFlags.HorizontalCenter);
        return r;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        g.Clear(Bg);
        stopButton = skipButton = Rectangle.Empty;
        switch (mode)
        {
            case Mode.Recording: PaintRecording(g); break;
            case Mode.Summary: PaintSummary(g); break;
            case Mode.Run: PaintRun(g); break;
        }
    }

    void PaintRecording(Graphics g)
    {
        int pad = S(16);
        using var red = new SolidBrush(Red);
        float pulse = (float)(0.6 + 0.4 * Math.Sin(DateTime.Now.TimeOfDay.TotalSeconds * 5));
        using var dot = new SolidBrush(Color.FromArgb((int)(255 * pulse), Red));
        g.FillEllipse(dot, pad, S(20), S(12), S(12));
        int n = Recorder.Shared.ClickCount;
        using var title = F(15, FontStyle.Bold);
        using var small = F(12.5f);
        Txt(g, $"Recording · {n} click{(n == 1 ? "" : "s")}", title, Text1, new Rectangle(pad + S(20), S(12), W - S(150), S(28)));
        Txt(g, "Click anywhere to record. Esc or Stop finishes.", small, Text2, new Rectangle(pad + S(20), S(40), W - S(150), S(22)));
        stopButton = Button(g, "Stop", new Rectangle(W - pad - S(84), S(22), S(84), S(34)), Red, hover == "stop");
    }

    void PaintSummary(Graphics g)
    {
        var s = summary;
        if (s == null) return;
        int pad = S(16);
        var (glyph, color, word) = s.Result switch
        {
            RunResult.Completed => ("", Green, "Done"),
            RunResult.Stopped => ("", Orange, "Stopped"),
            RunResult.Skipped => ("", Text2, "Skipped"),
            _ => ("", Red, "Failed"),
        };
        using var icon = new Font(Theme.IconFamily, 18 * DpiScale, GraphicsUnit.Pixel);
        Txt(g, glyph, icon, color, new Rectangle(pad, S(14), S(28), S(28)));
        using var title = F(15, FontStyle.Bold);
        using var small = F(12.5f);
        Txt(g, $"{word} · {s.MacroName}", title, Text1, new Rectangle(pad + S(36), S(10), W - 2 * pad - S(36), S(26)));
        Txt(g, $"{s.StepCount} step{(s.StepCount == 1 ? "" : "s")} · {Fmt.Seconds(s.Duration)}", small, Text2, new Rectangle(pad + S(36), S(36), W - 2 * pad - S(36), S(20)));
        int y = S(60);
        if (s.Reason != null)
        {
            Txt(g, s.Reason, small, s.Result == RunResult.Failed ? Red : Text2, new Rectangle(pad + S(36), y - S(2), W - 2 * pad - S(36), S(22)));
            y += S(24);
        }
        if (s.Output != null || s.OutputImage != null) PaintOutput(g, s.Output, s.OutputImage, new Rectangle(pad, Math.Max(y, S(64)), W - 2 * pad, S(56)));
    }

    void PaintOutput(Graphics g, string? text, Bitmap? image, Rectangle r)
    {
        using var card = new SolidBrush(Card);
        using var p = Rounded(r, S(8));
        g.FillPath(card, p);
        int x = r.X + S(8);
        if (image != null)
        {
            float scale = Math.Min((float)S(84) / image.Width, (float)(r.Height - S(12)) / image.Height);
            var ir = new RectangleF(x, r.Y + (r.Height - image.Height * scale) / 2, image.Width * scale, image.Height * scale);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(image, ir);
            x += (int)ir.Width + S(10);
        }
        using var lab = F(11, FontStyle.Bold);
        using var f = F(12.5f, FontStyle.Regular, "Consolas");
        Txt(g, "READ", lab, Text3, new Rectangle(x, r.Y + S(6), S(60), S(16)));
        var flat = string.IsNullOrEmpty(text) ? "(no text found)" : text.Replace("\r", "").Replace("\n", " ⏎ ");
        Txt(g, flat, f, Text1, new Rectangle(x, r.Y + S(22), r.Right - x - S(8), S(26)));
    }

    void PaintRun(Graphics g)
    {
        var st = Runner.Shared.Status;
        if (st == null) return;
        int pad = S(16), w = W;
        using var title = F(14, FontStyle.Bold);
        using var small = F(12);
        using var tiny = F(11, FontStyle.Bold);
        using var big = F(15.5f, FontStyle.Bold);
        using var icon = new Font(Theme.IconFamily, 15 * DpiScale, GraphicsUnit.Pixel);

        // Header: macro, step count, mode tag.
        var tagColor = st.Preview ? Purple : st.InputLocked ? Orange : Accent;
        var tag = st.Preview ? "PREVIEW" : st.TestOnly != null ? "STEP TEST" : st.InputLocked ? "INPUT LOCKED" : "RUNNING";
        var tagSize = TextRenderer.MeasureText(tag, tiny);
        var tagRect = new Rectangle(pad, S(13), tagSize.Width + S(10), S(20));
        using (var tb = new SolidBrush(Color.FromArgb(50, tagColor)))
        using (var tp = Rounded(tagRect, S(6))) g.FillPath(tb, tp);
        Txt(g, tag, tiny, tagColor, tagRect, TextFormatFlags.HorizontalCenter);
        var count = st.TestOnly != null ? "" : $"Step {st.StepIndex + 1} of {st.StepCount}"
            + (st.Iterations == 1 ? "" : st.Iterations == 0 ? $" · Loop {st.Iteration + 1}" : $" · Loop {st.Iteration + 1}/{st.Iterations}");
        var countSize = TextRenderer.MeasureText(count, small);
        Txt(g, count, small, Text2, new Rectangle(w - pad - countSize.Width, S(13), countSize.Width + 2, S(20)));
        Txt(g, st.MacroName, title, Text1, new Rectangle(tagRect.Right + S(8), S(11), w - tagRect.Right - S(16) - countSize.Width - pad, S(24)));

        // Previous / current / next.
        int y = S(42);
        int i = st.StepIndex;
        var steps = st.Steps;
        bool testing = st.TestOnly != null;
        if (!testing && i > 0)
        {
            var prev = steps[i - 1];
            bool skipped;
            lock (st) skipped = st.Skipped.Contains(i - 1);
            Txt(g, skipped ? "" : "", icon, skipped ? Text3 : Green, new Rectangle(pad, y, S(20), S(20)));
            Txt(g, $"{i}. {prev.Heading}", small, Text3, new Rectangle(pad + S(26), y, w - 2 * pad - S(26), S(20)));
        }
        y += S(22);
        if (st.Step is { } cur)
        {
            var cardRect = new Rectangle(pad - S(6), y, w - 2 * pad + S(12), S(48));
            using (var cb = new SolidBrush(Card))
            using (var cp = Rounded(cardRect, S(9))) g.FillPath(cb, cp);
            bool ghost = st.Preview || cur.ShowOnly;
            var verb = st.Phase == RunPhase.Waiting && cur.Type != StepType.Wait ? "Up next" : ghost ? cur.Type.WouldVerb() : cur.Type.Verb();
            Txt(g, cur.Type.Glyph(), icon, ghost ? Purple : Accent, new Rectangle(pad, y + S(4), S(22), S(22)));
            Txt(g, $"{i + 1}. {cur.Heading}", big, Text1, new Rectangle(pad + S(26), y + S(3), w - 2 * pad - S(30), S(24)));
            Txt(g, $"{verb} · {cur.Detail}", small, Text2, new Rectangle(pad + S(26), y + S(26), w - 2 * pad - S(30), S(18)));
        }
        y += S(52);
        if (!testing && i + 1 < steps.Count)
        {
            var next = steps[i + 1];
            Txt(g, next.Type.Glyph(), icon, Text3, new Rectangle(pad, y, S(20), S(20)));
            Txt(g, $"{i + 2}. {next.Heading}", small, Text3, new Rectangle(pad + S(26), y, w - 2 * pad - S(26), S(20)));
        }
        y += S(26);

        // Phase bar + time left, then Stop / Skip.
        var now = DateTime.Now;
        double f;
        string left = "";
        if (st.PhaseEnd is { } end && end > st.PhaseStart)
        {
            f = (now - st.PhaseStart).TotalSeconds / (end - st.PhaseStart).TotalSeconds;
            var secs = Math.Max(0, (end - now).TotalSeconds);
            left = st.Phase == RunPhase.PausingLoop ? $"Next loop in {secs:0.0}s" : $"{secs:0.0}s";
        }
        else if (st.Progress is { } p) { f = p; left = $"{p * 100:0}%"; }
        else { f = (now - st.PhaseStart).TotalSeconds % 1.2 / 1.2; left = st.Phase == RunPhase.Starting ? "Starting" : "Working"; }
        int btnW = S(76), gap = S(8);
        int buttonsW = btnW + (st.Preview ? btnW + gap : 0);
        var barRect = new Rectangle(pad, y + S(12), w - 2 * pad - buttonsW - S(76), S(6));
        Bar(g, barRect, f, st.Preview || (st.Step?.ShowOnly ?? false) ? Purple : Accent);
        Txt(g, left, small, Text2, new Rectangle(barRect.Right + S(8), y + S(2), S(70), S(24)));
        stopButton = Button(g, "Stop", new Rectangle(w - pad - btnW, y, btnW, S(30)), Red, hover == "stop");
        if (st.Preview) skipButton = Button(g, "Skip", new Rectangle(w - pad - btnW - gap - btnW, y, btnW, S(30)), Color.FromArgb(80, 82, 92), hover == "skip");
        y += S(36);
        var hint = st.InputLocked ? "Mouse & keyboard locked · Esc, Ctrl+Alt+. or Alt+F4 stops" : "Esc or Ctrl+Alt+. stops";
        using var hintFont = F(11);
        Txt(g, hint, hintFont, Text3, new Rectangle(pad, y, w - 2 * pad, S(16)));
        y += S(20);

        if (st.LastImage != null || st.LastOutput != null)
            PaintOutput(g, st.LastOutput, st.LastImage, new Rectangle(pad, y, w - 2 * pad, S(50)));

        // Grow when a Screenshot area result arrives.
        if (Height != HeightFor()) BeginInvoke(Place);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { frame.Dispose(); summaryHold.Dispose(); }
        base.Dispose(disposing);
    }
}
