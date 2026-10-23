namespace ClickFlow;

using Microsoft.UI;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

/// One step: number, type, name, Live / Show only, Pick and Test on the top row; the fields its
/// type uses below. Edits write straight into the Step and save shortly after.
public sealed class StepCard : UserControl
{
    public readonly Step Step;
    readonly MacroEditor editor;
    int index;
    readonly StackPanel inner = new() { Spacing = 10 };
    readonly TextBlock number = new()
    {
        Foreground = Theme.Solid(Theme.OnAccent), FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
        HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, FontSize = 13,
    };
    readonly Button more = Theme.Button("", "");
    // X, Y, delays: locked until Edit, so scrolling past can't nudge them.
    readonly List<NumberBox> numbers = new();
    readonly TextBlock warning = Theme.Small("", Theme.Solid(Theme.Orange));
    NumberBox? x, y, w, h;
    TextBlock? outputText;
    Image? outputImage;
    Border? outputFrame;
    UIElement? outputRow;

    bool ShowOnlyLook => Step.ShowOnly && Step.Type != StepType.Wait;
    Color Kind => Theme.StepColor(Step.Type);
    readonly Border card;
    readonly Brush restingFill, restingEdge;
    bool editing, hot, flashing;

    /// Editing: the whole card washes in its colour with a coloured edge. Hover: the edge only.
    void Paint()
    {
        var c = ShowOnlyLook ? Theme.Purple : Kind;
        card.Background = editing || flashing ? Theme.Solid(Wash(c, editing ? 0.24 : 0.32)) : restingFill;
        card.BorderBrush = editing ? Theme.Solid(c) : hot ? Theme.Tint(c, 0x90) : restingEdge;
    }

    /// The colour mixed into the card's own background (solid, so it doesn't look see-through).
    static Color Wash(Color c, double amount)
    {
        var b = Theme.Dark ? Theme.Rgb(44, 44, 44) : Theme.Rgb(255, 255, 255);
        byte M(byte x, byte y) => (byte)(y + (x - y) * amount);
        return Theme.Rgb(M(c.R, b.R), M(c.G, b.G), M(c.B, b.B));
    }

    /// Feedback for Test: a quick wash of colour and a bounce.
    public void Flash()
    {
        flashing = true;
        Paint();
        Anim.Pop(card, 0.015f);
        var t = DispatcherQueue.CreateTimer();
        t.Interval = TimeSpan.FromMilliseconds(380);
        t.IsRepeating = false;
        t.Tick += (_, _) => { flashing = false; Paint(); };
        t.Start();
    }

    public StepCard(MacroEditor editor, Step step, int index)
    {
        this.editor = editor;
        Step = step;
        this.index = index;
        // A stripe in the step's colour down the left edge, then the content.
        var stripe = new Border
        {
            Width = 4, CornerRadius = new CornerRadius(2), Margin = new Thickness(-8, 1, 14, 1),
            Background = Theme.Solid(ShowOnlyLook ? Theme.Purple : Kind),
        };
        var body = new Grid();
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        body.Children.Add(stripe);
        Grid.SetColumn(inner, 1);
        body.Children.Add(inner);
        card = ShowOnlyLook ? Theme.Card(body, Theme.PurpleSoft, Theme.PurpleEdge) : Theme.Card(body);
        card.BackgroundTransition = new BrushTransition { Duration = TimeSpan.FromMilliseconds(220) };
        restingFill = card.Background;
        restingEdge = card.BorderBrush;
        Content = card;
        PointerEntered += (_, _) => { hot = true; Paint(); };
        PointerExited += (_, _) => { hot = false; Paint(); };

        inner.Children.Add(TopRow());
        BuildFields();
        inner.Children.Add(warning);
        UpdateWarning();
        Renumber(index);
    }

    /// After a drag or Move Up / Down: the badge and the menus follow the new position.
    public void Renumber(int i)
    {
        index = i;
        number.Text = (i + 1).ToString();
        ContextFlyout = Menu();
        more.Flyout = Menu();
    }

    MenuFlyout Menu()
    {
        var m = new MenuFlyout();
        m.Items.Add(MainWindow.Item("Duplicate", () => editor.Duplicate(Step)));
        m.Items.Add(MainWindow.Item("Move Up", () => editor.MoveStep(Step, -1), index > 0));
        m.Items.Add(MainWindow.Item("Move Down", () => editor.MoveStep(Step, 1), index < editor.Macro.Steps.Count - 1));
        m.Items.Add(new MenuFlyoutSeparator());
        m.Items.Add(MainWindow.Item("Delete", () => editor.Remove(Step), danger: true));
        return m;
    }

    UIElement TopRow()
    {
        var badge = new Border
        {
            Background = Theme.Solid(ShowOnlyLook ? Theme.Purple : Kind), CornerRadius = new CornerRadius(11), MinWidth = 26, Height = 22,
            Padding = new Thickness(6, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center, Child = number,
        };
        var grip = new DragHandle();
        grip.PointerPressed += (_, e) => editor.DragStart(this, grip, e);
        grip.PointerMoved += (_, e) => editor.DragMove(e);
        grip.PointerReleased += (_, _) => editor.DragEnd(commit: true);
        grip.PointerCaptureLost += (_, _) => editor.DragEnd(commit: false);
        var icon = Theme.Icon(Step.Type.Glyph(), 15, Theme.Solid(Kind));
        icon.VerticalAlignment = VerticalAlignment.Center;
        var type = Theme.Label(Step.Type.Label(), 13, Theme.Muted, wrap: false);
        var lead = Theme.Row(grip, badge, icon, type);
        lead.VerticalAlignment = VerticalAlignment.Center;

        // The name reads as the card's title: no box until it's hovered or clicked.
        var name = new TextBox
        {
            Text = Step.Name, PlaceholderText = "Add a name", VerticalAlignment = VerticalAlignment.Center, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            Background = new SolidColorBrush(Colors.Transparent), BorderBrush = new SolidColorBrush(Colors.Transparent), Margin = new Thickness(6, 0, 12, 0),
        };
        name.TextChanged += (_, _) => { Step.Name = name.Text; editor.StepChanged(); };

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        if (Step.Type != StepType.Wait)
        {
            // Live / Show only as a coloured pill.
            var c = Step.ShowOnly ? Theme.Purple : Theme.Green;
            var mode = Theme.Button(Step.ShowOnly ? "Show only" : "Live", Step.ShowOnly ? "" : "", tint: c);
            mode.CornerRadius = new CornerRadius(14);
            mode.Background = Theme.Tint(c, Theme.Dark ? (byte)0x30 : (byte)0x1C);
            mode.BorderBrush = new SolidColorBrush(Colors.Transparent);
            mode.Margin = new Thickness(0, 0, 6, 0);
            ToolTipService.SetToolTip(mode, "Live: the step runs. Show only: it is never executed, even in a real run; it only shows its marker.");
            mode.Click += (_, _) =>
            {
                Step.ShowOnly = !Step.ShowOnly;
                editor.StepChanged();
                editor.RebuildSteps();
            };
            actions.Children.Add(mode);
        }
        if (Step.Type.HasPoint() || Step.Type.HasArea())
        {
            var pick = Theme.Ghost(Theme.Button("Pick", ""));
            ToolTipService.SetToolTip(pick, Step.Type.HasArea() ? "Drag a box over the area, then press ✓" : "Drag the target onto the spot, then press ✓");
            pick.Click += (_, _) => Pick();
            actions.Children.Add(pick);
        }
        if (Step.Type != StepType.Wait)
        {
            var test = Theme.Ghost(Theme.Button("Test", ""));
            ToolTipService.SetToolTip(test, Step.ShowOnly ? "Shows this step's marker (it's Show only, so nothing is executed)" : "Runs just this step, for real, with no delay");
            test.Click += (_, _) => { Flash(); editor.Test(Step); };
            actions.Children.Add(test);
        }
        // Every step type has a number (a delay at least).
        actions.Children.Add(Theme.EditToggle(numbers, "Unlock this step's numbers (position, size, delay) to change them", on =>
        {
            editing = on;
            Paint();
            Anim.Pop(card, 0.012f);
        }, ghost: true));
        ToolTipService.SetToolTip(more, "More: duplicate, move, delete");
        actions.Children.Add(Theme.Ghost(more));

        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.Children.Add(lead);
        Grid.SetColumn(name, 1);
        row.Children.Add(name);
        Grid.SetColumn(actions, 2);
        row.Children.Add(actions);
        return row;
    }

    NumberBox Field(WrapPanel row, string label, double value, double min, double max, int decimals, Action<double> set, string? unit = null, double width = 104)
    {
        row.Children.Add(Theme.Label(label, color: Theme.Muted, wrap: false));
        var n = Theme.Num(min, max, decimals, value, width);
        Theme.Lock(n, true);
        numbers.Add(n);
        n.ValueChanged += (_, e) => { if (double.IsNaN(e.NewValue)) return; set(e.NewValue); editor.StepChanged(); UpdateWarning(); };
        row.Children.Add(n);
        if (unit != null) { var u = Theme.Label(unit, color: Theme.Muted, wrap: false); u.Margin = new Thickness(0, 0, 10, 0); row.Children.Add(u); }
        return n;
    }

    WrapPanel DelayRow(WrapPanel? into = null)
    {
        var row = into ?? new WrapPanel();
        Field(row, "Delay before", Step.DelayBefore, 0, 86400, 1, v => Step.DelayBefore = v, "s");
        return row;
    }

    TextBox TextField(string value, Action<string> set, string placeholder, bool multiline = false)
    {
        var t = new TextBox
        {
            Text = multiline ? Theme.ToBox(value) : value, PlaceholderText = placeholder, AcceptsReturn = multiline,
            TextWrapping = multiline ? TextWrapping.Wrap : TextWrapping.NoWrap, MinHeight = multiline ? 64 : 0, MaxHeight = multiline ? 220 : double.PositiveInfinity,
        };
        t.TextChanged += (_, _) => { set(multiline ? Theme.FromBox(t.Text) : t.Text); editor.StepChanged(); };
        inner.Children.Add(t);
        return t;
    }

    void Add(UIElement e) => inner.Children.Add(e);

    void BuildFields()
    {
        var s = Step;
        const double big = 100000;
        switch (s.Type)
        {
            case StepType.LeftClick or StepType.DoubleClick or StepType.RightClick or StepType.Move:
            {
                var row = new WrapPanel();
                x = Field(row, "X", s.X, -big, big, 0, v => s.X = v);
                y = Field(row, "Y", s.Y, -big, big, 0, v => s.Y = v, "px");
                DelayRow(row);
                Add(row);
                break;
            }
            case StepType.Wait:
            {
                var row = new WrapPanel();
                Field(row, "Wait", s.Seconds, 0, 86400, 1, v => s.Seconds = v, "seconds");
                Add(row);
                break;
            }
            case StepType.TypeText:
                TextField(s.Text, v => s.Text = v, "Text to type (Enter makes a new line, typed as Enter)", multiline: true);
                Add(DelayRow());
                break;
            case StepType.KeyShortcut:
            {
                var keys = new KeyCaptureBox { Text = s.Keys, PlaceholderText = "ctrl+s, alt+f4, enter, win+d", Width = 220, VerticalAlignment = VerticalAlignment.Center };
                var parsed = Theme.Small("");
                void Show()
                {
                    var c = KeyCombo.Parse(keys.Text);
                    parsed.Text = keys.Text.Trim().Length == 0 ? "" : c is { } k ? k.Display : "Can't read this shortcut";
                    parsed.Foreground = c == null ? Theme.Solid(Theme.Red) : Theme.Muted;
                }
                keys.TextChanged += (_, _) => { s.Keys = keys.Text; editor.StepChanged(); Show(); };
                var rec = Theme.Button("Record keys", "");
                rec.Click += (_, _) => { keys.Armed = true; keys.Focus(FocusState.Programmatic); parsed.Text = "Press the shortcut…"; parsed.Foreground = Theme.Solid(Theme.Accent); };
                keys.Captured += t => keys.Text = t;
                Add(Theme.Row(keys, rec, parsed));
                Show();
                Add(DelayRow());
                break;
            }
            case StepType.PostClipboard:
                TextField(s.Url, v => s.Url = v, MacroEditor.DefaultPostUrl);
                Add(Hint("POSTs the clipboard text to this URL. The default relays it to the #clickflow Discord channel."));
                Add(DelayRow());
                break;
            case StepType.OpenUrl:
                TextField(s.Url, v => s.Url = v, "example.com/page");
                Add(Hint(ClickEngine.ChromePath() != null ? "Opens in a new Chrome tab. https:// is added when left out." : "Chrome isn't installed, so it opens in the default browser."));
                Add(DelayRow());
                break;
            case StepType.DiscordMessage:
            {
                var c = new Composer(s.Text, MessageVars.ForMessage, () => "text read earlier");
                c.Changed += t => { s.Text = t; editor.StepChanged(); };
                Add(c);
                if (Discord.WebhookUrl == null) Add(Hint("No Discord webhook set yet: Settings › Discord.", Theme.Orange));
                Add(DelayRow());
                break;
            }
            case StepType.ReadText:
                BuildScreenshot();
                break;
            case StepType.Shutdown:
            {
                var c = new Composer(s.Text, MessageVars.ForMessage, () => "text read earlier");
                c.Changed += t => { s.Text = t; editor.StepChanged(); };
                Add(c);
                Add(Hint(Discord.WebhookUrl == null
                    ? "No Discord webhook set, so it only shuts down: Settings › Discord."
                    : "Sends this to Discord (leave empty to skip), then force-closes every app (unsaved work is lost) and shuts down. Steps after it never run.", Theme.Red));
                var servo = new CheckBox { Content = "Only if the servo turned the PC on", IsChecked = s.OnlyIfServo };
                servo.Checked += (_, _) => { s.OnlyIfServo = true; editor.StepChanged(); };
                servo.Unchecked += (_, _) => { s.OnlyIfServo = false; editor.StepChanged(); };
                Add(servo);
                Add(Hint("Checks /servo/lastRun in Firebase first. Shuts down only if the last 5:55 / 3:55 servo check turned the PC on; if the PC was already on then, it stays on and the run carries on."));
                Add(DelayRow());
                break;
            }
        }
    }

    void BuildScreenshot()
    {
        var s = Step;
        var row = new WrapPanel();
        x = Field(row, "X", s.X, -100000, 100000, 0, v => s.X = v);
        y = Field(row, "Y", s.Y, -100000, 100000, 0, v => s.Y = v);
        w = Field(row, "W", s.Width, 1, 20000, 0, v => s.Width = v);
        h = Field(row, "H", s.Height, 1, 20000, 0, v => s.Height = v, "px");
        Add(row);

        var copy = new CheckBox { Content = "Copy the text it reads to the clipboard", IsChecked = s.CopyResult };
        copy.Checked += (_, _) => { s.CopyResult = true; editor.StepChanged(); };
        copy.Unchecked += (_, _) => { s.CopyResult = false; editor.StepChanged(); };
        var discord = new CheckBox { Content = "Send to Discord", IsChecked = s.SendDiscord };
        Add(Theme.Row(copy, discord));

        var discordBox = new StackPanel { Spacing = 6 };
        var group = $"img-{s.Id}";
        var withImage = new RadioButton { Content = "Screenshot + message", IsChecked = !s.TextOnly, GroupName = group };
        var textOnly = new RadioButton { Content = "Message only", IsChecked = s.TextOnly, GroupName = group };
        withImage.Checked += (_, _) => { s.TextOnly = false; editor.StepChanged(); };
        textOnly.Checked += (_, _) => { s.TextOnly = true; editor.StepChanged(); };
        discordBox.Children.Add(Theme.Row(withImage, textOnly));
        var c = new Composer(s.Text, MessageVars.ForScreenshot, () => StepOutputs.Text.GetValueOrDefault(s.Id, "text it reads"));
        c.Changed += t => { s.Text = t; editor.StepChanged(); };
        discordBox.Children.Add(c);
        if (Discord.WebhookUrl == null) discordBox.Children.Add(Hint("No Discord webhook set yet: Settings › Discord.", Theme.Orange));
        discordBox.Visibility = s.SendDiscord ? Visibility.Visible : Visibility.Collapsed;
        void SetDiscord(bool v) { s.SendDiscord = v; discordBox.Visibility = v ? Visibility.Visible : Visibility.Collapsed; editor.StepChanged(); }
        discord.Checked += (_, _) => SetDiscord(true);
        discord.Unchecked += (_, _) => SetDiscord(false);
        Add(discordBox);
        Add(DelayRow());

        outputImage = new Image { Stretch = Stretch.Uniform, Width = 120, Height = 50 };
        outputText = new TextBlock { FontFamily = new FontFamily("Consolas"), FontSize = 13, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
        var frame = outputFrame = new Border { Child = outputImage, BorderBrush = Theme.Res("CardStrokeColorDefaultBrush"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4) };
        var grid = new Grid { ColumnSpacing = 10 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.Children.Add(frame);
        Grid.SetColumn(outputText, 1);
        grid.Children.Add(outputText);
        outputRow = grid;
        Add(grid);
        ShowOutput();
    }

    /// The last thing this Screenshot area step read (from a run or a Test).
    public void ShowOutput()
    {
        if (outputRow == null || outputText == null || outputImage == null) return;
        bool has = StepOutputs.Text.TryGetValue(Step.Id, out var text);
        StepOutputs.Images.TryGetValue(Step.Id, out var img);
        outputRow.Visibility = has || img != null ? Visibility.Visible : Visibility.Collapsed;
        outputImage.Source = img != null ? Theme.ToImage(img) : null;
        if (outputFrame != null) outputFrame.Visibility = img != null ? Visibility.Visible : Visibility.Collapsed;
        outputText.Text = "Last read: " + (string.IsNullOrEmpty(text) ? "(no text found)" : text.Replace("\n", " ⏎ "));
    }

    static TextBlock Hint(string text, Color? color = null) => Theme.Small(text, color is { } c ? Theme.Solid(c) : null);

    void UpdateWarning()
    {
        string t = "";
        if (Step.Type.HasPoint() && !Screens.OnScreen(Step.Point)) t = "This point is off every display (the display layout may have changed).";
        else if (Step.Type.HasArea() && !Screens.OnScreen(Step.Area)) t = "This area is off every display.";
        warning.Text = t;
        warning.Visibility = t.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    static void SetNum(NumberBox? n, double v)
    {
        if (n != null) n.Value = Math.Clamp(v, n.Minimum, n.Maximum);
    }

    public void Pick()
    {
        if (Step.Type.HasArea())
        {
            editor.WithPlacer((ok, cancel) => Placer.PickArea(Step.Area, a =>
            {
                Step.X = a.X; Step.Y = a.Y; Step.Width = a.Width; Step.Height = a.Height;
                SetNum(x, a.X); SetNum(y, a.Y); SetNum(w, a.Width); SetNum(h, a.Height);
                editor.StepChanged();
                ok();
            }, cancel));
        }
        else
        {
            var start = Screens.OnScreen(Step.Point) ? Step.Point : Native.CursorPos();
            editor.WithPlacer((ok, cancel) => Placer.PickPoint(start, p =>
            {
                Step.X = p.X; Step.Y = p.Y;
                SetNum(x, p.X); SetNum(y, p.Y);
                editor.StepChanged();
                ok();
            }, cancel));
        }
    }
}

/// The grip on the left of a step card: press and drag to move the step.
sealed class DragHandle : Grid
{
    public DragHandle()
    {
        Width = 22;
        Height = 30;
        Margin = new Thickness(-6, 0, -4, 0);
        Background = new SolidColorBrush(Colors.Transparent);
        VerticalAlignment = VerticalAlignment.Center;
        var icon = Theme.Icon("", 14, Theme.Faint);
        icon.HorizontalAlignment = HorizontalAlignment.Center;
        icon.VerticalAlignment = VerticalAlignment.Center;
        Children.Add(icon);
        ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeNorthSouth);
        ToolTipService.SetToolTip(this, "Drag to reorder");
    }
}
