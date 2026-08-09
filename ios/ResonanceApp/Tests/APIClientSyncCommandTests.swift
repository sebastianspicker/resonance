import SwiftData
import XCTest
@testable import ResonanceApp

final class APIClientSyncCommandTests: APIRequestCaptureTestCase {
    @MainActor
    func testSyncCommandsUsesVersionedAbsolutePathAndEncodesOperationMetadata() async throws {
        let expectedURL = AppConfig.apiV1URL(path: "sync/commands")
        var capturedBody: Data?
        APIClientCaptureURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url, expectedURL)
            XCTAssertEqual(request.httpMethod, "POST")
            capturedBody = try XCTUnwrap(testRequestBodyData(request))
            return (
                HTTPURLResponse(url: expectedURL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(
                    """
                    {"results":[{"operationId":"op-1","entityId":"entry-1","kind":"updateEntry",
                    "status":"applied","currentVersion":4}]}
                    """.utf8
                )
            )
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [APIClientCaptureURLProtocol.self]
        let response = try await APIClient(session: URLSession(configuration: configuration)).sendSyncCommands(
            accessToken: "access-token",
            commands: [
                SyncCommand(
                    operationId: "op-1",
                    entityId: "entry-1",
                    kind: .updateEntry,
                    baseVersion: 3,
                    payload: .object(["goalText": .string("Scales")])
                )
            ]
        )
        let body = try XCTUnwrap(capturedBody)
        let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let commands = try XCTUnwrap(envelope["commands"] as? [[String: Any]])
        XCTAssertEqual(commands.count, 1)
        XCTAssertEqual(commands[0]["operationId"] as? String, "op-1")
        XCTAssertEqual(commands[0]["baseVersion"] as? Int, 3)
        XCTAssertEqual(response.results.single?.currentVersion, 4)
    }
}

private extension Array {
    var single: Element? { count == 1 ? first : nil }
}
