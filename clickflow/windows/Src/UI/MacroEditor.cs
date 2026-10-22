using System.Globalization;

namespace ClickFlow;

/// The editor for one macro: name and repeat, the step cards, and its schedules.
public sealed class MacroEditor : Panel
{
    public const string DefaultPostUrl = "https://clickflow-hook-668755364170.asia-southeast1.run.app";

    readonly Macro macro;
    readonly MainForm main;
    readonly Store store = Store.Shared;
    readonly FlowLayoutPanel stack = new();
    readonly Label stats = Theme.Label("", Theme.Small, Theme.Muted);
    readonly List<StepCard> cards = new();
    readonly FlowLayoutPanel stepsBox = new(), schedulesBox = new();

    public Macro Macro => macro;

    public MacroEditor(Macro macro, MainForm main)
    {
        this.macro = macro;
        this.main = main;
        AutoScroll = true;
        BackColor = Theme.Window;
        Padding = new Padding(20, 14, 20, 30);

        stack.FlowDirection = FlowDirection.TopDown;
        stack.WrapContents = false;
        stack.AutoSize = true;
        stack.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        stack.BackColor = Color.Transparent;
        stack.Location = new Point(Padding.Left, Padding.Top);
        Controls.Add(stack);

        stack.Controls.Add(BuildHeader());
        stack.Controls.Add(SectionHeader("Steps", AddStepButton()));
        foreach (var box in new[] { stepsBox, schedulesBox })
        {
            box.FlowDirection = FlowDirection.TopDown;
            box.WrapContents = false;
            box.AutoSize = true;
            box.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            box.Margin = Padding.Empty;
            box.BackColor = Color.Transparent;
        }
        stack.Controls.Add(stepsBox);
        var addSchedule = Theme.Button("Add schedule", "");
        addSchedule.Click += (_, _) => EditSchedule(null);
        stack.Controls.Add(SectionHeader("Schedules", addSchedule));
        stack.Controls.Add(schedulesBox);

        RebuildSteps();
        RebuildSchedules();
        UpdateStats();
        StepOutputs.Changed += OnOutput;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) StepOutputs.Changed -= OnOutput;
        base.Dispose(disposing);
    }

    void OnOutput(Guid stepId)
    {
        foreach (var c in cards) if (c.Step.Id == stepId) c.ShowOutput();
    }

    int ContentWidth => Math.Max(LogicalToDeviceUnits(520), ClientSize.Width - Padding.Horizontal - SystemInformation.VerticalScrollBarWidth / 2);

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Relayout();
    }

    void Relayout()
    {
        SuspendLayout();
        int w = ContentWidth;
        foreach (Control c in stack.Controls) Fit(c, w);
        foreach (Control c in stepsBox.Controls) Fit(c, w);
        foreach (Control c in schedulesBox.Controls) Fit(c, w);
        ResumeLayout();
    }

    static void Fit(Control c, int w)
    {
        if (c is FlowLayoutPanel f && (f.FlowDirection == FlowDirection.TopDown)) return;   // the boxes size from their children
        if (c is IFits fits) fits.FitWidth(w);
        else c.Width = w;
    }

    // ---------- header ----------

    Control BuildHeader()
    {
        var card = new FitCard();
        var name = new TextBox
        {
            Text = macro.Name, Font = Theme.H1, BorderStyle = BorderStyle.None, BackColor = Theme.Card,
            Margin = new Padding(0, 4, 0, 4), PlaceholderText = "Macro name",
        };
        name.TextChanged += (_, _) =>
        {
            var t = name.Text.Trim();
            if (t.Length == 0) return;
            macro.Name = t;
            store.Touch();
            main.RefreshEditorHeader();
        };
        name.Leave += (_, _) => { if (name.Text.Trim().Length == 0) name.Text = macro.Name; store.Changed(); };
        card.Stretch(name);
        card.Add(stats);

        var repeat = new Num(0, 100000, 0, macro.RepeatCount, 80);
        repeat.ValueChanged += (_, _) => { macro.RepeatCount = (int)repeat.Value; store.Touch(); UpdateStats(); };
        var delay = new Num(0, 86400, 1, (decimal)macro.RepeatDelay, 80);
        delay.ValueChanged += (_, _) => { macro.RepeatDelay = (double)delay.Value; store.Touch(); UpdateStats(); };
        card.Add(new Row(
            Theme.Label("Repeat"), repeat, Theme.Label("times (0 = until stopped)", null, Theme.Muted),
            new Label { Width = 18 }, Theme.Label("Pause between repeats"), delay, Theme.Label("s", null, Theme.Muted)));
        card.Margin = new Padding(0, 0, 0, 14);
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

    Control SectionHeader(string title, Control action)
    {
        var row = new FitRow();
        var label = Theme.Label(title, Theme.H2);
        label.Margin = new Padding(2, 4, 12, 0);
        row.Controls.Add(label);
        row.Controls.Add(action);
        row.Margin = new Padding(0, 6, 0, 6);
        return row;
    }

    FlatButton AddStepButton()
    {
        var b = Theme.Button("Add step", "", primary: true);
        var menu = new ContextMenuStrip();
        foreach (var t in StepTypes.All)
        {
            var type = t;
            menu.Items.Add(t.Label(), null, (_, _) => AddStep(type));
            if (t is StepType.Move or StepType.KeyShortcut) menu.Items.Add(new ToolStripSeparator());
        }
        b.Click += (_, _) => menu.Show(b, new Point(0, b.Height));
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
        ScrollControlIntoView(card);
        // Adding a click or screenshot step opens the placer straight away.
        if (type.HasPoint() || type.HasArea()) card.Pick();
    }

    public void RebuildSteps()
    {
        SuspendLayout();
        stepsBox.SuspendLayout();
        foreach (var c in cards) c.Dispose();
        stepsBox.Controls.Clear();
        cards.Clear();
        for (int i = 0; i < macro.Steps.Count; i++)
        {
            var card = new StepCard(this, macro.Steps[i], i);
            cards.Add(card);
            card.FitWidth(ContentWidth);
            stepsBox.Controls.Add(card);
        }
        if (macro.Steps.Count == 0)
        {
            var empty = Theme.Label("No steps yet. Add one, or press Record in the toolbar to capture your clicks.", null, Theme.Muted);
            empty.Margin = new Padding(4, 4, 0, 12);
            stepsBox.Controls.Add(empty);
        }
        stepsBox.ResumeLayout();
        ResumeLayout();
    }

    public void ScrollToStep(int i)
    {
        if (i >= 0 && i < cards.Count) { AutoScrollPosition = new Point(0, cards[i].Top + stepsBox.Top); }
    }

    public void ScrollToEnd() => AutoScrollPosition = new Point(0, stack.Height);

    public void StepChanged() { store.Touch(); UpdateStats(); }

    public void MoveStep(Step s, int delta)
    {
        int i = macro.Steps.IndexOf(s), j = i + delta;
        if (i < 0 || j < 0 || j >= macro.Steps.Count) return;
        macro.Steps.RemoveAt(i);
        macro.Steps.Insert(j, s);
        store.Changed();
        RebuildSteps();
        ScrollControlIntoView(cards[j]);
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
        macro.Steps.Remove(s);
        store.Changed();
        RebuildSteps();
        UpdateStats();
    }

    public void Test(Step s)
    {
        int i = macro.Steps.IndexOf(s);
        if (i >= 0) Runner.Shared.Test(i, macro.Id);
    }

    /// Hides the window while the placer is up (it usually targets an app behind it).
    public void WithPlacer(Action<Action, Action> open)
    {
        var form = FindForm();
        bool hid = form is { Visible: true, WindowState: not FormWindowState.Minimized };
        if (hid) form!.WindowState = FormWindowState.Minimized;
        void Restore()
        {
            if (hid && form != null) { form.WindowState = FormWindowState.Normal; form.Activate(); }
        }
        open(Restore, Restore);
    }

    // ---------- schedules ----------

    /// The sidebar switch changed this macro's schedules.
    public void RefreshSchedules() => RebuildSchedules();

    void RebuildSchedules()
    {
        schedulesBox.SuspendLayout();
        foreach (Control c in schedulesBox.Controls.Cast<Control>().ToList()) c.Dispose();
        schedulesBox.Controls.Clear();
        foreach (var s in macro.Schedules)
        {
            var row = new ScheduleRow(macro, s, main.RefreshEditorHeader, () => EditSchedule(s), () =>
            {
                macro.Schedules.Remove(s);
                store.Changed();
                RebuildSchedules();
            });
            row.FitWidth(ContentWidth);
            schedulesBox.Controls.Add(row);
        }
        if (macro.Schedules.Count == 0)
        {
            var empty = Theme.Label("Not scheduled. Add a schedule to run it by itself (ClickFlow must be open, it lives in the tray).", null, Theme.Muted);
            empty.Margin = new Padding(4, 4, 0, 12);
            schedulesBox.Controls.Add(empty);
        }
        schedulesBox.ResumeLayout();
    }

    void EditSchedule(Schedule? existing)
    {
        var copy = existing?.Clone(newId: false) ?? new Schedule
        {
            Time = Clock.String(DateTime.Now.AddMinutes(5)),
            Date = DayString.String(DateTime.Today),
        };
        using var d = new ScheduleDialog(copy, existing == null);
        if (d.ShowDialog(FindForm()) != DialogResult.OK) return;
        if (existing == null) macro.Schedules.Add(copy);
        else macro.Schedules[macro.Schedules.IndexOf(existing)] = copy;
        store.Changed();
        RebuildSchedules();
        main.RefreshEditorHeader();
    }
}

public interface IFits { void FitWidth(int width); }

/// A card with a vertical stack inside; FitWidth sets its width, height follows the content.
public class FitCard : CardPanel, IFits
{
    protected readonly FlowLayoutPanel Inner = new();
    readonly List<Control> stretched = new();

    public FitCard()
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Margin = new Padding(0, 0, 0, 8);
        Inner.FlowDirection = FlowDirection.TopDown;
        Inner.WrapContents = false;
        Inner.AutoSize = true;
        Inner.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Inner.BackColor = Color.Transparent;
        Inner.Margin = Padding.Empty;
        Inner.Location = new Point(Padding.Left, Padding.Top);
        Controls.Add(Inner);
    }

    public void Add(Control c) => Inner.Controls.Add(c);
    public void Stretch(Control c) { stretched.Add(c); Inner.Controls.Add(c); }
    protected int InnerWidth => Width - Padding.Horizontal;

    public virtual void FitWidth(int width)
    {
        int inner = width - Padding.Horizontal;
        MinimumSize = new Size(width, 0);
        MaximumSize = new Size(width, 0);
        Inner.MaximumSize = new Size(inner, 0);
        Inner.MinimumSize = new Size(inner, 0);
        foreach (Control c in Inner.Controls)
        {
            if (stretched.Contains(c)) c.Width = inner - c.Margin.Horizontal;
            else if (c is FlowLayoutPanel f) f.MaximumSize = new Size(inner, 0);
            else if (c is Label l && l.AutoSize) l.MaximumSize = new Size(inner, 0);
            if (c is IFits fits) fits.FitWidth(inner - c.Margin.Horizontal);
        }
    }
}

public sealed class FitRow : FlowLayoutPanel, IFits
{
    public FitRow()
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        WrapContents = true;
        BackColor = Color.Transparent;
    }

    public void FitWidth(int width) { MaximumSize = new Size(width, 0); MinimumSize = new Size(width, 0); }
}

/// One schedule: switch, summary, next run, Edit, Delete.
sealed class ScheduleRow : FitCard
{
    readonly Macro macro;
    readonly Schedule schedule;
    readonly Label summary = Theme.Label("", Theme.Bold);
    readonly Label detail = Theme.Label("", Theme.Small, Theme.Muted);
    readonly CheckBox on = new() { AutoSize = true, Text = "On", Margin = new Padding(0, 4, 12, 0) };

    public ScheduleRow(Macro macro, Schedule schedule, Action changed, Action edit, Action delete)
    {
        this.macro = macro;
        this.schedule = schedule;
        on.Checked = schedule.Enabled && macro.Enabled;
        on.CheckedChanged += (_, _) =>
        {
            schedule.Enabled = on.Checked;
            // Switching a schedule on turns the macro on too, so the sidebar switch follows.
            if (on.Checked) macro.Enabled = true;
            Store.Shared.Changed();
            Refresh_();
            changed();
        };
        var editB = Theme.Button("Edit", "");
        editB.Click += (_, _) => edit();
        var delB = Theme.Button("", "");
        delB.Tint = Theme.Red;
        delB.Click += (_, _) => delete();
        var row = new Row(on, summary) { WrapContents = false };
        Add(row);
        Add(detail);
        Add(new Row(editB, delB) { Margin = new Padding(0, 4, 0, 0) });
        Refresh_();
    }

    void Refresh_()
    {
        summary.Text = schedule.Summary;
        summary.ForeColor = schedule.Enabled && macro.Enabled ? Theme.Text : Theme.Faint;
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
public sealed class Composer : FlowLayoutPanel, IFits
{
    readonly TextBox box = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, Font = Theme.Body, AcceptsReturn = true, Height = 72 };
    readonly Label preview = Theme.Label("", Theme.Small, Theme.Muted);
    readonly Func<string> sampleText;
    public event Action<string>? Changed;

    public Composer(string text, (string Token, string Help)[] vars, Func<string> sampleText)
    {
        this.sampleText = sampleText;
        FlowDirection = FlowDirection.TopDown;
        WrapContents = false;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Color.Transparent;
        Margin = new Padding(0, 4, 0, 4);

        var tools = new Row();
        var tip = new ToolTip();
        void Fmt(string label, string help, string pre, string post, string placeholder)
        {
            var b = Theme.Button(label);
            b.Font = Theme.Bold;
            b.AutoSizeNow();
            tip.SetToolTip(b, help);
            b.Click += (_, _) => Wrap(pre, post, placeholder);
            tools.Controls.Add(b);
        }
        Fmt("B", "Bold", "**", "**", "bold");
        Fmt("I", "Italic", "*", "*", "italic");
        Fmt("U", "Underline", "__", "__", "underlined");
        Fmt("S", "Strikethrough", "~~", "~~", "struck");
        Fmt("</>", "Inline code", "`", "`", "code");
        Fmt("{ }", "Code block", "```\n", "\n```", "code");
        Fmt("||", "Spoiler", "||", "||", "spoiler");
        Fmt(">", "Quote", "> ", "", "quote");
        tools.Controls.Add(new Label { Width = 10, Height = 4 });
        foreach (var (token, help) in vars)
        {
            var b = Theme.Button(token);
            b.Tint = Theme.Accent;
            tip.SetToolTip(b, help);
            b.Click += (_, _) => Insert(token);
            tools.Controls.Add(b);
        }
        Controls.Add(tools);
        box.Text = text.Replace("\r\n", "\n").Replace("\n", "\r\n");
        box.TextChanged += (_, _) => { Changed?.Invoke(box.Text.Replace("\r\n", "\n")); UpdatePreview(); };
        Controls.Add(box);
        preview.Margin = new Padding(0, 2, 0, 4);
        Controls.Add(preview);
        UpdatePreview();
    }

    public void FitWidth(int width)
    {
        MaximumSize = new Size(width, 0);
        foreach (Control c in Controls)
        {
            if (c is FlowLayoutPanel f) f.MaximumSize = new Size(width, 0);
            else if (c == box) box.Width = width - box.Margin.Horizontal;
            else if (c is Label l) l.MaximumSize = new Size(width, 0);
        }
    }

    void Wrap(string pre, string post, string placeholder)
    {
        int start = box.SelectionStart, len = box.SelectionLength;
        var sel = len > 0 ? box.SelectedText : placeholder;
        box.SelectedText = pre.Replace("\n", "\r\n") + sel + post.Replace("\n", "\r\n");
        box.Select(start + pre.Replace("\n", "\r\n").Length, sel.Length);
        box.Focus();
    }

    void Insert(string token)
    {
        box.SelectedText = token;
        box.Focus();
    }

    void UpdatePreview()
    {
        var text = box.Text.Replace("\r\n", "\n");
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

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (Armed && KeyCombo.FromKeys(keyData) is { } s)
        {
            Armed = false;
            Captured?.Invoke(s);
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    protected override void OnLeave(EventArgs e) { Armed = false; base.OnLeave(e); }
}
