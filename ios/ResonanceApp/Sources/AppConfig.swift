import Foundation

enum AppConfig {
    static let apiBaseURL = URL(string: ProcessInfo.processInfo.environment["RESONANCE_API_BASE"] ?? "http://localhost:4000")!
    static let devLoginURL = apiBaseURL.appendingPathComponent("dev/login")
    static let authCallbackScheme = "resonance"
    static let authCallbackURL = URL(string: "resonance://auth-callback")!
    static let keychainNamespace: String = {
        let base = apiBaseURL.absoluteString.lowercased()
        let sanitized = base
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return sanitized.isEmpty ? "resonance-default" : "resonance-\(sanitized)"
    }()
}
