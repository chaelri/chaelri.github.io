"""AI pass: redraw the sweater area as real fabric with SD-Turbo on the Mac GPU (MPS).

The procedural 'worn' render supplies shape, outline and collar (stable frame to
frame); SD-Turbo img2img re-renders only that area so it reads as a photo of real
knit. Face, hands and background are never touched: the result is pasted back
through the sweater mask.
"""
import time

import cv2
import numpy as np
import torch
from diffusers import AutoPipelineForImage2Image
from PIL import Image

MODEL = "stabilityai/sd-turbo"
PROMPT = ("photo of a man wearing a plain black crew neck wool sweater, soft knit fabric, "
          "natural folds, realistic, webcam photo")


class AISweater:
    def __init__(self, size=512, strength=0.5, steps=2, seed=7):
        self.pipe = AutoPipelineForImage2Image.from_pretrained(
            MODEL, torch_dtype=torch.float16, variant="fp16")
        self.pipe.to("mps")
        self.pipe.set_progress_bar_config(disable=True)
        self.size, self.strength, self.steps, self.seed = size, strength, steps, seed
        self.box = None

    def _box(self, mask, w, h):
        ys, xs = np.where(mask > 0.5)
        if len(xs) == 0:
            return None
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        side = int(max(x1 - x0, y1 - y0) * 1.1)
        side = min(side, w, h)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        bx = int(np.clip(cx - side // 2, 0, w - side))
        by = int(np.clip(cy - side // 2, 0, h - side))
        b = np.array([bx, by, side], np.float32)
        self.box = b if self.box is None else 0.7 * self.box + 0.3 * b  # steady crop
        return self.box.astype(int)

    def render_crop(self, worn_frame, mask):
        """Run the model on the sweater area. Returns (box, ai_crop) or None."""
        h, w = worn_frame.shape[:2]
        b = self._box(mask, w, h)
        if b is None:
            return None
        bx, by, side = b
        crop = worn_frame[by:by + side, bx:bx + side]
        img = Image.fromarray(cv2.cvtColor(cv2.resize(crop, (self.size, self.size)), cv2.COLOR_BGR2RGB))
        g = torch.Generator("cpu").manual_seed(self.seed)  # same noise every frame = less flicker
        steps = max(self.steps, int(np.ceil(1.0 / self.strength)))  # at least 1 real denoise step
        out = self.pipe(PROMPT, image=img, num_inference_steps=steps, strength=self.strength,
                        guidance_scale=0.0, generator=g).images[0]
        return (bx, by, side), cv2.resize(cv2.cvtColor(np.array(out), cv2.COLOR_RGB2BGR), (side, side))

    @staticmethod
    def composite(worn_frame, mask, result):
        """Paste an AI crop back through the current sweater mask."""
        if result is None:
            return worn_frame
        (bx, by, side), out = result
        h, w = worn_frame.shape[:2]
        side = min(side, w - bx, h - by)
        a = cv2.GaussianBlur(mask[by:by + side, bx:bx + side], (0, 0), 2)[..., None]
        res = worn_frame.copy()
        crop = res[by:by + side, bx:bx + side].astype(np.float32)
        res[by:by + side, bx:bx + side] = (crop * (1 - a) + out[:side, :side] * a).astype(np.uint8)
        return res

    def render(self, worn_frame, mask):
        return self.composite(worn_frame, mask, self.render_crop(worn_frame, mask))


class AsyncAI:
    """Runs AISweater on a background thread; the camera never waits for it."""

    def __init__(self, **kw):
        import threading
        self.ai = AISweater(**kw)
        self.job, self.result = None, None
        self.cv = threading.Condition()
        self.last_ms = 0.0
        threading.Thread(target=self._loop, daemon=True).start()

    def submit(self, worn_frame, mask):
        with self.cv:
            self.job = (worn_frame.copy(), mask.copy())  # keep only the newest frame
            self.cv.notify()

    def _loop(self):
        while True:
            with self.cv:
                while self.job is None:
                    self.cv.wait()
                job, self.job = self.job, None
            t = time.time()
            r = self.ai.render_crop(*job)
            self.last_ms = (time.time() - t) * 1000
            if r is not None:
                self.result = r

    def apply(self, worn_frame, mask):
        return AISweater.composite(worn_frame, mask, self.result)


if __name__ == "__main__":
    import sys
    t = time.time()
    ai = AISweater()
    print(f"model loaded in {time.time() - t:.1f}s")
