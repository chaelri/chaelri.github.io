import AppKit
import CoreGraphics

/// Blocks the real mouse, trackpad and keyboard while a macro runs, so a stray touch can't
/// land in the middle of it. ClickFlow's own synthetic events pass (they carry its pid).
///
/// Always let through / handled:
///   esc       → stop the run (and unlock)
///   ⌃⌥⌘.      → stop the run (the Carbon hotkey never sees it while the tap drops it)
///   ⌘Q        → stop the run; swallowed so it doesn't quit the app the macro is driving
///   ⌘⌥esc     → passed through untouched (Force Quit, the system's own last resort)
///
/// Fail-safes: the tap only exists during a run; macOS disables a tap whose callback stalls
/// (we re-enable it only while still locked); the tap dies with the process; and a 1 s
/// watchdog releases it if no run is active.
@MainActor
enum InputLock {
    nonisolated(unsafe) private static var tap: CFMachPort?
    nonisolated(unsafe) private static var source: CFRunLoopSource?
    nonisolated(unsafe) private(set) static var engaged = false
    private static var watchdog: Timer?

    static func engage() -> Bool {
        guard !engaged, AXIsProcessTrusted() else { return engaged }
        guard let t = CGEvent.tapCreate(tap: .cghidEventTap, place: .headInsertEventTap, options: .defaultTap,
                                        eventsOfInterest: CGEventMask(UInt64.max), callback: inputLockCallback,
                                        userInfo: nil) else { return false }
        tap = t
        source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, t, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: t, enable: true)
        engaged = true
        watchdog = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            MainActor.assumeIsolated {
                if Runner.shared.status == nil { InputLock.release() }
            }
        }
        return true
    }

    static func release() {
        watchdog?.invalidate()
        watchdog = nil
        guard engaged else { return }
        engaged = false
        if let t = tap { CGEvent.tapEnable(tap: t, enable: false); CFMachPortInvalidate(t) }
        if let s = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), s, .commonModes) }
        tap = nil
        source = nil
    }

    /// `--lock-test`: lock for under a second, check our own pointer move still lands, unlock.
    static func selfTest() async -> [String] {
        var out: [String] = []
        let start = Geo.mouse
        let ok = engage()
        out.append(ok ? "PASS lock engaged" : "FAIL lock could not engage (Accessibility?)")
        let target = CGPoint(x: start.x + 37, y: start.y)
        CGEvent(mouseEventSource: CGEventSource(stateID: .hidSystemState), mouseType: .mouseMoved,
                mouseCursorPosition: target, mouseButton: .left)?.post(tap: .cghidEventTap)
        try? await Task.sleep(nanoseconds: 300_000_000)
        let moved = Geo.mouse
        out.append(abs(moved.x - target.x) < 1 && abs(moved.y - target.y) < 1
                   ? "PASS ClickFlow's own events pass through the lock"
                   : "FAIL own move blocked (pointer at \(moved), wanted \(target))")
        release()
        out.append(engaged ? "FAIL still locked" : "PASS unlocked")
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: start, mouseButton: .left)?
            .post(tap: .cghidEventTap)
        return out
    }

    /// Called from the tap when a re-enable is needed after macOS switched it off.
    nonisolated static func reenable() {
        if engaged, let t = tap { CGEvent.tapEnable(tap: t, enable: true) }
    }
}

private func inputLockCallback(_ proxy: CGEventTapProxy, _ type: CGEventType, _ event: CGEvent,
                               _ refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        InputLock.reenable()
        return Unmanaged.passUnretained(event)
    }
    // Our own clicks and typing.
    if event.getIntegerValueField(.eventSourceUnixProcessID) == Int64(getpid()) {
        return Unmanaged.passUnretained(event)
    }
    guard InputLock.engaged else { return Unmanaged.passUnretained(event) }

    if type == .keyDown {
        let code = event.getIntegerValueField(.keyboardEventKeycode)
        let f = event.flags
        let cmd = f.contains(.maskCommand), opt = f.contains(.maskAlternate), ctrl = f.contains(.maskControl)
        if code == 53, cmd, opt { return Unmanaged.passUnretained(event) }   // ⌘⌥esc: Force Quit
        let stops = code == 53 || (code == 47 && cmd && opt && ctrl) || (code == 12 && cmd)
        if stops {
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    InputLock.release()
                    Recorder.shared.stop()
                    Runner.shared.emergencyStop()
                }
            }
        }
        return nil
    }
    return nil   // every other real mouse / keyboard / scroll / gesture event
}
