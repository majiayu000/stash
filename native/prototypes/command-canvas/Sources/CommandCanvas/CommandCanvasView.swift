import SwiftUI

struct CommandCanvasView: View {
    @State private var items = WorkItem.samples
    @State private var selectedScope: WorkScope = .today
    @State private var selectedItemID: UUID?
    @State private var captureText = ""
    @FocusState private var captureIsFocused: Bool

    private var scopedItems: [WorkItem] {
        items.filter { $0.scope == selectedScope }
    }

    private var visibleItems: [WorkItem] {
        let query = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return scopedItems }
        return scopedItems.filter {
            $0.title.localizedCaseInsensitiveContains(query)
                || $0.project.localizedCaseInsensitiveContains(query)
                || $0.note.localizedCaseInsensitiveContains(query)
        }
    }

    private var selectedItem: WorkItem? {
        guard let selectedItemID else { return scopedItems.first }
        return items.first { $0.id == selectedItemID }
    }

    var body: some View {
        HStack(spacing: 0) {
            IconRail()

            VStack(spacing: 0) {
                CaptureField(
                    text: $captureText,
                    isFocused: $captureIsFocused,
                    matchCount: visibleItems.count,
                    onCapture: captureTask
                )
                .padding(.horizontal, 28)
                .padding(.top, 24)
                .padding(.bottom, 18)

                ScopeBar(
                    selection: $selectedScope,
                    counts: Dictionary(grouping: items, by: \.scope).mapValues(\.count),
                    onSelect: selectScope
                )
                .padding(.horizontal, 28)

                Rectangle()
                    .fill(Palette.line)
                    .frame(height: 1)

                TaskCanvas(
                    items: visibleItems,
                    selectedItemID: selectedItem?.id,
                    scope: selectedScope,
                    query: captureText,
                    onSelect: { selectedItemID = $0 },
                    onToggle: toggleCompletion
                )
            }
            .background(Palette.canvas)

            Rectangle()
                .fill(Palette.line)
                .frame(width: 1)

            Inspector(item: selectedItem)
                .frame(width: 304)
        }
        .background(Palette.canvas)
        .preferredColorScheme(.dark)
        .onAppear {
            selectedItemID = scopedItems.first?.id
        }
    }

    private func selectScope(_ scope: WorkScope) {
        selectedScope = scope
        captureText = ""
        selectedItemID = items.first { $0.scope == scope }?.id
    }

    private func toggleCompletion(_ id: UUID) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].isCompleted.toggle()
    }

    private func captureTask() {
        let title = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else {
            captureIsFocused = true
            return
        }

        let item = WorkItem(
            title: title,
            project: "Inbox",
            timing: "Captured now",
            note: "Quickly captured from the Command Canvas.",
            scope: selectedScope
        )
        items.append(item)
        selectedItemID = item.id
        captureText = ""
        captureIsFocused = true
    }
}

private struct IconRail: View {
    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Palette.indigo)
                    .frame(width: 32, height: 32)
                Image(systemName: "tray.full.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.ink)
            }
            .accessibilityLabel("Stash")
            .padding(.bottom, 18)

            RailIcon(systemName: "checklist", label: "Work", isSelected: true)
            RailIcon(systemName: "square.stack.3d.up", label: "Projects")
            RailIcon(systemName: "bolt.horizontal.circle", label: "Sessions")
            RailIcon(systemName: "clock.arrow.circlepath", label: "Review")

            Spacer()

            RailIcon(systemName: "gearshape", label: "Settings")
        }
        .padding(.vertical, 18)
        .frame(width: 62)
        .background(Palette.rail)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(Palette.line)
                .frame(width: 1)
        }
    }
}

private struct RailIcon: View {
    let systemName: String
    let label: String
    var isSelected = false

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 15, weight: isSelected ? .semibold : .regular))
            .foregroundStyle(isSelected ? Palette.text : Palette.secondaryText)
            .frame(width: 38, height: 38)
            .background {
                if isSelected {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Palette.selected)
                }
            }
            .overlay(alignment: .leading) {
                if isSelected {
                    Capsule()
                        .fill(Palette.indigo)
                        .frame(width: 2, height: 16)
                        .offset(x: -5)
                }
            }
            .help(label)
            .accessibilityLabel(label)
    }
}

private struct CaptureField: View {
    @Binding var text: String
    let isFocused: FocusState<Bool>.Binding
    let matchCount: Int
    let onCapture: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "plus")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(text.isEmpty ? Palette.secondaryText : Palette.indigo)

            TextField("Add or find a task", text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.text)
                .focused(isFocused)
                .onSubmit(onCapture)
                .accessibilityLabel("Add or find a task")

            if !text.isEmpty {
                Text("\(matchCount) MATCHES")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(Palette.tertiaryText)
            }

            Button(action: onCapture) {
                HStack(spacing: 6) {
                    Text("Add")
                    Text("↩")
                        .foregroundStyle(Palette.tertiaryText)
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.secondaryText)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Palette.selected, in: RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Capture task")
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(Palette.input, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(isFocused.wrappedValue ? Palette.indigo.opacity(0.8) : Palette.line, lineWidth: 1)
        }
    }
}

private struct ScopeBar: View {
    @Binding var selection: WorkScope
    let counts: [WorkScope: Int]
    let onSelect: (WorkScope) -> Void

    var body: some View {
        HStack(spacing: 26) {
            ForEach(WorkScope.allCases) { scope in
                Button {
                    onSelect(scope)
                } label: {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 7) {
                            Text(scope.title)
                                .foregroundStyle(selection == scope ? Palette.text : Palette.secondaryText)
                            Text("\(counts[scope, default: 0])")
                                .foregroundStyle(selection == scope ? Palette.indigo : Palette.tertiaryText)
                        }
                        .font(.system(size: 13, weight: selection == scope ? .semibold : .medium))

                        Rectangle()
                            .fill(selection == scope ? Palette.indigo : Color.clear)
                            .frame(height: 2)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(scope.title), \(counts[scope, default: 0]) tasks")
                .accessibilityAddTraits(selection == scope ? .isSelected : [])
            }

            Spacer()

            Text("TYPE TO FILTER · RETURN TO CAPTURE")
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(Palette.tertiaryText)
                .padding(.bottom, 12)
        }
        .frame(height: 48)
    }
}

private struct TaskCanvas: View {
    let items: [WorkItem]
    let selectedItemID: UUID?
    let scope: WorkScope
    let query: String
    let onSelect: (UUID) -> Void
    let onToggle: (UUID) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(scope == .today ? "TODAY" : scope.title.uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.3)
                        .foregroundStyle(Palette.tertiaryText)

                    if scope == .today {
                        Text(Date.now, format: .dateTime.weekday(.wide).month(.abbreviated).day())
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Palette.secondaryText)
                    }
                }

                Spacer()

                Text("\(items.filter { !$0.isCompleted }.count) open")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.tertiaryText)
            }
            .padding(.horizontal, 28)
            .padding(.top, 23)
            .padding(.bottom, 13)

            if items.isEmpty {
                EmptyTasks(query: query)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(items) { item in
                            TaskRow(
                                item: item,
                                isSelected: selectedItemID == item.id,
                                onSelect: { onSelect(item.id) },
                                onToggle: { onToggle(item.id) }
                            )
                            Rectangle()
                                .fill(Palette.line.opacity(0.75))
                                .frame(height: 1)
                                .padding(.leading, 72)
                        }
                    }
                }
            }
        }
    }
}

private struct TaskRow: View {
    let item: WorkItem
    let isSelected: Bool
    let onSelect: () -> Void
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Button(action: onToggle) {
                ZStack {
                    Circle()
                        .stroke(item.isCompleted ? Palette.green : Palette.tertiaryText, lineWidth: 1.4)
                        .frame(width: 18, height: 18)
                    if item.isCompleted {
                        Circle()
                            .fill(Palette.green)
                            .frame(width: 18, height: 18)
                        Image(systemName: "checkmark")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Palette.rail)
                    }
                }
                .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.isCompleted ? "Mark incomplete" : "Mark complete")

            Button(action: onSelect) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(item.isCompleted ? Palette.tertiaryText : Palette.text)
                            .strikethrough(item.isCompleted, color: Palette.tertiaryText)
                            .lineLimit(1)

                        HStack(spacing: 8) {
                            Text(item.project)
                                .foregroundStyle(Palette.secondaryText)
                            Circle()
                                .fill(Palette.tertiaryText)
                                .frame(width: 2.5, height: 2.5)
                            Text(item.timing)
                                .foregroundStyle(Palette.tertiaryText)
                        }
                        .font(.system(size: 11, weight: .medium))
                    }

                    Spacer(minLength: 8)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(isSelected ? Palette.indigo : Palette.tertiaryText.opacity(0.55))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Select \(item.title)")
        }
        .padding(.leading, 24)
        .padding(.trailing, 28)
        .frame(height: 68)
        .background(isSelected ? Palette.selected.opacity(0.72) : Color.clear)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(isSelected ? Palette.indigo : Color.clear)
                .frame(width: 2)
        }
    }
}

private struct EmptyTasks: View {
    let query: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("No matching tasks")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.text)
            Text(query.isEmpty ? "This scope is clear." : "Press Return to capture “\(query)”.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 28)
        .padding(.top, 26)
    }
}

private struct Inspector: View {
    let item: WorkItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("DETAIL")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.4)
                .foregroundStyle(Palette.tertiaryText)
                .padding(.top, 28)

            if let item {
                Text(item.title)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14)

                Text(item.note)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.secondaryText)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 9)

                Rectangle()
                    .fill(Palette.line)
                    .frame(height: 1)
                    .padding(.vertical, 22)

                MetadataRow(label: "STATUS", value: item.isCompleted ? "Completed" : "Open", accent: item.isCompleted)
                MetadataRow(label: "PROJECT", value: item.project)
                MetadataRow(label: "WHEN", value: item.timing)
                MetadataRow(label: "HORIZON", value: item.scope.title)
            } else {
                Text("Select a task to inspect its context.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.secondaryText)
                    .padding(.top, 16)
            }

            Spacer(minLength: 24)

            Rectangle()
                .fill(Palette.line)
                .frame(height: 1)

            Text("AGENT ACTIVITY")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(Palette.tertiaryText)
                .padding(.top, 18)

            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(Palette.green)
                    .frame(width: 7, height: 7)
                    .padding(.top, 5)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Codex")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Palette.text)
                        Spacer()
                        Text("RUNNING")
                            .font(.system(size: 9, weight: .bold))
                            .tracking(0.7)
                            .foregroundStyle(Palette.green)
                    }
                    Text("Building Command Canvas")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.secondaryText)
                    Text("stash · 3m")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(Palette.tertiaryText)
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 24)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Codex running, building Command Canvas")
        }
        .padding(.horizontal, 22)
        .background(Palette.inspector)
    }
}

private struct MetadataRow: View {
    let label: String
    let value: String
    var accent = false

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(Palette.tertiaryText)
                .frame(width: 66, alignment: .leading)

            Text(value)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(accent ? Palette.green : Palette.secondaryText)

            Spacer()
        }
        .padding(.bottom, 14)
    }
}

private enum Palette {
    static let rail = Color(red: 0.085, green: 0.09, blue: 0.105)
    static let canvas = Color(red: 0.11, green: 0.118, blue: 0.135)
    static let inspector = Color(red: 0.125, green: 0.132, blue: 0.15)
    static let input = Color(red: 0.145, green: 0.153, blue: 0.175)
    static let selected = Color(red: 0.175, green: 0.184, blue: 0.21)
    static let line = Color(red: 0.22, green: 0.23, blue: 0.255)
    static let text = Color(red: 0.91, green: 0.915, blue: 0.925)
    static let secondaryText = Color(red: 0.63, green: 0.64, blue: 0.68)
    static let tertiaryText = Color(red: 0.43, green: 0.445, blue: 0.49)
    static let indigo = Color(red: 0.47, green: 0.50, blue: 0.78)
    static let green = Color(red: 0.40, green: 0.70, blue: 0.53)
    static let ink = Color(red: 0.08, green: 0.085, blue: 0.10)
}
