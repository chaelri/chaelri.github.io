import SwiftUI

struct MainView: View {
    @ObservedObject private var store = Store.shared
    @ObservedObject private var app = AppState.shared
    @ObservedObject private var perms = PermissionMonitor.shared
    @ObservedObject private var runner = Runner.shared
    @Environment(\.openWindow) private var openWindow
    @AppStorage(Prefs.onboarded) private var onboarded = false

    private var selectedID: UUID? {
        if case .macro(let id) = app.selection { return id }
        return nil
    }

    var body: some View {
        NavigationSplitView {
            Sidebar()
                .navigationSplitViewColumnWidth(min: 250, ideal: 280, max: 360)
        } detail: {
            VStack(spacing: 0) {
                if !perms.accessibility { PermissionBanner() }
                detail
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { MainView.recordNew() } label: {
                    Label("Record", systemImage: "record.circle")
                }
                .help("Record your clicks into a new macro (⇧⌘R)")
                .disabled(runner.isBusy)

                Button {
                    if let id = selectedID { runner.runNow(id) }
                } label: {
                    Label("Run", systemImage: "play.fill")
                }
                .help("Run the selected macro (⌘R)")
                .disabled(selectedID == nil || runner.isBusy)
            }
        }
        .labelStyle(.titleAndIcon)
        .sheet(isPresented: $app.showOnboarding) { OnboardingView() }
        .onAppear {
            WindowManager.openAction = openWindow
            NSApp.setActivationPolicy(.regular)
            if app.selection == nil { app.selection = store.macros.first.map { .macro($0.id) } }
            if !onboarded { app.showOnboarding = true }
        }
    }

    @ViewBuilder private var detail: some View {
        switch app.selection {
        case .macro(let id):
            if let binding = store.binding(id) {
                MacroEditor(macro: binding).id(id)
            } else {
                emptyState
            }
        case .history:
            HistoryView()
        case .settings:
            SettingsView()
        case nil:
            emptyState
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No macro selected", systemImage: "cursorarrow.click.2")
        } description: {
            Text("Pick one on the left, make a new one, or record your clicks.")
        } actions: {
            HStack {
                Button("New Macro") { store.newMacro() }
                Button("Record") { MainView.recordNew() }.buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @MainActor static func recordNew() {
        Recorder.shared.start { steps in
            guard !steps.isEmpty else { return }
            Store.shared.newMacro(name: "Recording \(Fmt.stamp(Date()))", steps: steps)
            WindowManager.show()
        }
    }
}

// MARK: - Sidebar

struct Sidebar: View {
    @ObservedObject private var store = Store.shared
    @ObservedObject private var app = AppState.shared
    @ViewState private var search = ""
    @ViewState private var renaming: UUID?
    @ViewState private var renameText = ""
    @ViewState private var deleting: Macro?

    private var filtered: [Macro] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? store.macros : store.macros.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        List(selection: $app.selection) {
            Section("Macros") {
                ForEach(filtered) { m in
                    MacroRow(macro: m)
                        .tag(SidebarItem.macro(m.id))
                        .contextMenu { menu(for: m) }
                }
                .onMove { from, to in
                    // Reordering only makes sense on the unfiltered list.
                    guard search.isEmpty else { return }
                    store.macros.move(fromOffsets: from, toOffset: to)
                }
                if filtered.isEmpty {
                    Text(search.isEmpty ? "No macros yet" : "No matches")
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                Label("Run History", systemImage: "clock.arrow.circlepath").tag(SidebarItem.history)
                Label("Settings", systemImage: "gearshape").tag(SidebarItem.settings)
            }
        }
        .searchable(text: $search, placement: .sidebar, prompt: "Search macros")
        .safeAreaInset(edge: .bottom) {
            HStack {
                Button { store.newMacro() } label: { Label("New Macro", systemImage: "plus") }
                Spacer()
                Menu {
                    Button("Import Macros…") { store.importMacros() }
                    Button("Export All Macros…") { store.export(store.macros) }.disabled(store.macros.isEmpty)
                } label: {
                    Image(systemName: "square.and.arrow.up.on.square")
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .help("Import / export")
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.bar)
        }
        .alert("Rename Macro", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $renameText)
            Button("Rename") {
                if let id = renaming, let b = store.binding(id) {
                    let t = renameText.trimmingCharacters(in: .whitespaces)
                    if !t.isEmpty { b.wrappedValue.name = t }
                }
                renaming = nil
            }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .confirmationDialog("Delete \(deleting?.name ?? "")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Delete", role: .destructive) {
                if let m = deleting { store.delete(m.id) }
                deleting = nil
            }
        } message: {
            Text("Its steps and schedules are removed. Run history stays.")
        }
    }

    @ViewBuilder private func menu(for m: Macro) -> some View {
        Button("Run Now") { Runner.shared.runNow(m.id) }.disabled(Runner.shared.isBusy)
        Divider()
        Button("Rename…") { renameText = m.name; renaming = m.id }
        Button("Duplicate") { store.duplicate(m.id) }
        Button("Export…") { store.export([m]) }
        Divider()
        Button("Delete…", role: .destructive) { deleting = m }
    }
}

struct MacroRow: View {
    let macro: Macro
    @ObservedObject private var store = Store.shared

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(macro.name).font(.headline).lineLimit(1)
                Text(stats).font(.caption).foregroundStyle(.secondary).monospacedDigit()
                if let summary = macro.scheduleSummary {
                    Label(summary, systemImage: "alarm")
                        .font(.caption)
                        .foregroundStyle(macro.enabled ? .secondary : .tertiary)
                        .lineLimit(1)
                    TimelineView(.periodic(from: .now, by: 30)) { ctx in
                        if store.pausedAll {
                            Text("Paused").font(.caption).foregroundStyle(.orange)
                        } else if let next = macro.nextRun(after: ctx.date) {
                            Text("Next: \(Fmt.nextRun(next))").font(.caption).foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
            Spacer(minLength: 4)
            if !macro.schedules.isEmpty {
                Toggle("", isOn: Binding(
                    get: { macro.enabled },
                    set: { v in store.binding(macro.id)?.wrappedValue.enabled = v }))
                    .toggleStyle(.switch)
                    .controlSize(.mini)
                    .labelsHidden()
                    .help(macro.enabled ? "Schedules on" : "Schedules off")
            }
        }
        .padding(.vertical, 4)
    }

    private var stats: String {
        let n = macro.steps.count
        let d = macro.totalDuration.map(Fmt.seconds) ?? "loops"
        return "\(n) step\(n == 1 ? "" : "s") · \(d)"
    }
}

// MARK: - Permission banner + onboarding

struct PermissionBanner: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.trianglebadge.exclamationmark.fill")
                .font(.title2)
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text("ClickFlow can't click yet").font(.headline)
                Text("Turn on ClickFlow in System Settings › Privacy & Security › Accessibility. Runs are skipped until then.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Open Settings") { PermissionMonitor.requestAccessibility() }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color.orange.opacity(0.12))
        .overlay(alignment: .bottom) { Divider() }
    }
}

struct OnboardingView: View {
    @ObservedObject private var perms = PermissionMonitor.shared
    @ObservedObject private var login = LoginItem.shared
    @AppStorage(Prefs.onboarded) private var onboarded = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 14) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 64, height: 64)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Welcome to ClickFlow").font(.title.weight(.semibold))
                    Text("Record, edit and schedule click macros.").foregroundStyle(.secondary)
                }
            }

            VStack(spacing: 12) {
                row(done: perms.accessibility,
                    title: "Accessibility",
                    text: "Required. macOS blocks clicks from apps that aren't switched on here.",
                    button: "Open Settings") { PermissionMonitor.requestAccessibility() }
                row(done: perms.screenRecording,
                    title: "Screen Recording",
                    text: "Optional. Only used for the magnifier when picking a point.",
                    button: "Allow") { PermissionMonitor.requestScreenRecording() }
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "power").font(.title3).frame(width: 26).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Launch at login").font(.headline)
                        Text("Schedules only fire while ClickFlow is open. It lives in the menu bar.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Toggle("", isOn: login.binding).toggleStyle(.switch).labelsHidden()
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 12).fill(.quaternary.opacity(0.5)))
            }

            Text("Emergency stop: \(HotKey.display) from any app, or esc while a macro runs.")
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack {
                Spacer()
                Button(perms.accessibility ? "Get Started" : "Continue Without Permission") {
                    onboarded = true
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .controlSize(.large)
            }
        }
        .padding(28)
        .frame(width: 560)
    }

    private func row(done: Bool, title: String, text: String, button: String, action: @escaping () -> Void) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle.dashed")
                .font(.title3)
                .frame(width: 26)
                .foregroundStyle(done ? .green : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(text).font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
            if done {
                Text("On").foregroundStyle(.green).font(.callout.weight(.medium))
            } else {
                Button(button, action: action)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(.quaternary.opacity(0.5)))
    }
}
