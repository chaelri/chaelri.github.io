import SwiftUI

struct HistoryView: View {
    @ObservedObject private var store = Store.shared
    @ViewState private var confirmClear = false

    private var rows: [RunRecord] { Array(store.history.reversed()) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Run History").font(.title2.weight(.semibold))
                Spacer()
                Text("\(store.history.count) runs").foregroundStyle(.secondary)
                Button("Clear…") { confirmClear = true }.disabled(store.history.isEmpty)
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            Divider()
            if rows.isEmpty {
                ContentUnavailableView("No runs yet", systemImage: "clock",
                                       description: Text("Manual, scheduled and skipped runs all show up here."))
                    .frame(maxHeight: .infinity)
            } else {
                Table(rows) {
                    TableColumn("Macro") { r in Text(r.macroName).lineLimit(1) }
                        .width(min: 120, ideal: 170)
                    TableColumn("Trigger") { r in Label(r.trigger.label, systemImage: r.trigger.symbol) }
                        .width(min: 90, ideal: 110)
                    TableColumn("Started") { r in Text(Fmt.stamp(r.start)).monospacedDigit() }
                        .width(min: 130, ideal: 170)
                    TableColumn("Took") { r in
                        Text(r.end.map { Fmt.seconds($0.timeIntervalSince(r.start)) } ?? "—").monospacedDigit()
                    }
                    .width(min: 50, ideal: 60)
                    TableColumn("Result") { r in ResultBadge(result: r.result) }
                        .width(min: 80, ideal: 96)
                    TableColumn("Details") { r in
                        Text(r.reason ?? "").foregroundStyle(.secondary).lineLimit(2).help(r.reason ?? "")
                    }
                }
            }
        }
        .confirmationDialog("Clear all run history?", isPresented: $confirmClear) {
            Button("Clear History", role: .destructive) { store.history.removeAll() }
        }
    }
}

struct ResultBadge: View {
    let result: RunResult

    private var color: Color {
        switch result {
        case .completed: return .green
        case .stopped: return .orange
        case .skipped: return .gray
        case .failed: return .red
        }
    }

    var body: some View {
        Text(result.rawValue.capitalized)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .foregroundStyle(color)
            .background(Capsule().fill(color.opacity(0.15)))
    }
}

struct SettingsView: View {
    @ObservedObject private var perms = PermissionMonitor.shared
    @ObservedObject private var login = LoginItem.shared
    @ObservedObject private var store = Store.shared
    @AppStorage(Prefs.hideWindowDuringRuns) private var hideWindow = true
    @AppStorage(Prefs.showClickRing) private var clickRing = true
    @ViewState private var accuracy: [String] = []
    @ViewState private var testing = false

    var body: some View {
        Form {
            Section("Permissions") {
                permissionRow("Accessibility", on: perms.accessibility,
                              detail: "Needed to click, type and record.") { PermissionMonitor.requestAccessibility() }
                permissionRow("Screen Recording", on: perms.screenRecording,
                              detail: "Optional: the magnifier in the point picker. macOS may need ClickFlow relaunched after you allow it.") {
                    PermissionMonitor.requestScreenRecording()
                }
            }

            Section("Running") {
                Toggle("Pause all schedules", isOn: $store.pausedAll)
                Toggle("Launch at login", isOn: login.binding)
                if let e = login.error { Text(e).font(.caption).foregroundStyle(.red) }
                Toggle("Hide this window while a macro runs", isOn: $hideWindow)
                Toggle("Show a ring where each click lands", isOn: $clickRing)
                LabeledContent("Emergency stop") {
                    Text("\(HotKey.display) from any app, or esc during a run")
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Click accuracy test")
                        Text("Puts a target on every display, clicks it, and reports where the click landed.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(testing ? "Testing…" : "Run Test") {
                        testing = true
                        Task { @MainActor in
                            accuracy = await AccuracyTest.run()
                            testing = false
                        }
                    }
                    .disabled(testing || Runner.shared.isBusy)
                }
                ForEach(accuracy, id: \.self) { line in
                    Label(line, systemImage: line.contains("exactly") ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(line.contains("exactly") ? .green : .orange)
                }
            } header: {
                Text("Displays")
            } footer: {
                Text(displaySummary).font(.caption).foregroundStyle(.secondary)
            }

            Section("Data") {
                LabeledContent("Macros") { Text("\(store.macros.count)") }
                HStack {
                    Button("Import Macros…") { store.importMacros() }
                    Button("Export All…") { store.export(store.macros) }.disabled(store.macros.isEmpty)
                    Spacer()
                    Button("Show Data Folder") { NSWorkspace.shared.activateFileViewerSelecting([store.macrosURL]) }
                }
            }
        }
        .formStyle(.grouped)
    }

    private var displaySummary: String {
        NSScreen.screens.map { s in
            let f = Geo.frame(of: s)
            return "\(s.localizedName): \(Fmt.coord(f.minX)), \(Fmt.coord(f.minY)) · \(Int(f.width))×\(Int(f.height)) pt @\(Int(s.backingScaleFactor))x"
        }.joined(separator: "\n")
    }

    private func permissionRow(_ title: String, on: Bool, detail: String, action: @escaping () -> Void) -> some View {
        HStack {
            Image(systemName: on ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(on ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if on { Text("On").foregroundStyle(.secondary) } else { Button("Open Settings", action: action) }
        }
    }
}
