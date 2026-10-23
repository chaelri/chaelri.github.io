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

    public static Color Accent => Dark ? Rgb(96, 165, 250) : Rgb(10, 110, 230);
    public static Color Purple => Dark ? Rgb(167, 139, 250) : Rgb(130, 80, 230);
    public static Color PurpleSoft => Dark ? Rgb(44, 36, 66) : Rgb(240, 232, 255);
    public static Color PurpleEdge => Dark ? Rgb(84, 68, 130) : Rgb(214, 196, 250);
    public static Color Red => Dark ? Rgb(248, 113, 113) : Rgb(214, 52, 46);
    public static Color Orange => Dark ? Rgb(251, 170, 60) : Rgb(214, 120, 0);
    public static Color Green => Dark ? Rgb(74, 200, 120) : Rgb(30, 150, 70);
    /// Text on an Accent or Purple fill (the step number badge).
    public static Color OnAccent => Dark ? Rgb(18, 18, 18) : Rgb(255, 255, 255);

    /// Each kind of step has its own colour: the card's stripe, badge, icon and edit highlight.
    public static Color StepColor(StepType t) => t switch
    {
        StepType.LeftClick or StepType.DoubleClick or StepType.RightClick => Accent,
        StepType.Move => Dark ? Rgb(148, 163, 184) : Rgb(100, 116, 139),
        StepType.Wait => Dark ? Rgb(251, 191, 36) : Rgb(217, 119, 6),
        StepType.TypeText => Dark ? Rgb(45, 212, 191) : Rgb(13, 148, 136),
        StepType.KeyShortcut => Dark ? Rgb(129, 140, 248) : Rgb(79, 70, 229),
        StepType.PostClipboard => Dark ? Rgb(34, 211, 238) : Rgb(8, 145, 178),
        StepType.ReadText => Dark ? Rgb(244, 114, 182) : Rgb(219, 39, 119),
        StepType.OpenUrl => Dark ? Rgb(74, 222, 128) : Rgb(22, 163, 74),
        StepType.DiscordMessage => Dark ? Rgb(150, 160, 255) : Rgb(88, 101, 242),
        StepType.Shutdown => Red,
        _ => Accent,
    };

    /// Colours for macro tiles in the sidebar, picked by the macro's id so each keeps its own.
    static readonly StepType[] TileKinds = { StepType.LeftClick, StepType.OpenUrl, StepType.ReadText, StepType.Wait, StepType.TypeText, StepType.KeyShortcut, StepType.DiscordMessage, StepType.PostClipboard };
    public static Color TileColor(Guid id) => StepColor(TileKinds[(id.GetHashCode() & 0x7fffffff) % TileKinds.Length]);

    /// The colour at a low opacity, for washes behind content.
    public static SolidColorBrush Tint(Color c, byte alpha) => new(Color.FromArgb(alpha, c.R, c.G, c.B));

    /// The brand gradient (the app icon's blue to purple).
    public static LinearGradientBrush BrandGradient()
    {
        var g = new LinearGradientBrush { StartPoint = new Windows.Foundation.Point(0, 0), EndPoint = new Windows.Foundation.Point(1, 0) };
        g.GradientStops.Add(new GradientStop { Color = Dark ? Rgb(96, 165, 250) : Rgb(40, 130, 255), Offset = 0 });
        g.GradientStops.Add(new GradientStop { Color = Dark ? Rgb(192, 132, 252) : Rgb(130, 70, 230), Offset = 1 });
        return g;
    }

    public static Color Rgb(byte r, byte g, byte b) => Color.FromArgb(255, r, g, b);
    public static SolidColorBrush Solid(Color c) => new(c);
    public static Brush Res(string key) => (Brush)Application.Current.Resources[key];

    public static Brush Text => Res("TextFillColorPrimaryBrush");
    public static Brush Muted => Res("TextFillColorSecondaryBrush");
    public static Brush Faint => Res("TextFillColorTertiaryBrush");

    public static TextBlock Label(string text, double size = 14, Brush? color = null, bool bold = false, bool wrap = true) => new()
    {
        Text = text, FontSize = size, Foreground = color ?? Text, FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal,
        TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap, TextTrimming = wrap ? TextTrimming.None : TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Center, IsTextSelectionEnabled = false,
    };

    public static TextBlock Small(string text, Brush? color = null) => Label(text, 12, color ?? Muted);
    public static TextBlock H1(string text) => Label(text, 24, bold: true);
    public static TextBlock H2(string text) => Label(text, 17, bold: true);

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
        var b = new Button { Padding = new Thickness(text.Length > 0 ? 11 : 8, 5, text.Length > 0 ? 11 : 8, 6), VerticalAlignment = VerticalAlignment.Center };
        if (primary) b.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 7 };
        if (glyph != null) row.Children.Add(Icon(glyph, 13));
        if (text.Length > 0) row.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
        b.Content = row;
        if (tint is { } t && !primary) b.Foreground = Solid(t);
        Anim.Pressable(b);
        return b;
    }

    /// A white rounded card.
    public static Border Card(UIElement child, Color? fill = null, Color? edge = null, Thickness? padding = null) => new()
    {
        Child = child,
        Background = fill is { } f ? Solid(f) : Res("CardBackgroundFillColorDefaultBrush"),
        BorderBrush = edge is { } e ? Solid(e) : Res("CardStrokeColorDefaultBrush"),
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(8),
        Padding = padding ?? new Thickness(14, 10, 14, 12),
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
    public static Button EditToggle(IReadOnlyList<NumberBox> boxes, string tip, Action<bool>? changed = null)
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
            if (editing) b.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
            else b.ClearValue(FrameworkElement.StyleProperty);
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
    public double Gap = 8, LineGap = 6;

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
