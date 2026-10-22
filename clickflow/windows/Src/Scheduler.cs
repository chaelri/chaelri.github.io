using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace ClickFlow;

public enum DecisionKind { None, Fire, Missed }
public readonly record struct Decision(DecisionKind Kind, DateTime Latest = default, int Count = 0);

/// Ticks once a second. For each schedule it remembers the last moment it checked (persisted,
/// so closing the app or sleeping the PC is noticed on the next tick) and asks: did a fire time
/// pass since then? On time → run; long overdue → missed-run policy.
public sealed class Scheduler
{
    public static readonly Scheduler Shared = new();

    /// A fire time this late still counts as on time (timer jitter, a slow wake).
    public const double Grace = 90;

    sealed class Entry { public DateTime LastCheck; public string Signature = ""; }

    Dictionary<string, Entry> state = new();
    System.Windows.Forms.Timer? timer;
    bool dirty;
    DateTime lastSave = DateTime.MinValue;

    /// Pure: what should happen for `schedule` given when it was last checked.
    public static Decision Decide(Schedule schedule, DateTime lastCheck, DateTime now)
    {
        if (schedule.NextOccurrence(lastCheck) is not { } latest || latest > now) return new Decision(DecisionKind.None);
        int count = 1;
        while (count < 100_000 && schedule.NextOccurrence(latest) is { } n && n <= now)
        {
            latest = n;
            count++;
        }
        return (now - latest).TotalSeconds <= Grace
            ? new Decision(DecisionKind.Fire, latest, count)
            : new Decision(DecisionKind.Missed, latest, count);
    }

    public void Start()
    {
        Load();
        Tick();
        timer = new System.Windows.Forms.Timer { Interval = 1000 };
        timer.Tick += (_, _) => Tick();
        timer.Start();
        SystemEvents.PowerModeChanged += (_, e) =>
        {
            if (e.Mode == PowerModes.Resume)
            {
                ClickEngine.CameUpUtc = DateTime.UtcNow;
                UI.Post(Tick);
            }
            if (e.Mode == PowerModes.Suspend) UI.Post(Save);
        };
    }

    static string Signature(Schedule s) => Json.Write(Json.ToJson(s));

    public void Tick()
    {
        var store = Store.Shared;
        var now = DateTime.Now;
        var seen = new HashSet<string>();
        DateTime? soonest = null;

        foreach (var macro in store.Macros.ToList())
        {
            foreach (var s in macro.Schedules.ToList())
            {
                var key = $"{macro.Id}/{s.Id}";
                seen.Add(key);
                var sig = Signature(s);
                // New or edited schedule: start counting from now, so editing never fires a past time.
                if (!state.TryGetValue(key, out var entry) || entry.Signature != sig)
                {
                    state[key] = new Entry { LastCheck = now, Signature = sig };
                    dirty = true;
                    continue;
                }
                bool active = macro.Enabled && s.Enabled && !store.Prefs.PausedAll;
                if (active)
                {
                    var d = Decide(s, entry.LastCheck, now);
                    switch (d.Kind)
                    {
                        case DecisionKind.Fire:
                            Runner.Shared.EnqueueScheduled(macro, s, null);
                            dirty = true;
                            break;
                        case DecisionKind.Missed:
                            var when = Fmt.NextRun(d.Latest);
                            var many = d.Count > 1 ? $" ({d.Count} runs missed)" : "";
                            if (s.MissedRunPolicy == MissedRunPolicy.RunOnce)
                                Runner.Shared.EnqueueScheduled(macro, s, $"Ran late: was due {when}{many}");
                            else
                                Runner.Shared.LogSkip(macro, $"Missed {when} — PC asleep or ClickFlow closed{many}", now);
                            dirty = true;
                            break;
                    }
                    if (s.NextOccurrence(now) is { } n && (soonest == null || n < soonest)) soonest = n;
                }
                entry.LastCheck = now;
            }
        }

        int before = state.Count;
        state = state.Where(kv => seen.Contains(kv.Key)).ToDictionary(kv => kv.Key, kv => kv.Value);
        if (state.Count != before) dirty = true;

        // Keep the PC from idle-sleeping through a run that is about to happen.
        Power.KeepSystemAwake(soonest is { } t && (t - now).TotalMinutes < 15);

        if (dirty || (now - lastSave).TotalSeconds > 30) Save();
    }

    public void Save()
    {
        var o = new JsonObject();
        foreach (var (k, e) in state)
            o[k] = new JsonObject { ["lastCheck"] = Json.Date(e.LastCheck), ["signature"] = e.Signature };
        try { Store.WriteAtomic(Store.Shared.StatePath, Json.Write(o)); } catch (Exception) { }
        dirty = false;
        lastSave = DateTime.Now;
    }

    void Load()
    {
        try
        {
            if (JsonNode.Parse(File.ReadAllText(Store.Shared.StatePath)) is not JsonObject o) return;
            foreach (var (k, v) in o)
                if (v is JsonObject e && Json.ParseDate((string?)e["lastCheck"]) is { } d)
                    state[k] = new Entry { LastCheck = d, Signature = (string?)e["signature"] ?? "" };
        }
        catch (Exception) { }
    }
}
