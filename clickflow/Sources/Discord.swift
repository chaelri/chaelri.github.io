import AppKit

/// Direct Discord webhook: no Cloud Run, no Firebase. The webhook URL (set in Settings)
/// is never written to macros.json or an export, so a shared macro can't leak it.
enum Discord {
    enum Failure: LocalizedError {
        case noWebhook, http(Int, String)

        var errorDescription: String? {
            switch self {
            case .noWebhook: return "No Discord webhook set (Settings › Discord)"
            case .http(let code, let body): return "Discord said HTTP \(code)\(body.isEmpty ? "" : ": \(body)")"
            }
        }
    }

    /// A private file (mode 600) next to macros.json, never inside it. The Keychain asked
    /// for permission after every rebuild: "Always Allow" is remembered per exact build.
    private static var file: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ClickFlow/discord-webhook")
    }

    static var webhookURL: String? {
        get {
            guard let s = try? String(contentsOf: file, encoding: .utf8) else { return nil }
            let v = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return v.isEmpty ? nil : v
        }
        set {
            guard let v = newValue?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else {
                try? FileManager.default.removeItem(at: file)
                return
            }
            try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            FileManager.default.createFile(atPath: file.path, contents: Data(v.utf8), attributes: [.posixPermissions: 0o600])
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
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

    /// Text only. Discord caps a message at 2000 characters, so long text goes in parts.
    static func send(text: String) async throws {
        guard let raw = webhookURL, let url = URL(string: raw + (raw.contains("?") ? "&" : "?") + "wait=true") else {
            throw Failure.noWebhook
        }
        var rest = Substring(text)
        repeat {
            let chunk = rest.prefix(1900)
            rest = rest.dropFirst(chunk.count)
            var req = URLRequest(url: url, timeoutInterval: 30)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["content": String(chunk), "allowed_mentions": ["parse": []]])
            let (data, response) = try await URLSession.shared.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(code) else { throw Failure.http(code, String(decoding: data.prefix(200), as: UTF8.self)) }
        } while !rest.isEmpty
    }

    static func png(_ image: CGImage) -> Data? {
        NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
    }
}
