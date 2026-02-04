import Foundation
import SwiftData

@MainActor
enum PersistenceController {
    static let shared = createContainer()

    static func createContainer(inMemory: Bool = false) -> ModelContainer {
        let schema = Schema([
            LocalCourse.self,
            LocalPracticeEntry.self,
            LocalArtifact.self,
            LocalFeedback.self,
            LocalMarker.self,
            SyncQueueItem.self,
            CalendarEvent.self
        ])
        let config = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }
}
