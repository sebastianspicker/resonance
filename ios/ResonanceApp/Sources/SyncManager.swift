import Foundation
import SwiftData

enum SyncTaskType: String {
    case createEntry
    case createArtifact
    case uploadArtifact
    case confirmArtifact
    case submitEntry
    case deleteEntry
    case postFeedback
}

@MainActor
final class SyncManager: ObservableObject {
    private let apiClient = APIClient()
    private let modelContext: ModelContext
    private let authManager: AuthManager
    private let session: URLSession

    init(modelContext: ModelContext, authManager: AuthManager) {
        self.modelContext = modelContext
        self.authManager = authManager
        let config = URLSessionConfiguration.background(withIdentifier: "resonance.sync")
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    func enqueue(type: SyncTaskType, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        let item = SyncQueueItem(id: UUID().uuidString, type: type.rawValue, payloadJSON: json)
        modelContext.insert(item)
        try? modelContext.save()
    }

    func processQueue() async {
        await authManager.refreshIfNeeded()
        guard let accessToken = authManager.session?.accessToken else { return }
        let now = Date()
        let descriptor = FetchDescriptor<SyncQueueItem>(predicate: #Predicate { item in
            item.status == "pending" && (item.nextAttemptAt == nil || item.nextAttemptAt! <= now)
        })
        let items = (try? modelContext.fetch(descriptor)) ?? []

        for item in items {
            do {
                try await process(item: item, accessToken: accessToken)
                modelContext.delete(item)
            } catch {
                item.retryCount += 1
                item.lastError = String(describing: error)
                let delay = min(pow(2.0, Double(item.retryCount)), 300)
                item.nextAttemptAt = Date().addingTimeInterval(delay)
            }
        }
        try? modelContext.save()
    }

    private func process(item: SyncQueueItem, accessToken: String) async throws {
        guard let data = item.payloadJSON.data(using: .utf8),
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        switch SyncTaskType(rawValue: item.type) {
        case .createEntry:
            let entryId = payload["entryId"] as? String ?? ""
            let entry = try fetchEntry(id: entryId)
            _ = try await apiClient.createEntry(accessToken: accessToken, courseId: entry.courseId, entry: entry)

        case .createArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            let artifact = try fetchArtifact(id: artifactId)
            _ = try await apiClient.createArtifact(accessToken: accessToken, entryId: artifact.entryId, artifact: artifact)

        case .uploadArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            let artifact = try fetchArtifact(id: artifactId)
            let presign = try await apiClient.presignArtifact(accessToken: accessToken, artifactId: artifact.id)
            try await uploadFile(urlString: presign.uploadUrl, fileURL: URL(fileURLWithPath: artifact.localPath))

        case .confirmArtifact:
            let artifactId = payload["artifactId"] as? String ?? ""
            _ = try await apiClient.confirmArtifact(accessToken: accessToken, artifactId: artifactId)

        case .submitEntry:
            let entryId = payload["entryId"] as? String ?? ""
            _ = try await apiClient.submitEntry(accessToken: accessToken, entryId: entryId)

        case .deleteEntry:
            let entryId = payload["entryId"] as? String ?? ""
            try await apiClient.deleteEntry(accessToken: accessToken, entryId: entryId)

        case .postFeedback:
            let targetType = payload["targetType"] as? String ?? "entry"
            let targetId = payload["targetId"] as? String ?? ""
            let status = FeedbackStatus(rawValue: payload["status"] as? String ?? "ok") ?? .ok
            let commentsText = payload["commentsText"] as? String ?? ""
            _ = try await apiClient.createFeedback(accessToken: accessToken, targetType: targetType, targetId: targetId, status: status, commentsText: commentsText, markers: [])

        case .none:
            break
        }
    }

    private func fetchEntry(id: String) throws -> LocalPracticeEntry {
        let descriptor = FetchDescriptor<LocalPracticeEntry>(predicate: #Predicate { $0.id == id })
        guard let entry = try modelContext.fetch(descriptor).first else {
            throw NSError(domain: "Sync", code: 404)
        }
        return entry
    }

    private func fetchArtifact(id: String) throws -> LocalArtifact {
        let descriptor = FetchDescriptor<LocalArtifact>(predicate: #Predicate { $0.id == id })
        guard let artifact = try modelContext.fetch(descriptor).first else {
            throw NSError(domain: "Sync", code: 404)
        }
        return artifact
    }

    private func uploadFile(urlString: String, fileURL: URL) async throws {
        guard let url = URL(string: urlString) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        let (data, response) = try await session.upload(for: request, fromFile: fileURL)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw URLError(.badServerResponse)
        }
        if data.isEmpty == false {
            _ = data
        }
    }
}
