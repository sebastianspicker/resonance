import Foundation
import os
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
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "resonance", category: "SyncManager")
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
        saveContext()
        updateQueueMetrics()
    }

    func retryFailedItems() {
        let descriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { $0.status == "failed" })
        let failedItems: [SyncQueueItem]
        do {
            failedItems = try modelContext.fetch(descriptor)
        } catch {
            Self.logger.error("Failed to fetch failed sync items for retry: \(error.localizedDescription)")
            return
        }
        for item in failedItems {
            item.status = "pending"
            item.nextAttemptAt = nil
            item.lastError = nil
        }
        saveContext()
        updateQueueMetrics()
    }

    func processQueue() async {
        let taskId = UIApplication.shared.beginBackgroundTask(withName: "ResonanceSync") {
            // Background time expired: reset any stuck "processing" items so they retry next launch.
            let stuckDescriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { $0.status == "processing" })
            do {
                let stuck = try self.modelContext.fetch(stuckDescriptor)
                for item in stuck {
                    item.status = "pending"
                    item.nextAttemptAt = nil
                }
                if !stuck.isEmpty { self.saveContext() }
            } catch {
                Self.logger.error("Failed to fetch stuck sync items on background expiry: \(error.localizedDescription)")
            }
        }
        
        defer {
            UIApplication.shared.endBackgroundTask(taskId)
        }

        await authManager.refreshIfNeeded()
        guard let accessToken = authManager.session?.accessToken else { return }
        let now = Date()
        let descriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { item in
            item.status == "pending" && (item.nextAttemptAt == nil || (item.nextAttemptAt ?? .distantFuture) <= now)
        })
        let items: [SyncQueueItem]
        do {
            items = try modelContext.fetch(descriptor)
        } catch {
            Self.logger.error("Failed to fetch pending sync items: \(error.localizedDescription)")
            return
        }

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
                    item.status = "failed" // Item missing locally (via fetchFirst), can't sync.
                } else if error is SyncError {
                    item.status = "failed" // Any typed SyncError (missing local data, bad payload) is non-retryable.
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
        saveContext()
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
            saveContext()

        case .uploadArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            let artifact = try fetchArtifact(id: artifactId)
            artifact.uploadState = .uploading
            artifact.syncPhase = .uploading
            saveContext()
            
            // Fail fast before requesting a presign URL: missing file can't be recovered by retry.
            guard FileManager.default.fileExists(atPath: artifact.localPath) else {
                throw SyncError.localFileNotFound("Local file not found for artifact \(artifactId) at \(artifact.localPath)")
            }

            let presign = try await apiClient.presignArtifact(accessToken: accessToken, artifactId: artifact.id)

            guard let uploadURL = URL(string: presign.uploadUrl), uploadURL.scheme != nil else {
                throw SyncError.invalidPresignUrl("Invalid presign URL for artifact \(artifactId)")
            }

            try await uploadFile(
                url: uploadURL,
                fileURL: URL(fileURLWithPath: artifact.localPath),
                requiredHeaders: presign.requiredHeaders ?? [:]
            )
            artifact.syncPhase = .confirming
            saveContext()

        case .confirmArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            let response = try await apiClient.confirmArtifact(accessToken: accessToken, artifactId: artifactId)
            let artifact = try fetchArtifact(id: artifactId)
            artifact.uploadState = UploadState(rawValue: response.uploadState) ?? .uploaded
            artifact.syncPhase = .uploaded
            artifact.storageKey = response.storageKey
            artifact.remoteUrl = response.remoteUrl
            saveContext()

        case .submitEntry:
            let entryId = payload["entryId"] as? String ?? ""
            _ = try await apiClient.submitEntry(accessToken: accessToken, entryId: entryId)
            let entry = try fetchEntry(id: entryId)
            entry.status = .submitted
            saveContext()

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
                saveContext()
            } else if targetType == "artifact", let artifact = try? fetchArtifact(id: targetId), let entry = try? fetchEntry(id: artifact.entryId) {
                entry.status = .reviewed
                saveContext()
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
        saveContext()
    }

    private func saveContext() {
        do {
            try modelContext.save()
        } catch {
            Self.logger.error("Failed to save model context: \(error.localizedDescription)")
        }
    }

    private func updateQueueMetrics() {
        let pendingDescriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate {
            $0.status == "pending" || $0.status == "processing"
        })
        let failedDescriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { $0.status == "failed" })
        do {
            pendingQueueCount = try modelContext.fetch(pendingDescriptor).count
            failedQueueCount = try modelContext.fetch(failedDescriptor).count
        } catch {
            Self.logger.error("Failed to update queue metrics: \(error.localizedDescription)")
        }
    }

    private func uploadFile(
        url: URL,
        fileURL: URL,
        requiredHeaders: [String: String]
    ) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        for (header, value) in requiredHeaders {
            request.setValue(value, forHTTPHeaderField: header)
        }
        let (_, response) = try await session.upload(for: request, fromFile: fileURL)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw URLError(.badServerResponse)
        }
    }
}
