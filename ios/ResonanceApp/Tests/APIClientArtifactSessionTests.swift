import SwiftData
import XCTest
@testable import ResonanceApp

final class APIClientArtifactSessionTests: APIRequestCaptureTestCase {
    @MainActor
    func testArtifactSessionsUseV1CreateAndCompletionContracts() async throws {
        let createURL = AppConfig.apiV1URL(path: "artifact-sessions")
        let completionURL = AppConfig.apiV1URL(path: "artifact-sessions/session-1/complete")
        var capturedCreateBody: Data?
        var requestedURLs: [URL] = []
        APIClientCaptureURLProtocol.requestHandler = { request in
            requestedURLs.append(try XCTUnwrap(request.url))
            switch request.url {
            case createURL:
                XCTAssertEqual(request.httpMethod, "POST")
                capturedCreateBody = try XCTUnwrap(testRequestBodyData(request))
                return (
                    HTTPURLResponse(url: createURL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                    artifactSessionCreateResponse
                )
            case completionURL:
                XCTAssertEqual(request.httpMethod, "POST")
                return (
                    HTTPURLResponse(url: completionURL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                    artifactSessionCompletionResponse
                )
            default:
                XCTFail("Unexpected request: \(request.url?.absoluteString ?? "nil")")
                return (HTTPURLResponse(url: createURL, statusCode: 500, httpVersion: nil, headerFields: nil)!, Data())
            }
        }
        let artifact = makeTestArtifact()
        let client = makeCapturingAPIClient()

        let create = try await client.createArtifactSession(
            accessToken: "access-token",
            request: ArtifactSessionRequest(
                operationId: "operation-1",
                entryId: "entry-1",
                artifact: artifact,
                sizeBytes: 4_096,
                baseVersion: 7
            )
        )
        let completion = try await client.completeArtifactSession(accessToken: "access-token", sessionId: create.sessionId)

        let createBody = try XCTUnwrap(capturedCreateBody)
        let createPayload = try XCTUnwrap(JSONSerialization.jsonObject(with: createBody) as? [String: Any])
        XCTAssertEqual(createPayload["operationId"] as? String, "operation-1")
        XCTAssertEqual(createPayload["entryId"] as? String, "entry-1")
        XCTAssertEqual(createPayload["artifactId"] as? String, "artifact-1")
        XCTAssertEqual(createPayload["baseVersion"] as? Int, 7)
        XCTAssertEqual(requestedURLs, [createURL, completionURL])
        XCTAssertEqual(create.currentVersion, 8)
        XCTAssertEqual(completion.currentVersion, 9)
    }
}
