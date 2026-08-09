import Foundation
import XCTest
@testable import ResonanceApp

// Shared request capture and fixture support for API contract tests.

final class APIClientCaptureURLProtocol: TestRequestURLProtocol {}

final class RequestBodyCapture {
    var body: Data?
}

class APIRequestCaptureTestCase: XCTestCase {
    override func tearDown() {
        APIClientCaptureURLProtocol.requestHandler = nil
        super.tearDown()
    }
}

let artifactSessionCreateResponse = Data(
    """
    {"sessionId":"session-1","artifact":{"id":"artifact-1","entryId":"entry-1",
    "type":"audio","durationSeconds":30,"uploadState":"pending","storageKey":null,
    "remoteUrl":null},"uploadUrl":"https://storage.example.test/upload/session-1",
    "requiredHeaders":{"Content-Type":"audio/m4a"},"expiresInSeconds":900,"currentVersion":8}
    """.utf8
)

let artifactSessionCompletionResponse = Data(
    """
    {"artifact":{"id":"artifact-1","entryId":"entry-1","type":"audio",
    "durationSeconds":30,"uploadState":"uploaded",
    "storageKey":"artifacts/entry-1/artifact-1",
    "remoteUrl":"https://storage.example.test/artifact-1"},"currentVersion":9}
    """.utf8
)

func teachingEntryResponse(captureProfile: String? = nil) -> Data {
    let captureProfileField = captureProfile.map { ",\n    \"captureProfile\": \"\($0)\"" } ?? ""
    return Data(
        """
        {
            "id": "entry-teaching",
            "courseId": "course-1",
            "studentId": "student-1",
            "kind": "teaching_lesson",
            "practiceDate": "2026-02-23T12:00:00Z",
            "goalText": "Teach rhythm ostinato",
            "durationSeconds": null,
            "tags": ["lehramt"],
            "notes": null,
            "status": "draft",
            "consentConfirmedAt": "2026-02-23T12:01:00Z",
            "consentScope": "private_course_review"\(captureProfileField)
        }
        """.utf8
    )
}

@MainActor
func makeCapturingAPIClient() -> APIClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [APIClientCaptureURLProtocol.self]
    return APIClient(session: URLSession(configuration: configuration))
}

@MainActor
func installRequestBodyCapture(
    expectedURL: URL,
    method: String,
    response: Data,
    expectedContentType: String? = nil
) -> RequestBodyCapture {
    let capture = RequestBodyCapture()
    APIClientCaptureURLProtocol.requestHandler = { request in
        XCTAssertEqual(request.url, expectedURL)
        XCTAssertEqual(request.httpMethod, method)
        if let expectedContentType {
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), expectedContentType)
        }
        capture.body = try XCTUnwrap(testRequestBodyData(request))
        return (
            HTTPURLResponse(url: expectedURL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
            response
        )
    }
    return capture
}

func decodedJSON(from capture: RequestBodyCapture) throws -> [String: Any] {
    let body = try XCTUnwrap(capture.body)
    return try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
}

func makeTestArtifact(id: String = "artifact-1") -> LocalArtifact {
    LocalArtifact(
        id: id,
        entryId: "entry-1",
        type: .audio,
        durationSeconds: 30,
        localPath: "/tmp/\(id).m4a"
    )
}
