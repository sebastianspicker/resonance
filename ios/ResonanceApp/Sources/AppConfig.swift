import Foundation

enum AppConfig {
    static let apiBaseURL = URL(string: ProcessInfo.processInfo.environment["RESONANCE_API_BASE"] ?? "http://localhost:4000")!
    static let devLoginURL = URL(string: "http://localhost:4000/dev/login")!
    static let authCallbackScheme = "resonance"
    static let authCallbackURL = URL(string: "resonance://auth-callback")!
}
