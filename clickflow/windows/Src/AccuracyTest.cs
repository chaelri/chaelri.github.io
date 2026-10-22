namespace ClickFlow;

/// Clicks a target on each display and reports where the click landed.
public static class AccuracyTest
{
    sealed class Target : OverlayForm
    {
        public Point? Hit;
        public Target() : base(false) { BackColor = Color.FromArgb(10, 132, 255); }
        protected override void OnMouseDown(MouseEventArgs e) => Hit = Cursor.Position;
        protected override void OnPaint(PaintEventArgs e)
        {
            using var pen = new Pen(Color.White, 2);
            e.Graphics.DrawLine(pen, Width / 2, 4, Width / 2, Height - 4);
            e.Graphics.DrawLine(pen, 4, Height / 2, Width - 4, Height / 2);
        }
    }

    public static async Task<string> Run()
    {
        var lines = new List<string>();
        var back = Native.CursorPos();
        foreach (var s in Screen.AllScreens)
        {
            var t = new Target();
            int size = t.S(40);
            var c = new Point(s.Bounds.Left + s.Bounds.Width / 2, s.Bounds.Top + s.Bounds.Height / 2);
            t.Bounds = new Rectangle(c.X - size / 2, c.Y - size / 2, size, size);
            t.ShowNoActivate();
            await Task.Delay(150);
            await ClickEngine.Click(c, right: false, count: 1, CancellationToken.None);
            await Task.Delay(250);
            var name = s.Primary ? "Primary" : $"Display at {s.Bounds.X},{s.Bounds.Y}";
            lines.Add(t.Hit is { } h
                ? $"{name}: aimed {c.X},{c.Y} → landed {h.X},{h.Y} ({(h == c ? "exact" : $"off by {h.X - c.X},{h.Y - c.Y}")})"
                : $"{name}: the click never reached the target");
            t.Close();
        }
        Native.SetCursorPos(back.X, back.Y);
        return string.Join("\n", lines);
    }
}
