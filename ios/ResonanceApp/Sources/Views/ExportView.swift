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
        var descriptor = FetchDescriptor<LocalPracticeEntry>(
            predicate: #Predicate { $0.practiceDate >= startDate && $0.practiceDate <= endDate && $0.deletedAt == nil }
        )
        descriptor.sortBy = [SortDescriptor(\.practiceDate, order: .forward)]
        let entries = (try? modelContext.fetch(descriptor)) ?? []

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
}
