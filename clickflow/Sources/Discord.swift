import AppKit
import Security

/// Direct Discord webhook: no Cloud Run, no Firebase. The webhook URL lives in the macOS
/// Keychain (set in Settings) and is never written to macros.json or an export, so a
/// shared macro can't leak it.
enum Discord {
    private static let service = "com.chaelri.clickflow.discord-webhook"
    private static let account = "default"

    enum Failure: LocalizedError {
        case noWebhook, http(Int, String)

        var errorDescription: String? {
            switch self {
            case .noWebhook: return "No Discord webhook set (Settings › Discord)"
            case .http(let code, let body): return "Discord said HTTP \(code)\(body.isEmpty ? "" : ": \(body)")"
            }
        }
    }

    static var webhookURL: String? {
        get {
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: account, kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
            var out: AnyObject?
            guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
            return String(data: d, encoding: .utf8)
        }
        set {
            let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                       kSecAttrAccount as String: account]
            SecItemDelete(base as CFDictionary)
            guard let v = newValue?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else { return }
            var add = base
            add[kSecValueData as String] = Data(v.utf8)
            add[kSecAttrLabel as String] = "ClickFlow Discord webhook"
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    static func isValidWebhook(_ s: String) -> Bool {
        guard let u = URL(string: s.trimmingCharacters(in: .whitespaces)), u.scheme == "https",
              let host = u.host else { return false }
        return (host == "discord.com" || host == "discordapp.com" || host.hasSuffix(".discord.com"))
            && u.path.hasPrefix("/api/webhooks/")
    }

    /// Posts a PNG (and an optional caption) to the webhook. Mentions are disabled so a
    /// caption can never ping @everyone.
    static func send(png: Data, filename: String = "clickflow.png", caption: String) async throws {
        guard let raw = webhookURL, let url = URL(string: raw + (raw.contains("?") ? "&" : "?") + "wait=true") else {
            throw Failure.noWebhook
        }
        let boundary = "clickflow-\(UUID().uuidString)"
        var body = Data()
        func part(_ headers: String, _ data: Data) {
            body.append(Data("--\(boundary)\r\n\(headers)\r\n\r\n".utf8))
            body.append(data)
            body.append(Data("\r\n".utf8))
        }
        let payload: [String: Any] = ["content": String(caption.prefix(1900)), "allowed_mentions": ["parse": []]]
        part("Content-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json",
             try JSONSerialization.data(withJSONObject: payload))
        part("Content-Disposition: form-data; name=\"files[0]\"; filename=\"\(filename)\"\r\nContent-Type: image/png", png)
        body.append(Data("--\(boundary)--\r\n".utf8))

        var req = URLRequest(url: url, timeoutInterval: 30)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw Failure.http(code, String(decoding: data.prefix(200), as: UTF8.self)) }
    }

    static func png(_ image: CGImage) -> Data? {
        NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
    }
}
