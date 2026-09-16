import StashCore
import SwiftUI

struct TodayBudgetSheet: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    @State private var useDefault = true
    @State private var minutes = 360
    @State private var openedDay = Date.now
    @State private var saving = false
    @State private var applied = false
    @State private var error: String?

    private var budget: Int { useDefault ? store.planningPreferences.minuteBudget : minutes }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Today's time budget").font(.title2)
            Text(openedDay.formatted(date: .abbreviated, time: .omitted))
                .font(.subheadline).foregroundStyle(.secondary)
            Toggle("Use default budget (\(ledgerDuration(store.planningPreferences.minuteBudget)))", isOn: $useDefault)
                .disabled(applied).accessibilityIdentifier("stash.budget.use-default")
            if !useDefault {
                Stepper("Available today: \(ledgerDuration(minutes))", value: $minutes, in: 0...960, step: 30)
                    .disabled(applied).accessibilityIdentifier("stash.budget.minutes")
            }
            let over = max(0, store.todayEstimateMinutes - budget)
            Text("\(ledgerDuration(store.todayEstimateMinutes)) planned / \(ledgerDuration(budget)) available"
                 + (over > 0 ? " · \(ledgerDuration(over)) over" : ""))
                .font(.callout).foregroundStyle(over > 0 ? LedgerDesign.warning : .secondary)
            Text("This applies only to today. Tomorrow uses your default budget.")
                .font(.callout).foregroundStyle(.secondary)
            Text(store.planIsLocked
                 ? "Your locked tasks keep their order. Unlock and choose Replan to fit suggestions to this budget."
                 : "Your current tasks stay in place. Choose Replan to fit suggestions to this budget.")
                .font(.callout).foregroundStyle(.secondary)
            if let error { Text(error).font(.callout).foregroundStyle(.red).textSelection(.enabled) }
            HStack {
                Button(applied ? "Close" : "Cancel", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button(saving ? "Saving…" : (applied ? "Retry save" : "Save budget"), action: save)
                    .keyboardShortcut(.defaultAction).accessibilityIdentifier("stash.budget.save")
            }
        }
        .disabled(saving).padding(24).frame(width: 440)
        .interactiveDismissDisabled(saving)
        .onAppear {
            openedDay = store.calendar.startOfDay(for: store.currentDate)
            useDefault = store.todayMinuteBudgetOverride == nil
            minutes = store.todayMinuteBudget
        }
    }

    private func save() {
        do {
            if !applied {
                try store.setTodayMinuteBudget(useDefault ? nil : minutes, expectedDay: openedDay)
                applied = true
            }
            saving = true
            Task {
                let saved = await store.flush()
                saving = false
                if saved { dismiss() }
                else { error = "Today's budget is not saved to disk. Your choice is kept; retry saving." }
            }
        } catch { self.error = error.localizedDescription }
    }
}
