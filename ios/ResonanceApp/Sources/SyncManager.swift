import Foundation
import SwiftData
import UIKit

enum SyncTaskType: String {
    case createEntry
    case createArtifact
    case uploadArtifact
    case confirmArtifact
    case submitEntry
    case deleteEntry
    case postFeedback
}

/// Errors that can occur during sync operations
enum SyncError: LocalizedError {
    case payloadParseError(String)
    case unknownTaskType(String)
    case localFileNotFound(String)
    case invalidPresignUrl(String)
    case localFeedbackNotFound(String)
    case localEntryNotFound(String)
    case localArtifactNotFound(String)
    
    var errorDescription: String? {
        switch self {
        case .payloadParseError(let message): return message
        case .unknownTaskType(let message): return message
        case .localFileNotFound(let message): return message
        case .invalidPresignUrl(let message): return message
        case .localFeedbackNotFound(let message): return message
        case .localEntryNotFound(let message): return message
        case .localArtifactNotFound(let message): return message
        }
    }
}

@MainActor
final class SyncManager: ObservableObject {
    private let apiClient: APIClient
    private let modelContext: ModelContext
    private let authManager: AuthManager
    private let session: URLSession

    @Published var lastSyncedAt: Date?
    @Published var pendingQueueCount: Int = 0
    @Published var failedQueueCount: Int = 0

    init(modelContext: ModelContext, authManager: AuthManager, apiClient: APIClient) {
        self.modelContext = modelContext
        self.authManager = authManager
        self.apiClient = apiClient
        let config = URLSessionConfiguration.background(withIdentifier: "resonance.sync")
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
        updateQueueMetrics()
    }

    func enqueue(type: SyncTaskType, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        let item = SyncQueueItem(id: UUID().uuidString, type: type.rawValue, payloadJSON: json)
        modelContext.insert(item)
        try? modelContext.save()
        updateQueueMetrics()
    }

    func retryFailedItems() {
        let descriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { $0.status == "failed" })
        let failedItems = (try? modelContext.fetch(descriptor)) ?? []
        for item in failedItems {
            item.status = "pending"
            item.nextAttemptAt = nil
            item.lastError = nil
        }
        try? modelContext.save()
        updateQueueMetrics()
    }

    func processQueue() async {
        let taskId = UIApplication.shared.beginBackgroundTask(withName: "ResonanceSync") {
            // Task expiration handler
        }
        
        defer {
            UIApplication.shared.endBackgroundTask(taskId)
        }

        await authManager.refreshIfNeeded()
        guard let accessToken = authManager.session?.accessToken else { return }
        let now = Date()
        let descriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { item in
            item.status == "pending" && (item.nextAttemptAt == nil || item.nextAttemptAt! <= now)
        })
        let items = (try? modelContext.fetch(descriptor)) ?? []

        for item in items {
            do {
                item.status = "processing"
                try await process(item: item, accessToken: accessToken)
                modelContext.delete(item)
            } catch {
                item.retryCount += 1
                item.lastError = String(describing: error)
                
                // If it's a specific validation/client error, don't retry forever.
                if let apiError = error as? APIError, apiError.error.code == "VALIDATION_ERROR" {
                    item.status = "failed"
                } else if (error as NSError).domain == "SyncLocal" && (error as NSError).code == 404 {
                    item.status = "failed" // Item missing locally, can't sync.
                } else {
                    item.status = "pending"
                    let delay = min(pow(2.0, Double(item.retryCount)), 300)
                    item.nextAttemptAt = Date().addingTimeInterval(delay)
                }
                updateArtifactFailureIfNeeded(item: item)
            }
        }
        if !items.isEmpty {
            lastSyncedAt = Date()
        }
        try? modelContext.save()
        updateQueueMetrics()
    }

    private func process(item: SyncQueueItem, accessToken: String) async throws {
        // Parse payload - throw error instead of silent return on failure
        guard let data = item.payloadJSON.data(using: .utf8) else {
            throw SyncError.payloadParseError("Failed to convert payload to data")
        }
        
        guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SyncError.payloadParseError("Failed to parse payload as JSON dictionary")
        }

        // Validate task type - throw error for unknown types
        guard let taskType = SyncTaskType(rawValue: item.type) else {
            throw SyncError.unknownTaskType("Unknown sync task type: \(item.type)")
        }

        switch taskType {
        case .createEntry:
            let entryId = payload["entryId"] as? String ?? ""
            let entry = try fetchEntry(id: entryId)
            _ = try await apiClient.createEntry(accessToken: accessToken, courseId: entry.courseId, entry: entry)

        case .createArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            let artifact = try fetchArtifact(id: artifactId)
            _ = try await apiClient.createArtifact(accessToken: accessToken, entryId: artifact.entryId, artifact: artifact)
            artifact.syncPhase = .queued
            try? modelContext.save()

        case .uploadArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            let artifact = try fetchArtifact(id: artifactId)
            artifact.uploadState = .uploading
            artifact.syncPhase = .uploading
            try? modelContext.save()
            
            // Critical check: Does the file actually exist?
            guard FileManager.default.fileExists(atPath: artifact.localPath) else {
                throw SyncError.localFileNotFound("Local file not found for artifact \(artifactId) at \(artifact.localPath)")
            }
            
            let presign = try await apiClient.presignArtifact(accessToken: accessToken, artifactId: artifact.id)
            
            // Validate presign URL before upload
            guard let url = URL(string: presign.uploadUrl), url.scheme != nil else {
                throw SyncError.invalidPresignUrl("Invalid presign URL for artifact \(artifactId)")
            }
            
            try await uploadFile(
                urlString: presign.uploadUrl,
                fileURL: URL(fileURLWithPath: artifact.localPath),
                requiredHeaders: presign.requiredHeaders ?? [:]
            )
            artifact.syncPhase = .confirming
            try? modelContext.save()

        case .confirmArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            let response = try await apiClient.confirmArtifact(accessToken: accessToken, artifactId: artifactId)
            let artifact = try fetchArtifact(id: artifactId)
            artifact.uploadState = UploadState(rawValue: response.uploadState) ?? .uploaded
            artifact.syncPhase = .uploaded
            artifact.storageKey = response.storageKey
            artifact.remoteUrl = response.remoteUrl
            try? modelContext.save()

        case .submitEntry:
            let entryId = payload["entryId"] as? String ?? ""
            _ = try await apiClient.submitEntry(accessToken: accessToken, entryId: entryId)
            let entry = try fetchEntry(id: entryId)
            entry.status = .submitted
            try? modelContext.save()

        case .deleteEntry:
            let entryId = payload["entryId"] as? String ?? ""
            try await apiClient.deleteEntry(accessToken: accessToken, entryId: entryId)

        case .postFeedback:
            let targetType = payload["targetType"] as? String ?? "entry"
            let targetId = payload["targetId"] as? String ?? ""
            let feedbackId = payload["feedbackId"] as? String ?? ""
            
            // Fetch the local feedback to get markers
            let descriptor = FetchDescriptor<LocalFeedback>(predicate: #Predicate { $0.id == feedbackId })
            guard let feedback = try modelContext.fetch(descriptor).first else {
                throw SyncError.localFeedbackNotFound("Local feedback not found: \(feedbackId)")
            }
            let status = feedback.status
            let commentsText = feedback.commentsText
            let markers = feedback.markers
            _ = try await apiClient.createFeedback(accessToken: accessToken, targetType: targetType, targetId: targetId, status: status, commentsText: commentsText, markers: markers)
            if targetType == "entry", let entry = try? fetchEntry(id: targetId) {
                entry.status = .reviewed
                try? modelContext.save()
            } else if targetType == "artifact", let artifact = try? fetchArtifact(id: targetId), let entry = try? fetchEntry(id: artifact.entryId) {
                entry.status = .reviewed
                try? modelContext.save()
            }
        }
    }

    private func fetchFirst<T: PersistentModel>(_ descriptor: FetchDescriptor<T>) throws -> T {
        guard let first = try modelContext.fetch(descriptor).first else {
            throw NSError(domain: "SyncLocal", code: 404, userInfo: [NSLocalizedDescriptionKey: "Item not found in local DB"])
        }
        return first
    }

    private func fetchEntry(id: String) throws -> LocalPracticeEntry {
        try fetchFirst(FetchDescriptor<LocalPracticeEntry>(predicate: #Predicate { $0.id == id }))
    }

    private func fetchArtifact(id: String) throws -> LocalArtifact {
        try fetchFirst(FetchDescriptor<LocalArtifact>(predicate: #Predicate { $0.id == id }))
    }

    private func updateArtifactFailureIfNeeded(item: SyncQueueItem) {
        guard item.type == SyncTaskType.createArtifact.rawValue ||
                item.type == SyncTaskType.uploadArtifact.rawValue ||
                item.type == SyncTaskType.confirmArtifact.rawValue else {
            return
        }
        guard let data = item.payloadJSON.data(using: .utf8),
              let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let artifactId = payload["artifactId"] as? String,
              let artifact = try? fetchArtifact(id: artifactId) else {
            return
        }
        artifact.uploadState = .failed
        artifact.syncPhase = .failed
        try? modelContext.save()
    }

    private func updateQueueMetrics() {
        let pendingDescriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate {
            $0.status == "pending" || $0.status == "processing"
        })
        let failedDescriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { $0.status == "failed" })
        pendingQueueCount = ((try? modelContext.fetch(pendingDescriptor)) ?? []).count
        failedQueueCount = ((try? modelContext.fetch(failedDescriptor)) ?? []).count
    }

    private func uploadFile(
        urlString: String,
        fileURL: URL,
        requiredHeaders: [String: String]
    ) async throws {
        guard let url = URL(string: urlString) else {
            throw SyncError.invalidPresignUrl("Invalid presign URL: \(urlString)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        for (header, value) in requiredHeaders {
            request.setValue(value, forHTTPHeaderField: header)
        }
        let (data, response) = try await session.upload(for: request, fromFile: fileURL)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw URLError(.badServerResponse)
        }
        if data.isEmpty == false {
            _ = data
        }
    }
}
