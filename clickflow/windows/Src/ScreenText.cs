using System.Drawing.Imaging;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

namespace ClickFlow;

/// Screenshot area: captures a rectangle of the screen and reads it with Windows' own
/// on-device OCR (Windows.Media.Ocr). ClickFlow's HUD and markers are excluded from
/// captures (WDA_EXCLUDEFROMCAPTURE), so they never end up in the image.
public static class ScreenText
{
    public static Bitmap Capture(Rectangle area)
    {
        var bmp = new Bitmap(Math.Max(1, area.Width), Math.Max(1, area.Height), PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.CopyFromScreen(area.Location, Point.Empty, area.Size, CopyPixelOperation.SourceCopy);
        return bmp;
    }

    public static byte[] Png(Bitmap image)
    {
        using var ms = new MemoryStream();
        image.Save(ms, ImageFormat.Png);
        return ms.ToArray();
    }

    public static bool OcrAvailable => OcrEngine.TryCreateFromUserProfileLanguages() != null;

    /// Lines joined with newlines; empty when nothing was found.
    public static async Task<string> Recognize(Bitmap image)
    {
        var engine = OcrEngine.TryCreateFromUserProfileLanguages()
            ?? throw new EngineException("Windows OCR isn't available (Settings › Time & language › Language: add an OCR-capable language)");
        // Small areas read far better scaled up: the recognizer expects text around 20–40 px tall.
        using var scaled = Upscale(image);
        using var stream = new InMemoryRandomAccessStream();
        using (var ms = new MemoryStream())
        {
            scaled.Save(ms, ImageFormat.Png);
            var writer = new DataWriter(stream.GetOutputStreamAt(0));
            writer.WriteBytes(ms.ToArray());
            await writer.StoreAsync();
            await writer.FlushAsync();
            writer.DetachStream();
        }
        stream.Seek(0);
        var decoder = await BitmapDecoder.CreateAsync(stream);
        using var soft = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
        var result = await engine.RecognizeAsync(soft);
        return string.Join("\n", result.Lines.Select(l => l.Text)).Trim();
    }

    static Bitmap Upscale(Bitmap src)
    {
        int factor = Math.Max(src.Width, src.Height) < 400 ? 3 : Math.Max(src.Width, src.Height) < 1000 ? 2 : 1;
        int max = (int)OcrEngine.MaxImageDimension;
        while (factor > 1 && Math.Max(src.Width, src.Height) * factor > max) factor--;
        var dst = new Bitmap(src.Width * factor, src.Height * factor, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(dst);
        g.Clear(Color.White);
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        g.DrawImage(src, new Rectangle(0, 0, dst.Width, dst.Height));
        return dst;
    }
}
