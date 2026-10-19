import SwiftUI

struct MacroEditor: View {
    @Binding var macro: Macro
    @ObservedObject private var store = Store.shared
    @ViewState private var tab: Tab = .steps

    enum Tab { case steps, schedules }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            switch tab {
            case .steps: StepsPane(macro: $macro)
            case .schedules: SchedulesPane(macro: $macro)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                TextField("Macro name", text: $macro.name)
                    .textFieldStyle(.plain)
                    .font(.title2.weight(.semibold))
                Spacer()
                Label(macro.totalDuration.map { "total \(Fmt.seconds($0))" } ?? "repeats until stopped", systemImage: "timer")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .help("Estimated total duration")
            }
            HStack(spacing: 16) {
                Label(macro.scheduleSummary ?? "Not scheduled", systemImage: "alarm")
                    .foregroundStyle(macro.schedules.isEmpty ? .tertiary : .secondary)
                TimelineView(.periodic(from: .now, by: 30)) { ctx in
                    if store.pausedAll, !macro.schedules.isEmpty {
                        Text("All schedules paused").foregroundStyle(.orange)
                    } else if let next = macro.nextRun(after: ctx.date) {
                        Text("Next run: \(Fmt.nextRun(next))").foregroundStyle(Color.accentColor)
                    }
                }
                Spacer()
                Picker("", selection: $tab) {
                    Text("Steps (\(macro.steps.count))").tag(Tab.steps)
                    Text("Schedules (\(macro.schedules.count))").tag(Tab.schedules)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
            }
            .font(.callout)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 14)
    }
}

// MARK: - Steps

struct StepsPane: View {
    @Binding var macro: Macro
    @ObservedObject private var runner = Runner.shared
    @ViewState private var dragging: UUID?

    var body: some View {
        VStack(spacing: 0) {
            if macro.steps.isEmpty {
                ContentUnavailableView {
                    Label("No steps yet", systemImage: "cursorarrow.click")
                } description: {
                    Text("Add a step below, or record your clicks straight into this macro.")
                }
                .frame(maxHeight: .infinity)
            } else {
                // A plain stack, not a List: List's drag-to-reorder holds every mouse-down
                // to see if it's a drag, which made the text fields slow to take focus.
                // Reordering is from the ☰ handle only.
                ScrollView {
                    // Lazy: only cards on screen are built, so opening a long macro is instant.
                    LazyVStack(spacing: 8) {
                        ForEach(Array(macro.steps.enumerated()), id: \.element.id) { idx, step in
                            StepCard(step: step,
                                     macroID: macro.id,
                                     number: idx + 1,
                                     busy: runner.isBusy,
                                     onTest: { if let i = index(of: step.id) { runner.test(stepAt: i, of: macro.id) } },
                                     onDuplicate: { duplicate(step.id) },
                                     onDelete: { macro.steps.removeAll { $0.id == step.id } },
                                     onDrag: {
                                         dragging = step.id
                                         return NSItemProvider(object: step.id.uuidString as NSString)
                                     })
                                .equatable()
                                .opacity(dragging == step.id ? 0.45 : 1)
                                .onDrop(of: [.text], delegate: StepDropDelegate(target: step.id, steps: $macro.steps,
                                                                                dragging: $dragging))
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
                .onDrop(of: [.text], isTargeted: nil) { _ in dragging = nil; return false }
            }
            Divider()
            footer
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Menu {
                ForEach(StepType.allCases) { t in
                    Button { add(t) } label: { Label(t.label, systemImage: t.symbol) }
                }
                Divider()
                Button { recordInto() } label: { Label("Record Clicks Into This Macro…", systemImage: "record.circle") }
            } label: {
                Label("Add Step", systemImage: "plus")
            }
            .fixedSize()
            Spacer()
            RepeatControls(macro: $macro)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(.bar)
    }

    /// The clickflow-hook Cloud Run relay: saves to the test RTDB and posts to #clickflow.
    static let defaultPostURL = "https://clickflow-hook-668755364170.asia-southeast1.run.app"

    private func index(of id: UUID) -> Int? { macro.steps.firstIndex { $0.id == id } }
    private func number(of id: UUID) -> Int { (index(of: id) ?? 0) + 1 }

    private func add(_ type: StepType) {
        var s = Step(type: type)
        if type.hasPoint {
            if let last = macro.steps.last(where: { $0.type.hasPoint }) {
                s.x = last.x
                s.y = last.y
            } else {
                let f = CGDisplayBounds(CGMainDisplayID())
                s.x = f.midX.rounded()
                s.y = f.midY.rounded()
            }
        }
        if type == .keyShortcut { s.keys = "cmd+s" }
        if type == .postClipboard { s.url = StepsPane.defaultPostURL }
        if type.hasArea { s.text = "{text}" }
        if type == .discordMessage { s.text = "**{macro}** · {time}\n{clipboard}" }
        if type.hasArea {
            let f = CGDisplayBounds(CGMainDisplayID())
            s.x = (f.midX - 150).rounded()
            s.y = (f.midY - 60).rounded()
        }
        if type != .wait, !macro.steps.isEmpty { s.delayBefore = 0.5 }
        macro.steps.append(s)
        // Placing is part of adding: open the marker straight away, ✗ keeps the defaults.
        if type.hasPoint || type.hasArea { place(s) }
    }

    private func place(_ s: Step) {
        let (m, id) = (macro.id, s.id)
        Task { @MainActor in
            if s.type.hasArea {
                if let r = await Placer.placeArea(start: s.area) {
                    Store.shared.updateStep(m, id) { $0.x = r.minX; $0.y = r.minY; $0.width = r.width; $0.height = r.height }
                }
            } else if let p = await Placer.placePoint(start: s.point) {
                Store.shared.updateStep(m, id) { $0.x = p.x; $0.y = p.y }
            }
        }
    }

    private func duplicate(_ id: UUID) {
        guard let i = index(of: id) else { return }
        var s = macro.steps[i]
        s.id = UUID()
        macro.steps.insert(s, at: i + 1)
    }

    private func recordInto() {
        let id = macro.id
        Recorder.shared.start { steps in
            guard !steps.isEmpty, let b = Store.shared.binding(id) else { return }
            var add = steps
            if !b.wrappedValue.steps.isEmpty, add[0].type != .wait { add[0].delayBefore = 0.5 }
            b.wrappedValue.steps.append(contentsOf: add)
        }
    }
}

struct RepeatControls: View {
    @Binding var macro: Macro

    private enum Mode: Hashable { case once, times, forever }

    private var mode: Binding<Mode> {
        Binding(
            get: { macro.repeatCount == 1 ? .once : (macro.repeatCount == 0 ? .forever : .times) },
            set: { m in
                switch m {
                case .once: macro.repeatCount = 1
                case .forever: macro.repeatCount = 0
                case .times: if macro.repeatCount < 2 { macro.repeatCount = 2 }
                }
            })
    }

    var body: some View {
        HStack(spacing: 8) {
            Text("Repeat").foregroundStyle(.secondary)
            Picker("", selection: mode) {
                Text("1×").tag(Mode.once)
                Text("N×").tag(Mode.times)
                Text("Until stopped").tag(Mode.forever)
            }
            .labelsHidden()
            .fixedSize()
            if macro.repeatCount >= 2 {
                TextField("", value: $macro.repeatCount, format: .number.grouping(.never))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 48)
                    .multilineTextAlignment(.trailing)
                Stepper("", value: $macro.repeatCount, in: 2...100_000).labelsHidden()
            }
            if macro.repeatCount != 1 {
                Text("pause").foregroundStyle(.secondary)
                SecondsField(value: $macro.repeatDelay)
            }
        }
        .font(.callout)
    }
}

/// Equatable on what it shows, so SwiftUI skips cards whose step didn't change. (The
/// closures are recreated every render and would otherwise make every card look new.)
struct StepCard: View, Equatable {
    let step: Step
    let macroID: UUID
    let number: Int
    let busy: Bool
    var onTest: () -> Void
    var onDuplicate: () -> Void
    var onDelete: () -> Void
    var onDrag: () -> NSItemProvider

    static func == (a: StepCard, b: StepCard) -> Bool {
        a.step == b.step && a.number == b.number && a.busy == b.busy && a.macroID == b.macroID
    }

    private func bind<T>(_ kp: WritableKeyPath<Step, T>) -> Binding<T> {
        let current = step[keyPath: kp]
        let (m, id) = (macroID, step.id)
        return Binding(get: { current }, set: { v in Store.shared.updateStep(m, id) { $0[keyPath: kp] = v } })
    }

    private func update(_ change: (inout Step) -> Void) { Store.shared.updateStep(macroID, step.id, change) }

    private var tint: Color { step.type.tint }
    private var ghost: Bool { step.showOnly && step.type != .wait }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .frame(width: 22, height: 34)
                .contentShape(Rectangle())
                .onHover { inside in (inside ? NSCursor.openHand : NSCursor.arrow).set() }
                .onDrag(onDrag)
                .help("Drag to reorder")
            Text("\(number)")
                .font(.callout.monospacedDigit().weight(.medium))
                .foregroundStyle(.secondary)
                .frame(minWidth: 20, alignment: .trailing)
            Image(systemName: step.type.symbol)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 34, height: 34)
                .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 8) {
                // Name + actions share the top row, so a card is never wider than its fields:
                // the old layout put the buttons beside the fields and overflowed narrow windows.
                HStack(spacing: 8) {
                    TextField("Add a name…", text: bind(\.name))
                        .textFieldStyle(.plain)
                        .font(step.name.isEmpty ? .callout : .headline)
                        .frame(minWidth: 80, maxWidth: .infinity, alignment: .leading)
                    if step.type.hasPoint, !Geo.isOnScreen(step.point) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .help("This point isn't on any connected display. Was a monitor unplugged?")
                    }
                    actions
                        .labelStyle(.titleAndIcon)
                        .controlSize(.small)
                }
                HStack(spacing: 14) {
                    Picker("", selection: bind(\.type)) {
                        ForEach(StepType.allCases) { t in Text(t.label).tag(t) }
                    }
                    .labelsHidden()
                    .frame(width: 136)
                    fields
                }
                if step.type != .wait {
                    HStack(spacing: 6) {
                        Text("Delay before").foregroundStyle(.secondary)
                        SecondsField(value: bind(\.delayBefore))
                    }
                    .font(.callout)
                }
                if step.type == .discordMessage {
                    MessageComposer(text: bind(\.text), variables: MessageVars.forMessage)
                    WebhookWarning()
                }
                if step.type == .readText {
                    ScreenshotOptions(copyResult: bind(\.copyResult), sendDiscord: bind(\.sendDiscord),
                                      textOnly: bind(\.textOnly), message: bind(\.text))
                    ReadResult(stepID: step.id)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(ghost ? Color.purple.opacity(0.06) : Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(ghost ? Color.purple.opacity(0.6) : Color(nsColor: .separatorColor).opacity(0.7),
                          style: StrokeStyle(lineWidth: ghost ? 1.5 : 1, dash: ghost ? [6, 4] : [])))
        .animation(.easeOut(duration: 0.15), value: ghost)
        .contextMenu {
            if step.type != .wait {
                Button(step.showOnly ? "Make Live (Execute It)" : "Show Only (Don't Execute)") { update { $0.showOnly.toggle() } }
            }
            Button("Duplicate Step", action: onDuplicate)
            Button("Delete Step", role: .destructive, action: onDelete)
        }
    }

    private var actions: some View {
        HStack(spacing: 6) {
            if step.type != .wait { LiveToggle(showOnly: bind(\.showOnly)) }
            if step.type.hasPoint {
                Button { pick() } label: { Label("Pick", systemImage: "scope") }
                    .help("Show the target on screen to drag it onto the spot, then ✓")
            }
            if step.type.hasArea {
                Button { pickArea() } label: { Label("Pick area", systemImage: "rectangle.dashed") }
                    .help("Show the box on screen to move / resize it, then ✓")
            }
            Button { onTest() } label: { Label("Test", systemImage: "play") }
                .help("Run just this step")
                .disabled(busy)
            Button(role: .destructive, action: onDelete) { Image(systemName: "trash") }
                .buttonStyle(.borderless)
                .help("Delete step")
        }
        .fixedSize()
    }

    @ViewBuilder private var fields: some View {
        switch step.type {
        case .leftClick, .doubleClick, .rightClick, .move:
            CoordField(label: "X", value: bind(\.x))
            CoordField(label: "Y", value: bind(\.y))
        case .wait:
            SecondsField(value: bind(\.seconds))
        case .typeText:
            TextField("Text to type", text: bind(\.text))
                .textFieldStyle(.roundedBorder)
                .frame(minWidth: 160, maxWidth: 300)
        case .keyShortcut:
            TextField("cmd+s, return…", text: bind(\.keys))
                .textFieldStyle(.roundedBorder)
                .frame(width: 130)
            if let combo = KeyCombo.parse(step.keys) {
                Text(combo.display)
                    .font(.system(.callout, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.primary)
                    .fixedSize()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 6).fill(.quaternary))
            } else if !step.keys.isEmpty {
                Text("Not a key I know").font(.callout).foregroundStyle(.red)
            }
        case .readText:
            CoordField(label: "X", value: bind(\.x))
            CoordField(label: "Y", value: bind(\.y))
            CoordField(label: "W", value: bind(\.width))
            CoordField(label: "H", value: bind(\.height))
        case .discordMessage:
            EmptyView()
        case .openURL:
            TextField("Paste a link, e.g. eva.hrforte.com", text: bind(\.url))
                .textFieldStyle(.roundedBorder)
                .frame(minWidth: 220, maxWidth: 380)
            if !step.url.isEmpty, OpenLink.normalized(step.url) == nil {
                Text("Not a web link").font(.callout).foregroundStyle(.red)
            }
        case .postClipboard:
            TextField("https://…", text: bind(\.url))
                .textFieldStyle(.roundedBorder)
                .frame(minWidth: 220, maxWidth: 360)
                .help("Sends the clipboard text as the POST body")
            Text("clipboard → POST").font(.callout).foregroundStyle(.secondary)
        }
    }

    private func pickArea() {
        let start = step.area
        Task { @MainActor in
            if let r = await Placer.placeArea(start: start) {
                update { s in
                    s.x = r.minX
                    s.y = r.minY
                    s.width = r.width
                    s.height = r.height
                }
            }
        }
    }

    private func pick() {
        Task { @MainActor in
            if let p = await Placer.placePoint(start: step.point) {
                update { s in
                    s.x = p.x
                    s.y = p.y
                }
            }
        }
    }
}

struct CoordField: View {
    let label: String
    @Binding var value: Double

    var body: some View {
        HStack(spacing: 5) {
            Text(label)
                .font(.callout.weight(.semibold))
                .foregroundStyle(Color.secondary)
                .fixedSize()
            TextField("", value: $value, format: .number.precision(.fractionLength(0...1)).grouping(.never))
                .textFieldStyle(.roundedBorder)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .frame(width: 70)
        }
    }
}

struct SecondsField: View {
    @Binding var value: Double

    var body: some View {
        HStack(spacing: 3) {
            TextField("", value: Binding(get: { value }, set: { value = max(0, $0) }),
                      format: .number.precision(.fractionLength(1...2)).grouping(.never))
                .textFieldStyle(.roundedBorder)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .frame(width: 58)
            Text("s").foregroundStyle(.secondary)
        }
    }
}

/// Live reordering: the dragged card swaps into place as it passes over another one.
struct StepDropDelegate: DropDelegate {
    let target: UUID
    @Binding var steps: [Step]
    @Binding var dragging: UUID?

    func dropEntered(info: DropInfo) {
        guard let d = dragging, d != target,
              let from = steps.firstIndex(where: { $0.id == d }),
              let to = steps.firstIndex(where: { $0.id == target }) else { return }
        withAnimation(.snappy(duration: 0.22)) {
            steps.move(fromOffsets: IndexSet(integer: from), toOffset: to > from ? to + 1 : to)
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }

    func performDrop(info: DropInfo) -> Bool {
        dragging = nil
        return true
    }
}

// MARK: - Schedules

struct SchedulesPane: View {
    @Binding var macro: Macro

    var body: some View {
        VStack(spacing: 0) {
            if macro.schedules.isEmpty {
                ContentUnavailableView {
                    Label("Not scheduled", systemImage: "alarm")
                } description: {
                    Text("Schedules fire while ClickFlow is open. It keeps running in the menu bar when the window is closed.")
                } actions: {
                    Button("Add Schedule") { add() }.buttonStyle(.borderedProminent)
                }
                .frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        if !macro.enabled {
                            Label("This macro's schedules are switched off in the sidebar.", systemImage: "pause.circle")
                                .foregroundStyle(.orange)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach($macro.schedules) { $s in
                            ScheduleCard(schedule: $s) { macro.schedules.removeAll { $0.id == s.id } }
                        }
                    }
                    .padding(18)
                }
                Divider()
                HStack {
                    Button { add() } label: { Label("Add Schedule", systemImage: "plus") }
                    Spacer()
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(.bar)
            }
        }
    }

    private func add() {
        macro.schedules.append(Schedule())
        macro.enabled = true
    }
}

struct ScheduleCard: View {
    @Binding var schedule: Schedule
    var onDelete: () -> Void
    @ViewState private var showConditions = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                Toggle("", isOn: $schedule.enabled).toggleStyle(.switch).labelsHidden()
                VStack(alignment: .leading, spacing: 2) {
                    Text(schedule.summary).font(.headline)
                    TimelineView(.periodic(from: .now, by: 30)) { ctx in
                        if !schedule.enabled {
                            Text("Off").foregroundStyle(.tertiary)
                        } else if let next = schedule.nextOccurrence(after: ctx.date) {
                            Text("Next run: \(Fmt.nextRun(next))").foregroundStyle(Color.accentColor)
                        } else {
                            Text("No upcoming runs").foregroundStyle(.orange)
                        }
                    }
                    .font(.callout)
                }
                Spacer()
                Button(role: .destructive, action: onDelete) { Image(systemName: "trash") }
                    .buttonStyle(.borderless)
                    .help("Delete schedule")
            }

            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 10) {
                GridRow {
                    rowLabel("Repeat")
                    Picker("", selection: repeatBinding) {
                        ForEach(RepeatKind.allCases) { k in Text(k.label).tag(k) }
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                if schedule.repeatKind == .once {
                    GridRow {
                        rowLabel("Date")
                        DatePicker("", selection: dayBinding($schedule.date), displayedComponents: .date)
                            .labelsHidden().fixedSize()
                    }
                }
                GridRow {
                    rowLabel(schedule.repeatKind == .interval ? "From" : "Time")
                    HStack(spacing: 10) {
                        DatePicker("", selection: timeBinding($schedule.time), displayedComponents: .hourAndMinute)
                            .labelsHidden().fixedSize()
                        if schedule.repeatKind == .interval {
                            Text("to").foregroundStyle(.secondary)
                            DatePicker("", selection: timeBinding($schedule.endTime), displayedComponents: .hourAndMinute)
                                .labelsHidden().fixedSize()
                        }
                    }
                }
                if schedule.repeatKind == .interval {
                    GridRow {
                        rowLabel("Every")
                        HStack(spacing: 6) {
                            TextField("", value: Binding(get: { schedule.intervalMinutes },
                                                         set: { schedule.intervalMinutes = max(1, $0) }),
                                      format: .number.grouping(.never))
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 54)
                                .multilineTextAlignment(.trailing)
                            Stepper("", value: $schedule.intervalMinutes, in: 1...1440, step: 5).labelsHidden()
                            Text("minutes").foregroundStyle(.secondary)
                        }
                    }
                }
                if schedule.repeatKind == .custom || schedule.repeatKind == .interval {
                    GridRow {
                        rowLabel("Days")
                        DayPicker(days: $schedule.customDays)
                    }
                }
                GridRow {
                    rowLabel("If missed")
                    Picker("", selection: $schedule.missedRunPolicy) {
                        Text("Skip").tag(MissedRunPolicy.skip)
                        Text("Run once when available").tag(MissedRunPolicy.runOnce)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .fixedSize()
                    .help("What to do when the Mac was asleep or ClickFlow was closed at the scheduled time")
                }
            }
            .font(.callout)

            DisclosureGroup(isExpanded: $showConditions) {
                ConditionsEditor(conditions: $schedule.conditions)
                    .padding(.top, 8)
            } label: {
                let n = schedule.conditions.activeCount
                Text(n == 0 ? "Conditions" : "Conditions (\(n))").font(.callout.weight(.medium))
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor).opacity(0.7)))
        .onAppear { showConditions = schedule.conditions.activeCount > 0 }
    }

    private var repeatBinding: Binding<RepeatKind> {
        Binding(get: { schedule.repeatKind }, set: { k in
            schedule.repeatKind = k
            if k == .custom, schedule.customDays.isEmpty { schedule.customDays = [2, 4, 6] }
            if k == .interval, schedule.customDays.isEmpty { schedule.customDays = [2, 3, 4, 5, 6] }
            if k == .once, schedule.date == nil { schedule.date = DayString.string(Date()) }
        })
    }

    private func rowLabel(_ s: String) -> some View {
        Text(s).foregroundStyle(.secondary).gridColumnAlignment(.trailing)
    }
}

struct DayPicker: View {
    @Binding var days: [Int]

    private var order: [Int] {
        let first = Calendar.current.firstWeekday
        return (0..<7).map { (first - 1 + $0) % 7 + 1 }
    }

    var body: some View {
        HStack(spacing: 5) {
            ForEach(order, id: \.self) { d in
                let on = days.contains(d)
                Button {
                    if on { days.removeAll { $0 == d } } else { days = (days + [d]).sorted() }
                } label: {
                    Text(Calendar.current.veryShortWeekdaySymbols[d - 1])
                        .font(.callout.weight(.semibold))
                        .frame(width: 28, height: 28)
                        .foregroundStyle(on ? Color.white : Color.primary)
                        .background(Circle().fill(on ? Color.accentColor : Color.secondary.opacity(0.15)))
                }
                .buttonStyle(.plain)
                .help(Calendar.current.weekdaySymbols[d - 1])
            }
        }
    }
}

struct ConditionsEditor: View {
    @Binding var conditions: Conditions

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 10) {
            GridRow {
                Toggle("Starting", isOn: optionalDay(\.startDate))
                DatePicker("", selection: dayBinding($conditions.startDate), displayedComponents: .date)
                    .labelsHidden().fixedSize()
                    .disabled(conditions.startDate == nil)
            }
            GridRow {
                Toggle("Ending", isOn: optionalDay(\.endDate))
                DatePicker("", selection: dayBinding($conditions.endDate), displayedComponents: .date)
                    .labelsHidden().fixedSize()
                    .disabled(conditions.endDate == nil)
            }
            GridRow {
                Toggle("Only if", isOn: Binding(
                    get: { conditions.requireApp != nil },
                    set: { conditions.requireApp = $0 ? (NSWorkspace.shared.frontmostApplication?.localizedName ?? "") : nil }))
                HStack(spacing: 8) {
                    TextField("App name", text: Binding(get: { conditions.requireApp ?? "" },
                                                        set: { conditions.requireApp = $0 }))
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 170)
                    Menu("Choose") {
                        ForEach(runningApps, id: \.self) { name in
                            Button(name) { conditions.requireApp = name }
                        }
                    }
                    .fixedSize()
                    Picker("", selection: $conditions.requireFrontmost) {
                        Text("is running").tag(false)
                        Text("is frontmost").tag(true)
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                .disabled(conditions.requireApp == nil)
            }
            GridRow {
                Toggle("Only if idle", isOn: Binding(
                    get: { conditions.minIdleSeconds != nil },
                    set: { conditions.minIdleSeconds = $0 ? 30 : nil }))
                HStack(spacing: 6) {
                    Text("for at least").foregroundStyle(.secondary)
                    TextField("", value: Binding(get: { conditions.minIdleSeconds ?? 30 },
                                                 set: { conditions.minIdleSeconds = max(1, $0) }),
                              format: .number.grouping(.never))
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 54)
                        .multilineTextAlignment(.trailing)
                    Text("seconds, so it never grabs the mouse while you're using it").foregroundStyle(.secondary)
                }
                .disabled(conditions.minIdleSeconds == nil)
            }
        }
        .font(.callout)
    }

    private var runningApps: [String] {
        let names = NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular }
            .compactMap(\.localizedName)
        return Array(Set(names)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private func optionalDay(_ kp: WritableKeyPath<Conditions, String?>) -> Binding<Bool> {
        Binding(get: { conditions[keyPath: kp] != nil },
                set: { conditions[keyPath: kp] = $0 ? DayString.string(Date()) : nil })
    }
}

/// What the step read last time (from a Test or a run), with a copy button.
struct ReadResult: View {
    let stepID: UUID
    @ObservedObject private var outputs = StepOutputs.shared
    @ObservedObject private var perms = PermissionMonitor.shared

    var body: some View {
        if !perms.screenRecording {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                Text("Needs Screen Recording permission to read the screen.").foregroundStyle(.secondary)
                Button("Allow") { PermissionMonitor.requestScreenRecording() }.controlSize(.small)
            }
            .font(.callout)
        } else if let text = outputs.text[stepID] {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Label("Last read", systemImage: "text.viewfinder").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Spacer()
                    Button("Copy") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(text, forType: .string)
                    }
                    .controlSize(.small)
                }
                Text(text)
                    .font(.system(.callout, design: .monospaced))
                    .textSelection(.enabled)
                    .lineLimit(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.05)))
        } else {
            Text("Press Test to read the area now.").font(.caption).foregroundStyle(.tertiary)
        }
    }
}

/// What a Screenshot area step does with its capture. The text is always read (on-device,
/// no AI); these choose where the results go.
struct ScreenshotOptions: View {
    @Binding var copyResult: Bool
    @Binding var sendDiscord: Bool
    @Binding var textOnly: Bool
    @Binding var message: String
    @ViewState private var hasWebhook = Discord.webhookURL != nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            option($copyResult, icon: "doc.on.clipboard", tint: .mint, label: "Copy the text to the clipboard")
            option($sendDiscord, icon: "paperplane", tint: .indigo, label: "Send to Discord")
            if sendDiscord {
                VStack(alignment: .leading, spacing: 8) {
                    Picker("", selection: $textOnly) {
                        Text("Screenshot + message").tag(false)
                        Text("Message only").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .fixedSize()
                    HStack(spacing: 8) {
                        Text("Message").foregroundStyle(.secondary)
                        TextField(textOnly ? "{text}" : "Optional, e.g. {text}", text: $message)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 360)
                    }
                    HStack(spacing: 5) {
                        Text("Insert").font(.caption).foregroundStyle(.secondary)
                        ForEach(MessageVars.all, id: \.token) { v in
                            Button(v.token) { message += (message.isEmpty || message.hasSuffix(" ") || message.hasSuffix("\n") ? "" : " ") + v.token }
                                .font(.system(.caption, design: .monospaced))
                                .buttonStyle(.plain)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(Color.indigo.opacity(0.15)))
                                .help("Replaced with \(v.help)")
                        }
                    }
                    if !hasWebhook {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                            Text("Set your Discord webhook in Settings › Discord first.").foregroundStyle(.secondary)
                            Button("Open Settings") { AppState.shared.selection = .settings }.controlSize(.small)
                        }
                        .font(.caption)
                    }
                }
                .padding(.leading, 34)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .font(.callout)
        .animation(.easeOut(duration: 0.15), value: sendDiscord)
        .onAppear { hasWebhook = Discord.webhookURL != nil }
    }

    private func option(_ value: Binding<Bool>, icon: String, tint: Color, label: String) -> some View {
        HStack(spacing: 8) {
            Toggle("", isOn: value).toggleStyle(.switch).controlSize(.mini).labelsHidden()
            Image(systemName: value.wrappedValue ? icon + ".fill" : icon)
                .foregroundStyle(value.wrappedValue ? tint : Color.secondary)
                .frame(width: 18)
            Text(label).foregroundStyle(value.wrappedValue ? .primary : .secondary)
        }
    }
}

/// Shown only when there is no webhook to send to.
struct WebhookWarning: View {
    @ViewState private var has = Discord.webhookURL != nil

    var body: some View {
        Group {
            if !has {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text("Set your Discord webhook in Settings › Discord first.").foregroundStyle(.secondary)
                    Button("Open Settings") { AppState.shared.selection = .settings }.controlSize(.small)
                }
                .font(.caption)
            }
        }
        .onAppear { has = Discord.webhookURL != nil }
    }
}

/// Live = the step really acts. Show only = runs just mark where it would act.
struct LiveToggle: View {
    @Binding var showOnly: Bool

    var body: some View {
        Button {
            showOnly.toggle()
        } label: {
            Label(showOnly ? "Show only" : "Live", systemImage: showOnly ? "eye" : "bolt.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(showOnly ? Color.purple : Color.green)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill((showOnly ? Color.purple : Color.green).opacity(0.14)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .help(showOnly ? "Show only: runs mark where this would act, but never execute it. Click to make it live."
                       : "Live: this step really executes. Click to make it show-only.")
    }
}

extension StepType {
    var tint: Color {
        switch self {
        case .leftClick: return .blue
        case .doubleClick: return .indigo
        case .rightClick: return .purple
        case .move: return .teal
        case .wait: return .orange
        case .typeText: return .pink
        case .keyShortcut: return .green
        case .postClipboard: return .cyan
        case .readText: return .mint
        case .openURL: return .yellow
        case .discordMessage: return .indigo
        }
    }
}

// MARK: - String <-> Date bindings

func timeBinding(_ s: Binding<String>) -> Binding<Date> {
    Binding(get: { Clock.date(s.wrappedValue) }, set: { s.wrappedValue = Clock.string($0) })
}

func dayBinding(_ s: Binding<String?>) -> Binding<Date> {
    Binding(get: { s.wrappedValue.flatMap(DayString.date) ?? Calendar.current.startOfDay(for: Date()) },
            set: { s.wrappedValue = DayString.string($0) })
}
