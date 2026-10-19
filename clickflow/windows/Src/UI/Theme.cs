using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace ClickFlow;

/// Colours, fonts and the few custom controls the editor is built from.
public static class Theme
{
    public static readonly string IconFamily = FontExists("Segoe Fluent Icons") ? "Segoe Fluent Icons" : "Segoe MDL2 Assets";

    static bool FontExists(string name)
    {
        using var fonts = new InstalledFontCollection();
        return fonts.Families.Any(f => f.Name == name);
    }

    public static readonly Color Window = Color.FromArgb(243, 244, 247);
    public static readonly Color Sidebar = Color.FromArgb(234, 236, 241);
    public static readonly Color Card = Color.White;
    public static readonly Color Border = Color.FromArgb(222, 225, 232);
    public static readonly Color Text = Color.FromArgb(28, 30, 36);
    public static readonly Color Muted = Color.FromArgb(104, 110, 124);
    public static readonly Color Faint = Color.FromArgb(150, 155, 168);
    public static readonly Color Accent = Color.FromArgb(10, 110, 230);
    public static readonly Color AccentSoft = Color.FromArgb(222, 235, 255);
    public static readonly Color Purple = Color.FromArgb(130, 80, 230);
    public static readonly Color PurpleSoft = Color.FromArgb(240, 232, 255);
    public static readonly Color Red = Color.FromArgb(214, 52, 46);
    public static readonly Color Orange = Color.FromArgb(214, 120, 0);
    public static readonly Color Green = Color.FromArgb(30, 150, 70);

    public static readonly Font Body = new("Segoe UI", 9.75f);
    public static readonly Font Small = new("Segoe UI", 8.75f);
    public static readonly Font Bold = new("Segoe UI Semibold", 9.75f);
    public static readonly Font H1 = new("Segoe UI Semibold", 16f);
    public static readonly Font H2 = new("Segoe UI Semibold", 11.5f);
    public static readonly Font Mono = new("Consolas", 10f);
    public static readonly Font Icon = new(IconFamily, 11f);
    public static readonly Font IconSmall = new(IconFamily, 9f);

    public static GraphicsPath Rounded(RectangleF r, float radius) => OverlayForm.Rounded(r, radius);

    public static Label Label(string text, Font? font = null, Color? color = null, bool auto = true) => new()
    {
        Text = text, Font = font ?? Body, ForeColor = color ?? Text, AutoSize = auto, Margin = new Padding(0, 6, 6, 0),
        UseMnemonic = false, BackColor = Color.Transparent,
    };

    public static FlatButton Button(string text, string? glyph = null, bool primary = false) => new(text, glyph, primary);
}

/// A flat rounded button with an optional Fluent icon.
public sealed class FlatButton : Control
{
    public string? Glyph;
    public bool Primary;
    public Color? Tint;
    bool hot, down;

    public FlatButton(string text, string? glyph, bool primary)
    {
        Text = text;
        Glyph = glyph;
        Primary = primary;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.SupportsTransparentBackColor, true);
        Cursor = Cursors.Hand;
        Font = Theme.Body;
        Margin = new Padding(0, 2, 6, 2);
        BackColor = Color.Transparent;
        AutoSizeNow();
    }

    public void PerformClick() => OnClick(EventArgs.Empty);

    public void AutoSizeNow()
    {
        int w = TextRenderer.MeasureText(Text, Font).Width + (Glyph != null ? LogicalToDeviceUnits(22) : 0) + LogicalToDeviceUnits(Text.Length > 0 ? 22 : 12);
        Size = new Size(Math.Max(LogicalToDeviceUnits(30), w), LogicalToDeviceUnits(28));
    }

    protected override void OnTextChanged(EventArgs e) { base.OnTextChanged(e); AutoSizeNow(); Invalidate(); }
    protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); Invalidate(); }
    protected override void OnMouseEnter(EventArgs e) { hot = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { hot = down = false; Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var tint = Tint ?? Theme.Accent;
        Color fill, border, fore;
        if (!Enabled) { fill = Color.FromArgb(238, 239, 242); border = Theme.Border; fore = Theme.Faint; }
        else if (Primary) { fill = down ? ControlPaint.Dark(tint, 0.1f) : hot ? ControlPaint.Light(tint, 0.15f) : tint; border = fill; fore = Color.White; }
        else { fill = down ? Color.FromArgb(225, 228, 235) : hot ? Color.FromArgb(240, 242, 246) : Color.White; border = Theme.Border; fore = Tint ?? Theme.Text; }
        var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        using (var p = Theme.Rounded(r, LogicalToDeviceUnits(6)))
        {
            using var b = new SolidBrush(fill);
            using var pen = new Pen(border);
            g.FillPath(b, p);
            g.DrawPath(pen, p);
        }
        int x = LogicalToDeviceUnits(Text.Length > 0 ? 10 : 6);
        if (Glyph != null)
        {
            var ir = new Rectangle(x, 0, LogicalToDeviceUnits(18), Height);
            if (Text.Length == 0) ir = new Rectangle(0, 0, Width, Height);
            TextRenderer.DrawText(g, Glyph, Theme.IconSmall, ir, fore, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            x += LogicalToDeviceUnits(22);
        }
        if (Text.Length > 0)
            TextRenderer.DrawText(g, Text, Font, new Rectangle(x, 0, Width - x - LogicalToDeviceUnits(6), Height), fore,
                TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
    }
}

/// A white rounded card that lays its children out in a vertical flow.
public class CardPanel : Panel
{
    public CardPanel()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        BackColor = Theme.Window;
        Padding = new Padding(14, 10, 14, 10);
    }

    public Color Fill = Theme.Card;
    public Color Edge = Theme.Border;

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var p = Theme.Rounded(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), LogicalToDeviceUnits(10));
        using var b = new SolidBrush(Fill);
        using var pen = new Pen(Edge);
        g.FillPath(b, p);
        g.DrawPath(pen, p);
    }
}

/// A row of controls that wraps; children keep their own sizes.
public sealed class Row : FlowLayoutPanel
{
    public Row(params Control[] items)
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        WrapContents = true;
        Margin = new Padding(0, 2, 0, 2);
        Padding = Padding.Empty;
        BackColor = Color.Transparent;
        Controls.AddRange(items);
    }
}

/// A NumericUpDown that writes back on every change and selects its text on focus.
public sealed class Num : NumericUpDown
{
    public Num(decimal min, decimal max, int decimals, decimal value, int width = 74)
    {
        Minimum = min;
        Maximum = max;
        DecimalPlaces = decimals;
        Increment = decimals > 0 ? 0.5m : 1;
        Value = Math.Clamp(value, min, max);
        Width = width;
        Font = Theme.Body;
        Margin = new Padding(0, 2, 10, 2);
        TextAlign = HorizontalAlignment.Right;
    }

    protected override void OnEnter(EventArgs e)
    {
        base.OnEnter(e);
        BeginInvoke(() => Select(0, Text.Length));
    }
}
