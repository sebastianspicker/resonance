import XCTest
@testable import ResonanceApp

final class AppConfigResolveURLTests: XCTestCase {
    func testValidAbsoluteHTTPBaseURLIsAccepted() {
        let url = AppConfig.resolveAPIBaseURL("https://api.example.edu/resonance")

        XCTAssertEqual(url.absoluteString, "https://api.example.edu/resonance")
    }

    func testMalformedOrRelativeBaseURLFallsBackToLocalDefault() {
        XCTAssertEqual(
            AppConfig.resolveAPIBaseURL("%").absoluteString,
            "http://localhost:4000"
        )
        XCTAssertEqual(
            AppConfig.resolveAPIBaseURL("api.example.edu").absoluteString,
            "http://localhost:4000"
        )
    }

    func testBaseURLRejectsCredentialsQueryAndUnsupportedScheme() {
        for value in [
            "https://user:password@api.example.edu",
            "https://api.example.edu?token=secret",
            "ftp://api.example.edu"
        ] {
            XCTAssertEqual(
                AppConfig.resolveAPIBaseURL(value).absoluteString,
                "http://localhost:4000",
                "Expected invalid API base URL to fall back: \(value)"
            )
        }
    }
}
