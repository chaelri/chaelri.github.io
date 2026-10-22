namespace ClickFlow;

/// One step: number, type, name, Live / Show only, Pick and Test on the top row; the fields its
/// type uses below. Edits write straight into the Step and save shortly after.
public sealed class StepCard : FitCard
{
    public readonly Step Step;
    readonly MacroEditor editor;
    readonly int index;
    readonly Label warning = Theme.Label("", Theme.Small, Theme.Orange);
    Num? x, y, w, h;
    Label? outputText;
    PictureBox? outputImage;
    FlowLayoutPanel? outputRow;
    Composer? nestedComposer;

    public StepCard(MacroEditor editor, Step step, int index)
    {
        this.editor = editor;
        Step = step;
        this.index = index;
        Padding = new Padding(12, 8, 12, 8);
        Margin = new Padding(0, 0, 0, 6);
        if (step.ShowOnly && step.Type != StepType.Wait) { Fill = Theme.PurpleSoft; Edge = Color.FromArgb(214, 196, 250); }

        Add(TopRow());
        BuildFields();
        warning.Margin = new Padding(0, 2, 0, 0);
        Add(warning);
        UpdateWarning();
        ContextMenuStrip = Menu();
    }

    ContextMenuStrip Menu()
    {
        var m = new ContextMenuStrip();
        m.Items.Add("Duplicate", null, (_, _) => editor.Duplicate(Step));
        m.Items.Add("Move Up", null, (_, _) => editor.MoveStep(Step, -1)).Enabled = index > 0;
        m.Items.Add("Move Down", null, (_, _) => editor.MoveStep(Step, 1)).Enabled = index < editor.Macro.Steps.Count - 1;
        m.Items.Add(new ToolStripSeparator());
        m.Items.Add("Delete", null, (_, _) => editor.Remove(Step)).ForeColor = Theme.Red;
        return m;
    }

    Control TopRow()
    {
        var row = new Row { WrapContents = true };
        var badge = new Label
        {
            Text = (index + 1).ToString(), Font = Theme.Bold, ForeColor = Color.White, BackColor = Step.ShowOnly && Step.Type != StepType.Wait ? Theme.Purple : Theme.Accent,
            AutoSize = false, Size = new Size(LogicalToDeviceUnits(26), LogicalToDeviceUnits(22)), TextAlign = ContentAlignment.MiddleCenter, Margin = new Padding(0, 4, 6, 0),
        };
        var icon = new Label { Text = Step.Type.Glyph(), Font = Theme.Icon, ForeColor = Theme.Muted, AutoSize = true, Margin = new Padding(0, 6, 2, 0), BackColor = Color.Transparent };
        var type = Theme.Label(Step.Type.Label(), Theme.Bold);
        type.Margin = new Padding(0, 6, 8, 0);
        var name = new TextBox { Text = Step.Name, PlaceholderText = "Name (optional)", Width = LogicalToDeviceUnits(220), Margin = new Padding(0, 2, 8, 2) };
        name.TextChanged += (_, _) => { Step.Name = name.Text; editor.StepChanged(); };
        row.Controls.AddRange(new Control[] { badge, icon, type, name });

        var tip = new ToolTip();
        if (Step.Type != StepType.Wait)
        {
            var mode = Theme.Button(Step.ShowOnly ? "Show only" : "Live", Step.ShowOnly ? "" : "");
            mode.Tint = Step.ShowOnly ? Theme.Purple : Theme.Green;
            tip.SetToolTip(mode, "Live: the step runs. Show only: it is never executed, even in a real run; it only shows its marker.");
            mode.Click += (_, _) =>
            {
                Step.ShowOnly = !Step.ShowOnly;
                editor.StepChanged();
                editor.RebuildSteps();
            };
            row.Controls.Add(mode);
        }
        if (Step.Type.HasPoint() || Step.Type.HasArea())
        {
            var pick = Theme.Button("Pick", "");
            tip.SetToolTip(pick, Step.Type.HasArea() ? "Drag a box over the area, then press ✓" : "Drag the target onto the spot, then press ✓");
            pick.Click += (_, _) => Pick();
            row.Controls.Add(pick);
        }
        if (Step.Type != StepType.Wait)
        {
            var test = Theme.Button("Test", "");
            tip.SetToolTip(test, Step.ShowOnly ? "Shows this step's marker (it's Show only, so nothing is executed)" : "Runs just this step, for real, with no delay");
            test.Click += (_, _) => editor.Test(Step);
            row.Controls.Add(test);
        }
        var more = Theme.Button("", "");
        more.Click += (_, _) => ContextMenuStrip?.Show(more, new Point(0, more.Height));
        var del = Theme.Button("", "");
        del.Tint = Theme.Red;
        tip.SetToolTip(del, "Delete this step");
        del.Click += (_, _) => editor.Remove(Step);
        row.Controls.Add(more);
        row.Controls.Add(del);
        return row;
    }

    Num Field(Row row, string label, double value, double min, double max, int decimals, Action<double> set, string? unit = null, int width = 74)
    {
        row.Controls.Add(Theme.Label(label, null, Theme.Muted));
        var n = new Num((decimal)min, (decimal)max, decimals, (decimal)value, width);
        n.ValueChanged += (_, _) => { set((double)n.Value); editor.StepChanged(); UpdateWarning(); };
        row.Controls.Add(n);
        if (unit != null) { var u = Theme.Label(unit, null, Theme.Muted); u.Margin = new Padding(0, 6, 14, 0); row.Controls.Add(u); }
        return n;
    }

    Row DelayRow(Row? into = null)
    {
        var row = into ?? new Row();
        Field(row, "Delay before", Step.DelayBefore, 0, 86400, 1, v => Step.DelayBefore = v, "s");
        return row;
    }

    TextBox TextField(string value, Action<string> set, string placeholder, bool multiline = false)
    {
        var t = new TextBox
        {
            Text = multiline ? value.Replace("\r\n", "\n").Replace("\n", "\r\n") : value, PlaceholderText = placeholder, Multiline = multiline,
            AcceptsReturn = multiline, ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None, Height = multiline ? LogicalToDeviceUnits(64) : 0,
            Margin = new Padding(0, 4, 0, 4),
        };
        t.TextChanged += (_, _) => { set(t.Text.Replace("\r\n", "\n")); editor.StepChanged(); };
        Stretch(t);
        return t;
    }

    void BuildFields()
    {
        var s = Step;
        const double big = 100000;
        switch (s.Type)
        {
            case StepType.LeftClick or StepType.DoubleClick or StepType.RightClick or StepType.Move:
            {
                var row = new Row();
                x = Field(row, "X", s.X, -big, big, 0, v => s.X = v);
                y = Field(row, "Y", s.Y, -big, big, 0, v => s.Y = v, "px");
                DelayRow(row);
                Add(row);
                break;
            }
            case StepType.Wait:
            {
                var row = new Row();
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
                var row = new Row();
                var keys = new KeyCaptureBox { Text = s.Keys, PlaceholderText = "ctrl+s, alt+f4, enter, win+d", Width = LogicalToDeviceUnits(200), Margin = new Padding(0, 2, 8, 2) };
                var parsed = Theme.Label("", Theme.Small);
                void Show()
                {
                    var c = KeyCombo.Parse(keys.Text);
                    parsed.Text = keys.Text.Trim().Length == 0 ? "" : c is { } k ? k.Display : "Can't read this shortcut";
                    parsed.ForeColor = c == null ? Theme.Red : Theme.Muted;
                }
                keys.TextChanged += (_, _) => { s.Keys = keys.Text; editor.StepChanged(); Show(); };
                var rec = Theme.Button("Record keys", "");
                rec.Click += (_, _) => { keys.Armed = true; keys.Focus(); parsed.Text = "Press the shortcut…"; parsed.ForeColor = Theme.Accent; };
                keys.Captured += t => keys.Text = t;
                row.Controls.AddRange(new Control[] { keys, rec, parsed });
                Add(row);
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
                var servo = new CheckBox { Text = "Only if the servo turned the PC on", Checked = s.OnlyIfServo, AutoSize = true, Margin = new Padding(0, 4, 14, 0) };
                servo.CheckedChanged += (_, _) => { s.OnlyIfServo = servo.Checked; editor.StepChanged(); };
                Add(servo);
                Add(Hint("Checks /servo/lastRun in Firebase first. Shuts down only if this PC booted or woke within 10 min after the servo's last press (5:55 / 3:55 schedule, remote or shortcut); otherwise it stays on and the run carries on."));
                Add(DelayRow());
                break;
            }
        }
    }

    void BuildScreenshot()
    {
        var s = Step;
        var row = new Row();
        x = Field(row, "X", s.X, -100000, 100000, 0, v => s.X = v);
        y = Field(row, "Y", s.Y, -100000, 100000, 0, v => s.Y = v);
        w = Field(row, "W", s.Width, 1, 20000, 0, v => s.Width = v);
        h = Field(row, "H", s.Height, 1, 20000, 0, v => s.Height = v, "px");
        Add(row);

        var copy = new CheckBox { Text = "Copy the text it reads to the clipboard", Checked = s.CopyResult, AutoSize = true, Margin = new Padding(0, 4, 14, 0) };
        copy.CheckedChanged += (_, _) => { s.CopyResult = copy.Checked; editor.StepChanged(); };
        var discord = new CheckBox { Text = "Send to Discord", Checked = s.SendDiscord, AutoSize = true, Margin = new Padding(0, 4, 14, 0) };
        Add(new Row(copy, discord));

        var discordBox = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, BackColor = Color.Transparent, Margin = Padding.Empty };
        var withImage = new RadioButton { Text = "Screenshot + message", Checked = !s.TextOnly, AutoSize = true, Margin = new Padding(0, 2, 14, 0) };
        var textOnly = new RadioButton { Text = "Message only", Checked = s.TextOnly, AutoSize = true, Margin = new Padding(0, 2, 14, 0) };
        withImage.CheckedChanged += (_, _) => { s.TextOnly = !withImage.Checked; editor.StepChanged(); };
        discordBox.Controls.Add(new Row(withImage, textOnly));
        var c = new Composer(s.Text, MessageVars.ForScreenshot, () => StepOutputs.Text.GetValueOrDefault(s.Id, "text it reads"));
        c.Changed += t => { s.Text = t; editor.StepChanged(); };
        discordBox.Controls.Add(c);
        nestedComposer = c;
        if (Discord.WebhookUrl == null) discordBox.Controls.Add(Hint("No Discord webhook set yet: Settings › Discord.", Theme.Orange));
        discordBox.Visible = s.SendDiscord;
        discord.CheckedChanged += (_, _) => { s.SendDiscord = discord.Checked; discordBox.Visible = discord.Checked; editor.StepChanged(); };
        Stretch(discordBox);
        Add(DelayRow());

        outputRow = new Row();
        outputImage = new PictureBox { SizeMode = PictureBoxSizeMode.Zoom, Size = new Size(LogicalToDeviceUnits(120), LogicalToDeviceUnits(50)), Margin = new Padding(0, 4, 10, 0), BorderStyle = BorderStyle.FixedSingle };
        outputText = Theme.Label("", Theme.Mono, Theme.Text);
        outputRow.Controls.Add(outputImage);
        outputRow.Controls.Add(outputText);
        Add(outputRow);
        ShowOutput();
    }

    /// The last thing this Screenshot area step read (from a run or a Test).
    public void ShowOutput()
    {
        if (outputRow == null || outputText == null || outputImage == null) return;
        bool has = StepOutputs.Text.TryGetValue(Step.Id, out var text);
        StepOutputs.Images.TryGetValue(Step.Id, out var img);
        outputRow.Visible = has || img != null;
        outputImage.Image = img;
        outputImage.Visible = img != null;
        outputText.Text = "Last read: " + (string.IsNullOrEmpty(text) ? "(no text found)" : text.Replace("\n", " ⏎ "));
    }

    Label Hint(string text, Color? color = null)
    {
        var l = Theme.Label(text, Theme.Small, color ?? Theme.Muted);
        l.Margin = new Padding(0, 0, 0, 4);
        return l;
    }

    void UpdateWarning()
    {
        string t = "";
        if (Step.Type.HasPoint() && !Screens.OnScreen(Step.Point)) t = "This point is off every display (the display layout may have changed).";
        else if (Step.Type.HasArea() && !Screens.OnScreen(Step.Area)) t = "This area is off every display.";
        warning.Text = t;
        warning.Visible = t.Length > 0;
    }

    public void Pick()
    {
        if (Step.Type.HasArea())
        {
            editor.WithPlacer((ok, cancel) => Placer.PickArea(Step.Area, a =>
            {
                Step.X = a.X; Step.Y = a.Y; Step.Width = a.Width; Step.Height = a.Height;
                if (x != null) x.Value = Math.Clamp(a.X, x.Minimum, x.Maximum);
                if (y != null) y.Value = Math.Clamp(a.Y, y.Minimum, y.Maximum);
                if (w != null) w.Value = Math.Clamp(a.Width, w.Minimum, w.Maximum);
                if (h != null) h.Value = Math.Clamp(a.Height, h.Minimum, h.Maximum);
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
                if (x != null) x.Value = Math.Clamp(p.X, x.Minimum, x.Maximum);
                if (y != null) y.Value = Math.Clamp(p.Y, y.Minimum, y.Maximum);
                editor.StepChanged();
                ok();
            }, cancel));
        }
    }

    public override void FitWidth(int width)
    {
        base.FitWidth(width);
        nestedComposer?.FitWidth(width - Padding.Horizontal);
        if (outputText != null) outputText.MaximumSize = new Size(width - Padding.Horizontal - LogicalToDeviceUnits(140), 0);
    }
}
