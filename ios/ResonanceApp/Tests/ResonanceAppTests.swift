import XCTest
import SwiftData
@testable import ResonanceApp

final class ResonanceAppTests: XCTestCase {
    @MainActor
    func testTagsRoundTripWithCommas() {
        let entry = LocalPracticeEntry(
            id: "entry-1",
            courseId: "course-1",
            studentId: "student-1",
            practiceDate: Date(),
            goalText: "Goal",
            durationSeconds: nil,
            tags: ["alpha,beta", "gamma"],
            notes: nil,
            status: .draft
        )

        XCTAssertEqual(entry.tags, ["alpha,beta", "gamma"])

        entry.tags = ["delta,epsilon", "zeta"]
        XCTAssertEqual(entry.tags, ["delta,epsilon", "zeta"])
    }

    @MainActor
    func testSyncQueueEnqueue() throws {
        let container = PersistenceController.createContainer(inMemory: true)
        let auth = AuthManager()
        let syncManager = SyncManager(modelContext: container.mainContext, authManager: auth)

        syncManager.enqueue(type: .createEntry, payload: ["entryId": "entry-1"])

        let items = try container.mainContext.fetch(FetchDescriptor<SyncQueueItem>())
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.type, SyncTaskType.createEntry.rawValue)
    }

    func testICalParser() {
        let ical = """
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:123
SUMMARY:Room 101
DTSTART:20250101T120000Z
DTEND:20250101T130000Z
LOCATION:Building A
END:VEVENT
END:VCALENDAR
"""
        let events = ICalParser.parse(ical)
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events.first?.summary, "Room 101")
    }
}
