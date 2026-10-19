using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace ClickFlow;

/// Direct Discord webhook: no Cloud Run, no Firebase. The webhook URL (set in Settings) lives
/// in its own file next to macros.json, never inside it or an export, so a shared macro can't leak it.
public static class Discord
{
    static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(30) };
    static string FilePath => Path.Combine(Store.Directory, "discord-webhook");

    public static string? WebhookUrl
    {
        get
        {
            try
            {
                var v = File.ReadAllText(FilePath).Trim();
                return v.Length == 0 ? null : v;
            }
            catch (Exception) { return null; }
        }
        set
        {
            var v = value?.Trim();
            if (string.IsNullOrEmpty(v)) { try { File.Delete(FilePath); } catch (Exception) { } return; }
            Directory.CreateDirectory(Store.Directory);
            File.WriteAllText(FilePath, v);
        }
    }

    public static bool IsValidWebhook(string s)
    {
        if (!Uri.TryCreate(s.Trim(), UriKind.Absolute, out var u) || u.Scheme != "https") return false;
        var host = u.Host;
        return (host == "discord.com" || host == "discordapp.com" || host.EndsWith(".discord.com"))
            && u.AbsolutePath.StartsWith("/api/webhooks/");
    }

    static Uri Endpoint()
    {
        var raw = WebhookUrl ?? throw new EngineException("No Discord webhook set (Settings › Discord)");
        return new Uri(raw + (raw.Contains('?') ? "&" : "?") + "wait=true");
    }

    /// Mentions are disabled so a message can never ping @everyone.
    static string Payload(string content) => new JsonObject
    {
        ["content"] = content,
        ["allowed_mentions"] = new JsonObject { ["parse"] = new JsonArray() },
    }.ToJsonString();

    static async Task Check(HttpResponseMessage resp, CancellationToken ct)
    {
        if (resp.IsSuccessStatusCode) return;
        var body = await resp.Content.ReadAsStringAsync(ct);
        throw new EngineException($"Discord said HTTP {(int)resp.StatusCode}{(body.Length == 0 ? "" : ": " + body[..Math.Min(200, body.Length)])}");
    }

    /// Posts a PNG (and an optional caption) to the webhook.
    public static async Task SendPng(byte[] png, string filename, string caption, CancellationToken ct)
    {
        var url = Endpoint();
        using var form = new MultipartFormDataContent($"clickflow-{Guid.NewGuid()}");
        var json = new StringContent(Payload(caption.Length > 1900 ? caption[..1900] : caption), Encoding.UTF8);
        json.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        form.Add(json, "payload_json");
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "files[0]", filename);
        using var resp = await http.PostAsync(url, form, ct);
        await Check(resp, ct);
    }

    /// Text only. Discord caps a message at 2000 characters, so long text goes in parts.
    public static async Task SendText(string text, CancellationToken ct)
    {
        var url = Endpoint();
        var rest = text;
        do
        {
            var chunk = rest.Length > 1900 ? rest[..1900] : rest;
            rest = rest[chunk.Length..];
            using var content = new StringContent(Payload(chunk), Encoding.UTF8, "application/json");
            using var resp = await http.PostAsync(url, content, ct);
            await Check(resp, ct);
        } while (rest.Length > 0);
    }
}
