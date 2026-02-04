import Foundation

enum FileStore {
    static func mediaDirectory() -> URL {
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("Media", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            setFileProtection(url: dir)
        }
        return dir
    }

    static func createAudioFileURL(entryId: String) -> URL {
        let filename = "audio_\(entryId)_\(UUID().uuidString).m4a"
        let url = mediaDirectory().appendingPathComponent(filename)
        setFileProtection(url: url)
        return url
    }

    static func setFileProtection(url: URL) {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)

        let attributes: [FileAttributeKey: Any] = [
            .protectionKey: FileProtectionType.complete
        ]
        try? FileManager.default.setAttributes(attributes, ofItemAtPath: url.path)
    }
}
