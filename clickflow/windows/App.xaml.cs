namespace ClickFlow;

using Microsoft.UI.Xaml;

/// The WinUI application: Fluent control styles (App.xaml) and the main window.
public partial class App : Application
{
    public static MainWindow? Main;

    public App()
    {
        // Settings › Appearance; "system" leaves it to Windows.
        var look = Store.Shared.Prefs.Appearance;
        if (look == "light") RequestedTheme = ApplicationTheme.Light;
        else if (look == "dark") RequestedTheme = ApplicationTheme.Dark;
        InitializeComponent();
        Theme.Dark = RequestedTheme == ApplicationTheme.Dark;
        UnhandledException += (_, e) => { e.Handled = true; Crash.Report(e.Exception); };
    }

    protected override void OnLaunched(LaunchActivatedEventArgs _)
    {
        var args = Program.Args;
        // Schedules first: nothing that goes wrong building the window may stop them.
        Scheduler.Shared.Start();
        try { Main = new MainWindow(startHidden: args.Contains("--minimized")); }
        catch (Exception e) { Crash.Report(e); return; }
        if (args.Contains("--preview-hud")) Main.WhenShown(() => Runner.Shared.PreviewHud());
        // --page history|settings|step:<n>|schedules: opens that view (used for screenshots).
        if (Array.IndexOf(args, "--page") is var pg and >= 0 && pg + 1 < args.Length)
            Main.WhenShown(() => Main.OpenPage(args[pg + 1]));
    }
}
