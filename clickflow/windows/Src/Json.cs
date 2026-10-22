using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ClickFlow;

/// macros.json / history.json in exactly the Mac app's shape (sorted keys, ISO-8601 dates,
/// a step writes only the fields its type uses), so an export from one opens in the other.
public static class Json
{
    public static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string Write(JsonNode node) => Sort(node)!.ToJsonString(Pretty);

    /// Recursively rebuilds objects with their keys in ordinal order.
    static JsonNode? Sort(JsonNode? n)
    {
        switch (n)
        {
            case JsonObject o:
                var sorted = new JsonObject();
                foreach (var kv in o.OrderBy(k => k.Key, StringComparer.Ordinal).ToList())
                {
                    var child = kv.Value;
                    o.Remove(kv.Key);
                    sorted[kv.Key] = Sort(child);
                }
                return sorted;
            case JsonArray a:
                var arr = new JsonArray();
                foreach (var item in a.ToList()) { a.Remove(item); arr.Add(Sort(item)); }
                return arr;
            default:
                return n;
        }
    }

    public static string Date(DateTime d) => d.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
    public static DateTime? ParseDate(string? s) =>
        s != null && DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var d)
            ? d.ToLocalTime() : null;

    static string Id(Guid g) => g.ToString("D").ToUpperInvariant();

    // ---------- reading helpers ----------

    static string? Str(JsonObject o, string k) => o[k] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
    static double? Num(JsonObject o, string k) => o[k] is JsonValue v && v.TryGetValue<double>(out var d) ? d : null;
    static int? Int(JsonObject o, string k) => Num(o, k) is { } d ? (int)Math.Round(d) : null;
    static bool? Bool(JsonObject o, string k) => o[k] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;
    static Guid? Guid_(JsonObject o, string k) => Str(o, k) is { } s && Guid.TryParse(s, out var g) ? g : null;

    // ---------- Step ----------

    public static JsonObject ToJson(Step s)
    {
        var c = new JsonObject { ["type"] = s.Type.Raw() };
        if (s.Name.Length > 0) c["name"] = s.Name;
        if (s.ShowOnly && s.Type != StepType.Wait) c["showOnly"] = true;
        switch (s.Type)
        {
            case StepType.Wait:
                c["seconds"] = s.Seconds;
                break;
            case StepType.TypeText or StepType.DiscordMessage:
                c["text"] = s.Text;
                c["delayBefore"] = s.DelayBefore;
                break;
            case StepType.KeyShortcut:
                c["keys"] = s.Keys;
                c["delayBefore"] = s.DelayBefore;
                break;
            case StepType.PostClipboard or StepType.OpenUrl:
                c["url"] = s.Url;
                c["delayBefore"] = s.DelayBefore;
                break;
            case StepType.Shutdown:
                c["text"] = s.Text;
                c["onlyIfServo"] = s.OnlyIfServo;
                c["delayBefore"] = s.DelayBefore;
                break;
            case StepType.ReadText:
                c["x"] = s.X; c["y"] = s.Y; c["width"] = s.Width; c["height"] = s.Height;
                c["copyResult"] = s.CopyResult; c["sendDiscord"] = s.SendDiscord; c["textOnly"] = s.TextOnly;
                if (s.Text.Length > 0) c["text"] = s.Text;
                c["delayBefore"] = s.DelayBefore;
                break;
            default:
                c["x"] = s.X; c["y"] = s.Y;
                c["delayBefore"] = s.DelayBefore;
                break;
        }
        return c;
    }

    public static Step StepFrom(JsonObject c)
    {
        var raw = Str(c, "type") ?? throw new FormatException("A step has no type");
        // "sendScreenshot" was its own step before it merged into Screenshot area.
        bool legacyDiscord = raw == "sendScreenshot";
        var type = legacyDiscord ? StepType.ReadText : StepTypes.FromRaw(raw) ?? throw new FormatException($"Unknown step type {raw}");
        var s = new Step(type)
        {
            Name = Str(c, "name") ?? "",
            X = Num(c, "x") ?? 0,
            Y = Num(c, "y") ?? 0,
            DelayBefore = Math.Max(0, Num(c, "delayBefore") ?? 0),
            Seconds = Math.Max(0, Num(c, "seconds") ?? 1),
            Text = Str(c, "text") ?? "",
            Keys = Str(c, "keys") ?? "",
            Url = Str(c, "url") ?? "",
            ShowOnly = Bool(c, "showOnly") ?? false,
            Width = Num(c, "width") ?? 300,
            Height = Num(c, "height") ?? 120,
            CopyResult = Bool(c, "copyResult") ?? !legacyDiscord,
            SendDiscord = Bool(c, "sendDiscord") ?? legacyDiscord,
            TextOnly = Bool(c, "textOnly") ?? false,
            OnlyIfServo = Bool(c, "onlyIfServo") ?? false,
        };
        // "Include the text it read" became the {text} variable in the message.
        if (type == StepType.ReadText && (Bool(c, "includeText") ?? !legacyDiscord) && !s.Text.Contains("{text}"))
            s.Text = s.Text.Length == 0 ? "{text}" : s.Text + "\n{text}";
        return s;
    }

    // ---------- Schedule ----------

    public static JsonObject ToJson(Schedule s)
    {
        var o = new JsonObject
        {
            ["id"] = Id(s.Id),
            ["enabled"] = s.Enabled,
            ["time"] = s.Time,
            ["repeat"] = s.Repeat.Raw(),
            ["customDays"] = new JsonArray(s.CustomDays.Select(d => (JsonNode)d).ToArray()),
            ["intervalMinutes"] = s.IntervalMinutes,
            ["endTime"] = s.EndTime,
            ["missedRunPolicy"] = s.MissedRunPolicy == MissedRunPolicy.RunOnce ? "runOnce" : "skip",
            ["conditions"] = ToJson(s.Conditions),
        };
        if (s.Date != null) o["date"] = s.Date;
        return o;
    }

    public static Schedule ScheduleFrom(JsonObject o)
    {
        var s = new Schedule
        {
            Id = Guid_(o, "id") ?? Guid.NewGuid(),
            Enabled = Bool(o, "enabled") ?? true,
            Time = Str(o, "time") ?? "09:00",
            Repeat = RepeatKinds.FromRaw(Str(o, "repeat")),
            Date = Str(o, "date"),
            IntervalMinutes = Math.Max(1, Int(o, "intervalMinutes") ?? 30),
            EndTime = Str(o, "endTime") ?? "17:00",
            MissedRunPolicy = Str(o, "missedRunPolicy") == "runOnce" ? MissedRunPolicy.RunOnce : MissedRunPolicy.Skip,
        };
        if (o["customDays"] is JsonArray days)
            s.CustomDays = days.Select(d => d is JsonValue v && v.TryGetValue<double>(out var n) ? (int)n : 0).Where(n => n is >= 1 and <= 7).ToList();
        if (o["conditions"] is JsonObject c) s.Conditions = ConditionsFrom(c);
        return s;
    }

    static JsonObject ToJson(Conditions c)
    {
        var o = new JsonObject { ["requireFrontmost"] = c.RequireFrontmost };
        if (c.StartDate != null) o["startDate"] = c.StartDate;
        if (c.EndDate != null) o["endDate"] = c.EndDate;
        if (c.RequireApp != null) o["requireApp"] = c.RequireApp;
        if (c.MinIdleSeconds != null) o["minIdleSeconds"] = c.MinIdleSeconds;
        return o;
    }

    static Conditions ConditionsFrom(JsonObject o) => new()
    {
        StartDate = Str(o, "startDate"),
        EndDate = Str(o, "endDate"),
        RequireApp = Str(o, "requireApp") ?? Str(o, "requireAppRunning"),
        RequireFrontmost = Bool(o, "requireFrontmost") ?? false,
        MinIdleSeconds = Int(o, "minIdleSeconds"),
    };

    // ---------- Macro ----------

    public static JsonObject ToJson(Macro m) => new()
    {
        ["id"] = Id(m.Id),
        ["name"] = m.Name,
        ["enabled"] = m.Enabled,
        ["repeatCount"] = m.RepeatCount,
        ["repeatDelay"] = m.RepeatDelay,
        ["steps"] = new JsonArray(m.Steps.Select(s => (JsonNode)ToJson(s)).ToArray()),
        ["schedules"] = new JsonArray(m.Schedules.Select(s => (JsonNode)ToJson(s)).ToArray()),
    };

    public static Macro MacroFrom(JsonObject o)
    {
        var m = new Macro
        {
            Id = Guid_(o, "id") ?? Guid.NewGuid(),
            Name = Str(o, "name") ?? "Untitled",
            Enabled = Bool(o, "enabled") ?? true,
            RepeatCount = Math.Max(0, Int(o, "repeatCount") ?? 1),
            RepeatDelay = Math.Max(0, Num(o, "repeatDelay") ?? 0),
        };
        if (o["steps"] is JsonArray steps) m.Steps = steps.OfType<JsonObject>().Select(StepFrom).ToList();
        if (o["schedules"] is JsonArray sch) m.Schedules = sch.OfType<JsonObject>().Select(ScheduleFrom).ToList();
        return m;
    }

    public static string MacroFile(IEnumerable<Macro> macros) => Write(new JsonObject
    {
        ["version"] = 1,
        ["macros"] = new JsonArray(macros.Select(m => (JsonNode)ToJson(m)).ToArray()),
    });

    /// Accepts an export file, a bare array of macros, or a single macro object.
    public static List<Macro>? ParseMacros(string text)
    {
        try
        {
            var node = JsonNode.Parse(text);
            if (node is JsonObject o && o["macros"] is JsonArray list) return list.OfType<JsonObject>().Select(MacroFrom).ToList();
            if (node is JsonArray a) return a.OfType<JsonObject>().Select(MacroFrom).ToList();
            if (node is JsonObject single && single.ContainsKey("steps")) return new() { MacroFrom(single) };
        }
        catch (Exception) { }
        return null;
    }

    // ---------- history ----------

    public static string History(IEnumerable<RunRecord> list) => Write(new JsonArray(list.Select(r =>
    {
        var o = new JsonObject
        {
            ["id"] = Id(r.Id),
            ["macroName"] = r.MacroName,
            ["trigger"] = r.Trigger.Raw(),
            ["start"] = Date(r.Start),
            ["result"] = r.Result.Raw(),
        };
        if (r.MacroId is { } id) o["macroID"] = Id(id);
        if (r.End is { } e) o["end"] = Date(e);
        if (r.Reason != null) o["reason"] = r.Reason;
        return (JsonNode)o;
    }).ToArray()));

    public static List<RunRecord> ParseHistory(string text)
    {
        var outList = new List<RunRecord>();
        if (JsonNode.Parse(text) is not JsonArray a) return outList;
        foreach (var o in a.OfType<JsonObject>())
            outList.Add(new RunRecord
            {
                Id = Guid_(o, "id") ?? Guid.NewGuid(),
                MacroId = Guid_(o, "macroID"),
                MacroName = Str(o, "macroName") ?? "",
                Trigger = RunEnums.TriggerFromRaw(Str(o, "trigger")),
                Start = ParseDate(Str(o, "start")) ?? DateTime.Now,
                End = ParseDate(Str(o, "end")),
                Result = RunEnums.ResultFromRaw(Str(o, "result")),
                Reason = Str(o, "reason"),
            });
        return outList;
    }
}
