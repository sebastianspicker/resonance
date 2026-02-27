import Foundation

enum FileStore {
    static func mediaDirectory() -> URL {
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("Media", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            do {
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                setFileProtection(url: dir)
            } catch {
                print("Failed to create media directory: \(error)")
            }
        }
        return dir
    }

    static func createAudioFileURL(entryId: String) -> URL {
        let filename = "audio_\(entryId)_\(UUID().uuidString).m4a"
        return mediaDirectory().appendingPathComponent(filename)
    }

    static func setFileProtection(url: URL) {
        do {
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var urlCopy = url
            try urlCopy.setResourceValues(values)

            let attributes: [FileAttributeKey: Any] = [
                .protectionKey: FileProtectionType.complete
            ]
            try FileManager.default.setAttributes(attributes, ofItemAtPath: url.path)
        } catch {
            print("Failed to set data protection for \(url.path): \(error)")
        }
    }
}
