import Foundation

struct APIError: Error, Decodable {
    let error: APIErrorBody

    struct APIErrorBody: Decodable {
        let code: String
        let message: String
        let details: [String: String]?
    }
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let user: UserResponse?

    struct UserResponse: Decodable {
        let id: String
        let displayName: String
        let globalRole: String
    }
}

struct CourseResponse: Decodable {
    let id: String
    let title: String
    let roleInCourse: String
}

struct EntryResponse: Decodable {
    let id: String
    let courseId: String
    let studentId: String
    let practiceDate: Date
    let goalText: String
    let durationSeconds: Int?
    let tags: [String]
    let notes: String?
    let status: String
}

struct ReviewQueueResponse: Decodable {
    let id: String
    let courseId: String
    let studentId: String
    let studentName: String
    let practiceDate: Date
    let goalText: String
    let notes: String?
    let artifacts: [ArtifactResponse]
}

struct ArtifactResponse: Decodable {
    let id: String
    let entryId: String
    let type: String
    let durationSeconds: Int
    let uploadState: String
    let storageKey: String?
    let remoteUrl: String?
}

struct PresignResponse: Decodable {
    let uploadUrl: String
    let storageKey: String
    let expiresInSeconds: Int
}

struct FeedbackResponse: Decodable {
    let id: String
    let targetType: String
    let targetId: String
    let teacherName: String
    let createdAt: Date
    let status: String
    let commentsText: String
    let markers: [MarkerResponse]
}

struct MarkerResponse: Decodable {
    let id: String
    let timeSeconds: Int
    let text: String
}

final class APIClient {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func exchangeCodeForTokens(code: String) async throws -> AuthSession {
        let url = AppConfig.apiBaseURL.appendingPathComponent("auth/session")
        let body: [String: String] = [
            "code": code,
            "redirectUri": AppConfig.authCallbackURL.absoluteString
        ]
        let response: TokenResponse = try await send(url: url, method: "POST", body: body, accessToken: nil)
        guard let user = response.user else {
            throw URLError(.badServerResponse)
        }
        return AuthSession(accessToken: response.accessToken, refreshToken: response.refreshToken, userId: user.id, displayName: user.displayName, globalRole: user.globalRole)
    }

    func refreshTokens(refreshToken: String) async throws -> (accessToken: String, refreshToken: String) {
        let url = AppConfig.apiBaseURL.appendingPathComponent("auth/refresh")
        let body = ["refreshToken": refreshToken]
        let response: TokenResponse = try await send(url: url, method: "POST", body: body, accessToken: nil)
        return (response.accessToken, response.refreshToken)
    }

    func fetchCourses(accessToken: String) async throws -> [CourseResponse] {
        let url = AppConfig.apiBaseURL.appendingPathComponent("courses")
        return try await send(url: url, method: "GET", body: Optional<EmptyBody>.none, accessToken: accessToken)
    }

    func createEntry(accessToken: String, courseId: String, entry: LocalPracticeEntry) async throws -> EntryResponse {
        let url = AppConfig.apiBaseURL.appendingPathComponent("courses/\(courseId)/entries")
        let body: [String: Any] = [
            "id": entry.id,
            "practiceDate": entry.practiceDate.iso8601String,
            "goalText": entry.goalText,
            "durationSeconds": entry.durationSeconds as Any,
            "tags": entry.tags,
            "notes": entry.notes as Any
        ]
        return try await sendAny(url: url, method: "POST", body: body, accessToken: accessToken)
    }

    func createArtifact(accessToken: String, entryId: String, artifact: LocalArtifact) async throws -> ArtifactResponse {
        let url = AppConfig.apiBaseURL.appendingPathComponent("entries/\(entryId)/artifacts")
        let body: [String: Any] = [
            "id": artifact.id,
            "type": artifact.type.rawValue,
            "durationSeconds": artifact.durationSeconds
        ]
        return try await sendAny(url: url, method: "POST", body: body, accessToken: accessToken)
    }

    func presignArtifact(accessToken: String, artifactId: String) async throws -> PresignResponse {
        let url = AppConfig.apiBaseURL.appendingPathComponent("artifacts/\(artifactId)/presign")
        return try await send(url: url, method: "POST", body: Optional<EmptyBody>.none, accessToken: accessToken)
    }

    func confirmArtifact(accessToken: String, artifactId: String) async throws -> ArtifactResponse {
        let url = AppConfig.apiBaseURL.appendingPathComponent("artifacts/\(artifactId)/confirm")
        return try await send(url: url, method: "POST", body: Optional<EmptyBody>.none, accessToken: accessToken)
    }

    func submitEntry(accessToken: String, entryId: String) async throws -> EntryResponse {
        let url = AppConfig.apiBaseURL.appendingPathComponent("entries/\(entryId)/submit")
        return try await send(url: url, method: "POST", body: Optional<EmptyBody>.none, accessToken: accessToken)
    }

    func deleteEntry(accessToken: String, entryId: String) async throws {
        let url = AppConfig.apiBaseURL.appendingPathComponent("entries/\(entryId)")
        let _: EntryResponse = try await send(url: url, method: "DELETE", body: Optional<EmptyBody>.none, accessToken: accessToken)
    }

    func fetchReviewQueue(accessToken: String, courseId: String) async throws -> [ReviewQueueResponse] {
        let url = AppConfig.apiBaseURL.appendingPathComponent("courses/\(courseId)/review-queue")
        return try await send(url: url, method: "GET", body: Optional<EmptyBody>.none, accessToken: accessToken)
    }

    func createFeedback(accessToken: String, targetType: String, targetId: String, status: FeedbackStatus, commentsText: String, markers: [LocalMarker]) async throws -> FeedbackResponse {
        let url = AppConfig.apiBaseURL.appendingPathComponent("feedback")
        let body: [String: Any] = [
            "targetType": targetType,
            "targetId": targetId,
            "status": status.rawValue,
            "commentsText": commentsText,
            "markers": markers.map { ["timeSeconds": $0.timeSeconds, "text": $0.text] }
        ]
        return try await sendAny(url: url, method: "POST", body: body, accessToken: accessToken)
    }

    func fetchFeedback(accessToken: String, entryId: String) async throws -> [FeedbackResponse] {
        let url = AppConfig.apiBaseURL.appendingPathComponent("entries/\(entryId)/feedback")
        return try await send(url: url, method: "GET", body: Optional<EmptyBody>.none, accessToken: accessToken)
    }

    private struct EmptyBody: Encodable {}

    private func send<Response: Decodable, Body: Encodable>(url: URL, method: String, body: Body?, accessToken: String?) async throws -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if method != "GET" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if let body = body {
            let data = try JSONEncoder.apiEncoder.encode(body)
            request.httpBody = data
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        if http.statusCode >= 400 {
            if let apiError = try? JSONDecoder.apiDecoder.decode(APIError.self, from: data) {
                throw apiError
            }
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder.apiDecoder.decode(Response.self, from: data)
    }

    private func sendAny<T: Decodable>(url: URL, method: String, body: [String: Any], accessToken: String?) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        if http.statusCode >= 400 {
            if let apiError = try? JSONDecoder.apiDecoder.decode(APIError.self, from: data) {
                throw apiError
            }
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder.apiDecoder.decode(T.self, from: data)
    }
}

extension JSONEncoder {
    static let apiEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

extension JSONDecoder {
    static let apiDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

extension Date {
    var iso8601String: String {
        ISO8601DateFormatter().string(from: self)
    }
}
