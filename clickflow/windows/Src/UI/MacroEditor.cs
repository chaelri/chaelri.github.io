namespace ClickFlow;

using System.Numerics;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;
using Windows.UI.Core;

/// The editor for one macro: name and repeat, the step cards, and its schedules.
public sealed class MacroEditor : UserControl, IDisposable
{
    public const string DefaultPostUrl = "https://clickflow-hook-668755364170.asia-southeast1.run.app";

    readonly Macro macro;
    readonly MainWindow main;
    readonly Store store = Store.Shared;
    readonly StackPanel stack = new() { Padding = new Thickness(24, 16, 24, 32), Spacing = 0 };
    readonly ScrollViewer scroll = new() { VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    readonly TextBlock stats = Theme.Small("");
    readonly List<StepCard> cards = new();
    readonly StackPanel stepsBox = new() { Spacing = 6 }, schedulesBox = new() { Spacing = 6 };

    public Macro Macro => macro;
    public MainWindow Main => main;

    public MacroEditor(Macro macro, MainWindow main)
    {
        this.macro = macro;
        this.main = main;
        scroll.Content = stack;
        Content = scroll;

        stack.Children.Add(BuildHeader());
        stack.Children.Add(SectionHeader("Steps", "", Theme.Accent, AddStepButton()));
        stack.Children.Add(stepsBox);
        var addSchedule = Theme.Button("Add schedule", "");
        addSchedule.Click += (_, _) => EditSchedule(null);
        stack.Children.Add(SectionHeader("Schedules", "", Theme.Purple, addSchedule));
        stack.Children.Add(schedulesBox);

        RebuildSteps();
        RebuildSchedules();
        UpdateStats();
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

    // ---------- header ----------

    UIElement BuildHeader()
    {
        var inner = new StackPanel { Spacing = 6 };
        var name = new TextBox { Text = macro.Name, FontSize = 20, PlaceholderText = "Macro name" };
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
        inner.Children.Insert(0, new Border { Height = 3, Margin = new Thickness(-14, -10, -14, 6), CornerRadius = new CornerRadius(12, 12, 0, 0), Background = Theme.BrandGradient() });
        card = Theme.Card(inner);
        card.BackgroundTransition = new BrushTransition { Duration = TimeSpan.FromMilliseconds(220) };
        resting = card.BorderBrush;
        card.Margin = new Thickness(0, 0, 0, 14);
        return card;
    }

    public void UpdateStats()
    {
        var n = macro.Steps.Count;
        var single = Fmt.Seconds(macro.SingleRunDuration);
        var total = macro.TotalDuration is { } t ? $"{Fmt.Seconds(t)} in all" : "repeats until stopped";
        stats.Text = $"{n} step{(n == 1 ? "" : "s")} · {single} per run · {total}";
        main.RefreshEditorHeader();
    }

    static UIElement SectionHeader(string title, string glyph, Windows.UI.Color color, UIElement action)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Margin = new Thickness(2, 8, 0, 10) };
        var tile = new Border
        {
            Width = 30, Height = 30, CornerRadius = new CornerRadius(8), Background = Theme.Tint(color, Theme.Dark ? (byte)0x38 : (byte)0x22),
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

    void AddStep(StepType type)
    {
        var p = Native.CursorPos();
        var s = new Step(type) { X = p.X, Y = p.Y };
        if (type == StepType.PostClipboard) s.Url = DefaultPostUrl;
        if (type == StepType.ReadText) { s.Width = 300; s.Height = 120; s.X = p.X - 150; s.Y = p.Y - 60; }
        if (type == StepType.DiscordMessage) s.Text = "{macro} finished at {time}";
        if (type == StepType.Shutdown) s.Text = "PC Shutdown at {time}";
        macro.Steps.Add(s);
        store.Changed();
        RebuildSteps();
        UpdateStats();
        var card = cards.Last();
        Anim.Enter(card, slide: false, ms: 360);
        BringIntoView(card);
        // Adding a click or screenshot step opens the placer straight away.
        if (type.HasPoint() || type.HasArea()) card.Pick();
    }

    public void RebuildSteps()
    {
        stepsBox.Children.Clear();
        cards.Clear();
        for (int i = 0; i < macro.Steps.Count; i++)
        {
            var card = new StepCard(this, macro.Steps[i], i);
            cards.Add(card);
            stepsBox.Children.Add(card);
        }
        if (macro.Steps.Count == 0)
        {
            var empty = Theme.Label("No steps yet. Add one, or press Record in the toolbar to capture your clicks.", color: Theme.Muted);
            empty.Margin = new Thickness(4, 0, 0, 12);
            stepsBox.Children.Add(empty);
        }
    }

    void BringIntoView(UIElement e, double ratio = 0.3)
    {
        // After layout, so a card added just now has a position.
        AfterLayout(() => e.StartBringIntoView(new BringIntoViewOptions { VerticalAlignmentRatio = ratio, AnimationDesired = true }));
    }

    public void ScrollToStep(int i)
    {
        if (i >= 0 && i < cards.Count) BringIntoView(cards[i], 0);
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
        BringIntoView(cards[j]);
    }

    /// Moves step i to j, moving its existing card instead of rebuilding them all.
    void Reorder(int from, int to)
    {
        var card = cards[from];
        macro.Steps.RemoveAt(from);
        macro.Steps.Insert(to, card.Step);
        cards.RemoveAt(from);
        cards.Insert(to, card);
        stepsBox.Children.Move((uint)from, (uint)to);
        for (int k = Math.Min(from, to); k <= Math.Max(from, to); k++) cards[k].Renumber(k);
        store.Changed();
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
        store.Changed();
        RebuildSteps();
        UpdateStats();
    }

    public void Remove(Step s)
    {
        if (dragging != null || settling || cards.FirstOrDefault(c => c.Step == s) is not { } card) return;
        // Fade the card out, then take just that one out (the rest are renumbered, not rebuilt).
        settling = true;
        Anim.Leave(card, () =>
        {
            settling = false;
            int i = cards.IndexOf(card);
            macro.Steps.Remove(s);
            store.Changed();
            if (i < 0 || macro.Steps.Count == 0) { RebuildSteps(); UpdateStats(); return; }
            cards.RemoveAt(i);
            stepsBox.Children.Remove(card);
            for (int k = i; k < cards.Count; k++) cards[k].Renumber(k);
            UpdateStats();
        });
    }

    /// Switching to this macro: the cards cascade in.
    public void Cascade()
    {
        for (int i = 0; i < cards.Count; i++) Anim.Enter(cards[i], 30 + Math.Min(i, 10) * 28, slide: false);
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
