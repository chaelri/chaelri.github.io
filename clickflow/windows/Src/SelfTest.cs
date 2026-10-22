namespace ClickFlow;

/// `ClickFlow.exe --selftest [file]`: schedule maths, shortcut parsing and JSON round trips.
/// Pure logic only: it never clicks, types, sends or opens anything, and never touches the
/// saved macros.
static class SelfTest
{
    static readonly List<string> lines = new();
    static int failed;

    static void Check(bool ok, string what)
    {
        lines.Add((ok ? "PASS " : "FAIL ") + what);
        if (!ok) failed++;
    }

    static DateTime D(int y, int mo, int d, int h = 0, int mi = 0, int s = 0) => new(y, mo, d, h, mi, s, DateTimeKind.Local);

    public static int Run(string? outFile)
    {
        try { Body(); }
        catch (Exception e) { Check(false, "threw: " + e); }
        lines.Add(failed == 0 ? $"OK ({lines.Count} checks)" : $"{failed} FAILED");
        var text = string.Join(Environment.NewLine, lines);
        if (outFile != null) File.WriteAllText(outFile, text);
        Native.AttachConsole(-1);
        Console.WriteLine();
        Console.WriteLine(text);
        return failed == 0 ? 0 : 1;
    }

    static void Body()
    {
        // ---- schedules (2026-10-19 is a Monday) ----
        var weekdays = new Schedule { Repeat = RepeatKind.Weekdays, Time = "06:00" };
        Check(weekdays.NextOccurrence(D(2026, 10, 19, 5, 0)) == D(2026, 10, 19, 6, 0), "weekdays: same morning");
        Check(weekdays.NextOccurrence(D(2026, 10, 19, 6, 0)) == D(2026, 10, 20, 6, 0), "weekdays: strictly after");
        Check(weekdays.NextOccurrence(D(2026, 10, 23, 7, 0)) == D(2026, 10, 26, 6, 0), "weekdays: Friday → Monday");
        var weekends = new Schedule { Repeat = RepeatKind.Weekends, Time = "10:30" };
        Check(weekends.NextOccurrence(D(2026, 10, 19)) == D(2026, 10, 24, 10, 30), "weekends: Saturday");
        var custom = new Schedule { Repeat = RepeatKind.Custom, Time = "09:00", CustomDays = { 4 } };   // Wednesday
        Check(custom.NextOccurrence(D(2026, 10, 19)) == D(2026, 10, 21, 9, 0), "custom: Wednesday");
        Check(new Schedule { Repeat = RepeatKind.Custom }.NextOccurrence(D(2026, 10, 19)) == null, "custom with no days never runs");
        var once = new Schedule { Repeat = RepeatKind.Once, Time = "13:15", Date = "2026-10-20" };
        Check(once.NextOccurrence(D(2026, 10, 19)) == D(2026, 10, 20, 13, 15), "once: on its date");
        Check(once.NextOccurrence(D(2026, 10, 21)) == null, "once: past is gone");
        var interval = new Schedule { Repeat = RepeatKind.Interval, Time = "09:00", EndTime = "10:00", IntervalMinutes = 25, CustomDays = { 1, 2, 3, 4, 5, 6, 7 } };
        Check(interval.Times(D(2026, 10, 19)).Count == 3, "interval: 9:00, 9:25, 9:50");
        Check(interval.NextOccurrence(D(2026, 10, 19, 9, 30)) == D(2026, 10, 19, 9, 50), "interval: next slot");
        Check(interval.NextOccurrence(D(2026, 10, 19, 9, 51)) == D(2026, 10, 20, 9, 0), "interval: next day");
        var ranged = new Schedule { Repeat = RepeatKind.Daily, Time = "08:00", Conditions = { StartDate = "2026-11-01", EndDate = "2026-11-02" } };
        Check(ranged.NextOccurrence(D(2026, 10, 19)) == D(2026, 11, 1, 8, 0), "date range: waits for its start");
        Check(ranged.NextOccurrence(D(2026, 11, 2, 9, 0)) == null, "date range: ends");
        var sw = new Macro { Enabled = true, Schedules = { new Schedule { Enabled = false } } };
        Check(!sw.ScheduleOn, "sidebar switch: off when every schedule is off");
        sw.SetScheduleOn(true);
        Check(sw.ScheduleOn && sw.Schedules[0].Enabled, "sidebar switch: on turns a schedule on");
        sw.SetScheduleOn(false);
        Check(!sw.ScheduleOn && sw.Schedules[0].Enabled, "sidebar switch: off keeps the schedule's own setting");
        Check(weekdays.Summary ==$"Every weekday at {Fmt.Time(D(2026, 1, 1, 6, 0))}", "summary text");

        // ---- the scheduler's decision ----
        Check(Scheduler.Decide(weekdays, D(2026, 10, 19, 5, 59), D(2026, 10, 19, 6, 0, 1)).Kind == DecisionKind.Fire, "decide: fire on time");
        Check(Scheduler.Decide(weekdays, D(2026, 10, 19, 5, 0), D(2026, 10, 19, 5, 59)).Kind == DecisionKind.None, "decide: not yet");
        var missed = Scheduler.Decide(weekdays, D(2026, 10, 16, 5, 0), D(2026, 10, 20, 12, 0));
        Check(missed.Kind == DecisionKind.Missed && missed.Count == 3 && missed.Latest == D(2026, 10, 20, 6, 0), "decide: three missed (Fri, Mon, Tue)");
        Check(Scheduler.Decide(weekdays, D(2026, 10, 19, 5, 0), D(2026, 10, 19, 6, 1, 29)).Kind == DecisionKind.Fire, "decide: within the 90 s grace");
        Check(Scheduler.Decide(weekdays, D(2026, 10, 19, 5, 0), D(2026, 10, 19, 6, 1, 31)).Kind == DecisionKind.Missed, "decide: past the grace");

        // ---- key shortcuts ----
        Check(KeyCombo.Parse("cmd+w") is { Vk: 0x57, Mods: KeyCombo.Ctrl }, "cmd+w → Ctrl+W (Mac macros keep their meaning)");
        Check(KeyCombo.Parse("ctrl+shift+s") is { Vk: 0x53, Mods: KeyCombo.Ctrl | KeyCombo.Shift }, "ctrl+shift+s");
        Check(KeyCombo.Parse("⌘⇧4") is { Vk: 0x34, Mods: KeyCombo.Ctrl | KeyCombo.Shift }, "⌘⇧4 symbols");
        Check(KeyCombo.Parse("alt f4") is { Vk: 0x73, Mods: KeyCombo.Alt }, "alt f4");
        Check(KeyCombo.Parse("return")?.Display == "Enter", "return → Enter");
        Check(KeyCombo.Parse("win+d")?.Display == "Win+D", "win+d");
        Check(KeyCombo.Parse("ctrl+a+b") == null, "two keys is an error");
        Check(KeyCombo.Parse("ctrl") == null, "modifier alone is an error");
        Check(KeyCombo.FromKeys(Keys.Control | Keys.Shift | Keys.S) == "ctrl+shift+s", "recorded keys → text");

        // ---- message variables / links ----
        var filled = MessageVars.Fill("In: {text} | {macro}", "7h", "Auto", D(2026, 10, 19, 9, 0), () => "");
        Check(filled == "In: 7h | Auto", "message variables");
        Check(MessageVars.Fill("{text}{clipboard}", "", "", null, () => "") == "(no text found)(clipboard empty)", "empty variables say so");
        Check(OpenLink.Normalized("eva.hrforte.com/dashboard")?.AbsoluteUri == "https://eva.hrforte.com/dashboard", "https:// added");
        Check(OpenLink.Normalized("ftp://x.com") == null, "non-web links refused");
        Check(Discord.IsValidWebhook("https://discord.com/api/webhooks/1/abc") && !Discord.IsValidWebhook("https://example.com/api/webhooks/1"), "webhook check");

        // ---- JSON: Mac-format round trip ----
        var m = new Macro
        {
            Name = "Round trip", RepeatCount = 3, RepeatDelay = 1.5,
            Steps =
            {
                new Step(StepType.LeftClick) { X = 10, Y = -20, DelayBefore = 0.5, Name = "a" },
                new Step(StepType.Wait) { Seconds = 2 },
                new Step(StepType.KeyShortcut) { Keys = "ctrl+s", ShowOnly = true },
                new Step(StepType.ReadText) { X = 1, Y = 2, Width = 30, Height = 40, SendDiscord = true, TextOnly = true, CopyResult = false, Text = "In: {text}" },
                new Step(StepType.OpenUrl) { Url = "https://x.com" },
                new Step(StepType.Shutdown) { DelayBefore = 2, Text = "PC Shutdown at {time}", OnlyIfServo = true },
            },
            Schedules = { new Schedule { Repeat = RepeatKind.Interval, CustomDays = { 2, 3 }, Conditions = { RequireApp = "chrome", MinIdleSeconds = 60 } } },
        };
        var back = Json.ParseMacros(Json.MacroFile(new[] { m }))!.Single();
        Check(back.Id == m.Id && back.Name == m.Name && back.RepeatCount == 3 && back.RepeatDelay == 1.5, "macro fields");
        Check(back.Steps.Count == 6 && back.Steps[5].Type == StepType.Shutdown && back.Steps[5].DelayBefore == 2 && back.Steps[5].Text == "PC Shutdown at {time}" && back.Steps[5].OnlyIfServo && back.Steps[0].X == 10 && back.Steps[0].Y == -20 && back.Steps[0].Name == "a", "click step");
        Check(back.Steps[2].ShowOnly && back.Steps[2].Keys == "ctrl+s", "show-only shortcut");
        var rt = back.Steps[3];
        Check(rt.TextOnly && rt.SendDiscord && !rt.CopyResult && rt.Width == 30 && rt.Text == "In: {text}", "screenshot step");
        Check(back.Schedules[0].Repeat == RepeatKind.Interval && back.Schedules[0].CustomDays.SequenceEqual(new[] { 2, 3 })
              && back.Schedules[0].Conditions.RequireApp == "chrome" && back.Schedules[0].Conditions.MinIdleSeconds == 60, "schedule + conditions");
        var json = Json.MacroFile(new[] { m });
        Check(json.IndexOf("\"enabled\"") < json.IndexOf("\"id\"") && json.Contains("\"repeat\": \"interval\""), "sorted keys, Mac key names");
        Check(!json.Contains("\"keys\"") || json.Split("\"keys\"").Length == 2, "a step writes only its own fields");
        Check(Json.ParseMacros("[]") is { Count: 0 } && Json.ParseMacros("{nope") == null, "bad files are refused, not half-read");
        var legacy = Json.ParseMacros("{\"name\":\"L\",\"steps\":[{\"type\":\"sendScreenshot\",\"x\":1,\"y\":2}]}")!.Single().Steps[0];
        Check(legacy.Type == StepType.ReadText && legacy.SendDiscord && !legacy.CopyResult, "legacy sendScreenshot step");

        var hist = new List<RunRecord> { new() { MacroName = "H", Trigger = RunTrigger.Scheduled, Start = D(2026, 10, 19, 6, 0, 0), End = D(2026, 10, 19, 6, 0, 30), Result = RunResult.Stopped, Reason = "r" } };
        var hb = Json.ParseHistory(Json.History(hist)).Single();
        Check(hb.Start == hist[0].Start && hb.End == hist[0].End && hb.Result == RunResult.Stopped && hb.Trigger == RunTrigger.Scheduled, "history round trip");

        // ---- the repo's saved macros (parsed only; nothing is run or stored) ----
        foreach (var name in new[] { "macros.json", "macros.windows.json" })
        {
            var path = FindRepoFile(Path.Combine("clickflow", "macros", name));
            if (path == null) { lines.Add($"SKIP clickflow/macros/{name} not found"); continue; }
            var list = Json.ParseMacros(File.ReadAllText(path));
            Check(list is { Count: 2 } && list.All(x => x.Steps.Count == 8), $"{name}: 2 macros, 8 steps each");
            if (name == "macros.windows.json" && list != null)
            {
                Check(list.All(x => !x.Enabled && x.Schedules.All(s => !s.Enabled)), $"{name}: schedules all off");
                Check(list.All(x => x.Steps.All(s => s.ShowOnly || s.Type == StepType.Wait)), $"{name}: every step is Show only");
                Check(list.All(x => x.Steps.Where(s => s.Type == StepType.KeyShortcut).All(s => s.Keys == "ctrl+w")), $"{name}: cmd+w → ctrl+w");
            }
        }
    }

    static string? FindRepoFile(string rel)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        {
            var p = Path.Combine(dir.FullName, rel);
            if (File.Exists(p)) return p;
        }
        return null;
    }
}
