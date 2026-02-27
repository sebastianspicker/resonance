import Foundation
import Security

enum KeychainStore {
    private static func accountKey(for key: String) -> String {
        "\(AppConfig.keychainNamespace).\(key)"
    }

    static func set(_ value: String, for key: String) {
        let data = Data(value.utf8)
        let accountKey = accountKey(for: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: accountKey,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        let deleteStatus = SecItemDelete(query as CFDictionary)
        if deleteStatus != errSecSuccess && deleteStatus != errSecItemNotFound {
            print("Keychain delete error for \(accountKey): \(deleteStatus)")
        }
        
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        if addStatus != errSecSuccess {
            print("Keychain add error for \(accountKey): \(addStatus)")
        }
    }

    static func get(_ key: String) -> String? {
        let accountKey = accountKey(for: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: accountKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data {
            return String(decoding: data, as: UTF8.self)
        }
        if status != errSecSuccess && status != errSecItemNotFound {
            print("Keychain get error for \(accountKey): \(status)")
        }
        return nil
    }

    static func remove(_ key: String) {
        let accountKey = accountKey(for: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: accountKey
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            print("Keychain remove error for \(accountKey): \(status)")
        }
    }
}
