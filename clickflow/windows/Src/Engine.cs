using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;
using static ClickFlow.Native;

namespace ClickFlow;

public sealed class EngineException : Exception
{
    public EngineException(string message) : base(message) { }
}

/// The clipboard needs an STA thread; runs happen on the thread pool.
public static class ClipboardText
{
    static T Sta<T>(Func<T> f)
    {
        if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA) return f();
        T result = default!;
        Exception? error = null;
        var t = new Thread(() => { try { result = f(); } catch (Exception e) { error = e; } });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        if (error != null) throw error;
        return result;
    }

    public static string Get()
    {
        try { return Sta(() => Clipboard.ContainsText() ? Clipboard.GetText() : ""); }
        catch (Exception) { return ""; }
    }

    public static void Set(string text)
    {
        // Another app can hold the clipboard open for a moment; retry briefly.
        Sta(() => { Clipboard.SetDataObject(text, true, 10, 50); return true; });
    }
}

public static class ClickEngine
{
    static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(30) };
    static readonly int inputSize = Marshal.SizeOf<INPUT>();

    /// The image the latest Screenshot area step captured, for the HUD and the editor.
    public static Bitmap? LastCapture;

    /// Returns the text a Screenshot area step read; null for every other step.
    public static async Task<string?> Perform(Step step, RunContext ctx, CancellationToken ct, Action<double>? progress = null)
    {
        switch (step.Type)
        {
            case StepType.Wait:
                return null;
            case StepType.ReadText:
            {
                // One capture feeds everything: on-device OCR, the clipboard, and Discord.
                var image = ScreenText.Capture(step.Area);
                LastCapture = image;
                ct.ThrowIfCancellationRequested();
                string text;
                try { text = await ScreenText.Recognize(image); } catch (Exception) { text = ""; }
                if (step.CopyResult)
                {
                    // Never leave the old clipboard in place for a Post clipboard step to send.
                    if (text.Length == 0) throw new EngineException("No text found in the area");
                    ClipboardText.Set(text);
                }
                if (step.SendDiscord)
                {
                    var message = MessageVars.Fill(step.Text, text, ctx.MacroName).Trim();
                    ct.ThrowIfCancellationRequested();
                    if (step.TextOnly)
                    {
                        if (message.Length == 0) throw new EngineException("No text found in the area");
                        await Discord.SendText(message, ct);
                    }
                    else
                    {
                        await Discord.SendPng(ScreenText.Png(image), $"clickflow-{DateTimeOffset.Now.ToUnixTimeSeconds()}.png", message, ct);
                    }
                }
                return text.Length == 0 ? null : text;
            }
            case StepType.Move:
                SetCursorPos(step.Point.X, step.Point.Y);
                break;
            case StepType.LeftClick:
                await Click(step.Point, right: false, count: 1, ct);
                break;
            case StepType.DoubleClick:
                await Click(step.Point, right: false, count: 2, ct);
                break;
            case StepType.RightClick:
                await Click(step.Point, right: true, count: 1, ct);
                break;
            case StepType.TypeText:
                await Type(step.Text, ct, progress);
                break;
            case StepType.KeyShortcut:
                var combo = KeyCombo.Parse(step.Keys) ?? throw new EngineException($"Couldn't read the key shortcut \"{step.Keys}\"");
                Press(combo);
                break;
            case StepType.PostClipboard:
                await PostClipboard(step.Url, ct);
                break;
            case StepType.OpenUrl:
                await OpenInChrome(step.Url, ct);
                break;
            case StepType.DiscordMessage:
                var msg = MessageVars.Fill(step.Text, ctx.LastOutput ?? "", ctx.MacroName).Trim();
                if (msg.Length == 0) throw new EngineException("The Discord message is empty");
                await Discord.SendText(msg, ct);
                break;
            case StepType.Shutdown:
            {
                // Runner ends the run here, logs it, then forces the shutdown. The Discord note is
                // best effort, capped at 10 s and immune to Stop: nothing may keep the machine on.
                var note = MessageVars.Fill(step.Text, ctx.LastOutput ?? "", ctx.MacroName).Trim();
                if (note.Length > 0 && Discord.WebhookUrl != null)
                {
                    using var cap = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                    try { await Discord.SendText(note, cap.Token); } catch (Exception) { }
                }
                break;
            }
        }
        return null;
    }

    // ---------- Servo ----------

    const string ServoLastRun = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servo/lastRun.json";
    static readonly TimeSpan ServoWindow = TimeSpan.FromHours(3);

    /// Null when the servo pressed the power button within ServoWindow (written by gemini-proxy
    /// /servo-poweron at 5:55 / 3:55, and by the servo/ remote on a manual press); otherwise why the shutdown must not happen. Anything
    /// unreadable counts as "no": a PC left on is harmless, one switched off mid-work is not.
    public static async Task<string?> ServoDidNotStartPc(CancellationToken ct)
    {
        JsonElement run;
        try
        {
            using var cap = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cap.CancelAfter(TimeSpan.FromSeconds(15));
            var body = await http.GetStringAsync(ServoLastRun, cap.Token);
            run = JsonDocument.Parse(body).RootElement.Clone();
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception) { return "couldn't read /servo/lastRun"; }

        if (run.ValueKind != JsonValueKind.Object) return "the servo has no run on record";
        var action = run.TryGetProperty("action", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString() : null;
        var at = run.TryGetProperty("at", out var t) && t.ValueKind == JsonValueKind.Number ? t.GetDouble() : 0;
        var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds((long)at);
        if (action != "clicked")
        {
            var why = run.TryGetProperty("reason", out var r) && r.ValueKind == JsonValueKind.String ? $" ({r.GetString()})" : "";
            return $"the servo didn't press the button, PC was already on{why}";
        }
        if (age > ServoWindow) return $"the servo's last press was {Math.Round(age.TotalHours, 1)} h ago";
        return null;
    }

    // ---------- Chrome ----------

    /// chrome.exe from the App Paths registration (per-user installs first), or null.
    public static string? ChromePath()
    {
        const string key = @"Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe";
        foreach (var root in new[] { Registry.CurrentUser, Registry.LocalMachine })
        {
            using var k = root.OpenSubKey(key);
            if (k?.GetValue(null) is string p && File.Exists(p)) return p;
        }
        foreach (var p in new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
        })
            if (File.Exists(p)) return p;
        return null;
    }

    /// Opens the link in Google Chrome (a new tab, or a new window if Chrome wasn't running),
    /// then maximizes that window and brings it to the front before the next step runs.
    /// Falls back to the default browser when Chrome isn't installed.
    public static async Task OpenInChrome(string raw, CancellationToken ct)
    {
        var url = OpenLink.Normalized(raw) ?? throw new EngineException($"\"{raw}\" isn't a valid http(s) URL");
        var chrome = ChromePath();
        if (chrome == null)
        {
            Process.Start(new ProcessStartInfo(url.AbsoluteUri) { UseShellExecute = true })?.Dispose();
            return;
        }
        var before = ChromeWindows().ToDictionary(w => w.Hwnd, w => w.Title);
        Process.Start(new ProcessStartInfo(chrome) { UseShellExecute = false, ArgumentList = { url.AbsoluteUri } })?.Dispose();

        // Chrome tries to activate its own window, but Windows' foreground lock refuses a
        // process launched from the tray, so it only flashes in the taskbar. Find the window
        // that took the link (a new one, else the one whose tab title changed, else the
        // topmost) and activate it from here.
        nint target = 0;
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < 10_000)
        {
            ct.ThrowIfCancellationRequested();
            var now = ChromeWindows();
            var hit = now.FirstOrDefault(w => !before.ContainsKey(w.Hwnd))
                ?? now.FirstOrDefault(w => before.TryGetValue(w.Hwnd, out var t) && t != w.Title);
            if (hit != null) { target = hit.Hwnd; break; }
            if (sw.ElapsedMilliseconds > 1500 && now.Count > 0) { target = now[0].Hwnd; break; }
            await Task.Delay(100, ct);
        }
        if (target == 0) throw new EngineException("Chrome didn't open a window");

        for (int attempt = 0; attempt < 30; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            Activate(target);
            if (GetForegroundWindow() == target) break;
            await Task.Delay(100, ct);
        }
        if (GetForegroundWindow() != target) throw new EngineException("Chrome opened but couldn't be brought to the front");
        await Task.Delay(300, ct);   // let the tab settle before a click or typing step
    }

    sealed record ChromeWindow(nint Hwnd, string Title);

    /// Visible Chrome browser windows, topmost first (EnumWindows walks the Z order).
    static List<ChromeWindow> ChromeWindows()
    {
        var list = new List<ChromeWindow>();
        var pids = new Dictionary<uint, bool>();
        var cls = new StringBuilder(64);
        var title = new StringBuilder(512);
        EnumWindows((h, _) =>
        {
            if (!IsWindowVisible(h) || GetWindow(h, GW_OWNER) != 0) return true;
            cls.Clear();
            GetClassName(h, cls, cls.Capacity);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;   // Edge, VS Code etc. share this class
            GetWindowThreadProcessId(h, out var pid);
            if (!pids.TryGetValue(pid, out var isChrome))
            {
                try { using var p = Process.GetProcessById((int)pid); isChrome = p.ProcessName.Equals("chrome", StringComparison.OrdinalIgnoreCase); }
                catch (Exception) { isChrome = false; }
                pids[pid] = isChrome;
            }
            if (!isChrome) return true;
            title.Clear();
            GetWindowText(h, title, title.Capacity);
            if (title.Length > 0) list.Add(new ChromeWindow(h, title.ToString()));
            return true;
        }, 0);
        return list;
    }

    /// Maximizes and focuses a window from a background process. Sharing the foreground
    /// thread's input state is what lets SetForegroundWindow through the foreground lock.
    static void Activate(nint hwnd)
    {
        if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
        if (!IsZoomed(hwnd) && !CoversScreen(hwnd)) ShowWindow(hwnd, SW_MAXIMIZE);
        uint me = GetCurrentThreadId();
        uint fg = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        uint target = GetWindowThreadProcessId(hwnd, out _);
        bool attachFg = fg != 0 && fg != me && AttachThreadInput(me, fg, true);
        bool attachTarget = target != me && target != fg && AttachThreadInput(me, target, true);
        try
        {
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
        }
        finally
        {
            if (attachTarget) AttachThreadInput(me, target, false);
            if (attachFg) AttachThreadInput(me, fg, false);
        }
    }

    /// True for a Chrome window already in F11 full screen, which maximizing would undo.
    static bool CoversScreen(nint hwnd)
    {
        if (!GetWindowRect(hwnd, out var r)) return false;
        var screen = Screen.FromHandle(hwnd).Bounds;
        return r.Left <= screen.Left && r.Top <= screen.Top && r.Right >= screen.Right && r.Bottom >= screen.Bottom;
    }

    // ---------- Post clipboard ----------

    /// POSTs the clipboard text as-is. A JSON-looking clipboard goes as application/json.
    public static async Task PostClipboard(string raw, CancellationToken ct)
    {
        var s = raw.Trim();
        if (!Uri.TryCreate(s, UriKind.Absolute, out var url) || (url.Scheme != "http" && url.Scheme != "https"))
            throw new EngineException($"\"{s}\" isn't a valid http(s) URL");
        var text = ClipboardText.Get();
        if (text.Length == 0) throw new EngineException("The clipboard had no text to post");
        var trimmed = text.Trim();
        bool looksJson = false;
        if (trimmed.StartsWith('{') || trimmed.StartsWith('['))
        {
            try { using var _ = JsonDocument.Parse(trimmed); looksJson = true; } catch (JsonException) { }
        }
        using var content = new StringContent(text, Encoding.UTF8, looksJson ? "application/json" : "text/plain");
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(20));
        using var resp = await http.PostAsync(url, content, cts.Token);
        if (!resp.IsSuccessStatusCode)
        {
            var body = await resp.Content.ReadAsStringAsync(ct);
            throw new EngineException($"POST failed with HTTP {(int)resp.StatusCode}{(body.Length == 0 ? "" : ": " + body[..Math.Min(200, body.Length)])}");
        }
    }

    // ---------- mouse ----------

    static INPUT Mouse(uint flags) => new()
    {
        type = INPUT_MOUSE,
        U = new InputUnion { mi = new MOUSEINPUT { dwFlags = flags, dwExtraInfo = Signature } },
    };

    static void Send(params INPUT[] inputs) => SendInput((uint)inputs.Length, inputs, inputSize);

    public static async Task Click(Point p, bool right, int count, CancellationToken ct)
    {
        // Hover first: some apps only arm a control after they have seen the pointer over it.
        // SetCursorPos lands on the exact physical pixel (SendInput's absolute 0–65535 scale rounds).
        SetCursorPos(p.X, p.Y);
        Send(Mouse(MOUSEEVENTF_MOVE));   // a zero-length move so the app under it gets WM_MOUSEMOVE
        await Task.Delay(35, ct);
        uint down = right ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
        uint up = right ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
        // Once a press starts it always finishes, so a stop can never leave a button held down.
        for (int n = 1; n <= Math.Max(1, count); n++)
        {
            SetCursorPos(p.X, p.Y);
            Send(Mouse(down));
            Thread.Sleep(18);
            Send(Mouse(up));
            if (n < count) Thread.Sleep(45);
        }
    }

    // ---------- keyboard ----------

    static INPUT Key(ushort vk, ushort scan, uint flags) => new()
    {
        type = INPUT_KEYBOARD,
        U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags, dwExtraInfo = Signature } },
    };

    public static async Task Type(string text, CancellationToken ct, Action<double>? progress = null)
    {
        var chars = text.Replace("\r\n", "\n").Replace('\r', '\n');
        int total = Math.Max(1, chars.Length);
        for (int i = 0; i < chars.Length; i++)
        {
            progress?.Invoke((double)i / total);
            ct.ThrowIfCancellationRequested();
            char ch = chars[i];
            if (ch == '\n')
            {
                Press(new KeyCombo(0x0D, 0, "Enter"));
            }
            else if (char.IsHighSurrogate(ch) && i + 1 < chars.Length)
            {
                char lo = chars[++i];
                Send(Key(0, ch, KEYEVENTF_UNICODE), Key(0, lo, KEYEVENTF_UNICODE),
                     Key(0, ch, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP), Key(0, lo, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
            }
            else
            {
                Send(Key(0, ch, KEYEVENTF_UNICODE), Key(0, ch, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
            }
            await Task.Delay(12, ct);
        }
    }

    static readonly HashSet<ushort> extendedKeys = new()
    {
        0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B, 0x5C, 0x6F, 0x90, 0xA3, 0xA5,
    };

    static INPUT VkInput(ushort vk, bool up)
    {
        var flags = up ? KEYEVENTF_KEYUP : 0;
        if (extendedKeys.Contains(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
        return Key(vk, (ushort)MapVirtualKey(vk, 0), flags);
    }

    public static void Press(KeyCombo k)
    {
        var mods = new List<ushort>();
        if ((k.Mods & KeyCombo.Ctrl) != 0) mods.Add(0xA2);   // VK_LCONTROL
        if ((k.Mods & KeyCombo.Alt) != 0) mods.Add(0xA4);    // VK_LMENU
        if ((k.Mods & KeyCombo.Shift) != 0) mods.Add(0xA0);  // VK_LSHIFT
        if ((k.Mods & KeyCombo.Win) != 0) mods.Add(0x5B);    // VK_LWIN
        var list = new List<INPUT>();
        foreach (var m in mods) list.Add(VkInput(m, false));
        list.Add(VkInput(k.Vk, false));
        list.Add(VkInput(k.Vk, true));
        for (int i = mods.Count - 1; i >= 0; i--) list.Add(VkInput(mods[i], true));
        Send(list.ToArray());
    }
}

/// Parses "ctrl+shift+s", "alt f4", "enter", "win+d" and the Mac's "cmd+w" / "⌘⇧S"
/// (⌘ and cmd mean Ctrl here, so a macro made on the Mac keeps its meaning). US layout.
public readonly record struct KeyCombo(ushort Vk, int Mods, string Name)
{
    public const int Ctrl = 1, Alt = 2, Shift = 4, Win = 8;

    public string Display
    {
        get
        {
            var parts = new List<string>();
            if ((Mods & Ctrl) != 0) parts.Add("Ctrl");
            if ((Mods & Alt) != 0) parts.Add("Alt");
            if ((Mods & Shift) != 0) parts.Add("Shift");
            if ((Mods & Win) != 0) parts.Add("Win");
            parts.Add(Name);
            return string.Join("+", parts);
        }
    }

    static readonly Dictionary<char, int> modifierSymbols = new()
    {
        ['⌘'] = Ctrl, ['⇧'] = Shift, ['⌥'] = Alt, ['⌃'] = Ctrl, ['⊞'] = Win,
    };

    static readonly Dictionary<string, int> modifierWords = new()
    {
        ["cmd"] = Ctrl, ["command"] = Ctrl, ["ctrl"] = Ctrl, ["control"] = Ctrl,
        ["shift"] = Shift,
        ["alt"] = Alt, ["opt"] = Alt, ["option"] = Alt,
        ["win"] = Win, ["windows"] = Win, ["super"] = Win, ["meta"] = Win,
    };

    public static readonly Dictionary<string, (ushort Vk, string Name)> KeyTable = BuildKeys();

    static Dictionary<string, (ushort, string)> BuildKeys()
    {
        var k = new Dictionary<string, (ushort, string)>();
        for (char c = 'a'; c <= 'z'; c++) k[c.ToString()] = ((ushort)char.ToUpperInvariant(c), char.ToUpperInvariant(c).ToString());
        for (char c = '0'; c <= '9'; c++) k[c.ToString()] = (c, c.ToString());
        (string, ushort)[] punct =
        {
            ("=", 0xBB), ("-", 0xBD), ("]", 0xDD), ("[", 0xDB), ("'", 0xDE), (";", 0xBA), ("\\", 0xDC),
            (",", 0xBC), ("/", 0xBF), (".", 0xBE), ("`", 0xC0),
        };
        foreach (var (p, c) in punct) k[p] = (c, p);
        (string[], ushort, string)[] named =
        {
            (new[] { "return", "enter", "↩" }, 0x0D, "Enter"), (new[] { "tab", "⇥" }, 0x09, "Tab"),
            (new[] { "space", "spacebar" }, 0x20, "Space"), (new[] { "backspace", "⌫" }, 0x08, "Backspace"),
            (new[] { "esc", "escape", "⎋" }, 0x1B, "Esc"),
            // On a Mac keyboard "delete" is Backspace; Del / forward-delete is Delete.
            (new[] { "delete" }, 0x08, "Backspace"), (new[] { "forwarddelete", "del", "⌦" }, 0x2E, "Delete"),
            (new[] { "left", "←" }, 0x25, "Left"), (new[] { "right", "→" }, 0x27, "Right"),
            (new[] { "down", "↓" }, 0x28, "Down"), (new[] { "up", "↑" }, 0x26, "Up"),
            (new[] { "home" }, 0x24, "Home"), (new[] { "end" }, 0x23, "End"),
            (new[] { "pageup", "pgup" }, 0x21, "PageUp"), (new[] { "pagedown", "pgdn" }, 0x22, "PageDown"),
            (new[] { "insert", "ins" }, 0x2D, "Insert"), (new[] { "printscreen", "prtsc" }, 0x2C, "PrintScreen"),
        };
        foreach (var (names, c, d) in named) foreach (var n in names) k[n] = (c, d);
        for (int i = 1; i <= 24; i++) k[$"f{i}"] = ((ushort)(0x70 + i - 1), $"F{i}");
        return k;
    }

    public static KeyCombo? Parse(string raw)
    {
        int mods = 0;
        var rest = new StringBuilder();
        foreach (var ch in raw)
        {
            if (modifierSymbols.TryGetValue(ch, out var f)) mods |= f; else rest.Append(ch);
        }
        var tokens = rest.ToString().ToLowerInvariant().Split(new[] { '+', ' ' }, StringSplitOptions.RemoveEmptyEntries);
        (ushort, string)? key = null;
        foreach (var t in tokens)
        {
            if (modifierWords.TryGetValue(t, out var f)) { mods |= f; continue; }
            if (key != null || !KeyTable.TryGetValue(t, out var k)) return null;
            key = k;
        }
        // "ctrl++" splits the plus away; treat a trailing '+' as the = / + key.
        if (key == null && raw.TrimEnd().EndsWith("++")) key = KeyTable["="];
        if (key is not { } kk) return null;
        return new KeyCombo(kk.Item1, mods, kk.Item2);
    }

    /// For "Record keys": builds the text a step stores from a pressed key.
    public static string? FromKeys(System.Windows.Forms.Keys keyData)
    {
        var code = keyData & System.Windows.Forms.Keys.KeyCode;
        if (code is System.Windows.Forms.Keys.ControlKey or System.Windows.Forms.Keys.ShiftKey or System.Windows.Forms.Keys.Menu
            or System.Windows.Forms.Keys.LWin or System.Windows.Forms.Keys.RWin or System.Windows.Forms.Keys.None) return null;
        var name = KeyTable.FirstOrDefault(kv => kv.Value.Vk == (ushort)code && kv.Key.All(c => c < 128)).Key;
        if (name == null) return null;
        var parts = new List<string>();
        if (keyData.HasFlag(System.Windows.Forms.Keys.Control)) parts.Add("ctrl");
        if (keyData.HasFlag(System.Windows.Forms.Keys.Alt)) parts.Add("alt");
        if (keyData.HasFlag(System.Windows.Forms.Keys.Shift)) parts.Add("shift");
        parts.Add(name);
        return string.Join("+", parts);
    }
}
