using System.Globalization;

namespace ClickFlow;

// ---------- Steps ----------

/// Raw values match the Mac app's macros.json, so exports move between the two.
public enum StepType { LeftClick, DoubleClick, RightClick, Move, Wait, TypeText, KeyShortcut, PostClipboard, ReadText, OpenUrl, DiscordMessage, Shutdown }

public static class StepTypes
{
    public static readonly StepType[] All = Enum.GetValues<StepType>();

    public static string Raw(this StepType t) => t switch
    {
        StepType.LeftClick => "leftClick", StepType.DoubleClick => "doubleClick", StepType.RightClick => "rightClick",
        StepType.Move => "move", StepType.Wait => "wait", StepType.TypeText => "typeText",
        StepType.KeyShortcut => "keyShortcut", StepType.PostClipboard => "postClipboard",
        StepType.ReadText => "readText", StepType.OpenUrl => "openURL", StepType.DiscordMessage => "discordMessage",
        StepType.Shutdown => "shutdown",
        _ => "wait",
    };

    public static StepType? FromRaw(string raw) => All.Cast<StepType?>().FirstOrDefault(t => t!.Value.Raw() == raw);

    public static string Label(this StepType t) => t switch
    {
        StepType.LeftClick => "Left click", StepType.DoubleClick => "Double click", StepType.RightClick => "Right click",
        StepType.Move => "Move mouse", StepType.Wait => "Wait", StepType.TypeText => "Type text",
        StepType.KeyShortcut => "Key shortcut", StepType.PostClipboard => "Post clipboard",
        StepType.ReadText => "Screenshot area", StepType.OpenUrl => "Open link in Chrome",
        StepType.DiscordMessage => "Send to Discord", StepType.Shutdown => "Force shut down", _ => "",
    };

    /// Segoe Fluent Icons / Segoe MDL2 Assets glyphs.
    public static string Glyph(this StepType t) => t switch
    {
        StepType.LeftClick => "", StepType.DoubleClick => "", StepType.RightClick => "",
        StepType.Move => "", StepType.Wait => "", StepType.TypeText => "",
        StepType.KeyShortcut => "", StepType.PostClipboard => "", StepType.ReadText => "",
        StepType.OpenUrl => "", StepType.DiscordMessage => "", StepType.Shutdown => "", _ => "",
    };

    public static bool HasPoint(this StepType t) => t is StepType.LeftClick or StepType.DoubleClick or StepType.RightClick or StepType.Move;
    public static bool IsClick(this StepType t) => t.HasPoint() && t != StepType.Move;
    public static bool HasArea(this StepType t) => t == StepType.ReadText;

    public static string Verb(this StepType t) => t switch
    {
        StepType.LeftClick => "Clicking", StepType.DoubleClick => "Double-clicking", StepType.RightClick => "Right-clicking",
        StepType.Move => "Moving", StepType.Wait => "Waiting", StepType.TypeText => "Typing",
        StepType.KeyShortcut => "Pressing", StepType.PostClipboard => "Sending", StepType.ReadText => "Capturing",
        StepType.OpenUrl => "Opening", StepType.DiscordMessage => "Sending", StepType.Shutdown => "Shutting down", _ => "",
    };

    /// What a preview / show-only step says instead of doing it.
    public static string WouldVerb(this StepType t) => t switch
    {
        StepType.LeftClick => "Would click here", StepType.DoubleClick => "Would double-click here",
        StepType.RightClick => "Would right-click here", StepType.Move => "Would move here", StepType.Wait => "Waiting",
        StepType.TypeText => "Would type this", StepType.KeyShortcut => "Would press this",
        StepType.PostClipboard => "Would post the clipboard", StepType.ReadText => "Would capture this area",
        StepType.OpenUrl => "Would open this link", StepType.DiscordMessage => "Would send this message",
        StepType.Shutdown => "Would shut down the PC", _ => "",
    };

    /// Steps that post synthetic input (Windows needs no permission for that, but a locked screen blocks it).
    public static bool PostsInput(this StepType t) =>
        t is not (StepType.Wait or StepType.PostClipboard or StepType.OpenUrl or StepType.DiscordMessage or StepType.ReadText or StepType.Shutdown);
}

/// One step of a macro. Coordinates are physical pixels on the virtual desktop: origin at the
/// top-left of the primary display, y down, negative on displays left of / above it.
public sealed class Step
{
    public Guid Id = Guid.NewGuid();
    public StepType Type;
    /// Optional label shown on the card, in the HUD and in run history.
    public string Name = "";
    public double X, Y;
    public double DelayBefore;
    public double Seconds = 1;
    public string Text = "";
    public string Keys = "";
    public string Url = "";
    /// Never executed: runs only show where it would act (marker + HUD), then move on.
    public bool ShowOnly;
    /// Screenshot area: x, y (top-left) + width × height.
    public double Width = 300, Height = 120;
    /// Screenshot area: put the text it read on the clipboard (so Post clipboard can send it).
    public bool CopyResult = true;
    /// Screenshot area: post to the Discord webhook.
    public bool SendDiscord;
    /// Screenshot area: send only the message, no image.
    public bool TextOnly;
    /// Force shut down: only when /servo/lastRun says the servo pressed the power button
    /// recently, so a PC someone switched on themselves is never turned off under them.
    public bool OnlyIfServo;

    public Step() { }
    public Step(StepType type) { Type = type; }

    public Point Point => new((int)Math.Round(X), (int)Math.Round(Y));
    public Rectangle Area => new((int)Math.Round(X), (int)Math.Round(Y), Math.Max(1, (int)Math.Round(Width)), Math.Max(1, (int)Math.Round(Height)));

    public Step Clone(bool newId = true)
    {
        var s = (Step)MemberwiseClone();
        if (newId) s.Id = Guid.NewGuid();
        return s;
    }

    /// "Step 3 · Open timesheet" when named, "Step 3" otherwise.
    public string Title(int number)
    {
        var n = Name.Trim();
        return n.Length == 0 ? $"Step {number}" : $"Step {number} · {n}";
    }

    /// The step's own name, or its type when unnamed.
    public string Heading => Name.Trim() is { Length: > 0 } n ? n : Type.Label();

    /// One line on what the step does, for the run HUD.
    public string Detail
    {
        get
        {
            switch (Type)
            {
                case StepType.Move: return $"Move to {Fmt.Coord(X)}, {Fmt.Coord(Y)}";
                case StepType.LeftClick or StepType.DoubleClick or StepType.RightClick:
                    return $"{Type.Label()} at {Fmt.Coord(X)}, {Fmt.Coord(Y)}";
                case StepType.Wait: return $"Wait {Fmt.Seconds(Seconds)}";
                case StepType.TypeText: return $"Type “{Text.Replace("\r", "").Replace("\n", " ⏎ ")}” · {Text.Replace("\r", "").Length} chars";
                case StepType.KeyShortcut: return $"Press {KeyCombo.Parse(Keys)?.Display ?? Keys}";
                case StepType.PostClipboard: return $"Post clipboard → {(Uri.TryCreate(Url, UriKind.Absolute, out var u) ? u.Host : Url)}";
                case StepType.DiscordMessage: return $"Send “{Text.Replace("\r", "").Replace("\n", " ⏎ ")}” to Discord";
                case StepType.Shutdown:
                    return Text.Trim().Length == 0 ? "Force shut down the PC (unsaved work is lost)" : "Send to Discord, then force shut down the PC";
                case StepType.OpenUrl:
                    return $"Open {OpenLink.Normalized(Url)?.Host ?? (Url.Length == 0 ? "a link" : Url)} in Chrome";
                case StepType.ReadText:
                    var outs = new List<string> { "text" };
                    if (CopyResult) outs.Add("clipboard");
                    if (SendDiscord) outs.Add("Discord");
                    return $"Screenshot {(int)Width}×{(int)Height} at {Fmt.Coord(X)}, {Fmt.Coord(Y)} → " + string.Join(" · ", outs);
            }
            return "";
        }
    }

    /// Time this step adds to a run (waits + delays; the actions themselves are near-instant).
    public double Duration => Type == StepType.Wait ? Seconds : DelayBefore;
}

// ---------- Macro ----------

public sealed class Macro
{
    public Guid Id = Guid.NewGuid();
    public string Name = "Untitled";
    public bool Enabled = true;
    /// 0 = until stopped.
    public int RepeatCount = 1;
    public double RepeatDelay;
    public List<Step> Steps = new();
    public List<Schedule> Schedules = new();

    public double SingleRunDuration => Steps.Sum(s => s.Duration);

    /// null when the macro repeats until stopped.
    public double? TotalDuration => RepeatCount > 0 ? SingleRunDuration * RepeatCount + RepeatDelay * (RepeatCount - 1) : null;

    public string? ScheduleSummary
    {
        get
        {
            var active = Schedules.Where(s => s.Enabled).ToList();
            if (active.Count == 0) return Schedules.Count == 0 ? null : "Schedules off";
            return active.Count > 1 ? $"{active[0].Summary} +{active.Count - 1}" : active[0].Summary;
        }
    }

    public DateTime? NextRun(DateTime after)
    {
        if (!Enabled) return null;
        DateTime? best = null;
        foreach (var s in Schedules.Where(s => s.Enabled))
            if (s.NextOccurrence(after) is { } d && (best == null || d < best)) best = d;
        return best;
    }

    public Macro DeepCopy()
    {
        var m = (Macro)MemberwiseClone();
        m.Steps = Steps.Select(s => s.Clone(false)).ToList();
        m.Schedules = Schedules.Select(s => s.Clone(false)).ToList();
        return m;
    }

    public string Stats
    {
        get
        {
            int n = Steps.Count;
            var d = TotalDuration is { } t ? Fmt.Seconds(t) : "loops";
            return $"{n} step{(n == 1 ? "" : "s")} · {d}";
        }
    }
}

// ---------- Schedules ----------

public enum RepeatKind { Daily, Weekdays, Weekends, Custom, Once, Interval }
public enum MissedRunPolicy { Skip, RunOnce }

public static class RepeatKinds
{
    public static readonly RepeatKind[] All = Enum.GetValues<RepeatKind>();
    public static string Raw(this RepeatKind k) => k.ToString().ToLowerInvariant();
    public static RepeatKind FromRaw(string? s) => All.FirstOrDefault(k => k.Raw() == s, RepeatKind.Daily);
    public static string Label(this RepeatKind k) => k switch
    {
        RepeatKind.Daily => "Every day", RepeatKind.Weekdays => "Every weekday", RepeatKind.Weekends => "Every weekend",
        RepeatKind.Custom => "Custom days", RepeatKind.Once => "Once", RepeatKind.Interval => "Interval", _ => "",
    };
}

public sealed class Conditions
{
    /// yyyy-MM-dd, inclusive.
    public string? StartDate, EndDate;
    /// Process name ("chrome"), exe name ("chrome.exe") or the app's product name ("Google Chrome").
    public string? RequireApp;
    public bool RequireFrontmost;
    public int? MinIdleSeconds;

    public int ActiveCount => new[] { StartDate != null, EndDate != null, !string.IsNullOrWhiteSpace(RequireApp), (MinIdleSeconds ?? 0) > 0 }.Count(b => b);
    public Conditions Clone() => (Conditions)MemberwiseClone();
}

public sealed class Schedule
{
    public Guid Id = Guid.NewGuid();
    public bool Enabled = true;
    /// HH:mm, 24-hour, local time. For Interval this is the window start.
    public string Time = "09:00";
    public RepeatKind Repeat = RepeatKind.Weekdays;
    /// 1 = Sunday … 7 = Saturday (the Mac's calendar numbering). Used by Custom and Interval.
    public List<int> CustomDays = new();
    /// yyyy-MM-dd, for Once.
    public string? Date;
    public int IntervalMinutes = 30;
    /// HH:mm, window end for Interval.
    public string EndTime = "17:00";
    public MissedRunPolicy MissedRunPolicy = MissedRunPolicy.Skip;
    public Conditions Conditions = new();

    public Schedule Clone(bool newId = true)
    {
        var s = (Schedule)MemberwiseClone();
        s.CustomDays = CustomDays.ToList();
        s.Conditions = Conditions.Clone();
        if (newId) s.Id = Guid.NewGuid();
        return s;
    }

    public static readonly HashSet<int> AllDays = new() { 1, 2, 3, 4, 5, 6, 7 };
    public static int Weekday(DateTime d) => (int)d.DayOfWeek + 1;

    public HashSet<int> WeekdaySet => Repeat switch
    {
        RepeatKind.Daily => new HashSet<int>(AllDays),
        RepeatKind.Weekdays => new HashSet<int> { 2, 3, 4, 5, 6 },
        RepeatKind.Weekends => new HashSet<int> { 1, 7 },
        RepeatKind.Custom or RepeatKind.Interval => CustomDays.Where(d => d is >= 1 and <= 7).ToHashSet(),
        _ => new HashSet<int>(),
    };

    /// Fire times on a given day, ignoring the weekday filter.
    public List<DateTime> Times(DateTime day)
    {
        var outList = new List<DateTime>();
        if (Clock.Parse(Time) is not (int h, int m)) return outList;
        var start = new DateTime(day.Year, day.Month, day.Day, h, m, 0, DateTimeKind.Local);
        if (Repeat != RepeatKind.Interval) { outList.Add(start); return outList; }
        if (IntervalMinutes <= 0 || Clock.Parse(EndTime) is not (int eh, int em)) { outList.Add(start); return outList; }
        var end = new DateTime(day.Year, day.Month, day.Day, eh, em, 0, DateTimeKind.Local);
        if (end <= start) { outList.Add(start); return outList; }
        for (var t = start; t <= end; t = t.AddMinutes(IntervalMinutes)) outList.Add(t);
        return outList;
    }

    /// The first fire time strictly after `after`, honouring the date-range condition.
    public DateTime? NextOccurrence(DateTime after)
    {
        var startBound = DayString.Parse(Conditions.StartDate);
        var endBound = DayString.Parse(Conditions.EndDate);

        if (Repeat == RepeatKind.Once)
        {
            if (DayString.Parse(Date) is not { } d) return null;
            if (startBound is { } s0 && d < s0) return null;
            if (endBound is { } e0 && d > e0) return null;
            foreach (var t in Times(d)) if (t > after) return t;
            return null;
        }

        var days = WeekdaySet;
        if (days.Count == 0) return null;
        var day = after.Date;
        if (startBound is { } s && s > day) day = s;
        for (int i = 0; i < 370; i++)
        {
            if (endBound is { } e && day > e) return null;
            if (days.Contains(Weekday(day)))
                foreach (var t in Times(day)) if (t > after) return t;
            day = day.AddDays(1);
        }
        return null;
    }

    public string Summary
    {
        get
        {
            var t = Clock.Display(Time);
            switch (Repeat)
            {
                case RepeatKind.Daily: return $"Every day at {t}";
                case RepeatKind.Weekdays: return $"Every weekday at {t}";
                case RepeatKind.Weekends: return $"Every weekend at {t}";
                case RepeatKind.Custom: return CustomDays.Count == 0 ? "No days picked" : $"{DayList(WeekdaySet)} at {t}";
                case RepeatKind.Once:
                    var d = DayString.Parse(Date) is { } dd ? Fmt.LongDay(dd) : "no date";
                    return $"Once on {d} at {t}";
                default:
                    var every = IntervalMinutes % 60 == 0
                        ? (IntervalMinutes == 60 ? "hour" : $"{IntervalMinutes / 60} hours")
                        : $"{IntervalMinutes} min";
                    var set = WeekdaySet;
                    var suffix = set.SetEquals(AllDays) ? "" : (set.Count == 0 ? ", no days picked" : $", {DayList(set)}");
                    return $"Every {every}, {t}–{Clock.Display(EndTime)}{suffix}";
            }
        }
    }

    /// "Mon, Wed, Fri" — or "Weekdays" / "Weekends" when it is exactly one of those.
    public static string DayList(HashSet<int> days)
    {
        if (days.SetEquals(new[] { 2, 3, 4, 5, 6 })) return "Weekdays";
        if (days.SetEquals(new[] { 1, 7 })) return "Weekends";
        if (days.SetEquals(AllDays)) return "Every day";
        var names = CultureInfo.CurrentCulture.DateTimeFormat.AbbreviatedDayNames;
        return string.Join(", ", new[] { 2, 3, 4, 5, 6, 7, 1 }.Where(days.Contains).Select(d => names[d - 1]));
    }
}

// ---------- Run history ----------

public enum RunTrigger { Manual, Scheduled, Test, Preview }
public enum RunResult { Completed, Stopped, Skipped, Failed }

public static class RunEnums
{
    public static string Raw(this RunTrigger t) => t switch
    {
        RunTrigger.Manual => "manual", RunTrigger.Scheduled => "scheduled", RunTrigger.Test => "test", _ => "preview",
    };
    public static RunTrigger TriggerFromRaw(string? s) => s switch
    {
        "scheduled" => RunTrigger.Scheduled, "test" => RunTrigger.Test, "preview" => RunTrigger.Preview, _ => RunTrigger.Manual,
    };
    public static string Label(this RunTrigger t) => t switch
    {
        RunTrigger.Manual => "Manual", RunTrigger.Scheduled => "Scheduled", RunTrigger.Test => "Step test", _ => "Preview",
    };
    public static string Raw(this RunResult r) => r.ToString().ToLowerInvariant();
    public static RunResult ResultFromRaw(string? s) => Enum.GetValues<RunResult>().FirstOrDefault(r => r.Raw() == s, RunResult.Completed);
}

public sealed class RunRecord
{
    public Guid Id = Guid.NewGuid();
    public Guid? MacroId;
    public string MacroName = "";
    public RunTrigger Trigger;
    public DateTime Start;
    public DateTime? End;
    public RunResult Result;
    public string? Reason;
}

// ---------- Time helpers ----------

public static class Clock
{
    public static (int, int)? Parse(string? s)
    {
        if (s == null) return null;
        var parts = s.Split(':');
        if (parts.Length != 2 || !int.TryParse(parts[0], out var h) || !int.TryParse(parts[1], out var m)) return null;
        if (h is < 0 or > 23 || m is < 0 or > 59) return null;
        return (h, m);
    }

    public static string String(DateTime d) => d.ToString("HH:mm", CultureInfo.InvariantCulture);

    public static DateTime Date(string s, DateTime day)
    {
        var (h, m) = Parse(s) ?? (9, 0);
        return new DateTime(day.Year, day.Month, day.Day, h, m, 0, DateTimeKind.Local);
    }

    public static string Display(string s) => Parse(s) == null ? s : Fmt.Time(Date(s, DateTime.Today));
}

public static class DayString
{
    public static DateTime? Parse(string? s) =>
        s != null && DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var d)
            ? DateTime.SpecifyKind(d.Date, DateTimeKind.Local) : null;

    public static string String(DateTime d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}

public static class Fmt
{
    public static string Time(DateTime d) => d.ToString("t", CultureInfo.CurrentCulture);

    /// "Today at 9:00 AM", "Tomorrow at 9:00 AM", "Tue, Oct 20 at 9:00 AM".
    public static string NextRun(DateTime d)
    {
        var t = Time(d);
        if (d.Date == DateTime.Today) return $"Today at {t}";
        if (d.Date == DateTime.Today.AddDays(1)) return $"Tomorrow at {t}";
        return $"{d.ToString("ddd, MMM d", CultureInfo.CurrentCulture)} at {t}";
    }

    public static string LongDay(DateTime d) => d.ToString("ddd, MMM d, yyyy", CultureInfo.CurrentCulture);
    public static string Stamp(DateTime d) => d.ToString("ddd, MMM d h:mm:ss tt", CultureInfo.CurrentCulture);

    public static string Seconds(double s)
    {
        if (s < 60) return s.ToString("0.0", CultureInfo.InvariantCulture) + "s";
        int total = (int)Math.Round(s);
        int h = total / 3600, m = total % 3600 / 60, sec = total % 60;
        return h > 0 ? $"{h}h {m}m" : $"{m}m {sec}s";
    }

    public static string Coord(double v) =>
        v == Math.Round(v) ? ((long)v).ToString(CultureInfo.InvariantCulture) : v.ToString("0.0", CultureInfo.InvariantCulture);
}

/// {text}, {clipboard}, {date}, {time}, {macro} in a Discord message.
public static class MessageVars
{
    public static readonly (string Token, string Help)[] ForScreenshot =
    {
        ("{text}", "the text it read"), ("{clipboard}", "what's on the clipboard"),
        ("{date}", "today's date"), ("{time}", "the time now"), ("{macro}", "this macro's name"),
    };

    /// For a Send to Discord step, {text} is the last Screenshot area read in the same run.
    public static readonly (string Token, string Help)[] ForMessage =
    {
        ("{clipboard}", "what's on the clipboard"), ("{text}", "the last text a Screenshot area step read in this run"),
        ("{date}", "today's date"), ("{time}", "the time now"), ("{macro}", "this macro's name"),
    };

    public static string Fill(string template, string text, string macro, DateTime? now = null, Func<string>? clipboard = null)
    {
        var n = now ?? DateTime.Now;
        var outText = template;
        if (outText.Contains("{clipboard}"))
        {
            var c = (clipboard ?? ClipboardText.Get)();
            outText = outText.Replace("{clipboard}", c.Length == 0 ? "(clipboard empty)" : c);
        }
        return outText
            .Replace("{text}", text.Length == 0 ? "(no text found)" : text)
            .Replace("{date}", n.ToString("MMM d, yyyy", CultureInfo.CurrentCulture))
            .Replace("{time}", Fmt.Time(n))
            .Replace("{macro}", macro);
    }
}

public static class OpenLink
{
    /// Adds https:// when the scheme is missing; null for anything that isn't a web link.
    public static Uri? Normalized(string raw)
    {
        var t = raw.Trim();
        if (t.Length == 0) return null;
        var withScheme = t.Contains("://") ? t : "https://" + t;
        if (!Uri.TryCreate(withScheme, UriKind.Absolute, out var u)) return null;
        if (u.Scheme != "http" && u.Scheme != "https") return null;
        return string.IsNullOrEmpty(u.Host) ? null : u;
    }
}
