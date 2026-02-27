import SwiftUI
import SwiftData

struct ExportView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var startDate = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    @State private var endDate = Date()
    @State private var exportURL: URL?
    @State private var errorMessage: String?
    @State private var showErrorAlert = false
    @State private var showEmptyRangeMessage = false

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Start", selection: $startDate, displayedComponents: [.date])
                DatePicker("End", selection: $endDate, displayedComponents: [.date])

                if let stats = buildStats(entries: entriesInRange()) {
                    Section("Practice Stats") {
                        statRow("Entries", value: "\(stats.entryCount)")
                        statRow("Total Duration", value: "\(stats.totalDurationSeconds)s")
                        statRow("Draft", value: "\(stats.draftCount)")
                        statRow("Submitted", value: "\(stats.submittedCount)")
                        statRow("Reviewed", value: "\(stats.reviewedCount)")
                    }
                }

                Button("Generate PDF") {
                    generate()
                }

                if let exportURL {
                    ShareLink("Share PDF", item: exportURL)
                }
            }
            .navigationTitle("Export")
            .alert("Export failed", isPresented: $showErrorAlert) {
                Button("OK") { showErrorAlert = false; errorMessage = nil }
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
            .alert("No entries", isPresented: $showEmptyRangeMessage) {
                Button("OK") { showEmptyRangeMessage = false }
            } message: {
                Text("No entries in the selected date range.")
            }
        }
    }

    private func generate() {
        errorMessage = nil
        let entries = entriesInRange()

        if entries.isEmpty {
            showEmptyRangeMessage = true
            return
        }

        let filename = "Resonance_Export_\(Int(Date().timeIntervalSince1970))_\(UUID().uuidString.prefix(8)).pdf"
        let exportDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Exports", isDirectory: true)
        try? FileManager.default.createDirectory(at: exportDir, withIntermediateDirectories: true)
        let url = exportDir.appendingPathComponent(filename)

        do {
            try PDFExporter.export(entries: entries, to: url)
            exportURL = url
        } catch {
            errorMessage = error.localizedDescription
            showErrorAlert = true
        }
    }

    private func entriesInRange() -> [LocalPracticeEntry] {
        var descriptor = FetchDescriptor<LocalPracticeEntry>(
            predicate: #Predicate { $0.practiceDate >= startDate && $0.practiceDate <= endDate && $0.deletedAt == nil }
        )
        descriptor.sortBy = [SortDescriptor(\.practiceDate, order: .forward)]
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func buildStats(entries: [LocalPracticeEntry]) -> ExportStats? {
        guard entries.isEmpty == false else { return nil }
        let totalDuration = entries.reduce(0) { partial, entry in
            partial + (entry.durationSeconds ?? 0)
        }
        let draftCount = entries.filter { $0.status == .draft }.count
        let submittedCount = entries.filter { $0.status == .submitted }.count
        let reviewedCount = entries.filter { $0.status == .reviewed }.count
        return ExportStats(
            entryCount: entries.count,
            totalDurationSeconds: totalDuration,
            draftCount: draftCount,
            submittedCount: submittedCount,
            reviewedCount: reviewedCount
        )
    }

    private func statRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }
}

private struct ExportStats {
    let entryCount: Int
    let totalDurationSeconds: Int
    let draftCount: Int
    let submittedCount: Int
    let reviewedCount: Int
}
