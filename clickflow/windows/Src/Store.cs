using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace ClickFlow;

/// Runs work on the UI thread. Everything that touches Store or a form goes through here.
public static class UI
{
    public static SynchronizationContext? Context;
    public static void Post(Action a)
    {
        if (Context == null || SynchronizationContext.Current == Context) a();
        else Context.Post(_ => a(), null);
    }

    /// Runs on the UI thread and waits for it.
    public static T Send<T>(Func<T> f)
    {
        if (Context == null || SynchronizationContext.Current == Context) return f();
        T result = default!;
        Exception? error = null;
        Context.Send(_ => { try { result = f(); } catch (Exception e) { error = e; } }, null);
        if (error != null) throw error;
        return result;
    }

    public static void Send(Action a) => Send(() => { a(); return true; });
}

/// SetThreadExecutionState is per thread, so every request goes through the UI thread.
public static class Power
{
    static bool display, system;

    public static void KeepDisplayAwake(bool on) { display = on; Apply(); }
    public static void KeepSystemAwake(bool on) { system = on; Apply(); }

    static void Apply() => UI.Post(() =>
    {
        uint flags = Native.ES_CONTINUOUS;
        if (display) flags |= Native.ES_DISPLAY_REQUIRED | Native.ES_SYSTEM_REQUIRED;
        if (system) flags |= Native.ES_SYSTEM_REQUIRED;
        Native.SetThreadExecutionState(flags);
    });
}

public sealed class Prefs
{
    public bool HideWindowDuringRuns = true;
    public bool ShowClickRing = true;
    public bool LockInputDuringRuns = true;
    public bool PausedAll;
    public bool Onboarded;
    public bool TrayHintShown;

    static string FilePath => Path.Combine(Store.Directory, "settings.json");

    public static Prefs Load()
    {
        var p = new Prefs();
        try
        {
            if (JsonNode.Parse(File.ReadAllText(FilePath)) is JsonObject o)
            {
                bool B(string k, bool d) => o[k] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : d;
                p.HideWindowDuringRuns = B("hideWindowDuringRuns", true);
                p.ShowClickRing = B("showClickRing", true);
                p.LockInputDuringRuns = B("lockInputDuringRuns", true);
                p.PausedAll = B("pausedAll", false);
                p.Onboarded = B("onboarded", false);
                p.TrayHintShown = B("trayHintShown", false);
            }
        }
        catch (Exception) { }
        return p;
    }

    public void Save()
    {
        try
        {
            Store.WriteAtomic(FilePath, Json.Write(new JsonObject
            {
                ["hideWindowDuringRuns"] = HideWindowDuringRuns,
                ["showClickRing"] = ShowClickRing,
                ["lockInputDuringRuns"] = LockInputDuringRuns,
                ["pausedAll"] = PausedAll,
                ["onboarded"] = Onboarded,
                ["trayHintShown"] = TrayHintShown,
            }));
        }
        catch (Exception) { }
    }
}

public sealed class Store
{
    /// %APPDATA%\ClickFlow, or CLICKFLOW_DATA_DIR (a throwaway folder for tests, so a
    /// test build never sees, schedules or runs the real macros). Declared before Shared:
    /// static fields initialise in order, and the constructor reads this.
    public static string Directory { get; } =
        Environment.GetEnvironmentVariable("CLICKFLOW_DATA_DIR") is { Length: > 0 } dir ? dir
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClickFlow");

    public static readonly Store Shared = new();

    public List<Macro> Macros = new();
    public List<RunRecord> History = new();
    public Prefs Prefs;

    public string MacrosPath => Path.Combine(Directory, "macros.json");
    public string HistoryPath => Path.Combine(Directory, "history.json");
    public string StatePath => Path.Combine(Directory, "scheduler-state.json");

    /// Structure changed (macro added / removed / renamed / reordered, a schedule edited).
    public event Action? MacrosChanged;
    public event Action? HistoryChanged;

    readonly System.Threading.Timer saveTimer;
    bool macrosDirty, historyDirty;
    readonly object gate = new();

    Store()
    {
        System.IO.Directory.CreateDirectory(Directory);
        Prefs = Prefs.Load();
        saveTimer = new System.Threading.Timer(_ => UI.Post(Flush), null, Timeout.Infinite, Timeout.Infinite);
        Load();
    }

    void Load()
    {
        if (File.Exists(MacrosPath))
        {
            var list = Json.ParseMacros(File.ReadAllText(MacrosPath));
            if (list != null) Macros = list;
            else
            {
                // Never overwrite a file we couldn't read: set it aside and start fresh.
                var backup = Path.Combine(Directory, $"macros.unreadable-{DateTimeOffset.Now.ToUnixTimeSeconds()}.json");
                try { File.Move(MacrosPath, backup); } catch (Exception) { }
            }
        }
        else
        {
            Macros = new() { ExampleMacro() };
            WriteMacros();
        }
        try { if (File.Exists(HistoryPath)) History = Json.ParseHistory(File.ReadAllText(HistoryPath)); }
        catch (Exception) { }
    }

    static Macro ExampleMacro()
    {
        var b = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        double cx = b.Left + b.Width / 2, cy = b.Top + b.Height / 2;
        return new Macro
        {
            Name = "Example",
            Steps =
            {
                new Step(StepType.LeftClick) { X = cx, Y = cy },
                new Step(StepType.Wait) { Seconds = 1.5 },
                new Step(StepType.LeftClick) { X = cx + 120, Y = cy, DelayBefore = 0.5 },
            },
        };
    }

    // ---------- saving ----------

    /// A field inside a macro changed. Saves shortly after; no UI rebuild.
    public void Touch()
    {
        lock (gate) macrosDirty = true;
        saveTimer.Change(400, Timeout.Infinite);
    }

    /// Structure changed: save and tell the sidebar.
    public void Changed()
    {
        Touch();
        MacrosChanged?.Invoke();
    }

    public void SavePrefs() => Prefs.Save();

    public void Flush()
    {
        bool m, h;
        lock (gate) { m = macrosDirty; h = historyDirty; macrosDirty = historyDirty = false; }
        if (m) WriteMacros();
        if (h) WriteHistory();
    }

    void WriteMacros()
    {
        try { WriteAtomic(MacrosPath, Json.MacroFile(Macros)); } catch (Exception) { }
    }

    void WriteHistory()
    {
        try { WriteAtomic(HistoryPath, Json.History(History)); } catch (Exception) { }
    }

    public static void WriteAtomic(string path, string text)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, text);
        if (File.Exists(path)) File.Replace(tmp, path, null);
        else File.Move(tmp, path);
    }

    // ---------- access ----------

    public Macro? Macro(Guid id) => Macros.FirstOrDefault(m => m.Id == id);

    public (Macro Macro, DateTime Date)? NextRun
    {
        get
        {
            if (Prefs.PausedAll) return null;
            var now = DateTime.Now;
            (Macro, DateTime)? best = null;
            foreach (var m in Macros)
                if (m.NextRun(now) is { } d && (best == null || d < best.Value.Item2)) best = (m, d);
            return best;
        }
    }

    // ---------- editing ----------

    public Macro NewMacro(string name = "New Macro", List<Step>? steps = null)
    {
        var m = new Macro { Name = UniqueName(name), Steps = steps ?? new() };
        Macros.Add(m);
        Changed();
        return m;
    }

    public Macro? Duplicate(Guid id)
    {
        var src = Macro(id);
        if (src == null) return null;
        var m = src.DeepCopy();
        m.Id = Guid.NewGuid();
        m.Name = UniqueName($"{src.Name} copy");
        foreach (var s in m.Steps) s.Id = Guid.NewGuid();
        foreach (var s in m.Schedules) s.Id = Guid.NewGuid();
        Macros.Insert(Macros.IndexOf(src) + 1, m);
        Changed();
        return m;
    }

    public void Delete(Guid id)
    {
        Macros.RemoveAll(m => m.Id == id);
        Changed();
    }

    public string UniqueName(string b)
    {
        var names = Macros.Select(m => m.Name).ToHashSet();
        if (!names.Contains(b)) return b;
        int n = 2;
        while (names.Contains($"{b} {n}")) n++;
        return $"{b} {n}";
    }

    public void Log(RunRecord r)
    {
        UI.Post(() =>
        {
            History.Add(r);
            if (History.Count > 2000) History.RemoveRange(0, History.Count - 2000);
            lock (gate) historyDirty = true;
            saveTimer.Change(400, Timeout.Infinite);
            HistoryChanged?.Invoke();
        });
    }

    public void ClearHistory()
    {
        History.Clear();
        lock (gate) historyDirty = true;
        Flush();
        HistoryChanged?.Invoke();
    }

    // ---------- import / export ----------

    public void Export(IWin32Window? owner, List<Macro> list)
    {
        if (list.Count == 0) return;
        var b = list.Count == 1 ? list[0].Name : "ClickFlow Macros";
        foreach (var c in Path.GetInvalidFileNameChars()) b = b.Replace(c, '-');
        using var d = new SaveFileDialog { Filter = "ClickFlow macros (*.json)|*.json", FileName = $"{b}.clickflow.json" };
        if (d.ShowDialog(owner) != DialogResult.OK) return;
        try { File.WriteAllText(d.FileName, Json.MacroFile(list)); }
        catch (Exception e) { Alerts.Show(owner, "Couldn't export", e.Message); }
    }

    /// Returns the last macro added, if any.
    public Macro? Import(IWin32Window? owner)
    {
        using var d = new OpenFileDialog { Filter = "ClickFlow macros (*.json)|*.json|All files|*.*", Multiselect = true };
        if (d.ShowDialog(owner) != DialogResult.OK) return null;
        var added = new List<Macro>();
        var failed = new List<string>();
        foreach (var path in d.FileNames)
        {
            List<Macro>? list = null;
            try { list = Json.ParseMacros(File.ReadAllText(path)); } catch (Exception) { }
            if (list == null) { failed.Add(Path.GetFileName(path)); continue; }
            foreach (var m in list)
            {
                if (Macro(m.Id) != null || added.Any(a => a.Id == m.Id)) m.Id = Guid.NewGuid();
                m.Name = UniqueName(m.Name);
                added.Add(m);
                Macros.Add(m);
            }
        }
        if (added.Count > 0) Changed();
        if (failed.Count > 0) Alerts.Show(owner, "Some files couldn't be imported", string.Join("\n", failed));
        return added.LastOrDefault();
    }
}

/// HKCU Run key. Starts in the tray (--minimized) so a login doesn't pop the window open.
public static class LoginItem
{
    const string Key = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string Name = "ClickFlow";

    static string Command => $"\"{Environment.ProcessPath}\" --minimized";

    public static bool Enabled
    {
        get
        {
            using var k = Registry.CurrentUser.OpenSubKey(Key);
            return k?.GetValue(Name) is string s && s.Length > 0;
        }
        set
        {
            using var k = Registry.CurrentUser.CreateSubKey(Key);
            if (value) k.SetValue(Name, Command); else k.DeleteValue(Name, false);
        }
    }

    /// The exe moved (a rebuild into another folder): point the entry at this one.
    public static void Refresh()
    {
        if (!Enabled) return;
        using var k = Registry.CurrentUser.OpenSubKey(Key);
        if (k?.GetValue(Name) as string != Command) Enabled = true;
    }
}

public static class Alerts
{
    public static void Show(IWin32Window? owner, string title, string text) =>
        MessageBox.Show(owner, text, title, MessageBoxButtons.OK, MessageBoxIcon.Information);

    public static bool Confirm(IWin32Window? owner, string title, string text, string ok = "OK") =>
        MessageBox.Show(owner, text + (ok == "OK" ? "" : $"\n\nPress OK to {ok.ToLowerInvariant()}."), title,
            MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK;
}
