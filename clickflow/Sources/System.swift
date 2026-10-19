import AppKit
import SwiftUI
import ApplicationServices
import ServiceManagement
import IOKit.pwr_mgt
import Carbon.HIToolbox

// MARK: - Permissions

@MainActor
final class PermissionMonitor: ObservableObject {
    static let shared = PermissionMonitor()

    @Published private(set) var accessibility = AXIsProcessTrusted()
    @Published private(set) var screenRecording = CGPreflightScreenCaptureAccess()
    private var timer: Timer?

    func start() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { _ in
            MainActor.assumeIsolated { PermissionMonitor.shared.refresh() }
        }
    }

    func refresh() {
        let a = AXIsProcessTrusted()
        if a != accessibility { accessibility = a }
        let s = CGPreflightScreenCaptureAccess()
        if s != screenRecording { screenRecording = s }
    }

    /// Adds ClickFlow to the Accessibility list (switched off) and opens that pane.
    static func requestAccessibility() {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
        open("Privacy_Accessibility")
    }

    static func requestScreenRecording() {
        if !CGRequestScreenCaptureAccess() { open("Privacy_ScreenCapture") }
    }

    static func open(_ anchor: String) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)") {
            NSWorkspace.shared.open(url)
        }
    }
}

@MainActor
final class LoginItem: ObservableObject {
    static let shared = LoginItem()
    @Published private(set) var enabled = SMAppService.mainApp.status == .enabled
    @Published private(set) var error: String?

    func set(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        enabled = SMAppService.mainApp.status == .enabled
    }

    var binding: Binding<Bool> {
        Binding(get: { self.enabled }, set: { self.set($0) })
    }
}

enum SystemState {
    static var screenLocked: Bool {
        guard let d = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
        if let b = d["CGSSessionScreenIsLocked"] as? Bool { return b }
        if let n = d["CGSSessionScreenIsLocked"] as? NSNumber { return n.boolValue }
        return false
    }

    /// Seconds since the last real keyboard / mouse input.
    static var idleSeconds: Double {
        // kCGAnyInputEventType
        CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
    }
}

// MARK: - Power

final class PowerAssertion {
    private let type: String
    private let reason: String
    private var id: IOPMAssertionID = 0
    private(set) var held = false

    init(type: String, reason: String) {
        self.type = type
        self.reason = reason
    }

    func set(_ on: Bool) {
        if on, !held {
            held = IOPMAssertionCreateWithName(type as CFString, IOPMAssertionLevel(kIOPMAssertionLevelOn),
                                               reason as CFString, &id) == kIOReturnSuccess
        } else if !on, held {
            IOPMAssertionRelease(id)
            held = false
        }
    }
}

// MARK: - Global emergency-stop hotkey

/// ⌃⌥⌘. through Carbon's RegisterEventHotKey: it fires whichever app is focused and
/// needs no permission of its own.
enum HotKey {
    static let display = "⌃⌥⌘."
    nonisolated(unsafe) private static var handler: (() -> Void)?
    nonisolated(unsafe) private static var ref: EventHotKeyRef?

    static func register(_ h: @escaping () -> Void) {
        handler = h
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
            DispatchQueue.main.async { HotKey.handler?() }
            return noErr
        }, 1, &spec, nil, nil)
        let id = EventHotKeyID(signature: OSType(0x434C_4B46), id: 1)  // 'CLKF'
        RegisterEventHotKey(UInt32(kVK_ANSI_Period), UInt32(cmdKey | optionKey | controlKey),
                            id, GetApplicationEventTarget(), 0, &ref)
    }
}

// MARK: - Main window

@MainActor
enum WindowManager {
    static var openAction: OpenWindowAction?

    static var main: NSWindow? {
        NSApp.windows.first { $0.identifier?.rawValue.hasPrefix("main") == true }
    }

    static func show() {
        NSApp.setActivationPolicy(.regular)
        if let w = main, w.isVisible || w.isMiniaturized {
            w.deminiaturize(nil)
            w.makeKeyAndOrderFront(nil)
        } else if let open = openAction {
            open(id: "main")
        } else {
            main?.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Gets the window out of the way of a run / pick / recording. Returns whether it was showing.
    static func hideMain() -> Bool {
        guard let w = main, w.isVisible else { return false }
        w.orderOut(nil)
        NSApp.deactivate()
        return true
    }

    static func restoreMain(activate: Bool) {
        guard let w = main else { return }
        if activate {
            w.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        } else {
            w.orderFront(nil)
        }
    }

    /// Drop the Dock icon while only the menu bar item is left.
    static func observe() {
        NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: nil, queue: .main) { n in
            MainActor.assumeIsolated {
                guard let w = n.object as? NSWindow, w.identifier?.rawValue.hasPrefix("main") == true else { return }
                NSApp.setActivationPolicy(.accessory)
            }
        }
    }
}
