using System.Diagnostics;
using System.Runtime.InteropServices;
using static ClickFlow.Native;

namespace ClickFlow;

public enum RunPhase { Starting, Waiting, Acting, PausingLoop }

/// The live state of a run. Written by the run thread, read by the HUD on the UI thread
/// (a torn read only ever shows one frame of a stale value).
public sealed class RunContext
{
    public string MacroName = "";
    public List<Step> Steps = new();
    public volatile int StepIndex;
    public volatile int Iteration;
    public int Iterations;
    /// Set when only one step is being tested.
    public int? TestOnly;
    /// Dry run: nothing is clicked, typed or sent; each step shows where it would act.
    public bool Preview;
    /// Real mouse / keyboard blocked for this run.
    public bool InputLocked;
    public readonly HashSet<int> Skipped = new();
    public readonly HashSet<int> Completed = new();
    public DateTime Started = DateTime.Now;
    public volatile RunPhase Phase = RunPhase.Starting;
    public DateTime PhaseStart = DateTime.Now;
    public DateTime? PhaseEnd;
    /// 0…1 for steps that report it (typing).
    public double? Progress;
    /// Text from the latest Screenshot area step in this run.
    public string? LastOutput;
    public Bitmap? LastImage;

    public int StepCount => Steps.Count;
    public Step? Step => StepIndex >= 0 && StepIndex < Steps.Count ? Steps[StepIndex] : null;
}

public sealed class RunSummary
{
    public Guid Id = Guid.NewGuid();
    public string MacroName = "";
    public RunResult Result;
    public double Duration;
    public int StepCount;
    public string? Reason;
    public string? Output;
    public Bitmap? OutputImage;
    public DateTime Shown = DateTime.Now;
}

sealed class PendingRun
{
    public Guid MacroId;
    public string MacroName = "";
    public Schedule? Schedule;
    public string? Note;
}

public sealed class BlockReason
{
    public string Text = "";
    public bool OffScreen;
}

/// Plays macros one at a time. Scheduled runs queue behind a running one and start the moment
/// they're due; manual runs are refused while anything is busy.
public sealed class Runner
{
    public static readonly Runner Shared = new();

    public RunContext? Status { get; private set; }
    public RunSummary? Summary { get; private set; }
    public bool Busy => Status != null;
    public bool IsBusy => Busy || Recorder.Shared.IsRecording;
    /// Fires on the UI thread when a run starts or ends.
    public event Action? BusyChanged;

    /// The main window's hide / restore, set by MainForm.
    public Func<bool>? HideMain;
    public Action<bool>? RestoreMain;

    readonly List<PendingRun> queue = new();
    CancellationTokenSource? cts;
    volatile bool skipRequested;

    // Esc observer for runs without the input lock (the lock handles Esc itself).
    nint escHook;
    readonly LowLevelProc escProc;

    Runner() { escProc = EscProc; }

    // ---------- entry points (UI thread) ----------

    public void RunNow(Guid id, IWin32Window? owner)
    {
        var m = Store.Shared.Macro(id);
        if (m == null) return;
        if (IsBusy) { System.Media.SystemSounds.Beep.Play(); return; }
        if (BlockReasonFor(m, null) is { } reason)
        {
            if (reason.OffScreen)
            {
                if (!Alerts.Confirm(owner, "A step points off-screen", $"{reason.Text}. The display layout may have changed since it was recorded.", "Run anyway")) return;
            }
            else { Alerts.Show(owner, $"Can't run {m.Name}", reason.Text); return; }
        }
        Start(m, RunTrigger.Manual, null, null, preview: false);
    }

    /// Plays the whole macro without executing anything: markers show where each click would
    /// land, and Skip jumps past the current step.
    public void PreviewRun(Guid id, IWin32Window? owner)
    {
        var m = Store.Shared.Macro(id);
        if (m == null) return;
        if (IsBusy) { System.Media.SystemSounds.Beep.Play(); return; }
        if (m.Steps.Count == 0) { Alerts.Show(owner, $"Can't preview {m.Name}", "The macro has no steps."); return; }
        Start(m, RunTrigger.Preview, null, null, preview: true);
    }

    public void Test(int index, Guid id)
    {
        var m = Store.Shared.Macro(id);
        if (m == null || index < 0 || index >= m.Steps.Count) return;
        if (IsBusy) { System.Media.SystemSounds.Beep.Play(); return; }
        Start(m, RunTrigger.Test, index, null, preview: false);
    }

    /// Skip the rest of the current step (preview only).
    public void SkipStep()
    {
        if (Status?.Preview == true) skipRequested = true;
    }

    /// --preview-hud: plays a harmless macro (waits + in-place moves, nothing clicked, typed or
    /// sent, nothing saved) so the run HUD can be looked at.
    public void PreviewHud()
    {
        if (IsBusy) return;
        var here = CursorPos();
        Step Move(string name, double delay) => new(StepType.Move) { Name = name, X = here.X, Y = here.Y, DelayBefore = delay };
        Step Wait(string name, double s) => new(StepType.Wait) { Name = name, Seconds = s };
        var m = new Macro
        {
            Name = "HUD preview",
            Steps =
            {
                new Step(StepType.ReadText) { Name = "Send Current Clock-in Status to Discord", X = here.X, Y = here.Y, DelayBefore = 0.4, SendDiscord = true },
                Move("Open the timesheet", 0.6),
                Wait("Wait for the page to load", 3),
                Move("Hover the Clock Out button", 1.2),
                Wait("", 2),
                Move("Point at the confirm dialog with a deliberately long step name that has to truncate", 0.8),
                Wait("Let it settle", 1.5),
            },
        };
        Start(m, RunTrigger.Preview, null, "HUD preview", preview: true, log: false);
    }

    public void EnqueueScheduled(Macro m, Schedule s, string? note)
    {
        if (queue.Any(p => p.MacroId == m.Id))
        {
            Log(m.Id, m.Name, RunTrigger.Scheduled, RunResult.Skipped, "Already queued", DateTime.Now);
            return;
        }
        queue.Add(new PendingRun { MacroId = m.Id, MacroName = m.Name, Schedule = s, Note = note });
        Pump();
    }

    public void Stop() => cts?.Cancel();

    /// Hotkey / Esc: stop what's running and drop everything waiting behind it.
    public void EmergencyStop()
    {
        foreach (var p in queue)
            Log(p.MacroId, p.MacroName, RunTrigger.Scheduled, RunResult.Skipped, "Dropped by emergency stop", DateTime.Now);
        queue.Clear();
        Stop();
    }

    public void ResumeQueue() => Pump();

    void Pump()
    {
        if (IsBusy || queue.Count == 0) return;
        var p = queue[0];
        queue.RemoveAt(0);
        var m = Store.Shared.Macro(p.MacroId);
        if (m == null) { Pump(); return; }
        if (BlockReasonFor(m, p.Schedule) is { } reason)
        {
            Log(m.Id, m.Name, RunTrigger.Scheduled, RunResult.Skipped, reason.Text, DateTime.Now);
            Pump();
            return;
        }
        // Enabled means go: no "About to run" countdown, it starts straight away.
        Start(m, RunTrigger.Scheduled, null, p.Note, preview: false);
    }

    // ---------- playback ----------

    void Start(Macro source, RunTrigger trigger, int? onlyStep, string? note, bool preview, bool log = true)
    {
        // A snapshot: editing the macro mid-run never changes the run.
        var m = source.DeepCopy();
        var started = DateTime.Now;
        int iterations = onlyStep == null ? m.RepeatCount : 1;
        var st = new RunContext
        {
            MacroName = m.Name, Steps = m.Steps, Iterations = iterations, TestOnly = onlyStep, Preview = preview,
            StepIndex = onlyStep ?? 0, Started = started,
        };
        Summary = null;
        Status = st;
        cts = new CancellationTokenSource();
        var ct = cts.Token;
        Hud.Shared.ShowRun();
        InstallEsc();
        Power.KeepDisplayAwake(true);
        bool hid = Store.Shared.Prefs.HideWindowDuringRuns && (HideMain?.Invoke() ?? false);
        // Lock real input for real runs only: Preview and step tests need the mouse for Skip / Stop.
        if (Store.Shared.Prefs.LockInputDuringRuns && !preview && onlyStep == null)
            st.InputLocked = InputLock.Engage();
        BusyChanged?.Invoke();

        Task.Run(async () =>
        {
            var result = RunResult.Completed;
            string? reason = note;
            bool shutDown = false;
            try
            {
                if (hid) await Task.Delay(350, ct);
                for (int it = 0; iterations == 0 || it < iterations; it++)
                {
                    if (it > 0 && m.RepeatDelay > 0)
                    {
                        st.StepIndex = 0;
                        skipRequested = false;
                        SetPhase(st, RunPhase.PausingLoop, m.RepeatDelay);
                        await Sleep(m.RepeatDelay, ct);
                    }
                    lock (st) { st.Skipped.Clear(); st.Completed.Clear(); }
                    st.Iteration = it;
                    for (int i = 0; i < m.Steps.Count; i++)
                    {
                        if (onlyStep is { } only && i != only) continue;
                        ct.ThrowIfCancellationRequested();
                        var step = m.Steps[i];
                        st.StepIndex = i;
                        st.Progress = null;
                        skipRequested = false;
                        // Testing a single step never powers the machine off.
                        bool ghost = preview || step.ShowOnly || (onlyStep != null && step.Type == StepType.Shutdown);
                        int number = i + 1;
                        // Show the target from the moment the step is up, so the countdown has a place.
                        if (ghost && step.Type.HasPoint()) UI.Post(() => Ghost.ShowPoint(step, number));
                        if (ghost && step.Type.HasArea()) UI.Post(() => Ghost.ShowArea(step, number));
                        try
                        {
                            double delay = step.Type == StepType.Wait ? step.Seconds : (onlyStep == null ? step.DelayBefore : 0);
                            if (delay > 0)
                            {
                                SetPhase(st, RunPhase.Waiting, delay);
                                await Sleep(delay, ct);
                            }
                            if (skipRequested)
                            {
                                lock (st) st.Skipped.Add(i);
                            }
                            else if (step.Type != StepType.Wait && ghost)
                            {
                                // Hold long enough to read where it would have acted.
                                double hold = step.Type.HasPoint() ? 0.9 : 0.7;
                                SetPhase(st, RunPhase.Acting, hold);
                                await Sleep(hold, ct);
                                if (skipRequested) lock (st) st.Skipped.Add(i);
                            }
                            else if (step.Type != StepType.Wait)
                            {
                                SetPhase(st, RunPhase.Acting, null);
                                if (step.Type.PostsInput() && ScreenLocked())
                                    throw new EngineException("The screen is locked");
                                bool dodged = step.Type.HasPoint() && UI.Send(() => Hud.Shared.Dodge(step.Point));
                                ClickEngine.LastCapture = null;
                                if (step.Type == StepType.Shutdown && step.OnlyIfServo
                                    && await ClickEngine.ServoDidNotStartPc(ct) is { } keepOn)
                                {
                                    // Not a failure: the PC was on before the servo's slot, so leave it on
                                    // and carry on with any steps after this one.
                                    reason = $"Didn't shut down: {keepOn}";
                                    if (Discord.WebhookUrl != null)
                                    {
                                        using var cap = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                                        try { await Discord.SendText($"{m.Name}: didn't shut down, {keepOn}", cap.Token); } catch (Exception) { }
                                    }
                                    lock (st) st.Completed.Add(i);
                                    continue;
                                }
                                var outText = await ClickEngine.Perform(step, st, ct, p => st.Progress = Math.Floor(p * 100) / 100);
                                if (step.Type == StepType.Shutdown)
                                {
                                    // Nothing after it can run: end the run so it is logged first.
                                    lock (st) st.Completed.Add(i);
                                    shutDown = true;
                                    break;
                                }
                                if (outText != null)
                                {
                                    st.LastOutput = outText;
                                    UI.Post(() => StepOutputs.Text[step.Id] = outText);
                                }
                                if (step.Type == StepType.ReadText)
                                {
                                    var img = ClickEngine.LastCapture;
                                    st.LastImage = img;
                                    UI.Post(() =>
                                    {
                                        StepOutputs.Text[step.Id] = outText ?? "";
                                        if (img != null) StepOutputs.Images[step.Id] = img;
                                        StepOutputs.Changed?.Invoke(step.Id);
                                    });
                                }
                                if (step.Type.IsClick() && Store.Shared.Prefs.ShowClickRing) UI.Post(() => ClickRing.Show(step.Point));
                                if (dodged)
                                {
                                    await Task.Delay(150, CancellationToken.None);
                                    UI.Post(() => Hud.Shared.Undodge());
                                }
                            }
                        }
                        finally
                        {
                            if (ghost) UI.Post(Ghost.Hide);
                        }
                        lock (st) st.Completed.Add(i);
                    }
                    if (shutDown) break;
                }
            }
            catch (OperationCanceledException)
            {
                result = RunResult.Stopped;
                var title = st.Step?.Title(st.StepIndex + 1) ?? $"Step {st.StepIndex + 1}";
                reason = $"Stopped at {title} (of {st.StepCount})";
            }
            catch (Exception e)
            {
                result = RunResult.Failed;
                reason = (st.Step is { } s ? $"{s.Title(st.StepIndex + 1)}: " : "") + e.Message;
            }
            if (shutDown) reason = "Forced shutdown";
            UI.Post(() =>
            {
                Finish(m, st, trigger, started, result, reason, hid, log);
                // Log posts to the UI thread too, so flush on the next turn.
                if (shutDown) UI.Post(() => { Store.Shared.Flush(); Power.ForceShutDown(); });
            });
        });
    }

    static void SetPhase(RunContext st, RunPhase p, double? duration)
    {
        var now = DateTime.Now;
        st.PhaseStart = now;
        st.PhaseEnd = duration is { } d ? now.AddSeconds(d) : null;
        st.Phase = p;
    }

    /// Sliced sleep: throws the moment the run is cancelled (Stop is instant even mid-wait)
    /// and returns early when Skip is pressed.
    async Task Sleep(double seconds, CancellationToken ct)
    {
        var end = DateTime.Now.AddSeconds(Math.Max(0, seconds));
        while (!skipRequested)
        {
            var left = (end - DateTime.Now).TotalSeconds;
            if (left <= 0) return;
            await Task.Delay(TimeSpan.FromSeconds(Math.Min(left, 0.05)), ct);
        }
    }

    void Finish(Macro m, RunContext st, RunTrigger trigger, DateTime started, RunResult result, string? reason, bool restoreWindow, bool log)
    {
        var read = st.LastOutput is { } o ? "Read: “" + Trunc(o.Replace("\r", "").Replace("\n", " ⏎ "), 300) + "”" : null;
        var full = string.Join(" · ", new[] { reason, read }.Where(x => !string.IsNullOrEmpty(x)));
        if (log) Log(m.Id, m.Name, trigger, result, full.Length == 0 ? null : full, started, DateTime.Now);
        Summary = new RunSummary
        {
            MacroName = m.Name, Result = result, Duration = (DateTime.Now - started).TotalSeconds,
            StepCount = st.TestOnly == null ? st.StepCount : 1, Reason = result == RunResult.Completed ? null : reason,
            Output = st.LastOutput, OutputImage = st.LastImage,
        };
        InputLock.Release();
        Ghost.Hide();
        Hud.Shared.Undodge();
        Status = null;
        cts?.Dispose();
        cts = null;
        Power.KeepDisplayAwake(false);
        RemoveEsc();
        if (restoreWindow) RestoreMain?.Invoke(trigger != RunTrigger.Scheduled);
        Hud.Shared.ShowSummary(Summary);
        BusyChanged?.Invoke();
        Pump();
    }

    static string Trunc(string s, int n) => s.Length <= n ? s : s[..n];

    // ---------- Esc to stop ----------

    void InstallEsc()
    {
        if (escHook != 0) return;
        escHook = SetWindowsHookEx(WH_KEYBOARD_LL, escProc, GetModuleHandle(null), 0);
    }

    void RemoveEsc()
    {
        if (escHook != 0) UnhookWindowsHookEx(escHook);
        escHook = 0;
    }

    nint EscProc(int nCode, nint wParam, nint lParam)
    {
        if (nCode >= 0 && (int)wParam is WM_KEYDOWN or WM_SYSKEYDOWN)
        {
            var k = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            if (k.vkCode == 0x1B && (k.flags & LLKHF_INJECTED) == 0) UI.Post(Stop);
        }
        return CallNextHookEx(escHook, nCode, wParam, lParam);
    }

    // ---------- checks ----------

    public BlockReason? BlockReasonFor(Macro m, Schedule? schedule)
    {
        if (m.Steps.Count == 0) return new BlockReason { Text = "The macro has no steps" };
        if (m.Steps.Any(s => !s.ShowOnly && s.Type.PostsInput()) && ScreenLocked())
            return new BlockReason { Text = "The screen was locked" };
        if (m.Steps.Any(s => !s.ShowOnly && s.Type.HasArea()) && !ScreenText.OcrAvailable)
            return new BlockReason { Text = "Windows OCR isn't available for any installed language" };
        if (m.Steps.Any(s => !s.ShowOnly && (s.Type == StepType.DiscordMessage || (s.Type == StepType.ReadText && s.SendDiscord)))
            && Discord.WebhookUrl == null)
            return new BlockReason { Text = "No Discord webhook set (Settings › Discord)" };
        if (schedule?.Conditions is { } c)
        {
            var app = (c.RequireApp ?? "").Trim();
            if (app.Length > 0)
            {
                if (c.RequireFrontmost)
                {
                    if (!AppMatch.Frontmost(app)) return new BlockReason { Text = $"{app} wasn't the frontmost app" };
                }
                else if (!AppMatch.Running(app)) return new BlockReason { Text = $"{app} wasn't running" };
            }
            if (c.MinIdleSeconds is int need && need > 0)
            {
                var idle = IdleSeconds();
                if (idle < need) return new BlockReason { Text = $"You were using the PC (idle {(int)idle}s, needs {need}s)" };
            }
        }
        for (int i = 0; i < m.Steps.Count; i++)
        {
            var s = m.Steps[i];
            if (s.Type.HasPoint() && !s.ShowOnly && !Screens.OnScreen(s.Point))
                return new BlockReason { Text = $"{s.Title(i + 1)} points at {Fmt.Coord(s.X)}, {Fmt.Coord(s.Y)}, which is off every display", OffScreen = true };
        }
        return null;
    }

    // ---------- history ----------

    static void Log(Guid id, string name, RunTrigger trigger, RunResult result, string? reason, DateTime start, DateTime? end = null) =>
        Store.Shared.Log(new RunRecord { MacroId = id, MacroName = name, Trigger = trigger, Start = start, End = end, Result = result, Reason = reason });

    /// Scheduler entry for runs it decides not to start (missed, paused…).
    public void LogSkip(Macro m, string reason, DateTime at) => Log(m.Id, m.Name, RunTrigger.Scheduled, RunResult.Skipped, reason, at);
}

/// What each Screenshot area step last read, for its card in the editor.
public static class StepOutputs
{
    public static readonly Dictionary<Guid, string> Text = new();
    public static readonly Dictionary<Guid, Bitmap> Images = new();
    public static Action<Guid>? Changed;
}

public static class Screens
{
    public static bool OnScreen(Point p) => Screen.AllScreens.Any(s => s.Bounds.Contains(p));
    public static bool OnScreen(Rectangle r) => Screen.AllScreens.Any(s => s.Bounds.IntersectsWith(r));
    public static Screen At(Point p) => Screen.AllScreens.FirstOrDefault(s => s.Bounds.Contains(p)) ?? Screen.PrimaryScreen!;
}

/// "chrome", "chrome.exe" or "Google Chrome" all match Chrome.
public static class AppMatch
{
    static string Norm(string s)
    {
        var t = s.Trim();
        return t.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? t[..^4] : t;
    }

    static bool Matches(Process p, string app)
    {
        var want = Norm(app);
        if (p.ProcessName.Equals(want, StringComparison.OrdinalIgnoreCase)) return true;
        try
        {
            var v = p.MainModule?.FileVersionInfo;
            return v != null && (string.Equals(v.ProductName, want, StringComparison.OrdinalIgnoreCase)
                || string.Equals(v.FileDescription, want, StringComparison.OrdinalIgnoreCase));
        }
        catch (Exception) { return false; }   // other users' / elevated processes
    }

    public static bool Running(string app)
    {
        var want = Norm(app);
        var procs = Process.GetProcesses();
        try
        {
            if (procs.Any(p => p.ProcessName.Equals(want, StringComparison.OrdinalIgnoreCase))) return true;
            return procs.Where(p => p.MainWindowHandle != 0).Any(p => Matches(p, app));
        }
        finally { foreach (var p in procs) p.Dispose(); }
    }

    public static bool Frontmost(string app)
    {
        GetWindowThreadProcessId(GetForegroundWindow(), out var pid);
        try { using var p = Process.GetProcessById((int)pid); return Matches(p, app); }
        catch (Exception) { return false; }
    }
}
