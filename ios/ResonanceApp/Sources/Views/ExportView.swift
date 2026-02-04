import SwiftUI
import SwiftData

struct ExportView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var startDate = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    @State private var endDate = Date()
    @State private var exportURL: URL?

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
        }
    }

    private func generate() {
        let descriptor = FetchDescriptor<LocalPracticeEntry>(predicate: #Predicate { $0.practiceDate >= startDate && $0.practiceDate <= endDate && $0.deletedAt == nil })
        let entries = (try? modelContext.fetch(descriptor)) ?? []
        let filename = "Resonance_Export_\(Int(Date().timeIntervalSince1970)).pdf"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try PDFExporter.export(entries: entries, to: url)
            exportURL = url
        } catch {
            print("PDF export failed: \(error)")
        }
    }
}
