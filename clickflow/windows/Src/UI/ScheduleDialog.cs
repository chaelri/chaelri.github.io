using System.Globalization;

namespace ClickFlow;

/// Add / edit one schedule. Edits a copy; the caller stores it on OK.
public sealed class ScheduleDialog : Form
{
    readonly Schedule s;
    readonly CheckBox enabled = new() { Text = "Enabled", AutoSize = true };
    readonly ComboBox kind = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 180 };
    readonly DateTimePicker time = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "h:mm tt", ShowUpDown = true, Width = 110 };
    readonly DateTimePicker endTime = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "h:mm tt", ShowUpDown = true, Width = 110 };
    readonly DateTimePicker onceDate = new() { Format = DateTimePickerFormat.Long, Width = 240 };
    readonly NumericUpDown every = new() { Minimum = 1, Maximum = 1440, Width = 70 };
    readonly CheckBox[] days = new CheckBox[7];
    readonly RadioButton skip = new() { Text = "Skip it (it's logged in Run History)", AutoSize = true };
    readonly RadioButton runOnce = new() { Text = "Run it once, as soon as ClickFlow notices", AutoSize = true };
    readonly CheckBox useStart = new() { Text = "Starting", AutoSize = true }, useEnd = new() { Text = "Ending", AutoSize = true };
    readonly DateTimePicker startDate = new() { Format = DateTimePickerFormat.Short, Width = 120 }, endDate = new() { Format = DateTimePickerFormat.Short, Width = 120 };
    readonly TextBox requireApp = new() { Width = 200, PlaceholderText = "e.g. chrome" };
    readonly CheckBox frontmost = new() { Text = "and it must be the app in front", AutoSize = true };
    readonly NumericUpDown idle = new() { Minimum = 0, Maximum = 86400, Width = 80 };
    readonly Label summary = new() { AutoSize = true, Font = Theme.Bold };
    readonly Label next = new() { AutoSize = true, ForeColor = Theme.Accent };
    readonly FlowLayoutPanel daysRow = new() { AutoSize = true, WrapContents = false }, timeRow = new() { AutoSize = true, WrapContents = false },
        dateRow = new() { AutoSize = true, WrapContents = false }, intervalRow = new() { AutoSize = true, WrapContents = false };
    bool loading = true;

    public ScheduleDialog(Schedule schedule, bool isNew)
    {
        s = schedule;
        Text = isNew ? "Add Schedule" : "Edit Schedule";
        Font = Theme.Body;
        AutoScaleMode = AutoScaleMode.Dpi;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(16);
        BackColor = Theme.Card;

        var stack = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, Dock = DockStyle.Fill };
        Controls.Add(stack);

        foreach (var k in RepeatKinds.All) kind.Items.Add(k.Label());
        stack.Controls.Add(summary);
        stack.Controls.Add(next);
        stack.Controls.Add(Gap());
        stack.Controls.Add(Line(enabled));
        stack.Controls.Add(Line(L("Repeat"), kind));
        timeRow.Controls.AddRange(new Control[] { L("At"), time });
        stack.Controls.Add(timeRow);
        intervalRow.Controls.AddRange(new Control[] { L("Every"), every, L("minutes, until"), endTime });
        stack.Controls.Add(intervalRow);
        dateRow.Controls.AddRange(new Control[] { L("On"), onceDate });
        stack.Controls.Add(dateRow);
        var names = CultureInfo.CurrentCulture.DateTimeFormat.AbbreviatedDayNames;
        daysRow.Controls.Add(L("Days"));
        foreach (var d in new[] { 2, 3, 4, 5, 6, 7, 1 })
        {
            var cb = new CheckBox { Text = names[d - 1], AutoSize = true, Margin = new Padding(0, 4, 6, 0) };
            days[d - 1] = cb;
            daysRow.Controls.Add(cb);
        }
        stack.Controls.Add(daysRow);

        stack.Controls.Add(Gap());
        stack.Controls.Add(H("If ClickFlow was closed or the PC was asleep at that time"));
        stack.Controls.Add(skip);
        stack.Controls.Add(runOnce);

        stack.Controls.Add(Gap());
        stack.Controls.Add(H("Conditions (optional)"));
        stack.Controls.Add(Line(useStart, startDate, useEnd, endDate));
        stack.Controls.Add(Line(L("Only if this app is running"), requireApp));
        stack.Controls.Add(Line(L("   "), frontmost));
        stack.Controls.Add(Line(L("Only if the PC has been idle for at least"), idle, L("seconds (0 = off)")));
        var hint = new Label
        {
            Text = "App: a process name (chrome), an exe (chrome.exe) or the app's name (Google Chrome). A run that doesn't meet a condition is skipped and logged.",
            AutoSize = true, MaximumSize = new Size(560, 0), ForeColor = Theme.Muted, Font = Theme.Small,
        };
        stack.Controls.Add(hint);

        var ok = new Button { Text = isNew ? "Add" : "Save", DialogResult = DialogResult.OK, Width = 90 };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Width = 90 };
        var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Margin = new Padding(0, 14, 0, 0), Width = 560 };
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(ok);
        stack.Controls.Add(buttons);
        AcceptButton = ok;
        CancelButton = cancel;

        Load_();
        foreach (var c in new Control[] { enabled, kind, time, endTime, onceDate, every, skip, runOnce, useStart, useEnd, startDate, endDate, requireApp, frontmost, idle })
        {
            switch (c)
            {
                case CheckBox cb: cb.CheckedChanged += (_, _) => Save_(); break;
                case RadioButton rb: rb.CheckedChanged += (_, _) => Save_(); break;
                case ComboBox co: co.SelectedIndexChanged += (_, _) => Save_(); break;
                case DateTimePicker dp: dp.ValueChanged += (_, _) => Save_(); break;
                case NumericUpDown n: n.ValueChanged += (_, _) => Save_(); break;
                case TextBox t: t.TextChanged += (_, _) => Save_(); break;
            }
        }
        foreach (var cb in days) cb.CheckedChanged += (_, _) => Save_();
        loading = false;
        Save_();
    }

    static Label L(string t) => new() { Text = t, AutoSize = true, Margin = new Padding(0, 6, 6, 0) };
    static Label H(string t) => new() { Text = t, AutoSize = true, Font = Theme.Bold, Margin = new Padding(0, 4, 0, 4) };
    static Control Gap() => new Label { Height = 8, Width = 10 };

    static FlowLayoutPanel Line(params Control[] c)
    {
        var f = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0, 2, 0, 2) };
        f.Controls.AddRange(c);
        return f;
    }

    static DateTime TimeOf(string hhmm) => Clock.Date(hhmm, DateTime.Today);

    void Load_()
    {
        enabled.Checked = s.Enabled;
        kind.SelectedIndex = Array.IndexOf(RepeatKinds.All, s.Repeat);
        time.Value = TimeOf(s.Time);
        endTime.Value = TimeOf(s.EndTime);
        onceDate.Value = DayString.Parse(s.Date) ?? DateTime.Today;
        every.Value = Math.Clamp(s.IntervalMinutes, 1, 1440);
        foreach (var d in Enumerable.Range(1, 7)) days[d - 1].Checked = s.CustomDays.Contains(d);
        if (s.Repeat == RepeatKind.Interval && s.CustomDays.Count == 0) foreach (var cb in days) cb.Checked = true;
        skip.Checked = s.MissedRunPolicy == MissedRunPolicy.Skip;
        runOnce.Checked = s.MissedRunPolicy == MissedRunPolicy.RunOnce;
        useStart.Checked = s.Conditions.StartDate != null;
        useEnd.Checked = s.Conditions.EndDate != null;
        startDate.Value = DayString.Parse(s.Conditions.StartDate) ?? DateTime.Today;
        endDate.Value = DayString.Parse(s.Conditions.EndDate) ?? DateTime.Today.AddDays(30);
        requireApp.Text = s.Conditions.RequireApp ?? "";
        frontmost.Checked = s.Conditions.RequireFrontmost;
        idle.Value = Math.Clamp(s.Conditions.MinIdleSeconds ?? 0, 0, 86400);
    }

    void Save_()
    {
        if (loading) return;
        s.Enabled = enabled.Checked;
        s.Repeat = RepeatKinds.All[Math.Max(0, kind.SelectedIndex)];
        s.Time = Clock.String(time.Value);
        s.EndTime = Clock.String(endTime.Value);
        s.Date = DayString.String(onceDate.Value);
        s.IntervalMinutes = (int)every.Value;
        s.CustomDays = Enumerable.Range(1, 7).Where(d => days[d - 1].Checked).ToList();
        s.MissedRunPolicy = runOnce.Checked ? MissedRunPolicy.RunOnce : MissedRunPolicy.Skip;
        s.Conditions.StartDate = useStart.Checked ? DayString.String(startDate.Value) : null;
        s.Conditions.EndDate = useEnd.Checked ? DayString.String(endDate.Value) : null;
        s.Conditions.RequireApp = requireApp.Text.Trim().Length > 0 ? requireApp.Text.Trim() : null;
        s.Conditions.RequireFrontmost = frontmost.Checked;
        s.Conditions.MinIdleSeconds = idle.Value > 0 ? (int)idle.Value : null;

        intervalRow.Visible = s.Repeat == RepeatKind.Interval;
        daysRow.Visible = s.Repeat is RepeatKind.Custom or RepeatKind.Interval;
        dateRow.Visible = s.Repeat == RepeatKind.Once;
        ((Label)timeRow.Controls[0]).Text = s.Repeat == RepeatKind.Interval ? "From" : "At";
        startDate.Enabled = useStart.Checked;
        endDate.Enabled = useEnd.Checked;
        frontmost.Enabled = s.Conditions.RequireApp != null;

        summary.Text = s.Summary;
        next.Text = s.NextOccurrence(DateTime.Now) is { } n ? $"Next run: {Fmt.NextRun(n)}" : "No upcoming run with these settings";
        next.ForeColor = s.NextOccurrence(DateTime.Now) != null ? Theme.Accent : Theme.Orange;
    }
}
