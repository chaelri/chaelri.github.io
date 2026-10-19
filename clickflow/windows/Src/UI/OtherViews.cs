using System.Diagnostics;

namespace ClickFlow;

/// Manual, scheduled and skipped runs, newest first.
public sealed class HistoryView : Panel
{
    readonly ListView list = new()
    {
        View = View.Details, FullRowSelect = true, Dock = DockStyle.Fill, BorderStyle = BorderStyle.None, Font = Theme.Body,
        HeaderStyle = ColumnHeaderStyle.Nonclickable,
    };
    readonly Label count = Theme.Label("", null, Theme.Muted);

    public HistoryView()
    {
        BackColor = Theme.Window;
        Padding = new Padding(20, 12, 20, 20);
        list.Columns.Add("When", 170);
        list.Columns.Add("Macro", 190);
        list.Columns.Add("Trigger", 90);
        list.Columns.Add("Result", 90);
        list.Columns.Add("Took", 70);
        list.Columns.Add("Details", 600);
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = LogicalToDeviceUnits(40), BackColor = Color.Transparent };
        var clear = Theme.Button("Clear History", "");
        clear.Click += (_, _) =>
        {
            if (Alerts.Confirm(FindForm(), "Clear run history?", "Every entry is removed.", "Clear")) Store.Shared.ClearHistory();
        };
        top.Controls.Add(count);
        top.Controls.Add(clear);
        var wrap = new CardPanel { Dock = DockStyle.Fill, Padding = new Padding(2, 8, 2, 8) };
        wrap.Controls.Add(list);
        Controls.Add(wrap);
        Controls.Add(top);
        Store.Shared.HistoryChanged += Reload;
        Reload();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) Store.Shared.HistoryChanged -= Reload;
        base.Dispose(disposing);
    }

    void Reload()
    {
        var h = Store.Shared.History;
        count.Text = $"{h.Count} run{(h.Count == 1 ? "" : "s")}";
        list.BeginUpdate();
        list.Items.Clear();
        foreach (var r in Enumerable.Reverse(h).Take(1000))
        {
            var took = r.End is { } e ? Fmt.Seconds((e - r.Start).TotalSeconds) : "";
            var item = new ListViewItem(new[] { Fmt.Stamp(r.Start), r.MacroName, r.Trigger.Label(), r.Result.ToString(), took, r.Reason ?? "" });
            item.ForeColor = r.Result switch
            {
                RunResult.Failed => Theme.Red, RunResult.Stopped => Theme.Orange, RunResult.Skipped => Theme.Muted, _ => Theme.Text,
            };
            item.ToolTipText = r.Reason;
            list.Items.Add(item);
        }
        list.ShowItemToolTips = true;
        list.EndUpdate();
        if (h.Count == 0) count.Text = "No runs yet. Manual, scheduled and skipped runs all show up here.";
    }
}

public sealed class SettingsView : Panel
{
    readonly Store store = Store.Shared;
    readonly FlowLayoutPanel stack = new();
    readonly MainForm main;

    public SettingsView(MainForm main)
    {
        this.main = main;
        AutoScroll = true;
        BackColor = Theme.Window;
        Padding = new Padding(20, 14, 20, 30);
        stack.FlowDirection = FlowDirection.TopDown;
        stack.WrapContents = false;
        stack.AutoSize = true;
        stack.BackColor = Color.Transparent;
        stack.Location = new Point(Padding.Left, Padding.Top);
        Controls.Add(stack);

        stack.Controls.Add(Running());
        stack.Controls.Add(Discord_());
        stack.Controls.Add(Accuracy());
        stack.Controls.Add(Data());
        Resize += (_, _) => Fit();
        Fit();
    }

    void Fit()
    {
        int w = Math.Max(LogicalToDeviceUnits(520), Math.Min(LogicalToDeviceUnits(900), ClientSize.Width - Padding.Horizontal - 20));
        foreach (Control c in stack.Controls) if (c is IFits f) f.FitWidth(w);
    }

    static FitCard Card(string title)
    {
        var c = new FitCard { Margin = new Padding(0, 0, 0, 12) };
        var h = Theme.Label(title, Theme.H2);
        h.Margin = new Padding(0, 2, 0, 6);
        c.Add(h);
        return c;
    }

    static CheckBox Check(string text, bool value, Action<bool> set)
    {
        var cb = new CheckBox { Text = text, Checked = value, AutoSize = true, UseMnemonic = false, Margin = new Padding(0, 4, 0, 2) };
        cb.CheckedChanged += (_, _) => set(cb.Checked);
        return cb;
    }

    static Label Note(string text)
    {
        var l = Theme.Label(text, Theme.Small, Theme.Muted);
        l.Margin = new Padding(20, 0, 0, 6);
        return l;
    }

    Control Running()
    {
        var p = store.Prefs;
        var c = Card("Running");
        c.Add(Check("Pause all schedules", p.PausedAll, v => { p.PausedAll = v; store.SavePrefs(); store.Changed(); }));
        string? loginError = null;
        c.Add(Check("Start ClickFlow when I sign in to Windows (in the tray)", LoginItem.Enabled, v =>
        {
            try { LoginItem.Enabled = v; } catch (Exception e) { loginError = e.Message; Alerts.Show(FindForm(), "Couldn't change the login item", loginError); }
        }));
        c.Add(Note("Schedules only fire while ClickFlow is running. Closing the window keeps it in the tray; quit from the tray icon."));
        c.Add(Check("Hide this window while a macro runs", p.HideWindowDuringRuns, v => { p.HideWindowDuringRuns = v; store.SavePrefs(); }));
        c.Add(Check("Show a ring where each click lands", p.ShowClickRing, v => { p.ShowClickRing = v; store.SavePrefs(); }));
        c.Add(Check("Lock mouse & keyboard while a macro runs", p.LockInputDuringRuns, v => { p.LockInputDuringRuns = v; store.SavePrefs(); }));
        c.Add(Note("Your touches are ignored so nothing interrupts the macro. Esc, Ctrl+Alt+. or Alt+F4 stops it and unlocks; Ctrl+Alt+Del always works. Preview and step tests never lock."));
        var stop = Theme.Label("Emergency stop: Ctrl+Alt+. from any app, or Esc during a run.", Theme.Bold);
        stop.Margin = new Padding(0, 6, 0, 2);
        c.Add(stop);
        c.Add(Note("ClickFlow runs unelevated, so it can't click into apps running as administrator. Start ClickFlow as administrator if a macro has to."));
        return c;
    }

    Control Discord_()
    {
        var c = Card("Discord");
        c.Add(Theme.Label("Webhook used by Send to Discord and Screenshot area steps. Kept in a separate file on this PC, never in macros.json or exports.", Theme.Small, Theme.Muted));
        var box = new TextBox { Width = LogicalToDeviceUnits(460), PlaceholderText = "https://discord.com/api/webhooks/…", UseSystemPasswordChar = true, Margin = new Padding(0, 6, 8, 4) };
        var status = Theme.Label("", Theme.Small);
        void ShowStatus()
        {
            var has = Discord.WebhookUrl != null;
            status.Text = has ? "A webhook is set." : "No webhook set.";
            status.ForeColor = has ? Theme.Green : Theme.Orange;
        }
        var save = Theme.Button("Save", "", primary: true);
        save.Click += (_, _) =>
        {
            var v = box.Text.Trim();
            if (!Discord.IsValidWebhook(v)) { Alerts.Show(FindForm(), "That isn't a Discord webhook", "It should look like https://discord.com/api/webhooks/<id>/<token>."); return; }
            Discord.WebhookUrl = v;
            box.Text = "";
            ShowStatus();
        };
        var test = Theme.Button("Send test", "");
        test.Click += async (_, _) =>
        {
            if (Discord.WebhookUrl == null) { ShowStatus(); return; }
            test.Enabled = false;
            try
            {
                await Discord.SendText($"ClickFlow test from {Environment.MachineName} ✅ {Fmt.Time(DateTime.Now)}", CancellationToken.None);
                status.Text = "Test sent."; status.ForeColor = Theme.Green;
            }
            catch (Exception e) { status.Text = e.Message; status.ForeColor = Theme.Red; }
            finally { test.Enabled = true; }
        };
        var remove = Theme.Button("Remove", "");
        remove.Tint = Theme.Red;
        remove.Click += (_, _) => { Discord.WebhookUrl = null; ShowStatus(); };
        c.Add(new Row(box, save));
        c.Add(new Row(test, remove, status));
        ShowStatus();
        return c;
    }

    Control Accuracy()
    {
        var c = Card("Click accuracy test");
        c.Add(Theme.Label("Puts a target on every display, clicks it, and reports where the click landed. It only clicks ClickFlow's own targets.", Theme.Small, Theme.Muted));
        var result = Theme.Label("", Theme.Mono);
        var run = Theme.Button("Run test", "");
        run.Click += async (_, _) =>
        {
            run.Enabled = false;
            result.Text = "Testing…";
            result.Text = await AccuracyTest.Run();
            run.Enabled = true;
        };
        c.Add(run);
        c.Add(result);
        c.Add(Theme.Label("Displays", Theme.Bold));
        foreach (var s in Screen.AllScreens)
        {
            var b = s.Bounds;
            c.Add(Theme.Label($"{(s.Primary ? "Primary" : "Display")}: {b.Width} × {b.Height} at {b.X}, {b.Y} (pixels)", Theme.Small, Theme.Muted));
        }
        return c;
    }

    Control Data()
    {
        var c = Card("Data");
        c.Add(Theme.Label($"{store.Macros.Count} macros · {store.History.Count} runs in history", Theme.Small, Theme.Muted));
        var open = Theme.Button("Open data folder", "");
        open.Click += (_, _) => Process.Start(new ProcessStartInfo("explorer.exe", $"\"{Store.Directory}\"") { UseShellExecute = false })?.Dispose();
        var export = Theme.Button("Export all macros…", "");
        export.Click += (_, _) => store.Export(FindForm(), store.Macros);
        var import = Theme.Button("Import macros…", "");
        import.Click += (_, _) => store.Import(FindForm());
        c.Add(new Row(open, export, import));
        c.Add(Theme.Label(Store.Directory, Theme.Small, Theme.Faint));
        c.Add(Theme.Label("Macros from the Mac app import as-is. Its coordinates are Mac points, so re-pick each click and area on this PC, and check key shortcuts (cmd becomes Ctrl).", Theme.Small, Theme.Muted));
        return c;
    }
}

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
