namespace ClickFlow;

using System.Numerics;
using Microsoft.UI.Composition;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Hosting;
using Microsoft.UI.Xaml.Input;

/// Small Composition animations: entrances, press feedback, pops. They run on the compositor
/// thread, so they stay smooth while the UI thread is busy.
///
/// Step cards use UIElement.Translation for dragging, and XAML forbids mixing that with the
/// visual's own "Translation", so anything that may be a card is animated with Opacity and
/// Scale only (slide: false).
public static class Anim
{
    static Visual V(UIElement e) => ElementCompositionPreview.GetElementVisual(e);

    static CompositionEasingFunction Out(Compositor c) =>
        c.CreateCubicBezierEasingFunction(new Vector2(0.1f, 0.9f), new Vector2(0.2f, 1f));

    static void Centre(UIElement e, Visual v)
    {
        var s = e.ActualSize;
        v.CenterPoint = new Vector3(s.X / 2, s.Y / 2, 0);
    }

    /// Fades (and slides or grows) an element in, optionally after a delay.
    public static void Enter(UIElement e, int delayMs = 0, bool slide = true, float distance = 14, int ms = 300)
    {
        var v = V(e);
        var c = v.Compositor;
        var ease = Out(c);
        var delay = TimeSpan.FromMilliseconds(delayMs);

        var fade = c.CreateScalarKeyFrameAnimation();
        fade.InsertKeyFrame(0, 0);
        fade.InsertKeyFrame(1, 1, ease);
        fade.Duration = TimeSpan.FromMilliseconds(ms);
        fade.DelayTime = delay;
        fade.DelayBehavior = AnimationDelayBehavior.SetInitialValueBeforeDelay;
        v.StartAnimation("Opacity", fade);

        if (slide)
        {
            ElementCompositionPreview.SetIsTranslationEnabled(e, true);
            var move = c.CreateVector3KeyFrameAnimation();
            move.InsertKeyFrame(0, new Vector3(0, distance, 0));
            move.InsertKeyFrame(1, Vector3.Zero, ease);
            move.Duration = TimeSpan.FromMilliseconds(ms + 60);
            move.DelayTime = delay;
            move.DelayBehavior = AnimationDelayBehavior.SetInitialValueBeforeDelay;
            v.StartAnimation("Translation", move);
        }
        else
        {
            Centre(e, v);
            var grow = c.CreateVector3KeyFrameAnimation();
            grow.InsertKeyFrame(0, new Vector3(0.97f, 0.97f, 1));
            grow.InsertKeyFrame(1, Vector3.One, ease);
            grow.Duration = TimeSpan.FromMilliseconds(ms + 60);
            grow.DelayTime = delay;
            grow.DelayBehavior = AnimationDelayBehavior.SetInitialValueBeforeDelay;
            v.StartAnimation("Scale", grow);
        }
    }

    /// Fades and shrinks an element away, then calls done.
    public static void Leave(UIElement e, Action done, int ms = 160)
    {
        var v = V(e);
        var c = v.Compositor;
        Centre(e, v);
        var batch = c.CreateScopedBatch(CompositionBatchTypes.Animation);
        var fade = c.CreateScalarKeyFrameAnimation();
        fade.InsertKeyFrame(1, 0);
        fade.Duration = TimeSpan.FromMilliseconds(ms);
        v.StartAnimation("Opacity", fade);
        var shrink = c.CreateVector3KeyFrameAnimation();
        shrink.InsertKeyFrame(1, new Vector3(0.96f, 0.96f, 1));
        shrink.Duration = TimeSpan.FromMilliseconds(ms);
        v.StartAnimation("Scale", shrink);
        batch.End();
        var q = e.DispatcherQueue;
        batch.Completed += (_, _) => q.TryEnqueue(() => done());
    }

    /// A quick bounce: grows a little and springs back. Feedback for "something happened here".
    public static void Pop(UIElement e, float by = 0.025f)
    {
        var v = V(e);
        var c = v.Compositor;
        Centre(e, v);
        var a = c.CreateVector3KeyFrameAnimation();
        a.InsertKeyFrame(0.35f, new Vector3(1 + by, 1 + by, 1), Out(c));
        a.InsertKeyFrame(1, Vector3.One, Out(c));
        a.Duration = TimeSpan.FromMilliseconds(320);
        v.StartAnimation("Scale", a);
    }

    /// Squishes on press and springs back on release, so every click is felt.
    public static void Pressable(UIElement e, float to = 0.95f)
    {
        void Press(object s, PointerRoutedEventArgs a) => ScaleTo(e, to, spring: false);
        void Release(object s, PointerRoutedEventArgs a) => ScaleTo(e, 1, spring: true);
        e.AddHandler(UIElement.PointerPressedEvent, new PointerEventHandler(Press), true);
        e.AddHandler(UIElement.PointerReleasedEvent, new PointerEventHandler(Release), true);
        e.AddHandler(UIElement.PointerCaptureLostEvent, new PointerEventHandler(Release), true);
        e.AddHandler(UIElement.PointerExitedEvent, new PointerEventHandler(Release), true);
    }

    static void ScaleTo(UIElement e, float s, bool spring)
    {
        var v = V(e);
        var c = v.Compositor;
        Centre(e, v);
        if (spring)
        {
            var a = c.CreateSpringVector3Animation();
            a.FinalValue = new Vector3(s, s, 1);
            a.DampingRatio = 0.45f;
            a.Period = TimeSpan.FromMilliseconds(45);
            v.StartAnimation("Scale", a);
        }
        else
        {
            var a = c.CreateVector3KeyFrameAnimation();
            a.InsertKeyFrame(1, new Vector3(s, s, 1), Out(c));
            a.Duration = TimeSpan.FromMilliseconds(90);
            v.StartAnimation("Scale", a);
        }
    }
}
