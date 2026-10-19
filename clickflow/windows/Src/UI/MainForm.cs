using System.Drawing.Drawing2D;
using static ClickFlow.Native;

namespace ClickFlow;

public sealed class MainForm : Form
{
    enum Page { Macro, History, Settings }

    readonly Store store = Store.Shared;
    readonly Runner runner = Runner.Shared;

    readonly Panel sidebar = new();
    readonly TextBox search = new();
    readonly MacroList list = new();
    readonly NavButton historyNav = new("Run History", ""), settingsNav = new("Settings", "");
    readonly Panel content = new();
    readonly Panel toolbar = new();
    readonly Label pageTitle = Theme.Label("", Theme.H2);
    readonly FlatButton recordButton = Theme.Button("Record", "");
    readonly FlatButton previewButton = Theme.Button("Preview", "");
    readonly FlatButton runButton = Theme.Button("Run", "", primary: true);
    readonly NotifyIcon tray = new();
    readonly ContextMenuStrip trayMenu = new();
    Page page = Page.Macro;
    Guid? selected;
    Control? current;
    bool quitting;
    const int HotkeyId = 0xC11C;
    public static readonly uint ShowMessage = RegisterWindowMessage("ClickFlow.Show");

    public MainForm(bool startHidden)
    {
        Text = "ClickFlow";
        Icon = AppIcon.Get();
        Font = Theme.Body;
        BackColor = Theme.Window;
        AutoScaleMode = AutoScaleMode.Dpi;
        MinimumSize = new Size(900, 560);
        Size = new Size(1180, 800);
        StartPosition = FormStartPosition.CenterScreen;
        KeyPreview = true;

        BuildSidebar();
        BuildToolbar();
        content.Dock = DockStyle.Fill;
        content.BackColor = Theme.Window;
        Controls.Add(content);
        Controls.Add(toolbar);
        Controls.Add(sidebar);
        BuildTray();

        store.MacrosChanged += () => { list.Reload(Filtered()); UpdateTray(); };
        runner.BusyChanged += UpdateButtons;
        Recorder.Shared.Changed += UpdateButtons;
        runner.HideMain = () =>
        {
            if (!Visible || WindowState == FormWindowState.Minimized) return false;
            Hide();
            return true;
        };
        runner.RestoreMain = activate =>
        {
            Show();
            if (activate) Activate();
        };

        list.Reload(Filtered());
        Select(store.Macros.FirstOrDefault()?.Id);
        hiddenStart = startHidden;
    }

    bool hiddenStart;

    protected override void SetVisibleCore(bool value)
    {
        // --minimized: start in the tray without flashing the window.
        if (hiddenStart)
        {
            hiddenStart = false;
            if (!IsHandleCreated) CreateHandle();
            value = false;
        }
        base.SetVisibleCore(value);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Emergency stop from any app: Ctrl+Alt+.
        RegisterHotKey(Handle, HotkeyId, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0xBE);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY && (int)m.WParam == HotkeyId)
        {
            Recorder.Shared.Stop();
            runner.EmergencyStop();
            return;
        }
        if (m.Msg == ShowMessage) { ShowFromTray(); return; }
        base.WndProc(ref m);
    }

    // ---------- layout ----------

    void BuildSidebar()
    {
        sidebar.Dock = DockStyle.Left;
        sidebar.Width = LogicalToDeviceUnits(290);
        sidebar.BackColor = Theme.Sidebar;
        sidebar.Padding = new Padding(10, 12, 10, 10);

        var brand = Theme.Label("ClickFlow", Theme.H1);
        brand.Dock = DockStyle.Top;
        brand.AutoSize = false;
        brand.Height = LogicalToDeviceUnits(40);

        search.PlaceholderText = "Search macros";
        search.Dock = DockStyle.Top;
        search.BorderStyle = BorderStyle.FixedSingle;
        search.TextChanged += (_, _) => list.Reload(Filtered());
        var searchWrap = new Panel { Dock = DockStyle.Top, Height = LogicalToDeviceUnits(36), Padding = new Padding(0, 4, 0, 6) };
        searchWrap.Controls.Add(search);

        var header = Theme.Label("MACROS", Theme.Small, Theme.Muted);
        header.Dock = DockStyle.Top;
        header.AutoSize = false;
        header.Height = LogicalToDeviceUnits(22);

        list.Dock = DockStyle.Fill;
        list.Picked += id => Select(id);
        list.Toggled += id =>
        {
            if (store.Macro(id) is { } m) { m.Enabled = !m.Enabled; store.Changed(); RefreshEditorHeader(); }
        };
        list.ContextFor += MacroMenu;

        var nav = new Panel { Dock = DockStyle.Bottom, Height = LogicalToDeviceUnits(120) };
        historyNav.Dock = DockStyle.Top;
        settingsNav.Dock = DockStyle.Top;
        historyNav.Click += (_, _) => ShowPage(Page.History);
        settingsNav.Click += (_, _) => ShowPage(Page.Settings);
        var newButton = Theme.Button("New Macro", "");
        newButton.Click += (_, _) => Select(store.NewMacro().Id);
        var ioButton = Theme.Button("", "");
        var ioMenu = new ContextMenuStrip();
        ioMenu.Items.Add("Import Macros…", null, (_, _) => { if (store.Import(this) is { } m) Select(m.Id); });
        ioMenu.Items.Add("Export All Macros…", null, (_, _) => store.Export(this, store.Macros));
        ioButton.Click += (_, _) => ioMenu.Show(ioButton, new Point(0, ioButton.Height));
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = LogicalToDeviceUnits(40), Padding = new Padding(0, 6, 0, 0) };
        bottom.Controls.Add(newButton);
        bottom.Controls.Add(ioButton);
        nav.Controls.Add(settingsNav);
        nav.Controls.Add(historyNav);
        nav.Controls.Add(bottom);

        sidebar.Controls.Add(list);
        sidebar.Controls.Add(header);
        sidebar.Controls.Add(searchWrap);
        sidebar.Controls.Add(brand);
        sidebar.Controls.Add(nav);
    }

    void BuildToolbar()
    {
        toolbar.Dock = DockStyle.Top;
        toolbar.Height = LogicalToDeviceUnits(54);
        toolbar.BackColor = Theme.Window;
        toolbar.Padding = new Padding(20, 12, 16, 8);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Right, AutoSize = true, WrapContents = false, BackColor = Color.Transparent };
        buttons.Controls.AddRange(new Control[] { recordButton, previewButton, runButton });
        pageTitle.Dock = DockStyle.Fill;
        pageTitle.AutoSize = false;
        pageTitle.TextAlign = ContentAlignment.MiddleLeft;
        pageTitle.AutoEllipsis = true;
        toolbar.Controls.Add(pageTitle);
        toolbar.Controls.Add(buttons);
        toolbar.Paint += (_, e) => e.Graphics.DrawLine(new Pen(Theme.Border), 0, toolbar.Height - 1, toolbar.Width, toolbar.Height - 1);

        recordButton.Click += (_, _) => RecordNew();
        previewButton.Click += (_, _) => { if (selected is { } id) runner.PreviewRun(id, this); };
        runButton.Click += (_, _) => { if (selected is { } id) runner.RunNow(id, this); };
        var tip = new ToolTip();
        tip.SetToolTip(recordButton, "Record your clicks into a new macro (Ctrl+Shift+R)");
        tip.SetToolTip(previewButton, "Play it without clicking, typing or sending anything; markers show where each click would land (Ctrl+Alt+R)");
        tip.SetToolTip(runButton, "Run the selected macro (Ctrl+R)");
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.Control | Keys.R: runButton.PerformClickIfEnabled(); return true;
            case Keys.Control | Keys.Alt | Keys.R: previewButton.PerformClickIfEnabled(); return true;
            case Keys.Control | Keys.Shift | Keys.R: recordButton.PerformClickIfEnabled(); return true;
            case Keys.Control | Keys.N: Select(store.NewMacro().Id); return true;
            case Keys.Control | Keys.F: search.Focus(); return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    // ---------- navigation ----------

    List<Macro> Filtered()
    {
        var q = search.Text.Trim();
        return q.Length == 0 ? store.Macros.ToList() : store.Macros.Where(m => m.Name.Contains(q, StringComparison.CurrentCultureIgnoreCase)).ToList();
    }

    void Select(Guid? id)
    {
        selected = id;
        page = Page.Macro;
        list.Selected = id;
        historyNav.Active = settingsNav.Active = false;
        Swap(id is { } g && store.Macro(g) is { } m ? new MacroEditor(m, this) : Empty());
        UpdateButtons();
    }

    void ShowPage(Page p)
    {
        page = p;
        selected = null;
        list.Selected = null;
        historyNav.Active = p == Page.History;
        settingsNav.Active = p == Page.Settings;
        Swap(p == Page.History ? new HistoryView() : new SettingsView(this));
        UpdateButtons();
    }

    void Swap(Control c)
    {
        content.SuspendLayout();
        var old = current;
        c.Dock = DockStyle.Fill;
        content.Controls.Add(c);
        current = c;
        if (old != null) { content.Controls.Remove(old); old.Dispose(); }
        content.ResumeLayout();
        // Don't land in the first text box (it would open with the macro name selected).
        ActiveControl = list;
        pageTitle.Text = page switch
        {
            Page.History => "Run History",
            Page.Settings => "Settings",
            _ => selected is { } id && store.Macro(id) is { } m ? m.Name : "",
        };
    }

    public void OpenPage(string name)
    {
        if (name == "history") ShowPage(Page.History);
        else if (name == "settings") ShowPage(Page.Settings);
        else if (name.StartsWith("step:") && current is MacroEditor ed && int.TryParse(name[5..], out var n)) ed.ScrollToStep(n - 1);
        else if (name == "schedules" && current is MacroEditor ed2) ed2.ScrollToEnd();
    }

    public void RefreshEditorHeader()
    {
        if (page == Page.Macro && selected is { } id && store.Macro(id) is { } m) pageTitle.Text = m.Name;
        list.Invalidate();
    }

    Control Empty()
    {
        var panel = new Panel { BackColor = Theme.Window };
        var box = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, BackColor = Color.Transparent };
        box.Controls.Add(Theme.Label("No macro selected", Theme.H1));
        box.Controls.Add(Theme.Label("Pick one on the left, make a new one, or record your clicks.", null, Theme.Muted));
        var newB = Theme.Button("New Macro", "");
        newB.Click += (_, _) => Select(store.NewMacro().Id);
        var recB = Theme.Button("Record", "", primary: true);
        recB.Click += (_, _) => RecordNew();
        box.Controls.Add(new Row(newB, recB) { Margin = new Padding(0, 12, 0, 0) });
        panel.Controls.Add(box);
        panel.Resize += (_, _) => box.Location = new Point(Math.Max(0, (panel.Width - box.Width) / 2), Math.Max(0, (panel.Height - box.Height) / 2 - 40));
        return panel;
    }

    void UpdateButtons()
    {
        bool busy = runner.IsBusy;
        recordButton.Enabled = !busy;
        previewButton.Enabled = !busy && selected != null;
        runButton.Enabled = !busy && selected != null;
        UpdateTray();
        list.Invalidate();
    }

    void MacroMenu(Guid id, Point screen)
    {
        if (store.Macro(id) is not { } m) return;
        var menu = new ContextMenuStrip();
        bool busy = runner.IsBusy;
        menu.Items.Add("Run Now", null, (_, _) => runner.RunNow(id, this)).Enabled = !busy;
        menu.Items.Add("Preview", null, (_, _) => runner.PreviewRun(id, this)).Enabled = !busy;
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Rename…", null, (_, _) =>
        {
            if (Prompt.Ask(this, "Rename Macro", "Name", m.Name) is { } t && t.Trim().Length > 0)
            {
                m.Name = t.Trim();
                store.Changed();
                if (selected == id) Select(id);
            }
        });
        menu.Items.Add("Duplicate", null, (_, _) => { if (store.Duplicate(id) is { } d) Select(d.Id); });
        menu.Items.Add("Export…", null, (_, _) => store.Export(this, new() { m }));
        int i = store.Macros.IndexOf(m);
        menu.Items.Add("Move Up", null, (_, _) => { store.Macros.RemoveAt(i); store.Macros.Insert(i - 1, m); store.Changed(); }).Enabled = i > 0 && search.Text.Length == 0;
        menu.Items.Add("Move Down", null, (_, _) => { store.Macros.RemoveAt(i); store.Macros.Insert(i + 1, m); store.Changed(); }).Enabled = i < store.Macros.Count - 1 && search.Text.Length == 0;
        menu.Items.Add(new ToolStripSeparator());
        var del = menu.Items.Add("Delete…", null, (_, _) =>
        {
            if (!Alerts.Confirm(this, $"Delete {m.Name}?", "Its steps and schedules are removed. Run history stays.", "Delete")) return;
            store.Delete(id);
            if (selected == id) Select(store.Macros.FirstOrDefault()?.Id);
        });
        del.ForeColor = Theme.Red;
        menu.Show(screen);
    }

    public void RecordNew()
    {
        if (runner.IsBusy) return;
        bool hid = Visible;
        if (hid) Hide();
        Recorder.Shared.Start(steps =>
        {
            if (hid) { Show(); Activate(); }
            if (steps.Count == 0) return;
            var m = store.NewMacro($"Recording {Fmt.Stamp(DateTime.Now)}", steps);
            Select(m.Id);
        });
    }

    // ---------- tray ----------

    void BuildTray()
    {
        tray.Icon = AppIcon.Get();
        tray.Text = "ClickFlow";
        tray.ContextMenuStrip = trayMenu;
        tray.Visible = true;
        tray.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) ShowFromTray(); };
        trayMenu.Opening += (_, _) => BuildTrayMenu();
        UpdateTray();
    }

    void BuildTrayMenu()
    {
        trayMenu.Items.Clear();
        trayMenu.Items.Add("Open ClickFlow", null, (_, _) => ShowFromTray()).Font = Theme.Bold;
        if (runner.Busy) trayMenu.Items.Add($"Stop {runner.Status?.MacroName}", null, (_, _) => runner.EmergencyStop());
        if (Recorder.Shared.IsRecording) trayMenu.Items.Add("Stop Recording", null, (_, _) => Recorder.Shared.Stop());
        trayMenu.Items.Add(new ToolStripSeparator());
        var run = new ToolStripMenuItem("Run") { Enabled = !runner.IsBusy && store.Macros.Count > 0 };
        foreach (var m in store.Macros)
        {
            var id = m.Id;
            run.DropDownItems.Add(m.Name, null, (_, _) => runner.RunNow(id, null));
        }
        trayMenu.Items.Add(run);
        var pause = new ToolStripMenuItem("Pause All Schedules") { Checked = store.Prefs.PausedAll };
        pause.Click += (_, _) => { store.Prefs.PausedAll = !store.Prefs.PausedAll; store.SavePrefs(); store.Changed(); };
        trayMenu.Items.Add(pause);
        if (store.NextRun is { } next) trayMenu.Items.Add($"Next: {next.Macro.Name}, {Fmt.NextRun(next.Date)}").Enabled = false;
        trayMenu.Items.Add(new ToolStripSeparator());
        trayMenu.Items.Add("Quit ClickFlow", null, (_, _) => Quit());
    }

    void UpdateTray()
    {
        var text = runner.Busy ? $"ClickFlow · running {runner.Status?.MacroName}"
            : store.Prefs.PausedAll ? "ClickFlow · schedules paused"
            : store.NextRun is { } n ? $"ClickFlow · next: {n.Macro.Name}, {Fmt.NextRun(n.Date)}" : "ClickFlow";
        tray.Text = text.Length > 127 ? text[..127] : text;
    }

    public void ShowFromTray()
    {
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
        SetForegroundWindow(Handle);
    }

    public void Quit()
    {
        quitting = true;
        Close();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // Closing the window keeps ClickFlow in the tray, where schedules keep firing.
        if (!quitting && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            if (!store.Prefs.TrayHintShown)
            {
                store.Prefs.TrayHintShown = true;
                store.SavePrefs();
                tray.ShowBalloonTip(4000, "ClickFlow is still running", "Schedules keep firing from the tray. Right-click the icon to quit.", ToolTipIcon.Info);
            }
            return;
        }
        Placer.Close();
        Recorder.Shared.Stop();
        runner.EmergencyStop();
        InputLock.Release();
        UnregisterHotKey(Handle, HotkeyId);
        Scheduler.Shared.Save();
        store.Flush();
        tray.Visible = false;
        base.OnFormClosing(e);
    }

    // ---------- sidebar pieces ----------

    /// The macro list: name, stats, schedule and next run; a switch when it has schedules.
    sealed class MacroList : Control
    {
        List<Macro> items = new();
        public Guid? Selected { get => selected; set { selected = value; Invalidate(); } }
        Guid? selected;
        int scroll;
        public event Action<Guid>? Picked, Toggled;
        public event Action<Guid, Point>? ContextFor;
        readonly System.Windows.Forms.Timer minute = new() { Interval = 30_000 };

        public MacroList()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            BackColor = Theme.Sidebar;
            minute.Tick += (_, _) => Invalidate();
            minute.Start();
        }

        public void Reload(List<Macro> list) { items = list; Clamp(); Invalidate(); }

        int RowH(Macro m) => LogicalToDeviceUnits(m.ScheduleSummary != null ? 74 : 50);

        IEnumerable<(Macro M, Rectangle R)> Rows()
        {
            int y = -scroll;
            foreach (var m in items)
            {
                int h = RowH(m);
                yield return (m, new Rectangle(0, y, Width, h));
                y += h + LogicalToDeviceUnits(2);
            }
        }

        int ContentHeight => items.Sum(m => RowH(m) + LogicalToDeviceUnits(2));
        void Clamp() => scroll = Math.Max(0, Math.Min(scroll, ContentHeight - Height));

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            scroll -= e.Delta / 3;
            Clamp();
            Invalidate();
        }

        Rectangle SwitchRect(Rectangle r) => new(r.Right - LogicalToDeviceUnits(44), r.Top + LogicalToDeviceUnits(10), LogicalToDeviceUnits(34), LogicalToDeviceUnits(18));

        protected override void OnMouseDown(MouseEventArgs e)
        {
            foreach (var (m, r) in Rows())
            {
                if (!r.Contains(e.Location)) continue;
                if (e.Button == MouseButtons.Right) { ContextFor?.Invoke(m.Id, PointToScreen(e.Location)); return; }
                if (m.Schedules.Count > 0 && SwitchRect(r).Contains(e.Location)) { Toggled?.Invoke(m.Id); Invalidate(); return; }
                Picked?.Invoke(m.Id);
                return;
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(BackColor);
            if (items.Count == 0)
            {
                TextRenderer.DrawText(g, "No macros yet", Theme.Body, new Rectangle(8, 8, Width, 30), Theme.Muted, TextFormatFlags.NoPrefix);
                return;
            }
            var paused = Store.Shared.Prefs.PausedAll;
            var running = Runner.Shared.Status?.MacroName;
            foreach (var (m, r) in Rows())
            {
                if (r.Bottom < 0 || r.Top > Height) continue;
                if (m.Id == selected)
                {
                    using var b = new SolidBrush(Color.White);
                    using var p = Theme.Rounded(new RectangleF(r.X + 0.5f, r.Y + 0.5f, r.Width - 1.5f, r.Height - 1.5f), LogicalToDeviceUnits(8));
                    g.FillPath(b, p);
                    using var pen = new Pen(Theme.Border);
                    g.DrawPath(pen, p);
                }
                int x = r.X + LogicalToDeviceUnits(10), w = r.Width - LogicalToDeviceUnits(m.Schedules.Count > 0 ? 64 : 20);
                int y = r.Y + LogicalToDeviceUnits(6);
                var flags = TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine;
                TextRenderer.DrawText(g, m.Name, Theme.Bold, new Rectangle(x, y, w, LogicalToDeviceUnits(20)), Theme.Text, flags);
                y += LogicalToDeviceUnits(20);
                var stats = running == m.Name ? "Running…" : m.Stats;
                TextRenderer.DrawText(g, stats, Theme.Small, new Rectangle(x, y, w, LogicalToDeviceUnits(18)), running == m.Name ? Theme.Accent : Theme.Muted, flags);
                y += LogicalToDeviceUnits(18);
                if (m.ScheduleSummary is { } summary)
                {
                    TextRenderer.DrawText(g, "", Theme.IconSmall, new Rectangle(x, y, LogicalToDeviceUnits(16), LogicalToDeviceUnits(18)), m.Enabled ? Theme.Muted : Theme.Faint, TextFormatFlags.VerticalCenter);
                    TextRenderer.DrawText(g, summary, Theme.Small, new Rectangle(x + LogicalToDeviceUnits(18), y, w - LogicalToDeviceUnits(18), LogicalToDeviceUnits(18)), m.Enabled ? Theme.Muted : Theme.Faint, flags);
                    y += LogicalToDeviceUnits(16);
                    if (paused) TextRenderer.DrawText(g, "Paused", Theme.Small, new Rectangle(x, y, w, LogicalToDeviceUnits(18)), Theme.Orange, flags);
                    else if (m.NextRun(DateTime.Now) is { } next)
                        TextRenderer.DrawText(g, $"Next: {Fmt.NextRun(next)}", Theme.Small, new Rectangle(x, y, w, LogicalToDeviceUnits(18)), Theme.Accent, flags);
                }
                if (m.Schedules.Count > 0) Toggle.Draw(g, SwitchRect(r), m.Enabled);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) minute.Dispose();
            base.Dispose(disposing);
        }
    }

    sealed class NavButton : Control
    {
        readonly string glyph;
        bool active, hot;
        public bool Active { get => active; set { active = value; Invalidate(); } }

        public NavButton(string text, string glyph)
        {
            Text = text;
            this.glyph = glyph;
            Height = 38;
            Cursor = Cursors.Hand;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            BackColor = Theme.Sidebar;
        }

        protected override void OnMouseEnter(EventArgs e) { hot = true; Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { hot = false; Invalidate(); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(BackColor);
            if (active || hot)
            {
                using var b = new SolidBrush(active ? Color.White : Color.FromArgb(226, 229, 236));
                using var p = Theme.Rounded(new RectangleF(0, 2, Width - 1, Height - 4), LogicalToDeviceUnits(8));
                g.FillPath(b, p);
            }
            TextRenderer.DrawText(g, glyph, Theme.Icon, new Rectangle(LogicalToDeviceUnits(10), 0, LogicalToDeviceUnits(22), Height), active ? Theme.Accent : Theme.Muted, TextFormatFlags.VerticalCenter);
            TextRenderer.DrawText(g, Text, active ? Theme.Bold : Theme.Body, new Rectangle(LogicalToDeviceUnits(38), 0, Width, Height), Theme.Text, TextFormatFlags.VerticalCenter);
        }
    }
}

public static class Toggle
{
    public static void Draw(Graphics g, Rectangle r, bool on)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var track = new SolidBrush(on ? Theme.Accent : Color.FromArgb(200, 204, 212));
        using var p = Theme.Rounded(r, r.Height / 2f);
        g.FillPath(track, p);
        int d = r.Height - 4;
        int x = on ? r.Right - d - 2 : r.X + 2;
        using var knob = new SolidBrush(Color.White);
        g.FillEllipse(knob, x, r.Y + 2, d, d);
    }
}

public static class ButtonExt
{
    public static void PerformClickIfEnabled(this FlatButton b)
    {
        if (b.Enabled) b.PerformClick();
    }
}

/// A one-field text prompt.
public static class Prompt
{
    public static string? Ask(IWin32Window owner, string title, string label, string value)
    {
        using var f = new Form
        {
            Text = title, FormBorderStyle = FormBorderStyle.FixedDialog, MinimizeBox = false, MaximizeBox = false,
            StartPosition = FormStartPosition.CenterParent, ClientSize = new Size(380, 130), Font = Theme.Body, AutoScaleMode = AutoScaleMode.Dpi,
            ShowInTaskbar = false,
        };
        var lab = new Label { Text = label, Location = new Point(14, 14), AutoSize = true };
        var box = new TextBox { Text = value, Location = new Point(14, 38), Width = 350 };
        var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Location = new Point(196, 84), Width = 80 };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Location = new Point(284, 84), Width = 80 };
        f.Controls.AddRange(new Control[] { lab, box, ok, cancel });
        f.AcceptButton = ok;
        f.CancelButton = cancel;
        return f.ShowDialog(owner) == DialogResult.OK ? box.Text : null;
    }
}
