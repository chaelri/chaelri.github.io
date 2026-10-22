using System.Drawing.Drawing2D;

namespace ClickFlow;

static class Program
{
    public static string[] Args = Array.Empty<string>();

    /// ClickFlow.exe [--minimized] [--preview-hud] [--selftest [file]] [--set-discord-webhook <url> [--send-test]]
    [STAThread]
    static int Main(string[] args)
    {
        Args = args;
        if (args.Contains("--selftest"))
        {
            int i = Array.IndexOf(args, "--selftest");
            var outFile = i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[i + 1] : null;
            return SelfTest.Run(outFile);
        }

        if (Array.IndexOf(args, "--set-discord-webhook") is var w and >= 0)
        {
            Native.AttachConsole(-1);
            var url = w + 1 < args.Length ? args[w + 1] : "";
            if (!Discord.IsValidWebhook(url)) { Console.Error.WriteLine("✗ not a Discord webhook URL"); return 1; }
            Discord.WebhookUrl = url;
            Console.WriteLine($"✓ webhook saved to {Store.Directory}");
            if (args.Contains("--send-test"))
            {
                try { Discord.SendText($"ClickFlow test from {Environment.MachineName} ✅", CancellationToken.None).GetAwaiter().GetResult(); Console.WriteLine("✓ test sent"); }
                catch (Exception e) { Console.Error.WriteLine($"✗ {e.Message}"); return 1; }
            }
            return 0;
        }

        // One ClickFlow per user: a second launch brings the first one's window up.
        using var mutex = new Mutex(true, @"Local\ClickFlow.SingleInstance", out bool first);
        if (!first)
        {
            Native.PostMessage(Native.HWND_BROADCAST, MainWindow.ShowMessage, 0, 0);
            return 0;
        }

        // Windows Forms (HUD, placer, overlays, tray) is set up before WinUI starts; the other
        // way round crashes the process.
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Crash.Report(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => { if (e.ExceptionObject is Exception ex) Crash.Report(ex); };

        WinRT.ComWrappersSupport.InitializeComWrappers();
        WindowsFormsSynchronizationContext? context = null;
        Microsoft.UI.Xaml.Application.Start(p =>
        {
            // The UI thread's context must exist before the store, HUD or hooks are touched.
            // Windows Forms' context, not WinUI's: UI.Send needs a synchronous Send.
            context = new WindowsFormsSynchronizationContext();
            SynchronizationContext.SetSynchronizationContext(context);
            UI.Context = context;

            _ = Hud.Shared.Handle;   // created on the UI thread
            InputLock.OnStop = () => { Recorder.Shared.Stop(); Runner.Shared.EmergencyStop(); };
            InputLock.StillRunning = () => Runner.Shared.Busy;
            LoginItem.Refresh();
            _ = new App();
        });
        Store.Shared.Flush();
        context?.Dispose();
        return 0;
    }
}

static class Crash
{
    public static void Report(Exception e)
    {
        try
        {
            File.AppendAllText(Path.Combine(Store.Directory, "crash.log"), $"[{DateTime.Now:O}] {e}\n\n");
        }
        catch (Exception) { }
        // Never leave the input locked behind an error dialog.
        InputLock.Release();
        MessageBox.Show(e.Message, "ClickFlow hit an error", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}

/// The app icon: AppIcon.ico (embedded at build time when present), otherwise drawn.
static class AppIcon
{
    static Icon? cached;

    public static Icon Get()
    {
        if (cached != null) return cached;
        var stream = typeof(AppIcon).Assembly.GetManifestResourceStream("AppIcon.ico");
        if (stream != null) return cached = new Icon(stream);
        using var bmp = new Bitmap(64, 64);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var bg = new LinearGradientBrush(new Rectangle(0, 0, 64, 64), Color.FromArgb(40, 130, 255), Color.FromArgb(120, 70, 230), 45f);
            using var path = OverlayForm.Rounded(new RectangleF(2, 2, 60, 60), 14);
            g.FillPath(bg, path);
            using var pen = new Pen(Color.White, 4);
            g.DrawEllipse(pen, 18, 18, 28, 28);
            g.FillEllipse(Brushes.White, 28, 28, 8, 8);
        }
        return cached = Icon.FromHandle(bmp.GetHicon());
    }
}
