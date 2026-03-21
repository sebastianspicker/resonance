import Foundation
import os
import SwiftData

private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "resonance", category: "Persistence")

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
            logger.error("Failed to create ModelContainer: \(error.localizedDescription). Attempting recovery by deleting corrupt store.")

            // Attempt recovery: delete the default store file and retry.
            if !inMemory {
                deleteDefaultStoreFiles()
                do {
                    return try ModelContainer(for: schema, configurations: [config])
                } catch {
                    logger.fault("Failed to create ModelContainer after store reset: \(error.localizedDescription). Falling back to in-memory store.")
                }
            }

            // Last resort: use an in-memory store so the app can launch.
            let memoryConfig = ModelConfiguration(isStoredInMemoryOnly: true)
            do {
                return try ModelContainer(for: schema, configurations: [memoryConfig])
            } catch {
                // If even an in-memory container fails, the schema itself is broken.
                // This is a programmer error that cannot be recovered at runtime.
                fatalError("Unable to create even an in-memory ModelContainer: \(error)")
            }
        }
    }

    /// Deletes the default SwiftData/SQLite store files from the application support directory.
    private static func deleteDefaultStoreFiles() {
        guard let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return
        }
        let storePath = appSupport.appendingPathComponent("default.store").path
        let paths = [storePath, storePath + "-shm", storePath + "-wal"]
        for path in paths {
            do {
                if FileManager.default.fileExists(atPath: path) {
                    try FileManager.default.removeItem(atPath: path)
                    logger.info("Deleted corrupt store file: \(path)")
                }
            } catch {
                logger.warning("Could not delete store file \(path): \(error.localizedDescription)")
            }
        }
    }
}
