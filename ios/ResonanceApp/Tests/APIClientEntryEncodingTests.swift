import SwiftData
import XCTest
@testable import ResonanceApp

final class APIClientRequestEncodingTests: APIRequestCaptureTestCase {
    @MainActor
    private func makeEntryForEncoding(
        id: String,
        goalText: String,
        tags: [String],
        captureContext: CaptureContext? = nil
    ) -> LocalPracticeEntry {
        LocalPracticeEntry(
            id: id,
            courseId: "course-1",
            studentId: "student-1",
            details: PracticeEntryDetails(
                practiceDate: Date(timeIntervalSince1970: 1_771_848_000),
                goalText: goalText,
                durationSeconds: nil,
                tags: tags,
                notes: nil
            ),
            status: .draft,
            captureContext: captureContext ?? .practice
        )
    }

    @MainActor
    private func createEntryAndDecode(
        _ entry: LocalPracticeEntry,
        capture: RequestBodyCapture
    ) async throws -> [String: Any] {
        _ = try await makeCapturingAPIClient().createEntry(
            accessToken: "access-token",
            courseId: "course-1",
            entry: entry
        )
        return try decodedJSON(from: capture)
    }

    @MainActor
    func testCreateEntryWithNilOptionalFieldsEncodesValidJSONAndOmitsKeys() async throws {
        let expectedURL = AppConfig.apiBaseURL.appendingPathComponent("courses/course-1/entries")
        let response = Data("""
            {
                "id": "entry-nil-optionals",
                "courseId": "course-1",
                "studentId": "student-1",
                "practiceDate": "2026-02-23T12:00:00Z",
                "goalText": "Goal",
                "durationSeconds": null,
                "tags": ["tone"],
                "notes": null,
                "status": "draft"
            }
            """.utf8)
        let capture = installRequestBodyCapture(
            expectedURL: expectedURL,
            method: "POST",
            response: response,
            expectedContentType: "application/json"
        )

        let entry = makeEntryForEncoding(id: "entry-nil-optionals", goalText: "Goal", tags: ["tone"])
        let json = try await createEntryAndDecode(entry, capture: capture)
        XCTAssertEqual(json["id"] as? String, "entry-nil-optionals")
        XCTAssertEqual(json["goalText"] as? String, "Goal")
        XCTAssertEqual(json["kind"] as? String, "practice")
        XCTAssertEqual(json["tags"] as? [String], ["tone"])
        XCTAssertFalse(json.keys.contains("durationSeconds"))
        XCTAssertFalse(json.keys.contains("notes"))
        XCTAssertFalse(json.keys.contains("consentConfirmed"))
        XCTAssertFalse(json.keys.contains("consentScope"))
        XCTAssertFalse(json.keys.contains("captureProfile"))
    }

    @MainActor
    func testCreateTeachingLessonEntryEncodesConsentMetadata() async throws {
        let expectedURL = AppConfig.apiBaseURL.appendingPathComponent("courses/course-1/entries")
        let capture = installRequestBodyCapture(
            expectedURL: expectedURL,
            method: "POST",
            response: teachingEntryResponse()
        )

        let entry = makeEntryForEncoding(
            id: "entry-teaching",
            goalText: "Teach rhythm ostinato",
            tags: ["lehramt"],
            captureContext: CaptureContext(
                kind: .teachingLesson,
                consentConfirmedAt: Date(timeIntervalSince1970: 1_771_848_060),
                consentScope: .privateCourseReview,
                captureProfile: .teacherLearner
            )
        )

        let json = try await createEntryAndDecode(entry, capture: capture)
        XCTAssertEqual(json["kind"] as? String, "teaching_lesson")
        XCTAssertEqual(json["consentConfirmed"] as? Bool, true)
        XCTAssertEqual(json["consentScope"] as? String, "private_course_review")
        XCTAssertEqual(json["captureProfile"] as? String, "teacher_learner")
    }

    @MainActor
    func testUpdateEntryCaptureProfileEncodesPatch() async throws {
        let expectedURL = AppConfig.apiBaseURL.appendingPathComponent("entries/entry-teaching")
        let capture = installRequestBodyCapture(
            expectedURL: expectedURL,
            method: "PATCH",
            response: teachingEntryResponse(captureProfile: "ensemble_group")
        )

        let client = makeCapturingAPIClient()

        _ = try await client.updateEntryCaptureProfile(
            accessToken: "access-token",
            entryId: "entry-teaching",
            captureProfile: .ensembleGroup
        )

        let json = try decodedJSON(from: capture)
        XCTAssertEqual(json["captureProfile"] as? String, "ensemble_group")
    }

    @MainActor
    func testSyncCaptureMarkersEncodesBatchPut() async throws {
        let expectedURL = AppConfig.apiBaseURL.appendingPathComponent("entries/entry-teaching/capture-markers")
        let responseData = Data("""
            [
                {
                    "id": "marker-1",
                    "entryId": "entry-teaching",
                    "artifactId": "artifact-video",
                    "studentId": "student-1",
                    "timeSeconds": 12,
                    "kind": "phase_modeling",
                    "note": "Modeling begins.",
                    "createdAt": "2026-04-29T12:00:00Z"
                }
            ]
            """.utf8)
        let capture = installRequestBodyCapture(
            expectedURL: expectedURL,
            method: "PUT",
            response: responseData
        )

        let client = makeCapturingAPIClient()
        let marker = LocalCaptureMarker(
            id: "marker-1",
            entryId: "entry-teaching",
            artifactId: "artifact-video",
            timeSeconds: 12,
            kind: .phaseModeling,
            note: "Modeling begins."
        )

        let response = try await client.syncCaptureMarkers(
            accessToken: "access-token",
            entryId: "entry-teaching",
            markers: [marker]
        )

        let json = try decodedJSON(from: capture)
        let markers = try XCTUnwrap(json["markers"] as? [[String: Any]])
        XCTAssertEqual(markers[0]["id"] as? String, "marker-1")
        XCTAssertEqual(markers[0]["artifactId"] as? String, "artifact-video")
        XCTAssertEqual(markers[0]["timeSeconds"] as? Int, 12)
        XCTAssertEqual(markers[0]["kind"] as? String, "phase_modeling")
        XCTAssertEqual(response[0].kind, "phase_modeling")
    }
}
