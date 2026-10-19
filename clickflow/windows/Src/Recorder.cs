using System.Diagnostics;
using System.Runtime.InteropServices;
using static ClickFlow.Native;

namespace ClickFlow;

/// Records real clicks into steps, with the real gaps between them as Wait steps. Clicks on
/// ClickFlow's own windows (the HUD's Stop button) are never recorded.
public sealed class Recorder
{
    public static readonly Recorder Shared = new();

    public bool IsRecording { get; private set; }
    public readonly List<Step> Steps = new();
    public int ClickCount => Steps.Count(s => s.Type.IsClick());
    public event Action? Changed;

    nint mouseHook, keyHook;
    readonly LowLevelProc mouseProc, keyProc;
    uint? lastTime;
    uint lastLeftTime;
    Point lastLeftPoint;
    int leftClicks;
    Action<List<Step>>? onFinish;
    static readonly uint ownPid = (uint)Environment.ProcessId;

    Recorder()
    {
        mouseProc = MouseProc;
        keyProc = KeyProc;
    }

    /// UI thread only.
    public void Start(Action<List<Step>> finish)
    {
        if (IsRecording) return;
        Steps.Clear();
        lastTime = null;
        leftClicks = 0;
        onFinish = finish;
        var mod = GetModuleHandle(null);
        mouseHook = SetWindowsHookEx(WH_MOUSE_LL, mouseProc, mod, 0);
        keyHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyProc, mod, 0);
        IsRecording = true;
        Changed?.Invoke();
    }

    static bool IsOwnWindow(Point p)
    {
        var h = WindowFromPoint(new POINT { X = p.X, Y = p.Y });
        if (h == 0) return false;
        GetWindowThreadProcessId(GetAncestor(h, GA_ROOT), out var pid);
        return pid == ownPid;
    }

    nint MouseProc(int nCode, nint wParam, nint lParam)
    {
        if (nCode >= 0 && IsRecording)
        {
            int msg = (int)wParam;
            if (msg is WM_LBUTTONDOWN or WM_RBUTTONDOWN)
            {
                var m = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                bool ours = (m.flags & LLMHF_INJECTED) != 0 && m.dwExtraInfo == Signature;
                var p = new Point(m.pt.X, m.pt.Y);
                if (!ours && !IsOwnWindow(p))
                {
                    var t = m.time;
                    UI.Post(() => Handle(msg == WM_RBUTTONDOWN, p, t));
                }
            }
        }
        return CallNextHookEx(mouseHook, nCode, wParam, lParam);
    }

    nint KeyProc(int nCode, nint wParam, nint lParam)
    {
        if (nCode >= 0 && IsRecording && (int)wParam is WM_KEYDOWN or WM_SYSKEYDOWN)
        {
            var k = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            if (k.vkCode == 0x1B && (k.flags & LLKHF_INJECTED) == 0) UI.Post(Stop);
        }
        return CallNextHookEx(keyHook, nCode, wParam, lParam);
    }

    void Handle(bool right, Point p, uint time)
    {
        if (!IsRecording) return;
        if (!right)
        {
            // The second press of a double-click upgrades the click before it.
            bool sameSpot = Math.Abs(p.X - lastLeftPoint.X) <= GetSystemMetrics(SM_CXDOUBLECLK) / 2
                && Math.Abs(p.Y - lastLeftPoint.Y) <= GetSystemMetrics(SM_CYDOUBLECLK) / 2;
            if (leftClicks > 0 && unchecked(time - lastLeftTime) <= GetDoubleClickTime() && sameSpot)
            {
                leftClicks++;
                if (leftClicks == 2 && Steps.Count > 0 && Steps[^1].Type == StepType.LeftClick)
                    Steps[^1].Type = StepType.DoubleClick;
                lastLeftTime = time;
                lastTime = time;
                Changed?.Invoke();
                return;
            }
            leftClicks = 1;
            lastLeftTime = time;
            lastLeftPoint = p;
        }
        else leftClicks = 0;

        if (lastTime is { } t0)
        {
            double gap = Math.Round(unchecked(time - t0) / 100.0) / 10;
            if (gap >= 0.1) Steps.Add(new Step(StepType.Wait) { Seconds = gap });
        }
        Steps.Add(new Step(right ? StepType.RightClick : StepType.LeftClick) { X = p.X, Y = p.Y });
        lastTime = time;
        Changed?.Invoke();
    }

    public void Stop()
    {
        if (!IsRecording) return;
        if (mouseHook != 0) UnhookWindowsHookEx(mouseHook);
        if (keyHook != 0) UnhookWindowsHookEx(keyHook);
        mouseHook = keyHook = 0;
        IsRecording = false;
        var result = Steps.Select(s => s.Clone()).ToList();
        var done = onFinish;
        onFinish = null;
        Changed?.Invoke();
        done?.Invoke(result);
        Runner.Shared.ResumeQueue();
    }
}
