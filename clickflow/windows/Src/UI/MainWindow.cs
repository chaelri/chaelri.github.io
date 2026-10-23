using System.Runtime.InteropServices;

namespace ClickFlow;

using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.Graphics;
using Windows.System;
using static ClickFlow.Native;
using FPoint = Windows.Foundation.Point;

public sealed class MainWindow : Window
{
    enum Page { Macro, History, Settings }

    readonly Store store = Store.Shared;
    readonly Runner runner = Runner.Shared;

    readonly TextBox search = new() { PlaceholderText = "Search macros" };
    readonly MacroList list = new();
    readonly NavButton historyNav = new("Run History", ""), settingsNav = new("Settings", "");
    readonly ContentControl content = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Stretch };
    // Building an editor (a NumberBox, text box and menus per step) takes long enough to stall
    // the click that picked it, so each macro's editor is built once, kept here, and switching
    // macros only flips which one is visible.
    readonly Grid editorHost = new();
    readonly Dictionary<Guid, MacroEditor> editors = new();
    readonly TextBlock pageTitle = Theme.Label("", 20, bold: true, wrap: false);
    readonly Button recordButton = Theme.Button("Record", "");
    readonly Button previewButton = Theme.Button("Preview", "");
    readonly Button runButton = Theme.Button("Run", "", primary: true);
    readonly NotifyIcon tray = new();
    readonly ContextMenuStrip trayMenu = new();
    readonly Messages messages;
    Page page = Page.Macro;
    Guid? selected;
    object? current;
    bool quitting, shown;
    readonly List<Action> onShown = new();
    const int HotkeyId = 0xC11C;
    public static readonly uint ShowMessage = RegisterWindowMessage("ClickFlow.Show");

    public nint Hwnd { get; }
    /// For Windows Forms dialogs (message boxes, file pickers) owned by this window.
    public IWin32Window Owner { get; }
    public XamlRoot? Root => Content?.XamlRoot;

    [DllImport("user32.dll")] static extern uint GetDpiForWindow(nint hwnd);

    public MainWindow(bool startHidden)
    {
        Title = "ClickFlow";
        Hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        Owner = new HwndOwner(Hwnd);
        SystemBackdrop = new MicaBackdrop();
        ExtendsContentIntoTitleBar = true;
        AppWindow.SetIcon(Win32Interop.GetIconIdFromIcon(AppIcon.Get().Handle));
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
        PaintCaptionButtons();

        double scale = GetDpiForWindow(Hwnd) / 96.0;
        if (AppWindow.Presenter is OverlappedPresenter op)
        {
            op.PreferredMinimumWidth = (int)(900 * scale);
            op.PreferredMinimumHeight = (int)(560 * scale);
        }
        var work = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
        int w = Math.Min((int)(1180 * scale), work.Width), h = Math.Min((int)(800 * scale), work.Height);
        AppWindow.MoveAndResize(new RectInt32(work.X + (work.Width - w) / 2, work.Y + (work.Height - h) / 2, w, h));

        Content = BuildRoot();
        BuildTray();
        messages = new Messages(this);
        // Emergency stop from any app: Ctrl+Alt+.
        RegisterHotKey(messages.Handle, HotkeyId, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0xBE);

        store.MacrosChanged += () => { list.Reload(Filtered()); UpdateTray(); DropStaleEditors(); };
        runner.BusyChanged += UpdateButtons;
        Recorder.Shared.Changed += UpdateButtons;
        runner.HideMain = () =>
        {
            if (!AppWindow.IsVisible || IsMinimized) return false;
            AppWindow.Hide();
            return true;
        };
        runner.RestoreMain = activate =>
        {
            AppWindow.Show(activate);
            if (activate) Activate();
        };
        AppWindow.Closing += (_, e) =>
        {
            // Closing the window keeps ClickFlow in the tray, where schedules keep firing.
            if (quitting) return;
            e.Cancel = true;
            AppWindow.Hide();
            if (!store.Prefs.TrayHintShown)
            {
                store.Prefs.TrayHintShown = true;
                store.SavePrefs();
                tray.ShowBalloonTip(4000, "ClickFlow is still running", "Schedules keep firing from the tray. Right-click the icon to quit.", ToolTipIcon.Info);
            }
        };
        Activated += (_, _) =>
        {
            PaintCaptionButtons();
            if (shown) return;
            shown = true;
            foreach (var a in onShown) a();
            onShown.Clear();
            WarmEditors();
        };

        list.Reload(Filtered());
        Select(store.Macros.FirstOrDefault()?.Id);
        // --minimized: start in the tray; a WinUI window stays hidden until it's activated.
        if (!startHidden) Activate();
    }

    /// Runs once the window is first on screen (or now, if it already is).
    public void WhenShown(Action a)
    {
        if (shown) a(); else onShown.Add(a);
    }

    /// Minimize / maximize / close sit on the Mica title bar. Left unset, Windows fills them with
    /// its own solid colour, which shows up as white blocks when the window goes inactive or comes
    /// back from being hidden for a run; so they're transparent, with colours for the Light theme,
    /// and set again on every activation.
    void PaintCaptionButtons()
    {
        var bar = AppWindow.TitleBar;
        var ink = Windows.UI.Color.FromArgb(0xE4, 0, 0, 0);
        bar.ButtonBackgroundColor = Colors.Transparent;
        bar.ButtonInactiveBackgroundColor = Colors.Transparent;
        bar.ButtonForegroundColor = ink;
        bar.ButtonInactiveForegroundColor = Windows.UI.Color.FromArgb(0x5C, 0, 0, 0);
        bar.ButtonHoverBackgroundColor = Windows.UI.Color.FromArgb(0x0F, 0, 0, 0);
        bar.ButtonHoverForegroundColor = ink;
        bar.ButtonPressedBackgroundColor = Windows.UI.Color.FromArgb(0x0A, 0, 0, 0);
        bar.ButtonPressedForegroundColor = ink;
    }

    bool IsMinimized =>AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized };

    // ---------- layout ----------

    UIElement BuildRoot()
    {
        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(290) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var titleBar = new Grid { Background = new SolidColorBrush(Colors.Transparent) };
        var titleRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, Margin = new Thickness(16, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
        titleRow.Children.Add(new Image { Source = Theme.ToImage(new Icon(AppIcon.Get(), 32, 32).ToBitmap()), Width = 18, Height = 18 });
        titleRow.Children.Add(Theme.Label("ClickFlow", 12, Theme.Muted));
        titleBar.Children.Add(titleRow);
        Grid.SetColumnSpan(titleBar, 2);
        root.Children.Add(titleBar);
        SetTitleBar(titleBar);

        var side = BuildSidebar();
        Grid.SetRow(side, 1);
        root.Children.Add(side);

        var main = new Grid
        {
            Background = Theme.Res("LayerFillColorDefaultBrush"), BorderBrush = Theme.Res("CardStrokeColorDefaultBrush"),
            BorderThickness = new Thickness(1, 1, 0, 0), CornerRadius = new CornerRadius(8, 0, 0, 0),
        };
        main.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        main.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        main.Children.Add(BuildToolbar());
        Grid.SetRow(content, 1);
        main.Children.Add(content);
        Grid.SetRow(main, 1);
        Grid.SetColumn(main, 1);
        root.Children.Add(main);

        Key(root, VirtualKey.R, VirtualKeyModifiers.Control, () => ClickIfEnabled(runButton));
        Key(root, VirtualKey.R, VirtualKeyModifiers.Control | VirtualKeyModifiers.Menu, () => ClickIfEnabled(previewButton));
        Key(root, VirtualKey.R, VirtualKeyModifiers.Control | VirtualKeyModifiers.Shift, () => ClickIfEnabled(recordButton));
        Key(root, VirtualKey.N, VirtualKeyModifiers.Control, () => Select(store.NewMacro().Id));
        Key(root, VirtualKey.F, VirtualKeyModifiers.Control, () => search.Focus(FocusState.Keyboard));
        root.KeyboardAcceleratorPlacementMode = KeyboardAcceleratorPlacementMode.Hidden;
        return root;
    }

    static void Key(UIElement on, VirtualKey key, VirtualKeyModifiers mods, Action a)
    {
        var k = new KeyboardAccelerator { Key = key, Modifiers = mods };
        k.Invoked += (_, e) => { e.Handled = true; a(); };
        on.KeyboardAccelerators.Add(k);
    }

    void ClickIfEnabled(Button b)
    {
        if (!b.IsEnabled) return;
        if (b == runButton) RunSelected();
        else if (b == previewButton) PreviewSelected();
        else if (b == recordButton) RecordNew();
    }

    void RunSelected() { if (selected is { } id) runner.RunNow(id, Owner); }
    void PreviewSelected() { if (selected is { } id) runner.PreviewRun(id, Owner); }

    FrameworkElement BuildSidebar()
    {
        var side = new Grid { Padding = new Thickness(10, 0, 10, 10) };
        for (int i = 0; i < 5; i++) side.RowDefinitions.Add(new RowDefinition { Height = i == 3 ? new GridLength(1, GridUnitType.Star) : GridLength.Auto });

        var brand = Theme.H1("ClickFlow");
        brand.Margin = new Thickness(6, 0, 0, 10);
        side.Children.Add(brand);

        search.Margin = new Thickness(0, 0, 0, 10);
        search.TextChanged += (_, _) => list.Reload(Filtered());
        Grid.SetRow(search, 1);
        side.Children.Add(search);

        var header = Theme.Small("MACROS");
        header.Margin = new Thickness(6, 0, 0, 6);
        header.CharacterSpacing = 60;
        Grid.SetRow(header, 2);
        side.Children.Add(header);

        list.Picked += id => Select(id);
        list.Toggled += id =>
        {
            if (store.Macro(id) is not { } m) return;
            m.SetScheduleOn(!m.ScheduleOn);
            store.Changed();
            if (editors.TryGetValue(id, out var ed)) ed.RefreshSchedules();
            RefreshEditorHeader();
        };
        list.ContextFor += MacroMenu;
        Grid.SetRow(list, 3);
        side.Children.Add(list);

        var nav = new StackPanel { Spacing = 2, Margin = new Thickness(0, 8, 0, 0) };
        historyNav.Click += (_, _) => ShowPage(Page.History);
        settingsNav.Click += (_, _) => ShowPage(Page.Settings);
        nav.Children.Add(historyNav);
        nav.Children.Add(settingsNav);
        var newButton = Theme.Button("New Macro", "");
        newButton.Click += (_, _) => Select(store.NewMacro().Id);
        var ioButton = Theme.Button("", "");
        ToolTipService.SetToolTip(ioButton, "Import / export");
        var ioMenu = new MenuFlyout();
        ioMenu.Items.Add(Item("Import Macros…", () => { if (store.Import(Owner) is { } m) Select(m.Id); }));
        ioMenu.Items.Add(Item("Export All Macros…", () => store.Export(Owner, store.Macros)));
        ioButton.Flyout = ioMenu;
        var bottom = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, Margin = new Thickness(0, 8, 0, 0) };
        bottom.Children.Add(newButton);
        bottom.Children.Add(ioButton);
        nav.Children.Add(bottom);
        Grid.SetRow(nav, 4);
        side.Children.Add(nav);
        return side;
    }

    UIElement BuildToolbar()
    {
        var bar = new Grid { Padding = new Thickness(24, 14, 18, 12), BorderBrush = Theme.Res("DividerStrokeColorDefaultBrush"), BorderThickness = new Thickness(0, 0, 0, 1) };
        bar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        bar.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        bar.Children.Add(pageTitle);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        buttons.Children.Add(recordButton);
        buttons.Children.Add(previewButton);
        buttons.Children.Add(runButton);
        Grid.SetColumn(buttons, 1);
        bar.Children.Add(buttons);

        recordButton.Click += (_, _) => RecordNew();
        previewButton.Click += (_, _) => PreviewSelected();
        runButton.Click += (_, _) => RunSelected();
        ToolTipService.SetToolTip(recordButton, "Record your clicks into a new macro (Ctrl+Shift+R)");
        ToolTipService.SetToolTip(previewButton, "Play it without clicking, typing or sending anything; markers show where each click would land (Ctrl+Alt+R)");
        ToolTipService.SetToolTip(runButton, "Run the selected macro (Ctrl+R)");
        return bar;
    }

    public static MenuFlyoutItem Item(string text, Action a, bool enabled = true, bool danger = false)
    {
        var i = new MenuFlyoutItem { Text = text, IsEnabled = enabled };
        if (danger) i.Foreground = Theme.Solid(Theme.Red);
        i.Click += (_, _) => a();
        return i;
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
        UIElement view;
        // A bug in one step's editor shouldn't take the window (or the tray) down with it.
        try { view = id is { } g && store.Macro(g) is { } m ? EditorFor(m) : Empty(); }
        catch (Exception e) { Crash.Report(e); view = Empty(); }
        Swap(view);
        UpdateButtons();
    }

    MacroEditor EditorFor(Macro m)
    {
        if (editors.TryGetValue(m.Id, out var ed) && ed.Macro == m)
        {
            ed.Refresh();
            return ed;
        }
        DropEditor(m.Id);
        ed = new MacroEditor(m, this) { Visibility = Visibility.Collapsed };
        editors[m.Id] = ed;
        editorHost.Children.Add(ed);
        return ed;
    }

    void DropEditor(Guid id)
    {
        if (!editors.Remove(id, out var ed)) return;
        ed.Dispose();
        editorHost.Children.Remove(ed);
        if (current == ed) current = null;
    }

    /// Deleted (or re-imported) macros lose their cached editor.
    void DropStaleEditors()
    {
        foreach (var (id, ed) in editors.ToList())
            if (store.Macro(id) != ed.Macro) DropEditor(id);
    }

    /// Builds and lays out every other macro's editor in the background once the window is up,
    /// so even the first switch to one is instant. One per idle tick, drawn invisibly for one
    /// layout pass (that's when WinUI applies the controls' templates), then collapsed.
    void WarmEditors()
    {
        var queue = new Queue<Guid>(store.Macros.Select(m => m.Id));
        void Next()
        {
            while (queue.Count > 0)
            {
                var id = queue.Dequeue();
                if (editors.ContainsKey(id) || store.Macro(id) is not { } m) continue;
                MacroEditor ed;
                try { ed = EditorFor(m); }
                catch (Exception e) { Crash.Report(e); continue; }
                ed.Opacity = 0;
                ed.IsHitTestVisible = false;
                Canvas.SetZIndex(ed, -1);
                ed.Visibility = Visibility.Visible;
                DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () =>
                {
                    if (current != ed) ed.Visibility = Visibility.Collapsed;
                    ed.Opacity = 1;
                    ed.IsHitTestVisible = true;
                    Canvas.SetZIndex(ed, 0);
                    Next();
                });
                return;
            }
        }
        DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, Next);
    }

    void ShowPage(Page p)
    {
        page = p;
        selected = null;
        list.Selected = null;
        historyNav.Active = p == Page.History;
        settingsNav.Active = p == Page.Settings;
        Swap(p == Page.History ? new HistoryView(this) : new SettingsView(this));
        UpdateButtons();
    }

    void Swap(UIElement c)
    {
        // Cached editors are only hidden; anything else (history, settings) is thrown away.
        if (current is not MacroEditor) (current as IDisposable)?.Dispose();
        if (c is MacroEditor ed)
        {
            foreach (var other in editors.Values) if (other != ed) other.Visibility = Visibility.Collapsed;
            ed.Visibility = Visibility.Visible;
            content.Content = editorHost;
        }
        else content.Content = c;
        current = c;
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
        list.Refresh();
    }

    UIElement Empty()
    {
        var box = new StackPanel { Spacing = 6, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 0, 80) };
        box.Children.Add(Theme.H1("No macro selected"));
        box.Children.Add(Theme.Label("Pick one on the left, make a new one, or record your clicks.", color: Theme.Muted));
        var newB = Theme.Button("New Macro", "");
        newB.Click += (_, _) => Select(store.NewMacro().Id);
        var recB = Theme.Button("Record", "", primary: true);
        recB.Click += (_, _) => RecordNew();
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, Margin = new Thickness(0, 12, 0, 0) };
        row.Children.Add(newB);
        row.Children.Add(recB);
        box.Children.Add(row);
        return box;
    }

    void UpdateButtons()
    {
        bool busy = runner.IsBusy;
        recordButton.IsEnabled = !busy;
        previewButton.IsEnabled = !busy && selected != null;
        runButton.IsEnabled = !busy && selected != null;
        UpdateTray();
        list.Refresh();
    }

    void MacroMenu(Guid id, UIElement target, FPoint at)
    {
        if (store.Macro(id) is not { } m) return;
        var menu = new MenuFlyout();
        bool busy = runner.IsBusy;
        menu.Items.Add(Item("Run Now", () => runner.RunNow(id, Owner), !busy));
        menu.Items.Add(Item("Preview", () => runner.PreviewRun(id, Owner), !busy));
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Item("Rename…", async () =>
        {
            if (Root == null) return;
            if (await Dialogs.Ask(Root, "Rename Macro", "Name", m.Name) is { } t && t.Trim().Length > 0)
            {
                m.Name = t.Trim();
                store.Changed();
                DropEditor(id);
                if (selected == id) Select(id);
            }
        }));
        menu.Items.Add(Item("Duplicate", () => { if (store.Duplicate(id) is { } d) Select(d.Id); }));
        menu.Items.Add(Item("Export…", () => store.Export(Owner, new() { m })));
        int i = store.Macros.IndexOf(m);
        menu.Items.Add(Item("Move Up", () => { store.Macros.RemoveAt(i); store.Macros.Insert(i - 1, m); store.Changed(); }, i > 0 && search.Text.Length == 0));
        menu.Items.Add(Item("Move Down", () => { store.Macros.RemoveAt(i); store.Macros.Insert(i + 1, m); store.Changed(); }, i < store.Macros.Count - 1 && search.Text.Length == 0));
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Item("Delete…", async () =>
        {
            if (Root == null || !await Dialogs.Confirm(Root, $"Delete {m.Name}?", "Its steps and schedules are removed. Run history stays.", "Delete")) return;
            store.Delete(id);
            if (selected == id) Select(store.Macros.FirstOrDefault()?.Id);
        }, danger: true));
        menu.ShowAt(target, new FlyoutShowOptions { Position = at });
    }

    public void RecordNew()
    {
        if (runner.IsBusy) return;
        bool hid = AppWindow.IsVisible;
        if (hid) AppWindow.Hide();
        Recorder.Shared.Start(steps =>
        {
            if (hid) { AppWindow.Show(); Activate(); }
            if (steps.Count == 0) return;
            var m = store.NewMacro($"Recording {Fmt.Stamp(DateTime.Now)}", steps);
            Select(m.Id);
        });
    }

    /// Minimizes the window while the placer is up (it usually targets an app behind it);
    /// both callbacks put it back.
    public void WithPlacer(Action<Action, Action> open)
    {
        var op = AppWindow.Presenter as OverlappedPresenter;
        bool hid = AppWindow.IsVisible && !IsMinimized && op != null;
        if (hid) op!.Minimize();
        void Restore()
        {
            if (!hid) return;
            op!.Restore();
            Activate();
        }
        open(Restore, Restore);
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
        trayMenu.Items.Add("Open ClickFlow", null, (_, _) => ShowFromTray()).Font = new Font("Segoe UI Semibold", 9f);
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
        AppWindow.Show();
        if (IsMinimized && AppWindow.Presenter is OverlappedPresenter op) op.Restore();
        Activate();
        SetForegroundWindow(Hwnd);
    }

    /// Windows is signing out or shutting down: keep the schedule state and macros.
    void SaveAll()
    {
        Scheduler.Shared.Save();
        store.Flush();
    }

    public void Quit()
    {
        quitting = true;
        Placer.Close();
        Recorder.Shared.Stop();
        runner.EmergencyStop();
        InputLock.Release();
        UnregisterHotKey(messages.Handle, HotkeyId);
        SaveAll();
        tray.Visible = false;
        tray.Dispose();
        messages.DestroyHandle();
        Close();
        Microsoft.UI.Xaml.Application.Current.Exit();
    }

    /// A hidden top-level window for the emergency-stop hotkey, the second-launch "show"
    /// broadcast and the end-of-session notice.
    sealed class Messages : NativeWindow
    {
        const int WM_ENDSESSION = 0x0016;
        readonly MainWindow main;

        public Messages(MainWindow main)
        {
            this.main = main;
            CreateHandle(new CreateParams { Caption = "ClickFlow.Messages" });
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY && (int)m.WParam == HotkeyId)
            {
                Recorder.Shared.Stop();
                main.runner.EmergencyStop();
                return;
            }
            if (m.Msg == ShowMessage) { main.ShowFromTray(); return; }
            if (m.Msg == WM_ENDSESSION && m.WParam != 0) main.SaveAll();
            base.WndProc(ref m);
        }
    }

    sealed class HwndOwner : IWin32Window
    {
        public HwndOwner(nint h) => Handle = h;
        public nint Handle { get; }
    }
}

/// The macro list: name, stats, schedule and next run; a switch when it has schedules.
sealed class MacroList : UserControl
{
    readonly StackPanel stack = new() { Spacing = 2 };
    readonly Dictionary<Guid, MacroRow> rows = new();
    List<Macro> items = new();
    Guid? selected;
    readonly DispatcherTimer minute = new() { Interval = TimeSpan.FromSeconds(30) };
    public event Action<Guid>? Picked, Toggled;
    public event Action<Guid, UIElement, FPoint>? ContextFor;

    public Guid? Selected { get => selected; set { selected = value; Refresh(); } }

    public MacroList()
    {
        Content = new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        minute.Tick += (_, _) => Refresh();
        minute.Start();
    }

    public void Reload(List<Macro> list)
    {
        items = list;
        // Same macros in the same order: update the rows in place, so a switch keeps its animation.
        if (!items.Select(m => m.Id).SequenceEqual(stack.Children.OfType<MacroRow>().Select(r => r.Id)))
        {
            stack.Children.Clear();
            rows.Clear();
            if (items.Count == 0)
            {
                var none = Theme.Label("No macros yet", color: Theme.Muted);
                none.Margin = new Thickness(8);
                stack.Children.Add(none);
            }
            foreach (var m in items)
            {
                var r = new MacroRow(m.Id);
                r.Picked += id => Picked?.Invoke(id);
                r.Toggled += id => Toggled?.Invoke(id);
                r.ContextFor += (id, el, p) => ContextFor?.Invoke(id, el, p);
                rows[m.Id] = r;
                stack.Children.Add(r);
            }
        }
        Refresh();
    }

    public void Refresh()
    {
        var paused = Store.Shared.Prefs.PausedAll;
        var running = Runner.Shared.Status?.MacroName;
        foreach (var m in items)
            if (rows.TryGetValue(m.Id, out var r)) r.Update(m, m.Id == selected, paused, running == m.Name);
    }
}

sealed class MacroRow : Grid
{
    public readonly Guid Id;
    readonly TextBlock name = Theme.Label("", bold: true, wrap: false);
    readonly TextBlock stats = Theme.Label("", 12, wrap: false);
    readonly FontIcon clock = Theme.Icon("", 11);
    readonly TextBlock schedule = Theme.Label("", 12, wrap: false);
    readonly StackPanel scheduleLine = new() { Orientation = Orientation.Horizontal, Spacing = 5 };
    readonly TextBlock next = Theme.Label("", 12, wrap: false);
    readonly ToggleSwitch toggle = new() { OnContent = "", OffContent = "", MinWidth = 0, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -2, -6, 0) };
    bool isSelected, hot, updating;
    public event Action<Guid>? Picked, Toggled;
    public event Action<Guid, UIElement, FPoint>? ContextFor;

    public MacroRow(Guid id)
    {
        Id = id;
        Padding = new Thickness(10, 7, 10, 9);
        CornerRadius = new CornerRadius(6);
        BorderThickness = new Thickness(1);
        ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var text = new StackPanel { Spacing = 2 };
        scheduleLine.Children.Add(clock);
        scheduleLine.Children.Add(schedule);
        text.Children.Add(name);
        text.Children.Add(stats);
        text.Children.Add(scheduleLine);
        text.Children.Add(next);
        Children.Add(text);
        Grid.SetColumn(toggle, 1);
        Children.Add(toggle);

        toggle.Toggled += (_, _) => { if (!updating) Toggled?.Invoke(Id); };
        PointerEntered += (_, _) => { hot = true; Paint(); };
        PointerExited += (_, _) => { hot = false; Paint(); };
        Tapped += (_, e) => { if (!Inside(e.OriginalSource as DependencyObject, toggle)) Picked?.Invoke(Id); };
        RightTapped += (_, e) => { e.Handled = true; ContextFor?.Invoke(Id, this, e.GetPosition(this)); };
    }

    static bool Inside(DependencyObject? d, DependencyObject parent)
    {
        for (; d != null; d = VisualTreeHelper.GetParent(d)) if (d == parent) return true;
        return false;
    }

    public void Update(Macro m, bool selected, bool paused, bool running)
    {
        isSelected = selected;
        name.Text = m.Name;
        stats.Text = running ? "Running…" : m.Stats;
        stats.Foreground = running ? Theme.Solid(Theme.Accent) : Theme.Muted;
        var summary = m.ScheduleSummary;
        scheduleLine.Visibility = summary != null ? Visibility.Visible : Visibility.Collapsed;
        schedule.Text = summary ?? "";
        schedule.Foreground = clock.Foreground = m.Enabled ? Theme.Muted : Theme.Faint;
        if (summary != null && paused) { next.Text = "Paused"; next.Foreground = Theme.Solid(Theme.Orange); }
        else if (summary != null && m.NextRun(DateTime.Now) is { } n) { next.Text = $"Next: {Fmt.NextRun(n)}"; next.Foreground = Theme.Solid(Theme.Accent); }
        else next.Text = "";
        next.Visibility = next.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        toggle.Visibility = m.Schedules.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        updating = true;
        if (toggle.IsOn != m.ScheduleOn) toggle.IsOn = m.ScheduleOn;
        updating = false;
        Paint();
    }

    void Paint()
    {
        Background = isSelected ? Theme.Res("CardBackgroundFillColorDefaultBrush") : hot ? Theme.Res("SubtleFillColorSecondaryBrush") : new SolidColorBrush(Colors.Transparent);
        BorderBrush = isSelected ? Theme.Res("CardStrokeColorDefaultBrush") : new SolidColorBrush(Colors.Transparent);
    }
}

sealed class NavButton : Button
{
    readonly FontIcon icon;
    readonly TextBlock label;
    bool active;

    public bool Active
    {
        get => active;
        set
        {
            active = value;
            icon.Foreground = active ? Theme.Solid(Theme.Accent) : Theme.Muted;
            label.FontWeight = active ? Microsoft.UI.Text.FontWeights.SemiBold : Microsoft.UI.Text.FontWeights.Normal;
            Background = active ? Theme.Res("SubtleFillColorSecondaryBrush") : new SolidColorBrush(Colors.Transparent);
        }
    }

    public NavButton(string text, string glyph)
    {
        icon = Theme.Icon(glyph, 15, Theme.Muted);
        label = new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center };
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12 };
        row.Children.Add(icon);
        row.Children.Add(label);
        Content = row;
        HorizontalAlignment = HorizontalAlignment.Stretch;
        HorizontalContentAlignment = HorizontalAlignment.Left;
        Padding = new Thickness(12, 8, 12, 8);
        BorderThickness = new Thickness(0);
        Background = new SolidColorBrush(Colors.Transparent);
    }
}
