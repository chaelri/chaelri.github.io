using System.Runtime.InteropServices;
using static ClickFlow.Native;

namespace ClickFlow;

/// Blocks the real mouse, touchpad and keyboard while a macro runs, so a stray touch can't
/// land in the middle of it. ClickFlow's own SendInput events pass (they carry its signature).
///
/// Always let through / handled:
///   Esc            → stop the run (and unlock)
///   Ctrl+Alt+.     → stop the run (the hotkey never fires while the hook drops it)
///   Alt+F4         → stop the run; swallowed so it doesn't close the app the macro is driving
///   Ctrl+Alt+Del   → can't be hooked at all: Windows' own last resort always works
///
/// Fail-safes: the hooks only exist during a run; Windows silently removes a low-level hook
/// whose callback stalls (LowLevelHooksTimeout); the hooks die with the process; and a 1 s
/// watchdog releases them if no run is active.
public static class InputLock
{
    static nint mouseHook, keyHook;
    static readonly LowLevelProc mouseProc = MouseProc, keyProc = KeyProc;
    static System.Windows.Forms.Timer? watchdog;
    static bool ctrl, alt, shift;
    public static bool Engaged { get; private set; }
    /// Set by the app: what to do when Esc / the stop combo is pressed while locked.
    public static Action? OnStop;
    public static Func<bool>? StillRunning;

    /// Must be called on the UI thread (the hooks run on the thread that installed them).
    public static bool Engage()
    {
        if (Engaged) return true;
        var mod = GetModuleHandle(null);
        mouseHook = SetWindowsHookEx(WH_MOUSE_LL, mouseProc, mod, 0);
        keyHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyProc, mod, 0);
        if (mouseHook == 0 || keyHook == 0) { Release(); return false; }
        ctrl = alt = shift = false;
        Engaged = true;
        watchdog = new System.Windows.Forms.Timer { Interval = 1000 };
        watchdog.Tick += (_, _) => { if (StillRunning?.Invoke() != true) Release(); };
        watchdog.Start();
        return true;
    }

    public static void Release()
    {
        watchdog?.Stop();
        watchdog?.Dispose();
        watchdog = null;
        Engaged = false;
        if (mouseHook != 0) { UnhookWindowsHookEx(mouseHook); mouseHook = 0; }
        if (keyHook != 0) { UnhookWindowsHookEx(keyHook); keyHook = 0; }
    }

    static nint MouseProc(int nCode, nint wParam, nint lParam)
    {
        if (nCode < 0 || !Engaged) return CallNextHookEx(mouseHook, nCode, wParam, lParam);
        var m = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
        bool injected = (m.flags & LLMHF_INJECTED) != 0;
        // Ours (signed SendInput, or the cursor jump from SetCursorPos) passes; the real mouse doesn't.
        if (injected && (m.dwExtraInfo == Signature || (int)wParam == WM_MOUSEMOVE))
            return CallNextHookEx(mouseHook, nCode, wParam, lParam);
        return 1;
    }

    static nint KeyProc(int nCode, nint wParam, nint lParam)
    {
        if (nCode < 0 || !Engaged) return CallNextHookEx(keyHook, nCode, wParam, lParam);
        var k = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
        if ((k.flags & LLKHF_INJECTED) != 0 && k.dwExtraInfo == Signature)
            return CallNextHookEx(keyHook, nCode, wParam, lParam);

        int msg = (int)wParam;
        bool down = msg is WM_KEYDOWN or WM_SYSKEYDOWN;
        // Swallowed keys never reach the system's key state, so modifiers are tracked here.
        switch (k.vkCode)
        {
            case 0x11 or 0xA2 or 0xA3: ctrl = down; break;
            case 0x12 or 0xA4 or 0xA5: alt = down; break;
            case 0x10 or 0xA0 or 0xA1: shift = down; break;
        }
        if (down)
        {
            bool stops = k.vkCode == 0x1B                       // Esc
                || (k.vkCode == 0xBE && ctrl && alt)            // Ctrl+Alt+.
                || (k.vkCode == 0x73 && alt);                   // Alt+F4
            if (stops) UI.Post(() => { Release(); OnStop?.Invoke(); });
        }
        return 1;
    }
}
