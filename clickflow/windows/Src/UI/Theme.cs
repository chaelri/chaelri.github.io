using System.Drawing.Text;

namespace ClickFlow;

using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Globalization.NumberFormatting;
using Windows.UI;
using FSize = Windows.Foundation.Size;
using FRect = Windows.Foundation.Rect;

/// Colours, text styles and the few building blocks the windows are made of.
public static class Theme
{
    /// For the Windows Forms HUD and overlays.
    public static readonly string IconFamily = FontExists("Segoe Fluent Icons") ? "Segoe Fluent Icons" : "Segoe MDL2 Assets";

    static bool FontExists(string name)
    {
        using var fonts = new InstalledFontCollection();
        return fonts.Families.Any(f => f.Name == name);
    }

    /// Set once at start-up from Settings › Appearance: WinUI can't switch an app's theme while
    /// it runs, so changing it restarts ClickFlow.
    public static bool Dark;

    // Charlie design system, option B "paper": warm paper, ink outlines, green primary, mustard shape.
    // Light: paper #EFE8D8, card #F7F2E6, ink #1F1A17, green #2F6B4F, mustard #F4C94B, rust #9A3417.
    // Dark: paper #1F1A17, card #2B2520, ink #EFE8D8, green #7FD1A6, mustard #F4C94B, coral #FF9A7A.
    // Every text pair was run through contrast.py (>= 4.5:1); on mustard fills only ink text is used.
    public static Color Paper => Dark ? Rgb(31, 26, 23) : Rgb(239, 232, 216);
    public static Color Shape => Dark ? Rgb(43, 37, 32) : Rgb(247, 242, 230);
    public static Color Sun => Rgb(244, 201, 75);
    public static Color Ink => Dark ? Rgb(239, 232, 216) : Rgb(31, 26, 23);
    public static Color Accent => Dark ? Rgb(127, 209, 166) : Rgb(47, 107, 79);     // primary green
    public static Color Purple => Dark ? Rgb(244, 201, 75) : Rgb(122, 82, 0);        // accent (show-only, schedules)
    public static Color PurpleSoft => Dark ? Rgb(58, 50, 32) : Rgb(249, 231, 168);
    public static Color PurpleEdge => Ink;
    public static Color Red => Dark ? Rgb(255, 154, 122) : Rgb(154, 52, 23);
    public static Color Orange => Purple;
    public static Color Green => Accent;
    public static Color OnAccent => Dark ? Rgb(31, 26, 23) : Rgb(247, 242, 230);
    public static Color Muted2 => Dark ? Rgb(168, 154, 140) : Rgb(90, 78, 69);

    // Type scale x1.618: 12 / 15 / 24 / 38. Radii x1.618: 8 / 13 / 21 (then pill).
    public const double T12 = 12, T15 = 15, T24 = 24, T38 = 38;
    public const double R8 = 8, R13 = 13, R21 = 21;

    /// Three step colours plus the muted ink: primary for clicks and links, accent for timing and
    /// reading, muted for typing and keys, red only for shutdown.
    public static Color StepColor(StepType t) => t switch
    {
        StepType.LeftClick or StepType.DoubleClick or StepType.RightClick => Accent,
        StepType.OpenUrl or StepType.DiscordMessage => Accent,
        StepType.Wait or StepType.ReadText => Purple,
        StepType.Move or StepType.TypeText or StepType.KeyShortcut or StepType.PostClipboard => Muted2,
        StepType.Shutdown => Red,
        _ => Accent,
    };

    /// Colours for macro tiles in the sidebar, picked by the macro's id so each keeps its own.
    static readonly StepType[] TileKinds = { StepType.LeftClick, StepType.OpenUrl, StepType.ReadText, StepType.Wait, StepType.TypeText, StepType.KeyShortcut, StepType.DiscordMessage, StepType.PostClipboard };
    public static Color TileColor(Guid id) => StepColor(TileKinds[(id.GetHashCode() & 0x7fffffff) % TileKinds.Length]);

    /// The colour at a low opacity, for washes behind content.
    public static SolidColorBrush Tint(Color c, byte alpha) => new(Color.FromArgb(alpha, c.R, c.G, c.B));

    /// The brand fill: flat primary (the system has no gradients outside liquid glass).
    public static SolidColorBrush BrandGradient() => new(Accent);

    public static Color Rgb(byte r, byte g, byte b) => Color.FromArgb(255, r, g, b);
    public static SolidColorBrush Solid(Color c) => new(c);
    public static Brush Res(string key) => (Brush)Application.Current.Resources[key];

    public static Brush Text => Res("TextFillColorPrimaryBrush");
    public static Brush Muted => Res("TextFillColorSecondaryBrush");
    public static Brush Faint => Res("TextFillColorTertiaryBrush");

    public static TextBlock Label(string text, double size = T12, Brush? color = null, bool bold = false, bool wrap = true) => new()
    {
        Text = text, FontSize = size, Foreground = color ?? Text, FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal,
        TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap, TextTrimming = wrap ? TextTrimming.None : TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Center, IsTextSelectionEnabled = false,
    };

    public static TextBlock Small(string text, Brush? color = null) => Label(text, T12, color ?? Muted);
    public static TextBlock H1(string text) => Label(text, T24, bold: true);
    public static TextBlock H2(string text) => Label(text, T15, bold: true);

    public static FontIcon Icon(string glyph, double size = 14, Brush? color = null)
    {
        var i = new FontIcon { Glyph = glyph, FontSize = size };
        if (color != null) i.Foreground = color;
        return i;
    }

    /// A button with an optional Fluent icon. Primary is the accent style; tint colours a
    /// plain one's text (Delete in red, Live in green).
    public static Button Button(string text, string? glyph = null, bool primary = false, Color? tint = null)
    {
        var b = new Button { Padding = new Thickness(text.Length > 0 ? 16 : 8, 4, text.Length > 0 ? 16 : 8, 4), VerticalAlignment = VerticalAlignment.Center, CornerRadius = new CornerRadius(16), MinHeight = 32 };
        if (primary)
        {
            b.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
            // The system accent (Windows blue) leaks through the template: pin the primary fill here.
            foreach (var k in new[] { "AccentButtonBackground", "AccentButtonBackgroundPointerOver", "AccentButtonBackgroundPressed" })
                b.Resources[k] = Solid(Accent);
            foreach (var k in new[] { "AccentButtonForeground", "AccentButtonForegroundPointerOver", "AccentButtonForegroundPressed" })
                b.Resources[k] = Solid(OnAccent);
            foreach (var k in new[] { "AccentButtonBorderBrush", "AccentButtonBorderBrushPointerOver", "AccentButtonBorderBrushPressed" })
                b.Resources[k] = Solid(Ink);
        }
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        if (glyph != null) row.Children.Add(Icon(glyph, 13));
        if (text.Length > 0) row.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
        b.Content = row;
        if (tint is { } t && !primary) b.Foreground = Solid(t);
        Anim.Pressable(b);
        return b;
    }

    /// Pins the green primary onto a control whose template would otherwise use the Windows accent.
    public static T Pin<T>(T c) where T : FrameworkElement
    {
        foreach (var k in new[] { "ToggleSwitchFillOn", "ToggleSwitchFillOnPointerOver", "ToggleSwitchFillOnPressed", "TextControlElevationBorderFocusedBrush", "TextControlBorderBrushFocused" })
            c.Resources[k] = Solid(Accent);
        foreach (var k in new[] { "ToggleSwitchKnobFillOn", "ToggleSwitchKnobFillOnPointerOver", "ToggleSwitchKnobFillOnPressed" })
            c.Resources[k] = Solid(OnAccent);
        return c;
    }

    /// A flat shape-colour card.
    public static Border Card(UIElement child, Color? fill = null, Color? edge = null, Thickness? padding = null) => new()
    {
        Child = child,
        Background = Solid(fill ?? Shape),
        BorderBrush = Solid(edge ?? Ink),
        BorderThickness = new Thickness(2, 2, 3, 3),   // ink outline, heavier bottom/right edge = hard offset shadow
        CornerRadius = new CornerRadius(R13),
        Padding = padding ?? new Thickness(16, 16, 16, 16),
    };

    public static NumberBox Num(double min, double max, int decimals, double value, double width = 104)
    {
        var f = new DecimalFormatter { FractionDigits = decimals, IntegerDigits = 1, IsGrouped = false };
        f.NumberRounder = new IncrementNumberRounder { Increment = decimals > 0 ? Math.Pow(10, -decimals) : 1, RoundingAlgorithm = RoundingAlgorithm.RoundHalfUp };
        var n = new NumberBox
        {
            Minimum = min, Maximum = max, Value = Math.Clamp(value, min, max), SmallChange = decimals > 0 ? 0.5 : 1, LargeChange = decimals > 0 ? 5 : 10,
            SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact, Width = width, NumberFormatter = f,
            ValidationMode = NumberBoxValidationMode.InvalidInputOverwritten, VerticalAlignment = VerticalAlignment.Center,
        };
        // Emptying the box gives NaN: put the last number back instead of saving it.
        double last = n.Value;
        n.ValueChanged += (_, e) =>
        {
            if (double.IsNaN(e.NewValue)) { n.Value = last; return; }
            last = e.NewValue;
        };
        return n;
    }

    /// A borderless button that only fills in on hover, for the quieter actions.
    public static Button Ghost(Button b)
    {
        b.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        b.BorderBrush = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        return b;
    }

    /// A locked number box can't be clicked into, so it can't take focus, and the mouse wheel
    /// (which steps a focused NumberBox) can't change it while you scroll past.
    public static void Lock(NumberBox n, bool locked)
    {
        n.IsHitTestVisible = !locked;
        n.IsTabStop = !locked;
        n.SpinButtonPlacementMode = locked ? NumberBoxSpinButtonPlacementMode.Hidden : NumberBoxSpinButtonPlacementMode.Compact;
        n.Opacity = locked ? 0.75 : 1;
    }

    /// The Edit / Done toggle that unlocks a group of number boxes.
    public static Button EditToggle(IReadOnlyList<NumberBox> boxes, string tip, Action<bool>? changed = null, bool ghost = false)
    {
        var b = Button("Edit", "");
        ToolTipService.SetToolTip(b, tip);
        var row = (StackPanel)b.Content;
        var icon = (FontIcon)row.Children[0];
        var text = (TextBlock)row.Children[1];
        bool editing = false;
        // The boxes may be added after the button is made: lock them once they're all there.
        void Apply()
        {
            foreach (var n in boxes) Lock(n, !editing);
            icon.Glyph = editing ? "" : "";
            text.Text = editing ? "Done" : "Edit";
            if (editing)
            {
                b.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
                foreach (var k in new[] { "AccentButtonBackground", "AccentButtonBackgroundPointerOver", "AccentButtonBackgroundPressed" }) b.Resources[k] = Solid(Accent);
                foreach (var k in new[] { "AccentButtonForeground", "AccentButtonForegroundPointerOver", "AccentButtonForegroundPressed" }) b.Resources[k] = Solid(OnAccent);
                b.ClearValue(Control.BackgroundProperty);
                b.ClearValue(Control.BorderBrushProperty);
            }
            else
            {
                b.ClearValue(FrameworkElement.StyleProperty);
                if (ghost) Ghost(b);
            }
        }
        b.Click += (_, _) => { editing = !editing; Apply(); changed?.Invoke(editing); };
        b.Loaded += (_, _) => Apply();
        Apply();
        return b;
    }

    public static WrapPanel Row(params UIElement[] items)
    {
        var r = new WrapPanel();
        foreach (var i in items) r.Children.Add(i);
        return r;
    }

    /// WinUI text boxes use \r for a new line; macros use \n.
    public static string FromBox(string t) => t.Replace("\r\n", "\n").Replace('\r', '\n');
    public static string ToBox(string t) => t.Replace("\r\n", "\n").Replace('\n', '\r');

    public static BitmapImage ToImage(Bitmap b)
    {
        using var ms = new MemoryStream();
        b.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        ms.Position = 0;
        var bi = new BitmapImage();
        bi.SetSource(ms.AsRandomAccessStream());
        return bi;
    }
}

/// Children left to right, wrapping to a new line when they run out of width; each line's
/// items are centred on each other.
public sealed class WrapPanel : Panel
{
    public double Gap = 10, LineGap = 8;

    List<(int From, int To, double Height)> Lines(double width)
    {
        var lines = new List<(int, int, double)>();
        double x = 0, h = 0;
        int start = 0;
        for (int i = 0; i < Children.Count; i++)
        {
            var c = Children[i];
            if (c.Visibility == Visibility.Collapsed) continue;
            var d = c.DesiredSize;
            if (x > 0 && x + d.Width > width + 0.5)
            {
                lines.Add((start, i, h));
                start = i; x = 0; h = 0;
            }
            x += d.Width + Gap;
            h = Math.Max(h, d.Height);
        }
        lines.Add((start, Children.Count, h));
        return lines;
    }

    protected override FSize MeasureOverride(FSize available)
    {
        double widest = 0, x = 0;
        foreach (var c in Children)
        {
            c.Measure(new FSize(available.Width, double.PositiveInfinity));
            if (c.Visibility == Visibility.Collapsed) continue;
            x += c.DesiredSize.Width + Gap;
            widest = Math.Max(widest, c.DesiredSize.Width);
        }
        var lines = Lines(available.Width);
        double height = lines.Sum(l => l.Height) + LineGap * Math.Max(0, lines.Count(l => l.Height > 0) - 1);
        double w = double.IsInfinity(available.Width) ? Math.Max(0, x - Gap) : Math.Min(available.Width, Math.Max(widest, x - Gap));
        return new FSize(w, height);
    }

    protected override FSize ArrangeOverride(FSize final)
    {
        double y = 0;
        foreach (var (from, to, h) in Lines(final.Width))
        {
            double x = 0;
            for (int i = from; i < to; i++)
            {
                var c = Children[i];
                if (c.Visibility == Visibility.Collapsed) { c.Arrange(new FRect(0, 0, 0, 0)); continue; }
                var d = c.DesiredSize;
                double w = Math.Min(d.Width, final.Width);
                c.Arrange(new FRect(x, y + (h - d.Height) / 2, w, d.Height));
                x += w + Gap;
            }
            if (h > 0) y += h + LineGap;
        }
        return final;
    }
}

/// Small async dialogs on the WinUI window.
public static class Dialogs
{
    public static async Task<bool> Confirm(XamlRoot root, string title, string text, string ok)
    {
        var d = new ContentDialog
        {
            XamlRoot = root, Title = title, Content = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap },
            PrimaryButtonText = ok, CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close,
        };
        return await d.ShowAsync() == ContentDialogResult.Primary;
    }

    public static async Task<string?> Ask(XamlRoot root, string title, string label, string value)
    {
        var box = new TextBox { Header = label, Text = value };
        box.Loaded += (_, _) => { box.Focus(FocusState.Programmatic); box.SelectAll(); };
        var d = new ContentDialog
        {
            XamlRoot = root, Title = title, Content = box, PrimaryButtonText = "OK", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Primary,
        };
        return await d.ShowAsync() == ContentDialogResult.Primary ? box.Text : null;
    }
}
