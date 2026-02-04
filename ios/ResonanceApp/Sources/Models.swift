import Foundation
import SwiftData

enum EntryStatus: String, Codable {
    case draft
    case submitted
}

enum ArtifactType: String, Codable {
    case audio
    case video
}

enum UploadState: String, Codable {
    case pending
    case uploading
    case uploaded
    case failed
}

enum FeedbackStatus: String, Codable {
    case ok
    case needsRevision = "needs_revision"
    case nextGoal = "next_goal"
}

@Model
final class LocalCourse {
    @Attribute(.unique) var id: String
    var title: String
    var roleInCourse: String

    init(id: String, title: String, roleInCourse: String) {
        self.id = id
        self.title = title
        self.roleInCourse = roleInCourse
    }
}

@Model
final class LocalPracticeEntry {
    @Attribute(.unique) var id: String
    var courseId: String
    var studentId: String
    var practiceDate: Date
    var goalText: String
    var durationSeconds: Int?
    var tagsCSV: String
    var notes: String?
    var statusRaw: String
    var updatedAt: Date
    var deletedAt: Date?

    @Relationship(deleteRule: .cascade) var artifacts: [LocalArtifact]
    @Relationship(deleteRule: .cascade) var feedback: [LocalFeedback]

    init(id: String,
         courseId: String,
         studentId: String,
         practiceDate: Date,
         goalText: String,
         durationSeconds: Int?,
         tags: [String],
         notes: String?,
         status: EntryStatus) {
        self.id = id
        self.courseId = courseId
        self.studentId = studentId
        self.practiceDate = practiceDate
        self.goalText = goalText
        self.durationSeconds = durationSeconds
        self.tagsCSV = encodeTags(tags)
        self.notes = notes
        self.statusRaw = status.rawValue
        self.updatedAt = Date()
        self.deletedAt = nil
        self.artifacts = []
        self.feedback = []
    }

    var status: EntryStatus {
        get { EntryStatus(rawValue: statusRaw) ?? .draft }
        set { statusRaw = newValue.rawValue }
    }

    var tags: [String] {
        get { decodeTags(tagsCSV) }
        set { tagsCSV = encodeTags(newValue) }
    }
}

private func encodeTags(_ tags: [String]) -> String {
    if let data = try? JSONEncoder().encode(tags),
       let json = String(data: data, encoding: .utf8) {
        return json
    }
    return tags.joined(separator: ",")
}

private func decodeTags(_ value: String) -> [String] {
    if let data = value.data(using: .utf8),
       let decoded = try? JSONDecoder().decode([String].self, from: data) {
        return decoded
    }
    return value.split(separator: ",").map { String($0) }
}

@Model
final class LocalArtifact {
    @Attribute(.unique) var id: String
    var entryId: String
    var typeRaw: String
    var durationSeconds: Int
    var createdAt: Date
    var uploadStateRaw: String
    var storageKey: String?
    var remoteUrl: String?
    var localPath: String

    init(id: String, entryId: String, type: ArtifactType, durationSeconds: Int, localPath: String) {
        self.id = id
        self.entryId = entryId
        self.typeRaw = type.rawValue
        self.durationSeconds = durationSeconds
        self.createdAt = Date()
        self.uploadStateRaw = UploadState.pending.rawValue
        self.storageKey = nil
        self.remoteUrl = nil
        self.localPath = localPath
    }

    var type: ArtifactType {
        get { ArtifactType(rawValue: typeRaw) ?? .audio }
        set { typeRaw = newValue.rawValue }
    }

    var uploadState: UploadState {
        get { UploadState(rawValue: uploadStateRaw) ?? .pending }
        set { uploadStateRaw = newValue.rawValue }
    }
}

@Model
final class LocalFeedback {
    @Attribute(.unique) var id: String
    var targetType: String
    var targetId: String
    var teacherName: String
    var statusRaw: String
    var commentsText: String
    var createdAt: Date
    @Relationship(deleteRule: .cascade) var markers: [LocalMarker]

    init(id: String, targetType: String, targetId: String, teacherName: String, status: FeedbackStatus, commentsText: String) {
        self.id = id
        self.targetType = targetType
        self.targetId = targetId
        self.teacherName = teacherName
        self.statusRaw = status.rawValue
        self.commentsText = commentsText
        self.createdAt = Date()
        self.markers = []
    }

    var status: FeedbackStatus {
        get { FeedbackStatus(rawValue: statusRaw) ?? .ok }
        set { statusRaw = newValue.rawValue }
    }
}

@Model
final class LocalMarker {
    @Attribute(.unique) var id: String
    var timeSeconds: Int
    var text: String

    init(id: String, timeSeconds: Int, text: String) {
        self.id = id
        self.timeSeconds = timeSeconds
        self.text = text
    }
}

@Model
final class SyncQueueItem {
    @Attribute(.unique) var id: String
    var type: String
    var payloadJSON: String
    var status: String
    var retryCount: Int
    var lastError: String?
    var createdAt: Date
    var nextAttemptAt: Date?

    init(id: String, type: String, payloadJSON: String) {
        self.id = id
        self.type = type
        self.payloadJSON = payloadJSON
        self.status = "pending"
        self.retryCount = 0
        self.createdAt = Date()
        self.nextAttemptAt = nil
    }
}

@Model
final class CalendarEvent {
    @Attribute(.unique) var id: String
    var summary: String
    var startDate: Date
    var endDate: Date
    var location: String?

    init(id: String, summary: String, startDate: Date, endDate: Date, location: String?) {
        self.id = id
        self.summary = summary
        self.startDate = startDate
        self.endDate = endDate
        self.location = location
    }
}
