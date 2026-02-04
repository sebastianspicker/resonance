import Foundation
import SwiftData

@MainActor
final class CalendarService: ObservableObject {
    @Published var lastUpdated: Date?

    func refresh(from url: URL, modelContext: ModelContext) async {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let raw = String(data: data, encoding: .utf8) else { return }
            let events = ICalParser.parse(raw)

            let descriptor = FetchDescriptor<CalendarEvent>()
            let existing = (try? modelContext.fetch(descriptor)) ?? []
            existing.forEach { modelContext.delete($0) }

            for event in events {
                let record = CalendarEvent(id: event.id, summary: event.summary, startDate: event.startDate, endDate: event.endDate, location: event.location)
                modelContext.insert(record)
            }
            try? modelContext.save()
            lastUpdated = Date()
        } catch {
            print("Calendar refresh failed: \(error)")
        }
    }
}
