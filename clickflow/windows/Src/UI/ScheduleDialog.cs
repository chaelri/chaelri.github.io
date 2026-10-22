using System.Globalization;

namespace ClickFlow;

using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

/// Add / edit one schedule. Edits a copy; the caller stores it on Add / Save.
public sealed class ScheduleDialog : ContentDialog
{
    readonly Schedule s;
    readonly CheckBox enabled = new() { Content = "Enabled" };
    readonly ComboBox kind = new() { Width = 200 };
    readonly TimePicker time = new() { MinuteIncrement = 1 }, endTime = new() { MinuteIncrement = 1 };
    readonly CalendarDatePicker onceDate = new() { Width = 200 };
    readonly NumberBox every = Theme.Num(1, 1440, 0, 30, 110);
    readonly CheckBox[] days = new CheckBox[7];
    readonly RadioButton skip = new() { Content = "Skip it (it's logged in Run History)", GroupName = "missed" };
    readonly RadioButton runOnce = new() { Content = "Run it once, as soon as ClickFlow notices", GroupName = "missed" };
    readonly CheckBox useStart = new() { Content = "Starting", MinWidth = 0 }, useEnd = new() { Content = "Ending", MinWidth = 0 };
    readonly CalendarDatePicker startDate = new(), endDate = new();
    readonly TextBox requireApp = new() { Width = 220, PlaceholderText = "e.g. chrome" };
    readonly CheckBox frontmost = new() { Content = "and it must be the app in front" };
    readonly NumberBox idle = Theme.Num(0, 86400, 0, 0, 120);
    readonly TextBlock summary = Theme.Label("", 16, bold: true);
    readonly TextBlock next = Theme.Label("");
    readonly TextBlock atLabel = Theme.Label("At");
    readonly WrapPanel daysRow, timeRow, dateRow, intervalRow;
    bool loading = true;

    public static async Task<bool> Show(XamlRoot root, Schedule schedule, bool isNew)
    {
        var d = new ScheduleDialog(schedule, isNew) { XamlRoot = root };
        return await d.ShowAsync() == ContentDialogResult.Primary;
    }

    ScheduleDialog(Schedule schedule, bool isNew)
    {
        s = schedule;
        // A subclass gets no template of its own; borrow ContentDialog's.
        Style = (Style)Application.Current.Resources["DefaultContentDialogStyle"];
        Title = isNew ? "Add Schedule" : "Edit Schedule";
        PrimaryButtonText = isNew ? "Add" : "Save";
        CloseButtonText = "Cancel";
        DefaultButton = ContentDialogButton.Primary;
        Resources["ContentDialogMaxWidth"] = 720.0;

        var stack = new StackPanel { Spacing = 8, Width = 600 };
        foreach (var k in RepeatKinds.All) kind.Items.Add(k.Label());
        stack.Children.Add(summary);
        stack.Children.Add(next);
        stack.Children.Add(enabled);
        stack.Children.Add(Theme.Row(Theme.Label("Repeat"), kind));
        timeRow = Theme.Row(atLabel, time);
        stack.Children.Add(timeRow);
        intervalRow = Theme.Row(Theme.Label("Every"), every, Theme.Label("minutes, until"), endTime);
        stack.Children.Add(intervalRow);
        dateRow = Theme.Row(Theme.Label("On"), onceDate);
        stack.Children.Add(dateRow);
        var names = CultureInfo.CurrentCulture.DateTimeFormat.AbbreviatedDayNames;
        daysRow = Theme.Row(Theme.Label("Days"));
        foreach (var d in new[] { 2, 3, 4, 5, 6, 7, 1 })
        {
            var cb = new CheckBox { Content = names[d - 1], MinWidth = 0 };
            days[d - 1] = cb;
            daysRow.Children.Add(cb);
        }
        stack.Children.Add(daysRow);

        stack.Children.Add(H("If ClickFlow was closed or the PC was asleep at that time"));
        stack.Children.Add(skip);
        stack.Children.Add(runOnce);

        stack.Children.Add(H("Conditions (optional)"));
        stack.Children.Add(Theme.Row(useStart, startDate, useEnd, endDate));
        stack.Children.Add(Theme.Row(Theme.Label("Only if this app is running"), requireApp));
        frontmost.Margin = new Thickness(24, 0, 0, 0);
        stack.Children.Add(frontmost);
        stack.Children.Add(Theme.Row(Theme.Label("Only if the PC has been idle for at least"), idle, Theme.Label("seconds (0 = off)")));
        stack.Children.Add(Theme.Small("App: a process name (chrome), an exe (chrome.exe) or the app's name (Google Chrome). A run that doesn't meet a condition is skipped and logged."));
        Content = new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };

        Load_();
        foreach (var cb in new[] { enabled, useStart, useEnd, frontmost }.Concat(days)) { cb.Checked += (_, _) => Save_(); cb.Unchecked += (_, _) => Save_(); }
        skip.Checked += (_, _) => Save_();
        runOnce.Checked += (_, _) => Save_();
        kind.SelectionChanged += (_, _) => Save_();
        time.SelectedTimeChanged += (_, _) => Save_();
        endTime.SelectedTimeChanged += (_, _) => Save_();
        foreach (var dp in new[] { onceDate, startDate, endDate }) dp.DateChanged += (_, _) => Save_();
        every.ValueChanged += (_, _) => Save_();
        idle.ValueChanged += (_, _) => Save_();
        requireApp.TextChanged += (_, _) => Save_();
        loading = false;
        Save_();
    }

    static TextBlock H(string t)
    {
        var l = Theme.Label(t, bold: true);
        l.Margin = new Thickness(0, 10, 0, 0);
        return l;
    }

    static TimeSpan TimeOf(string hhmm) => Clock.Date(hhmm, DateTime.Today).TimeOfDay;
    static DateTime At(TimePicker p) => DateTime.Today + (p.SelectedTime ?? p.Time);
    static DateTime Day(CalendarDatePicker p, DateTime fallback) => p.Date?.Date ?? fallback;

    void Load_()
    {
        enabled.IsChecked = s.Enabled;
        kind.SelectedIndex = Array.IndexOf(RepeatKinds.All, s.Repeat);
        time.SelectedTime = TimeOf(s.Time);
        endTime.SelectedTime = TimeOf(s.EndTime);
        onceDate.Date = DayString.Parse(s.Date) ?? DateTime.Today;
        every.Value = Math.Clamp(s.IntervalMinutes, 1, 1440);
        foreach (var d in Enumerable.Range(1, 7)) days[d - 1].IsChecked = s.CustomDays.Contains(d);
        if (s.Repeat == RepeatKind.Interval && s.CustomDays.Count == 0) foreach (var cb in days) cb.IsChecked = true;
        skip.IsChecked = s.MissedRunPolicy == MissedRunPolicy.Skip;
        runOnce.IsChecked = s.MissedRunPolicy == MissedRunPolicy.RunOnce;
        useStart.IsChecked = s.Conditions.StartDate != null;
        useEnd.IsChecked = s.Conditions.EndDate != null;
        startDate.Date = DayString.Parse(s.Conditions.StartDate) ?? DateTime.Today;
        endDate.Date = DayString.Parse(s.Conditions.EndDate) ?? DateTime.Today.AddDays(30);
        requireApp.Text = s.Conditions.RequireApp ?? "";
        frontmost.IsChecked = s.Conditions.RequireFrontmost;
        idle.Value = Math.Clamp(s.Conditions.MinIdleSeconds ?? 0, 0, 86400);
    }

    void Save_()
    {
        if (loading) return;
        s.Enabled = enabled.IsChecked == true;
        s.Repeat = RepeatKinds.All[Math.Max(0, kind.SelectedIndex)];
        s.Time = Clock.String(At(time));
        s.EndTime = Clock.String(At(endTime));
        s.Date = DayString.String(Day(onceDate, DateTime.Today));
        if (!double.IsNaN(every.Value)) s.IntervalMinutes = (int)every.Value;
        s.CustomDays = Enumerable.Range(1, 7).Where(d => days[d - 1].IsChecked == true).ToList();
        s.MissedRunPolicy = runOnce.IsChecked == true ? MissedRunPolicy.RunOnce : MissedRunPolicy.Skip;
        s.Conditions.StartDate = useStart.IsChecked == true ? DayString.String(Day(startDate, DateTime.Today)) : null;
        s.Conditions.EndDate = useEnd.IsChecked == true ? DayString.String(Day(endDate, DateTime.Today.AddDays(30))) : null;
        s.Conditions.RequireApp = requireApp.Text.Trim().Length > 0 ? requireApp.Text.Trim() : null;
        s.Conditions.RequireFrontmost = frontmost.IsChecked == true;
        s.Conditions.MinIdleSeconds = !double.IsNaN(idle.Value) && idle.Value > 0 ? (int)idle.Value : null;

        intervalRow.Visibility = s.Repeat == RepeatKind.Interval ? Visibility.Visible : Visibility.Collapsed;
        daysRow.Visibility = s.Repeat is RepeatKind.Custom or RepeatKind.Interval ? Visibility.Visible : Visibility.Collapsed;
        dateRow.Visibility = s.Repeat == RepeatKind.Once ? Visibility.Visible : Visibility.Collapsed;
        atLabel.Text = s.Repeat == RepeatKind.Interval ? "From" : "At";
        startDate.IsEnabled = useStart.IsChecked == true;
        endDate.IsEnabled = useEnd.IsChecked == true;
        frontmost.IsEnabled = s.Conditions.RequireApp != null;

        summary.Text = s.Summary;
        var n = s.NextOccurrence(DateTime.Now);
        next.Text = n is { } d ? $"Next run: {Fmt.NextRun(d)}" : "No upcoming run with these settings";
        next.Foreground = Theme.Solid(n != null ? Theme.Accent : Theme.Orange);
    }
}
