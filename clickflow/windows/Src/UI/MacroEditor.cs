namespace ClickFlow;

using System.Numerics;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Windows.System;
using Windows.UI.Core;

/// The editor for one macro: name and repeat, the step cards, and its schedules.
public sealed class MacroEditor : UserControl, IDisposable
{
    public const string DefaultPostUrl = "https://clickflow-hook-668755364170.asia-southeast1.run.app";

    readonly Macro macro;
    readonly MainWindow main;
    readonly Store store = Store.Shared;
    readonly StackPanel stack = new() { Padding = new Thickness(32, 22, 32, 40), Spacing = 0 };
    readonly ScrollViewer scroll = new() { VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    readonly TextBlock stats = Theme.Small("");
    readonly List<StepCard> cards = new();
    readonly StackPanel stepsBox = new() { Spacing = 16 }, schedulesBox = new() { Spacing = 10 };
    // The flow: steps as nodes on a canvas, joined by arrows; the picked step's full card sits below it.
    readonly Canvas flowCanvas = new();
    readonly Border flowFrame = new();
    readonly ContentControl panel = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch };
    int sel;
    double flowWidth;
    bool editing;
    readonly TextBlock titleText = new() { FontSize = Theme.T38, FontWeight = Microsoft.UI.Text.FontWeights.Bold, TextAlignment = TextAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center, TextWrapping = TextWrapping.Wrap };
    TextBox nameBox = new();
    readonly TextBlock schedText = Theme.Small("");
    readonly StackPanel schedLine = new() { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Center };
    readonly ToggleSwitch schedToggle = Theme.Pin(new ToggleSwitch { OnContent = "", OffContent = "", MinWidth = 0 });
    bool updatingSched;
    readonly StackPanel runHost = new() { Orientation = Orientation.Horizontal, Spacing = 16, HorizontalAlignment = HorizontalAlignment.Center };
    readonly Button doneButton = Theme.Button("Done", "", primary: true);
    readonly Button editLink = Theme.Ghost(Theme.Button("Edit steps", ""));
    Border settings = new();
    readonly StackPanel schedulesSection = new() { Spacing = 0 };

    public Macro Macro => macro;
    public MainWindow Main => main;

    public MacroEditor(Macro macro, MainWindow main)
    {
        this.macro = macro;
        this.main = main;
        scroll.Content = stack;
        Content = scroll;
        stack.Padding = new Thickness(64, 24, 64, 48);
        stack.Spacing = 24;
        stack.MaxWidth = 1000;
        stack.HorizontalAlignment = HorizontalAlignment.Center;
        scroll.SizeChanged += (_, e) => stack.Width = Math.Max(320, Math.Min(1000, e.NewSize.Width - 16));
        stats.HorizontalAlignment = HorizontalAlignment.Center;
        stats.TextAlignment = TextAlignment.Center;

        stack.Children.Add(BuildTitleBlock());
        stack.Children.Add(BuildRunRow());
        flowFrame.Child = flowCanvas;
        flowFrame.SizeChanged += (_, e) => { if (Math.Abs(e.NewSize.Width - flowWidth) > 8) RebuildFlow(); };
        stack.Children.Add(flowFrame);
        editLink.HorizontalAlignment = HorizontalAlignment.Center;
        editLink.Click += (_, _) => { editing = true; ApplyMode(); };
        stack.Children.Add(editLink);
        stack.Children.Add(panel);
        stack.Children.Add(BuildSettings());
        var addSchedule = Theme.Button("Add schedule", "");
        addSchedule.Click += (_, _) => EditSchedule(null);
        schedulesSection.Children.Add(SectionHeader("Schedules", "", Theme.Purple, addSchedule));
        schedulesSection.Children.Add(schedulesBox);
        stack.Children.Add(schedulesSection);

        editing = macro.Steps.Count == 0;
        RebuildSteps();
        RebuildSchedules();
        UpdateStats();
        ApplyMode();
        StepOutputs.Changed += OnOutput;
    }

    public void Dispose() => StepOutputs.Changed -= OnOutput;

    /// Shown again from the window's cache: catch up on what changed while it was hidden
    /// (schedules fire and switch off, the sidebar switch, run stats).
    public void Refresh()
    {
        RebuildSchedules();
        UpdateStats();
    }

    void OnOutput(Guid stepId)
    {
        foreach (var c in cards) if (c.Step.Id == stepId) c.ShowOutput();
    }

    // ---------- the calm layout: title, one Run, the route; editing opens on request ----------

    UIElement BuildTitleBlock()
    {
        var box = new StackPanel { Spacing = 8, HorizontalAlignment = HorizontalAlignment.Center };
        titleText.Text = macro.Name;
        nameBox = new TextBox
        {
            Text = macro.Name, FontSize = Theme.T24, FontWeight = Microsoft.UI.Text.FontWeights.Bold, PlaceholderText = "Macro name",
            TextAlignment = TextAlignment.Center, MinWidth = 420, HorizontalAlignment = HorizontalAlignment.Center,
        };
        nameBox.TextChanged += (_, _) =>
        {
            var t = nameBox.Text.Trim();
            if (t.Length == 0) return;
            macro.Name = t;
            titleText.Text = t;
            store.Touch();
            main.RefreshEditorHeader();
        };
        nameBox.LostFocus += (_, _) => { if (nameBox.Text.Trim().Length == 0) nameBox.Text = macro.Name; store.Changed(); };
        box.Children.Add(titleText);
        box.Children.Add(nameBox);
        box.Children.Add(stats);
        schedLine.Children.Add(schedText);
        schedLine.Children.Add(schedToggle);
        schedToggle.Toggled += (_, _) =>
        {
            if (updatingSched) return;
            if (macro.ScheduleOn != schedToggle.IsOn) macro.SetScheduleOn(!macro.ScheduleOn);
            store.Changed();
            RebuildSchedules();
            UpdateSchedLine();
            main.RefreshEditorHeader();
        };
        box.Children.Add(schedLine);
        return box;
    }

    void UpdateSchedLine()
    {
        var summary = macro.ScheduleSummary;
        schedLine.Visibility = summary != null ? Visibility.Visible : Visibility.Collapsed;
        if (summary == null) return;
        string next = macro.NextRun(DateTime.Now) is { } n ? $" · Next: {Fmt.NextRun(n)}" : "";
        schedText.Text = summary + next;
        updatingSched = true;
        if (schedToggle.IsOn != macro.ScheduleOn) schedToggle.IsOn = macro.ScheduleOn;
        updatingSched = false;
    }

    UIElement BuildRunRow()
    {
        doneButton.Click += (_, _) => { editing = false; store.Changed(); ApplyMode(); };
        var g = new Grid { HorizontalAlignment = HorizontalAlignment.Center };
        g.Children.Add(runHost);
        g.Children.Add(doneButton);
        return g;
    }

    /// The window moves its Preview / Run buttons into the editor that is showing.
    public void HostButtons(Button preview, Button run)
    {
        foreach (var b in new[] { preview, run }) if (b.Parent is Panel old) old.Children.Remove(b);
        runHost.Children.Clear();
        runHost.Children.Add(preview);
        runHost.Children.Add(run);
        run.MinHeight = 48;
        run.Padding = new Thickness(40, 8, 40, 8);
        run.CornerRadius = new CornerRadius(24);
    }

    UIElement BuildSettings()
    {
        var repeat = Theme.Num(0, 100000, 0, macro.RepeatCount);
        repeat.ValueChanged += (_, e) => { if (double.IsNaN(e.NewValue)) return; macro.RepeatCount = (int)e.NewValue; store.Touch(); UpdateStats(); };
        var delay = Theme.Num(0, 86400, 1, macro.RepeatDelay);
        delay.ValueChanged += (_, e) => { if (double.IsNaN(e.NewValue)) return; macro.RepeatDelay = e.NewValue; store.Touch(); UpdateStats(); };
        var row = Theme.Row(Theme.Label("Repeat"), repeat, Theme.Label("times (0 = until stopped)", color: Theme.Muted),
            new Border { Width = 16 }, Theme.Label("Pause between repeats"), delay, Theme.Label("s", color: Theme.Muted));
        settings = Theme.Card(row);
        return settings;
    }

    void ApplyMode()
    {
        titleText.Visibility = editing ? Visibility.Collapsed : Visibility.Visible;
        nameBox.Visibility = editing ? Visibility.Visible : Visibility.Collapsed;
        runHost.Visibility = editing ? Visibility.Collapsed : Visibility.Visible;
        doneButton.Visibility = editing ? Visibility.Visible : Visibility.Collapsed;
        editLink.Visibility = editing || macro.Steps.Count == 0 ? Visibility.Collapsed : Visibility.Visible;
        var v = editing ? Visibility.Visible : Visibility.Collapsed;
        panel.Visibility = settings.Visibility = schedulesSection.Visibility = v;
        RebuildFlow();
        if (editing) Anim.Enter(panel, slide: false, ms: 260);
    }

    // ---------- header ----------

    UIElement BuildHeader()
    {
        var inner = new StackPanel { Spacing = 10 };
        var name = new TextBox { Text = macro.Name, FontSize = Theme.T15, FontWeight = Microsoft.UI.Text.FontWeights.Bold, PlaceholderText = "Macro name" };
        name.TextChanged += (_, _) =>
        {
            var t = name.Text.Trim();
            if (t.Length == 0) return;
            macro.Name = t;
            store.Touch();
            main.RefreshEditorHeader();
        };
        name.LostFocus += (_, _) => { if (name.Text.Trim().Length == 0) name.Text = macro.Name; store.Changed(); };
        inner.Children.Add(name);
        inner.Children.Add(stats);

        var repeat = Theme.Num(0, 100000, 0, macro.RepeatCount);
        repeat.ValueChanged += (_, e) => { if (double.IsNaN(e.NewValue)) return; macro.RepeatCount = (int)e.NewValue; store.Touch(); UpdateStats(); };
        var delay = Theme.Num(0, 86400, 1, macro.RepeatDelay);
        delay.ValueChanged += (_, e) => { if (double.IsNaN(e.NewValue)) return; macro.RepeatDelay = e.NewValue; store.Touch(); UpdateStats(); };
        var gap = new Border { Width = 14 };
        Border? card = null;
        Brush? resting = null;
        var edit = Theme.EditToggle(new[] { repeat, delay }, "Unlock Repeat and Pause to change them", on =>
        {
            if (card == null) return;
            card.BorderBrush = on ? Theme.Solid(Theme.Accent) : resting;
            card.Background = on ? Theme.Tint(Theme.Accent, Theme.Dark ? (byte)0x24 : (byte)0x14) : Theme.Res("CardBackgroundFillColorDefaultBrush");
            Anim.Pop(card, 0.008f);
        });
        edit.Margin = new Thickness(8, 0, 0, 0);
        inner.Children.Add(Theme.Row(
            Theme.Label("Repeat"), repeat, Theme.Label("times (0 = until stopped)", color: Theme.Muted),
            gap, Theme.Label("Pause between repeats"), delay, Theme.Label("s", color: Theme.Muted), edit));
        // The brand gradient along the top edge.
        inner.Children.Insert(0, new Border { Height = 3, Margin = new Thickness(-16, -16, -16, 8), CornerRadius = new CornerRadius(Theme.R13, Theme.R13, 0, 0), Background = Theme.Solid(Theme.Accent), Visibility = Visibility.Collapsed });
        card = Theme.Card(inner);
        card.BackgroundTransition = new BrushTransition { Duration = TimeSpan.FromMilliseconds(220) };
        resting = card.BorderBrush;
        card.Margin = new Thickness(0, 0, 0, 20);
        return card;
    }

    public void UpdateStats()
    {
        var n = macro.Steps.Count;
        var single = Fmt.Seconds(macro.SingleRunDuration);
        var total = macro.TotalDuration is { } t ? $"{Fmt.Seconds(t)} in all" : "repeats until stopped";
        stats.Text = $"{n} step{(n == 1 ? "" : "s")} · {single} per run · {total}";
        UpdateSchedLine();
        main.RefreshEditorHeader();
    }

    static UIElement SectionHeader(string title, string glyph, Windows.UI.Color color, UIElement action)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Margin = new Thickness(2, 16, 0, 16) };
        var tile = new Border
        {
            Width = 30, Height = 30, CornerRadius = new CornerRadius(Theme.R8), Background = Theme.Tint(color, Theme.Dark ? (byte)0x38 : (byte)0x22),
            Child = Theme.Icon(glyph, 15, Theme.Solid(color)), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, -4, 0),
        };
        row.Children.Add(tile);
        row.Children.Add(Theme.H2(title));
        row.Children.Add(action);
        return row;
    }

    Button AddStepButton()
    {
        var b = Theme.Button("Add step", "", primary: true);
        var menu = new MenuFlyout();
        foreach (var t in StepTypes.All)
        {
            var type = t;
            menu.Items.Add(new MenuFlyoutItem { Text = t.Label(), Icon = new FontIcon { Glyph = t.Glyph() } });
            ((MenuFlyoutItem)menu.Items[^1]).Click += (_, _) => AddStep(type);
            if (t is StepType.Move or StepType.KeyShortcut) menu.Items.Add(new MenuFlyoutSeparator());
        }
        b.Flyout = menu;
        return b;
    }

    // ---------- steps ----------

    void AddStep(StepType type, int at = -1)
    {
        var p = Native.CursorPos();
        var s = new Step(type) { X = p.X, Y = p.Y };
        if (type == StepType.PostClipboard) s.Url = DefaultPostUrl;
        if (type == StepType.ReadText) { s.Width = 300; s.Height = 120; s.X = p.X - 150; s.Y = p.Y - 60; }
        if (type == StepType.DiscordMessage) s.Text = "{macro} finished at {time}";
        if (type == StepType.Shutdown) s.Text = "PC Shutdown at {time}";
        if (at < 0 || at > macro.Steps.Count) at = macro.Steps.Count;
        macro.Steps.Insert(at, s);
        sel = at;
        store.Changed();
        RebuildSteps();
        UpdateStats();
        var card = cards[sel];
        Anim.Enter(panel, slide: false, ms: 360);
        // Adding a click or screenshot step opens the placer straight away.
        if (type.HasPoint() || type.HasArea()) card.Pick();
    }

    public void RebuildSteps()
    {
        cards.Clear();
        for (int i = 0; i < macro.Steps.Count; i++) cards.Add(new StepCard(this, macro.Steps[i], i));
        sel = Math.Clamp(sel, 0, Math.Max(0, macro.Steps.Count - 1));
        RebuildFlow();
    }

    // ---------- the flow canvas ----------
    const double NodeW = 208, NodeH = 64, GapX = 72, GapY = 80, Pad = 24;

    MenuFlyout TypeMenu(Action<StepType> pick)
    {
        var menu = new MenuFlyout();
        foreach (var t in StepTypes.All)
        {
            var type = t;
            var item = new MenuFlyoutItem { Text = t.Label(), Icon = new FontIcon { Glyph = t.Glyph() } };
            item.Click += (_, _) => pick(type);
            menu.Items.Add(item);
            if (t is StepType.Move or StepType.KeyShortcut) menu.Items.Add(new MenuFlyoutSeparator());
        }
        return menu;
    }

    static string Summary(Step st)
    {
        var l = st.Type.Label();
        if (st.Type.HasPoint()) return $"{l} · {st.X}, {st.Y}";
        if (st.Type == StepType.Wait) return $"{l} · {st.Seconds:0.#} s";
        return l;
    }

    public void RebuildFlow()
    {
        double w = flowFrame.ActualWidth > 100 ? flowFrame.ActualWidth : 820;
        flowWidth = flowFrame.ActualWidth;
        int n = macro.Steps.Count;
        flowCanvas.Children.Clear();
        var ink = Theme.Solid(Theme.Ink);
        if (n == 0)
        {
            flowCanvas.Height = 64;
            var none = Theme.Label("No steps yet. Press + to add the first one, or Record from the top bar.", color: Theme.Muted);
            Canvas.SetLeft(none, 0); Canvas.SetTop(none, 8);
            flowCanvas.Children.Add(none);
            var first = InsertButton(0);
            Canvas.SetLeft(first, 0); Canvas.SetTop(first, 32);
            flowCanvas.Children.Add(first);
            panel.Content = null;
            return;
        }
        const double cell = 96, rowH = 104, circleY = 40;
        int slots = n + (editing ? 1 : 0);
        int perRow = Math.Max(1, (int)(w / cell));
        int rows = (slots + perRow - 1) / perRow;
        double rowW = Math.Min(perRow, slots) * cell, left = Math.Max(0, (w - rowW) / 2);
        double X(int i) => left + (i % perRow) * cell + cell / 2;
        double Y(int i) => (i / perRow) * rowH + circleY;
        flowCanvas.Height = rows * rowH;

        for (int r = 0; r < rows; r++)
        {
            int first = r * perRow, last = Math.Min(slots - 1, first + perRow - 1);
            if (last > first)
            {
                var line = new Rectangle { Width = X(last) - X(first), Height = 1, Fill = ink };
                Canvas.SetLeft(line, X(first)); Canvas.SetTop(line, Y(first));
                flowCanvas.Children.Add(line);
            }
        }
        for (int i = 0; i < n; i++)
        {
            var st = macro.Steps[i];
            bool on = editing && i == sel;
            var color = st.ShowOnly ? Theme.Purple : Theme.StepColor(st.Type);
            double size = on ? 32 : 24;
            var halo = new Ellipse { Width = size + 14, Height = size + 14, Fill = Theme.Solid(Theme.Paper) };
            Canvas.SetLeft(halo, X(i) - (size + 14) / 2); Canvas.SetTop(halo, Y(i) - (size + 14) / 2);
            flowCanvas.Children.Add(halo);
            var dot = new Border
            {
                Width = size, Height = size, CornerRadius = new CornerRadius(size / 2), BorderBrush = ink, BorderThickness = new Thickness(2),
                Background = Theme.Solid(on ? Theme.Sun : color),
                Child = new TextBlock
                {
                    Text = (i + 1).ToString(), FontSize = Theme.T12, FontWeight = Microsoft.UI.Text.FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
                    Foreground = Theme.Solid(on ? Theme.Rgb(31, 26, 23) : Theme.OnAccent),
                },
            };
            Canvas.SetLeft(dot, X(i) - size / 2); Canvas.SetTop(dot, Y(i) - size / 2);
            flowCanvas.Children.Add(dot);
            var label = new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(st.Name) ? st.Type.Label() : st.Name, Width = cell - 8, TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap,
                MaxLines = 2, TextTrimming = TextTrimming.CharacterEllipsis, FontSize = Theme.T12, LineHeight = 14,
                FontWeight = on ? Microsoft.UI.Text.FontWeights.Bold : Microsoft.UI.Text.FontWeights.Normal, Foreground = on ? Theme.Text : Theme.Muted,
            };
            Canvas.SetLeft(label, X(i) - (cell - 8) / 2); Canvas.SetTop(label, Y(i) + 24);
            flowCanvas.Children.Add(label);
            // The whole stop is the click target while editing.
            var hit = new Border { Width = cell - 8, Height = 76, Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent) };
            Canvas.SetLeft(hit, X(i) - (cell - 8) / 2); Canvas.SetTop(hit, Y(i) - 20);
            int idx = i;
            hit.Tapped += (_, _) => { if (editing && sel != idx) { sel = idx; RebuildFlow(); Anim.Enter(panel, slide: false, ms: 200); } };
            flowCanvas.Children.Add(hit);
            double d = st.Type == StepType.Wait ? 0 : st.DelayBefore;
            if (i > 0 && d > 0 && i % perRow != 0)
            {
                var chip = new Border
                {
                    Background = Theme.Solid(Theme.Sun), CornerRadius = new CornerRadius(10), Padding = new Thickness(8, 1, 8, 1),
                    Child = new TextBlock { Text = $"{d:0.#} s", FontSize = Theme.T12, FontWeight = Microsoft.UI.Text.FontWeights.Bold, Foreground = Theme.Solid(Theme.Rgb(31, 26, 23)) },
                };
                chip.Measure(new Windows.Foundation.Size(200, 40));
                Canvas.SetLeft(chip, (X(i - 1) + X(i)) / 2 - chip.DesiredSize.Width / 2); Canvas.SetTop(chip, Y(i) - 36);
                flowCanvas.Children.Add(chip);
            }
        }
        if (editing)
        {
            for (int i = 1; i <= n; i++)
            {
                // Insert before step i (the last one appends); none across a row break.
                if (i < n && i % perRow == 0) continue;
                var plus = InsertButton(i);
                double px = i < n ? (X(i - 1) + X(i)) / 2 : X(i);
                Canvas.SetLeft(plus, px - 12); Canvas.SetTop(plus, Y(i < n ? i : i) - 12);
                flowCanvas.Children.Add(plus);
            }
        }
        panel.Content = null;
        if (editing && n > 0) panel.Content = cards[sel];
    }

    Button InsertButton(int at)
    {
        var b = new Button
        {
            Width = 24, Height = 24, MinWidth = 24, MinHeight = 24, Padding = new Thickness(0), CornerRadius = new CornerRadius(12),
            Content = new TextBlock { Text = "+", FontSize = Theme.T15, FontWeight = Microsoft.UI.Text.FontWeights.Bold, Margin = new Thickness(0, -3, 0, 0) },
            Flyout = TypeMenu(t => AddStep(t, at)),
        };
        ToolTipService.SetToolTip(b, "Insert a step here");
        return b;
    }

    Border Node(int i)
    {
        var st = macro.Steps[i];
        bool on = i == sel;
        var color = st.ShowOnly ? Theme.Purple : Theme.StepColor(st.Type);
        var badge = new Border
        {
            Width = 24, Height = 24, CornerRadius = new CornerRadius(12), Background = Theme.Solid(color), BorderBrush = Theme.Solid(Theme.Ink), BorderThickness = new Thickness(2),
            VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock { Text = (i + 1).ToString(), FontSize = Theme.T12, FontWeight = Microsoft.UI.Text.FontWeights.Bold, Foreground = Theme.Solid(Theme.OnAccent), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
        };
        // On the mustard (selected) fill only ink text keeps its contrast.
        Brush textColor = on && !Theme.Dark ? Theme.Solid(Theme.Rgb(31, 26, 23)) : Theme.Text;
        Brush subColor = on && !Theme.Dark ? Theme.Solid(Theme.Rgb(90, 78, 69)) : Theme.Muted;
        bool named = !string.IsNullOrWhiteSpace(st.Name);
        var name = Theme.Label(named ? st.Name : st.Type.Label(), Theme.T12, textColor, bold: true, wrap: false);
        var detail = Summary(st);
        if (!named) detail = detail.Contains(" · ") ? detail[(detail.IndexOf(" · ") + 3)..] : "";
        var sub = Theme.Label(detail + (st.ShowOnly ? (detail.Length > 0 ? " · " : "") + "show only" : ""), Theme.T12, subColor, wrap: false);
        var text = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        text.Children.Add(name); text.Children.Add(sub);
        var row = new Grid { ColumnSpacing = 8 };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.Children.Add(badge);
        Grid.SetColumn(text, 1); row.Children.Add(text);
        var node = new Border
        {
            Width = NodeW, Height = NodeH, Padding = new Thickness(16, 0, 8, 0), CornerRadius = new CornerRadius(Theme.R13),
            Background = Theme.Solid(on ? (Theme.Dark ? Theme.PurpleSoft : Theme.Sun) : Theme.Shape),
            BorderBrush = Theme.Solid(Theme.Ink), BorderThickness = new Thickness(2, 2, 3, 3),
            Child = row,
        };
        node.Tapped += (_, _) => { if (sel != i) { sel = i; RebuildFlow(); Anim.Enter(panel, slide: false, ms: 220); } };
        node.PointerEntered += (_, _) => node.Translation = new Vector3(0, -2, 0);
        node.PointerExited += (_, _) => node.Translation = default;
        node.TranslationTransition = new Vector3Transition { Duration = TimeSpan.FromMilliseconds(120) };
        return node;
    }

    void BringIntoView(UIElement e, double ratio = 0.3)
    {
        // After layout, so a card added just now has a position.
        AfterLayout(() => e.StartBringIntoView(new BringIntoViewOptions { VerticalAlignmentRatio = ratio, AnimationDesired = true }));
    }

    public void ScrollToStep(int i)
    {
        if (i >= 0 && i < cards.Count) { sel = i; RebuildFlow(); }
    }

    public void ScrollToEnd() => AfterLayout(() => scroll.ChangeView(null, scroll.ScrollableHeight, null));

    /// Once the editor has been laid out (straight away if it already has).
    void AfterLayout(Action a)
    {
        if (scroll.ActualHeight > 0) { DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () => a()); return; }
        void Once(object? s, object e) { scroll.LayoutUpdated -= Once; DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () => a()); }
        scroll.LayoutUpdated += Once;
    }

    public void StepChanged() { store.Touch(); UpdateStats(); }

    public void MoveStep(Step s, int delta)
    {
        int i = macro.Steps.IndexOf(s), j = i + delta;
        if (i < 0 || j < 0 || j >= macro.Steps.Count || dragging != null || settling) return;
        Reorder(i, j);
    }

    /// Moves step i to j, moving its existing card instead of rebuilding them all.
    void Reorder(int from, int to)
    {
        var step = macro.Steps[from];
        macro.Steps.RemoveAt(from);
        macro.Steps.Insert(to, step);
        sel = to;
        store.Changed();
        RebuildSteps();
    }

    // ---------- drag to reorder ----------
    // The grip on a card captures the pointer. While dragging, the card follows the pointer and
    // the cards it passes slide out of its way (Translation only, so nothing is laid out again);
    // on release it glides into its slot, and only then is the order changed for real.

    StepCard? dragging;
    UIElement? dragGrip;
    bool settling;
    int dragFrom, dragTo;
    double[] tops = Array.Empty<double>(), heights = Array.Empty<double>();
    double startY, startOffset, pointerY;
    DispatcherTimer? autoScroll;
    const int SlideMs = 150;

    static Vector3Transition Slide() => new() { Duration = TimeSpan.FromMilliseconds(SlideMs) };

    public void DragStart(StepCard card, UIElement grip, PointerRoutedEventArgs e)
    {
        return;   // reordering is Move Up / Move Down in the step menu (the flow is not a list)
#pragma warning disable CS0162
        if (dragging != null || settling || cards.Count < 2 || !e.GetCurrentPoint(grip).Properties.IsLeftButtonPressed) return;
        dragFrom = dragTo = cards.IndexOf(card);
        if (dragFrom < 0 || !grip.CapturePointer(e.Pointer)) return;
        e.Handled = true;
        tops = cards.Select(c => c.TransformToVisual(stepsBox).TransformPoint(default).Y).ToArray();
        heights = cards.Select(c => c.ActualHeight).ToArray();
        dragging = card;
        dragGrip = grip;
        startY = pointerY = e.GetCurrentPoint(scroll).Position.Y;
        startOffset = scroll.VerticalOffset;
        foreach (var c in cards) c.TranslationTransition = c == card ? null : Slide();
        Canvas.SetZIndex(card, 1);
        card.Opacity = 0.9;
        if (autoScroll == null)
        {
            autoScroll = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
            autoScroll.Tick += (_, _) => AutoScroll();
        }
        autoScroll.Start();
    }

    public void DragMove(PointerRoutedEventArgs e)
    {
        if (dragging == null) return;
        e.Handled = true;
        pointerY = e.GetCurrentPoint(scroll).Position.Y;
        Follow();
    }

    /// Holding a card near the top or bottom edge scrolls the list, faster the closer it is.
    void AutoScroll()
    {
        const double edge = 56;
        double h = scroll.ActualHeight, speed = 0;
        if (pointerY < edge) speed = -(edge - pointerY);
        else if (pointerY > h - edge) speed = pointerY - (h - edge);
        if (speed != 0) scroll.ChangeView(null, Math.Clamp(scroll.VerticalOffset + Math.Clamp(speed, -edge, edge) / 2.5, 0, scroll.ScrollableHeight), null, true);
        Follow();
    }

    void Follow()
    {
        if (dragging == null) return;
        int n = cards.Count;
        double dy = pointerY - startY + scroll.VerticalOffset - startOffset;
        dy = Math.Clamp(dy, tops[0] - tops[dragFrom], tops[n - 1] + heights[n - 1] - heights[dragFrom] - tops[dragFrom]);
        dragging.Translation = new Vector3(0, (float)dy, 0);

        double centre = tops[dragFrom] + dy + heights[dragFrom] / 2;
        int to = 0;
        for (int i = 0; i < n; i++) if (i != dragFrom && tops[i] + heights[i] / 2 < centre) to++;
        if (to == dragTo) return;
        dragTo = to;
        float shift = (float)(heights[dragFrom] + stepsBox.Spacing);
        for (int i = 0; i < n; i++)
        {
            if (i == dragFrom) continue;
            float t = dragFrom < i && i <= to ? -shift : to <= i && i < dragFrom ? shift : 0;
            cards[i].Translation = new Vector3(0, t, 0);
        }
    }

    public void DragEnd(bool commit)
    {
        if (dragging is not { } card) return;
        dragging = null;
        autoScroll?.Stop();
        dragGrip?.ReleasePointerCaptures();
        int from = dragFrom, to = commit ? dragTo : dragFrom;
        // Where its slot is now: the cards it passed have slid out of the way by its height.
        double slot = to > from ? tops[to] + heights[to] - heights[from] : to < from ? tops[to] : tops[from];
        if (!commit) foreach (var c in cards) c.Translation = default;
        card.TranslationTransition = Slide();
        card.Translation = new Vector3(0, (float)(slot - tops[from]), 0);
        settling = true;
        var done = DispatcherQueue.CreateTimer();
        done.Interval = TimeSpan.FromMilliseconds(SlideMs + 20);
        done.IsRepeating = false;
        done.Tick += (_, _) =>
        {
            // Swap the slide for the real order in one go: same frame, so nothing jumps.
            foreach (var c in cards) { c.TranslationTransition = null; c.Translation = default; }
            Canvas.SetZIndex(card, 0);
            card.Opacity = 1;
            if (to != from) Reorder(from, to);
            settling = false;
        };
        done.Start();
    }

    public void Duplicate(Step s)
    {
        int i = macro.Steps.IndexOf(s);
        macro.Steps.Insert(i + 1, s.Clone());
        sel = i + 1;
        store.Changed();
        RebuildSteps();
        UpdateStats();
    }

    public void Remove(Step s)
    {
        int i = macro.Steps.IndexOf(s);
        if (i < 0) return;
        macro.Steps.Remove(s);
        sel = Math.Min(i, macro.Steps.Count - 1);
        store.Changed();
        RebuildSteps();
        UpdateStats();
    }

    /// Switching to this macro: the cards cascade in.
    public void Cascade()
    {
        Anim.Enter(flowFrame, 30, slide: false);
        Anim.Enter(panel, 120, slide: false);
    }

    public void Test(Step s)
    {
        int i = macro.Steps.IndexOf(s);
        if (i >= 0) Runner.Shared.Test(i, macro.Id);
    }

    public void WithPlacer(Action<Action, Action> open) => main.WithPlacer(open);

    // ---------- schedules ----------

    /// The sidebar switch changed this macro's schedules.
    public void RefreshSchedules() => RebuildSchedules();

    void RebuildSchedules()
    {
        schedulesBox.Children.Clear();
        foreach (var s in macro.Schedules)
        {
            var row = new ScheduleRow(macro, s, main.RefreshEditorHeader, () => EditSchedule(s), () =>
            {
                macro.Schedules.Remove(s);
                store.Changed();
                RebuildSchedules();
            });
            schedulesBox.Children.Add(row);
        }
        if (macro.Schedules.Count == 0)
        {
            var empty = Theme.Label("Not scheduled. Add a schedule to run it by itself (ClickFlow must be open, it lives in the tray).", color: Theme.Muted);
            empty.Margin = new Thickness(4, 0, 0, 12);
            schedulesBox.Children.Add(empty);
        }
    }

    async void EditSchedule(Schedule? existing)
    {
        if (XamlRoot == null) return;
        var copy = existing?.Clone(newId: false) ?? new Schedule
        {
            Time = Clock.String(DateTime.Now.AddMinutes(5)),
            Date = DayString.String(DateTime.Today),
        };
        if (!await ScheduleDialog.Show(XamlRoot, copy, existing == null)) return;
        if (existing == null) macro.Schedules.Add(copy);
        else macro.Schedules[macro.Schedules.IndexOf(existing)] = copy;
        store.Changed();
        RebuildSchedules();
        main.RefreshEditorHeader();
    }
}

/// One schedule: switch, summary, next run, Edit, Delete.
sealed class ScheduleRow : UserControl
{
    readonly Macro macro;
    readonly Schedule schedule;
    readonly TextBlock summary = Theme.Label("", bold: true);
    readonly TextBlock detail = Theme.Small("");
    readonly CheckBox on = new() { Content = "On", MinWidth = 0, Margin = new Thickness(0, 0, 6, 0) };

    public ScheduleRow(Macro macro, Schedule schedule, Action changed, Action edit, Action delete)
    {
        this.macro = macro;
        this.schedule = schedule;
        on.IsChecked = schedule.Enabled && macro.Enabled;
        void Toggle()
        {
            schedule.Enabled = on.IsChecked == true;
            // Switching a schedule on turns the macro on too, so the sidebar switch follows.
            if (schedule.Enabled) macro.Enabled = true;
            Store.Shared.Changed();
            Refresh_();
            changed();
        }
        on.Checked += (_, _) => Toggle();
        on.Unchecked += (_, _) => Toggle();
        var editB = Theme.Button("Edit", "");
        editB.Click += (_, _) => edit();
        var delB = Theme.Button("", "", tint: Theme.Red);
        ToolTipService.SetToolTip(delB, "Delete this schedule");
        delB.Click += (_, _) => delete();
        var inner = new StackPanel { Spacing = 4 };
        inner.Children.Add(Theme.Row(on, summary));
        inner.Children.Add(detail);
        var buttons = Theme.Row(editB, delB);
        buttons.Margin = new Thickness(0, 4, 0, 0);
        inner.Children.Add(buttons);
        Content = Theme.Card(inner);
        Refresh_();
    }

    void Refresh_()
    {
        summary.Text = schedule.Summary;
        summary.Foreground = schedule.Enabled && macro.Enabled ? Theme.Text : Theme.Faint;
        var parts = new List<string>();
        if (!macro.Enabled) parts.Add("Macro's schedules are off (switch in the sidebar)");
        else if (!schedule.Enabled) parts.Add("Off");
        else if (Store.Shared.Prefs.PausedAll) parts.Add("All schedules paused");
        else if (schedule.NextOccurrence(DateTime.Now) is { } n) parts.Add($"Next: {Fmt.NextRun(n)}");
        else parts.Add("No upcoming run");
        parts.Add(schedule.MissedRunPolicy == MissedRunPolicy.RunOnce ? "Missed runs run once, late" : "Missed runs are skipped");
        if (schedule.Conditions.ActiveCount > 0) parts.Add($"{schedule.Conditions.ActiveCount} condition{(schedule.Conditions.ActiveCount == 1 ? "" : "s")}");
        detail.Text = string.Join(" · ", parts);
    }
}

/// A Discord message editor: formatting buttons that wrap the selection, variable chips, and a
/// live preview of what will be sent.
public sealed class Composer : StackPanel
{
    readonly TextBox box = new() { AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 72, MaxHeight = 220 };
    readonly TextBlock preview = Theme.Small("");
    readonly Func<string> sampleText;
    public event Action<string>? Changed;

    public Composer(string text, (string Token, string Help)[] vars, Func<string> sampleText)
    {
        this.sampleText = sampleText;
        Spacing = 6;
        Margin = new Thickness(0, 4, 0, 4);

        var tools = new WrapPanel { Gap = 4 };
        void Fmt(string label, string help, string pre, string post, string placeholder)
        {
            var b = Small(label, bold: true);
            ToolTipService.SetToolTip(b, help);
            b.Click += (_, _) => Wrap(pre, post, placeholder);
            tools.Children.Add(b);
        }
        Fmt("B", "Bold", "**", "**", "bold");
        Fmt("I", "Italic", "*", "*", "italic");
        Fmt("U", "Underline", "__", "__", "underlined");
        Fmt("S", "Strikethrough", "~~", "~~", "struck");
        Fmt("</>", "Inline code", "`", "`", "code");
        Fmt("{ }", "Code block", "```\n", "\n```", "code");
        Fmt("||", "Spoiler", "||", "||", "spoiler");
        Fmt(">", "Quote", "> ", "", "quote");
        tools.Children.Add(new Border { Width = 8 });
        foreach (var (token, help) in vars)
        {
            var b = Small(token);
            b.Foreground = Theme.Solid(Theme.Accent);
            ToolTipService.SetToolTip(b, help);
            b.Click += (_, _) => Insert(token);
            tools.Children.Add(b);
        }
        Children.Add(tools);
        box.Text = Theme.ToBox(text);
        box.TextChanged += (_, _) => { Changed?.Invoke(Theme.FromBox(box.Text)); UpdatePreview(); };
        Children.Add(box);
        Children.Add(preview);
        UpdatePreview();
    }

    /// Doesn't take focus, so the text box keeps its selection.
    static Button Small(string text, bool bold = false) => new()
    {
        Content = text, Padding = new Thickness(8, 2, 8, 3), MinWidth = 30, AllowFocusOnInteraction = false,
        FontWeight = bold ? Microsoft.UI.Text.FontWeights.SemiBold : Microsoft.UI.Text.FontWeights.Normal,
    };

    void Wrap(string pre, string post, string placeholder)
    {
        pre = Theme.ToBox(pre);
        post = Theme.ToBox(post);
        int start = box.SelectionStart;
        var sel = box.SelectionLength > 0 ? box.SelectedText : placeholder;
        box.SelectedText = pre + sel + post;
        box.Select(start + pre.Length, sel.Length);
        box.Focus(FocusState.Programmatic);
    }

    void Insert(string token)
    {
        int start = box.SelectionStart;
        box.SelectedText = token;
        box.Select(start + token.Length, 0);
        box.Focus(FocusState.Programmatic);
    }

    void UpdatePreview()
    {
        var text = Theme.FromBox(box.Text);
        if (text.Trim().Length == 0) { preview.Text = "Preview: (empty message)"; return; }
        var filled = MessageVars.Fill(text, sampleText(), "Macro", clipboard: () => "(clipboard text)");
        preview.Text = "Preview: " + filled.Replace("\n", " ⏎ ");
    }
}

/// A text box that, once armed, turns the next key combo pressed into shortcut text.
public sealed class KeyCaptureBox : TextBox
{
    public bool Armed;
    public event Action<string>? Captured;

    public KeyCaptureBox()
    {
        PreviewKeyDown += (_, e) =>
        {
            if (!Armed) return;
            // Same key codes as Windows Forms: build its Keys so KeyCombo.FromKeys reads it.
            var keys = (Keys)(int)e.Key;
            if (Down(VirtualKey.Control)) keys |= Keys.Control;
            if (Down(VirtualKey.Menu)) keys |= Keys.Alt;
            if (Down(VirtualKey.Shift)) keys |= Keys.Shift;
            if (KeyCombo.FromKeys(keys) is not { } s) return;
            e.Handled = true;
            Armed = false;
            Captured?.Invoke(s);
        };
        LostFocus += (_, _) => Armed = false;
    }

    static bool Down(VirtualKey k) => InputKeyboardSource.GetKeyStateForCurrentThread(k).HasFlag(CoreVirtualKeyStates.Down);
}
