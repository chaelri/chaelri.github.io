import SwiftUI
import AppKit

@main
struct ClickFlowApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var runner = Runner.shared
    @StateObject private var recorder = Recorder.shared

    init() {
        if CommandLine.arguments.contains("--selftest") { exit(SelfTest.run() ? 0 : 1) }
    }

    var body: some Scene {
        Window("ClickFlow", id: "main") {
            MainView()
                .frame(minWidth: 880, minHeight: 560)
        }
        .defaultSize(width: 1060, height: 720)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Macro") { Store.shared.newMacro() }
                    .keyboardShortcut("n")
                Button("Import Macros…") { Store.shared.importMacros() }
                    .keyboardShortcut("i", modifiers: [.command, .shift])
                Button("Export All Macros…") { Store.shared.export(Store.shared.macros) }
                    .keyboardShortcut("e", modifiers: [.command, .shift])
            }
            CommandMenu("Macro") {
                Button("Record New Macro") { MainView.recordNew() }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
                Button("Run Selected") {
                    if case .macro(let id) = AppState.shared.selection { Runner.shared.runNow(id) }
                }
                .keyboardShortcut("r")
                Button("Preview Selected (nothing is clicked)") {
                    if case .macro(let id) = AppState.shared.selection { Runner.shared.previewRun(id) }
                }
                .keyboardShortcut("r", modifiers: [.command, .option])
                Button("Stop  \(HotKey.display)") { Runner.shared.emergencyStop() }
                    .keyboardShortcut(".")
            }
        }

        MenuBarExtra {
            MenuBarMenu()
        } label: {
            Image(systemName: runner.busy || recorder.isRecording ? "record.circle.fill" : "cursorarrow.click.2")
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        _ = Store.shared
        HotKey.register {
            MainActor.assumeIsolated {
                Recorder.shared.stop()
                Runner.shared.emergencyStop()
            }
        }
        PermissionMonitor.shared.start()
        WindowManager.observe()
        Scheduler.shared.start()

        if let i = CommandLine.arguments.firstIndex(of: "--set-discord-webhook"), i + 1 < CommandLine.arguments.count {
            let url = CommandLine.arguments[i + 1]
            let ok = Discord.isValidWebhook(url)
            if ok { Discord.webhookURL = url }
            let send = CommandLine.arguments.contains("--send-test")
            Task { @MainActor in
                var lines = [ok ? "saved" : "invalid webhook URL"]
                if ok, send {
                    do { try await Discord.send(png: SettingsView.testImage(), caption: "ClickFlow test image"); lines.append("test sent") }
                    catch { lines.append("test failed: \(error.localizedDescription)") }
                }
                try? lines.joined(separator: "\n").write(to: Store.shared.directory.appendingPathComponent("discord-setup.txt"),
                                                         atomically: true, encoding: .utf8)
                NSApp.terminate(nil)
            }
            return
        }
        if CommandLine.arguments.contains("--placer-test") {
            Task { @MainActor in
                let lines = await Placer.selfTest()
                try? lines.joined(separator: "\n").write(to: Store.shared.directory.appendingPathComponent("placer-test.txt"),
                                                         atomically: true, encoding: .utf8)
                NSApp.terminate(nil)
            }
        }
        if CommandLine.arguments.contains("--preview-hud") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                MainActor.assumeIsolated { Runner.shared.previewHUD() }
            }
        }
        if CommandLine.arguments.contains("--accuracy-test") {
            Task { @MainActor in
                let lines = await AccuracyTest.run()
                let out = Store.shared.directory.appendingPathComponent("accuracy-test.txt")
                try? lines.joined(separator: "\n").write(to: out, atomically: true, encoding: .utf8)
                NSApp.terminate(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { WindowManager.show() }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        Store.shared.flush()
        Scheduler.shared.save()
    }
}

// MARK: - Menu bar

struct MenuBarMenu: View {
    @ObservedObject private var store = Store.shared
    @ObservedObject private var runner = Runner.shared
    @ObservedObject private var login = LoginItem.shared
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        if store.pausedAll {
            Text("Schedules paused")
        } else if let next = store.nextRun {
            Text("Next: \(next.macro.name) · \(Fmt.nextRun(next.date))")
        } else {
            Text("No scheduled runs")
        }
        if let name = runner.runningName {
            Button("Stop \(name)  \(HotKey.display)") { runner.emergencyStop() }
        }
        Divider()
        Menu("Run") {
            if store.macros.isEmpty { Text("No macros") }
            ForEach(store.macros) { m in
                Button(m.name) { runner.runNow(m.id) }
            }
        }
        .disabled(runner.isBusy)
        Toggle("Pause All Schedules", isOn: $store.pausedAll)
        Divider()
        Button("Open ClickFlow") {
            WindowManager.openAction = openWindow
            WindowManager.show()
        }
        Toggle("Launch at Login", isOn: login.binding)
        Divider()
        Button("Quit ClickFlow") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}
