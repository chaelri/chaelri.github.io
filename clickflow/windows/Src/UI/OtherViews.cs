using System.Diagnostics;

namespace ClickFlow;

using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;

/// Manual, scheduled and skipped runs, newest first.
public sealed class HistoryView : Grid, IDisposable
{
    static readonly double[] Widths = { 190, 170, 90, 90, 70 };
    readonly MainWindow main;
    readonly TextBlock count = Theme.Label("", color: Theme.Muted);
    readonly ListView list = new() { SelectionMode = ListViewSelectionMode.None, IsItemClickEnabled = false };

    public HistoryView(MainWindow main)
    {
        this.main = main;
        Padding = new Thickness(24, 14, 24, 20);
        RowSpacing = 10;
        RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

        var clear = Theme.Button("Clear History", "");
        clear.Click += async (_, _) =>
        {
            if (XamlRoot != null && await Dialogs.Confirm(XamlRoot, "Clear run history?", "Every entry is removed.", "Clear")) Store.Shared.ClearHistory();
        };
        var top = Theme.Row(count, clear);
        Children.Add(top);

        var header = Line();
        string[] titles = { "When", "Macro", "Trigger", "Result", "Took", "Details" };
        for (int i = 0; i < titles.Length; i++)
        {
            var t = (TextBlock)header.Children[i];
            t.Text = titles[i];
            t.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
            t.Foreground = Theme.Muted;
        }
        header.Padding = new Thickness(16, 10, 16, 8);
        // Rows are recycled as you scroll: one empty template, filled in when a row is shown.
        list.ItemTemplate = (DataTemplate)XamlReader.Load("<DataTemplate xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\"><Grid/></DataTemplate>");
        list.ContainerContentChanging += (_, e) =>
        {
            if (e.ItemContainer.ContentTemplateRoot is not Grid g || e.Item is not RunRecord r) return;
            if (g.Children.Count == 0) Fill(g);
            Show(g, r);
        };
        var body = new Grid();
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        body.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        body.Children.Add(header);
        Grid.SetRow(list, 1);
        body.Children.Add(list);
        var card = Theme.Card(body, padding: new Thickness(0, 0, 0, 6));
        Grid.SetRow(card, 1);
        Children.Add(card);

        Store.Shared.HistoryChanged += Reload;
        Reload();
    }

    public void Dispose() => Store.Shared.HistoryChanged -= Reload;

    static Grid Line()
    {
        var g = new Grid();
        Fill(g);
        return g;
    }

    static void Fill(Grid g)
    {
        foreach (var w in Widths) g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(w) });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        for (int i = 0; i <= Widths.Length; i++)
        {
            var t = new TextBlock { TextTrimming = TextTrimming.CharacterEllipsis, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) };
            Grid.SetColumn(t, i);
            g.Children.Add(t);
        }
    }

    static void Show(Grid g, RunRecord r)
    {
        var took = r.End is { } e ? Fmt.Seconds((e - r.Start).TotalSeconds) : "";
        string[] cells = { Fmt.Stamp(r.Start), r.MacroName, r.Trigger.Label(), r.Result.ToString(), took, r.Reason ?? "" };
        var color = r.Result switch
        {
            RunResult.Failed => Theme.Solid(Theme.Red), RunResult.Stopped => Theme.Solid(Theme.Orange), RunResult.Skipped => Theme.Muted, _ => Theme.Text,
        };
        for (int i = 0; i < cells.Length; i++)
        {
            var t = (TextBlock)g.Children[i];
            t.Text = cells[i];
            t.Foreground = color;
        }
        ToolTipService.SetToolTip(g, string.IsNullOrEmpty(r.Reason) ? null : r.Reason);
    }

    void Reload()
    {
        var h = Store.Shared.History;
        count.Text = h.Count == 0 ? "No runs yet. Manual, scheduled and skipped runs all show up here." : $"{h.Count} run{(h.Count == 1 ? "" : "s")}";
        list.ItemsSource = Enumerable.Reverse(h).Take(1000).Cast<object>().ToList();
    }
}

public sealed class SettingsView : UserControl
{
    readonly Store store = Store.Shared;
    readonly StackPanel stack = new() { Spacing = 12, Padding = new Thickness(24, 16, 24, 32), MaxWidth = 900, HorizontalAlignment = HorizontalAlignment.Left };
    readonly MainWindow main;

    public SettingsView(MainWindow main)
    {
        this.main = main;
        Content = new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        stack.Children.Add(Appearance());
        stack.Children.Add(Running());
        stack.Children.Add(Discord_());
        stack.Children.Add(Accuracy());
        stack.Children.Add(Data());
    }

    static (Border Card, StackPanel Inner) Card(string title)
    {
        var inner = new StackPanel { Spacing = 4 };
        var h = Theme.H2(title);
        h.Margin = new Thickness(0, 0, 0, 6);
        inner.Children.Add(h);
        return (Theme.Card(inner, padding: new Thickness(18, 14, 18, 16)), inner);
    }

    static CheckBox Check(string text, bool value, Action<bool> set)
    {
        var cb = new CheckBox { Content = text, IsChecked = value };
        cb.Checked += (_, _) => set(true);
        cb.Unchecked += (_, _) => set(false);
        return cb;
    }

    static TextBlock Note(string text)
    {
        var l = Theme.Small(text);
        l.Margin = new Thickness(28, 0, 0, 6);
        return l;
    }

    UIElement Appearance()
    {
        var p = store.Prefs;
        var (card, c) = Card("Appearance");
        string[] keys = { "system", "light", "dark" };
        var pick = new ComboBox { Width = 220, SelectedIndex = Math.Max(0, Array.IndexOf(keys, p.Appearance)) };
        pick.Items.Add("Same as Windows");
        pick.Items.Add("Light");
        pick.Items.Add("Dark");
        var restart = Theme.Button("Restart now", "", primary: true);
        restart.Click += (_, _) => main.Restart();
        var note = Theme.Small("ClickFlow restarts to change it. Schedules keep their times.");
        var applied = p.Appearance;
        void Show() => restart.Visibility = p.Appearance != applied ? Visibility.Visible : Visibility.Collapsed;
        pick.SelectionChanged += (_, _) =>
        {
            p.Appearance = keys[Math.Max(0, pick.SelectedIndex)];
            store.SavePrefs();
            Show();
        };
        Show();
        var row = Theme.Row(Theme.Label("Theme"), pick, restart);
        row.Margin = new Thickness(0, 2, 0, 2);
        c.Children.Add(row);
        c.Children.Add(note);
        return card;
    }

    UIElement Running()
    {
        var p = store.Prefs;
        var (card, c) = Card("Running");
        c.Children.Add(Check("Pause all schedules", p.PausedAll, v => { p.PausedAll = v; store.SavePrefs(); store.Changed(); }));
        c.Children.Add(Check("Start ClickFlow when I sign in to Windows (in the tray)", LoginItem.Enabled, v =>
        {
            try { LoginItem.Enabled = v; } catch (Exception e) { Alerts.Show(main.Owner, "Couldn't change the login item", e.Message); }
        }));
        c.Children.Add(Note("Schedules only fire while ClickFlow is running. Closing the window keeps it in the tray; quit from the tray icon."));
        c.Children.Add(Check("Hide this window while a macro runs", p.HideWindowDuringRuns, v => { p.HideWindowDuringRuns = v; store.SavePrefs(); }));
        c.Children.Add(Check("Show a ring where each click lands", p.ShowClickRing, v => { p.ShowClickRing = v; store.SavePrefs(); }));
        c.Children.Add(Check("Lock mouse & keyboard while a macro runs", p.LockInputDuringRuns, v => { p.LockInputDuringRuns = v; store.SavePrefs(); }));
        c.Children.Add(Note("Your touches are ignored so nothing interrupts the macro. Esc, Ctrl+Alt+. or Alt+F4 stops it and unlocks; Ctrl+Alt+Del always works. Preview and step tests never lock."));
        var stop = Theme.Label("Emergency stop: Ctrl+Alt+. from any app, or Esc during a run.", bold: true);
        stop.Margin = new Thickness(0, 6, 0, 2);
        c.Children.Add(stop);
        c.Children.Add(Theme.Small("ClickFlow runs unelevated, so it can't click into apps running as administrator. Start ClickFlow as administrator if a macro has to."));
        return card;
    }

    UIElement Discord_()
    {
        var (card, c) = Card("Discord");
        c.Children.Add(Theme.Small("Webhook used by Send to Discord and Screenshot area steps. Kept in a separate file on this PC, never in macros.json or exports."));
        var box = new PasswordBox { Width = 460, PlaceholderText = "https://discord.com/api/webhooks/…", VerticalAlignment = VerticalAlignment.Center };
        var status = Theme.Small("");
        void ShowStatus()
        {
            var has = Discord.WebhookUrl != null;
            status.Text = has ? "A webhook is set." : "No webhook set.";
            status.Foreground = Theme.Solid(has ? Theme.Green : Theme.Orange);
        }
        var save = Theme.Button("Save", "", primary: true);
        save.Click += (_, _) =>
        {
            var v = box.Password.Trim();
            if (!Discord.IsValidWebhook(v)) { Alerts.Show(main.Owner, "That isn't a Discord webhook", "It should look like https://discord.com/api/webhooks/<id>/<token>."); return; }
            Discord.WebhookUrl = v;
            box.Password = "";
            ShowStatus();
        };
        var test = Theme.Button("Send test", "");
        test.Click += async (_, _) =>
        {
            if (Discord.WebhookUrl == null) { ShowStatus(); return; }
            test.IsEnabled = false;
            try
            {
                await Discord.SendText($"ClickFlow test from {Environment.MachineName} ✅ {Fmt.Time(DateTime.Now)}", CancellationToken.None);
                status.Text = "Test sent."; status.Foreground = Theme.Solid(Theme.Green);
            }
            catch (Exception e) { status.Text = e.Message; status.Foreground = Theme.Solid(Theme.Red); }
            finally { test.IsEnabled = true; }
        };
        var remove = Theme.Button("Remove", "", tint: Theme.Red);
        remove.Click += (_, _) => { Discord.WebhookUrl = null; ShowStatus(); };
        var r1 = Theme.Row(box, save);
        r1.Margin = new Thickness(0, 6, 0, 0);
        c.Children.Add(r1);
        c.Children.Add(Theme.Row(test, remove, status));
        ShowStatus();
        return card;
    }

    UIElement Accuracy()
    {
        var (card, c) = Card("Click accuracy test");
        c.Children.Add(Theme.Small("Puts a target on every display, clicks it, and reports where the click landed. It only clicks ClickFlow's own targets."));
        var result = new TextBlock { FontFamily = new FontFamily("Consolas"), FontSize = 13, TextWrapping = TextWrapping.Wrap };
        var run = Theme.Button("Run test", "");
        run.HorizontalAlignment = HorizontalAlignment.Left;
        run.Margin = new Thickness(0, 6, 0, 0);
        run.Click += async (_, _) =>
        {
            run.IsEnabled = false;
            result.Text = "Testing…";
            result.Text = await AccuracyTest.Run();
            run.IsEnabled = true;
        };
        c.Children.Add(run);
        c.Children.Add(result);
        var d = Theme.Label("Displays", bold: true);
        d.Margin = new Thickness(0, 8, 0, 0);
        c.Children.Add(d);
        foreach (var s in Screen.AllScreens)
        {
            var b = s.Bounds;
            c.Children.Add(Theme.Small($"{(s.Primary ? "Primary" : "Display")}: {b.Width} × {b.Height} at {b.X}, {b.Y} (pixels)"));
        }
        return card;
    }

    UIElement Data()
    {
        var (card, c) = Card("Data");
        c.Children.Add(Theme.Small($"{store.Macros.Count} macros · {store.History.Count} runs in history"));
        var open = Theme.Button("Open data folder", "");
        open.Click += (_, _) => Process.Start(new ProcessStartInfo("explorer.exe", $"\"{Store.Directory}\"") { UseShellExecute = false })?.Dispose();
        var export = Theme.Button("Export all macros…", "");
        export.Click += (_, _) => store.Export(main.Owner, store.Macros);
        var import = Theme.Button("Import macros…", "");
        import.Click += (_, _) => store.Import(main.Owner);
        var row = Theme.Row(open, export, import);
        row.Margin = new Thickness(0, 6, 0, 2);
        c.Children.Add(row);
        c.Children.Add(Theme.Small(Store.Directory, Theme.Faint));
        c.Children.Add(Theme.Small("Macros from the Mac app import as-is. Its coordinates are Mac points, so re-pick each click and area on this PC, and check key shortcuts (cmd becomes Ctrl)."));
        return card;
    }
}
