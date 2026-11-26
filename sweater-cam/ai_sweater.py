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
from diffusers import AutoPipelineForImage2Image, AutoencoderTiny
from PIL import Image

MODEL = "stabilityai/sd-turbo"
PROMPT = ("photo of a man wearing a plain black crew neck wool sweater, soft knit fabric, "
          "natural folds, realistic, webcam photo")


class AISweater:
    def __init__(self, size=512, strength=0.5, steps=2, seed=7):
        self.pipe = AutoPipelineForImage2Image.from_pretrained(
            MODEL, torch_dtype=torch.float16, variant="fp16")
        # tiny VAE: 3 s -> 0.2 s per update on an M5; dark knit loses nothing visible
        self.pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesd", torch_dtype=torch.float16)
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
    def composite(worn_frame, mask, result, shift=(0, 0)):
        """Paste an AI crop back through the current sweater mask, moved by `shift` px."""
        if result is None:
            return worn_frame
        (bx, by, side), out = result
        bx, by = int(round(bx + shift[0])), int(round(by + shift[1]))
        h, w = worn_frame.shape[:2]
        x0, y0, x1, y1 = max(bx, 0), max(by, 0), min(bx + side, w), min(by + side, h)
        if x1 <= x0 or y1 <= y0:
            return worn_frame
        piece = out[y0 - by:y1 - by, x0 - bx:x1 - bx].astype(np.float32)
        a = cv2.GaussianBlur(mask, (0, 0), 2)[y0:y1, x0:x1, None]
        res = worn_frame.copy()
        res[y0:y1, x0:x1] = (res[y0:y1, x0:x1] * (1 - a) + piece * a).astype(np.uint8)
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

    def submit(self, worn_frame, mask, anchor):
        with self.cv:
            self.job = (worn_frame.copy(), mask.copy(), np.array(anchor, np.float32))  # newest only
            self.cv.notify()

    def _loop(self):
        while True:
            with self.cv:
                while self.job is None:
                    self.cv.wait()
                job, self.job = self.job, None
            t = time.time()
            r = self.ai.render_crop(job[0], job[1])
            self.last_ms = (time.time() - t) * 1000
            if r is None:
                continue
            prev = self.result
            if prev is not None and prev[0][0][2] == r[0][2]:
                # blend with the previous result so folds settle instead of popping
                old_box, old_img = prev[0]
                dx, dy = int(old_box[0] - r[0][0]), int(old_box[1] - r[0][1])
                M = np.float32([[1, 0, dx], [0, 1, dy]])
                old = cv2.warpAffine(old_img, M, (r[0][2], r[0][2]), borderMode=cv2.BORDER_REPLICATE)
                r = (r[0], (0.6 * r[1] + 0.4 * old).astype(np.uint8))
            self.result = (r, job[2])

    def apply(self, worn_frame, mask, anchor):
        """Use the latest AI sweater, moved along with your body since it was made."""
        if self.result is None:
            return worn_frame
        r, made_at = self.result
        shift = np.clip(np.array(anchor, np.float32) - made_at, -60, 60)
        return AISweater.composite(worn_frame, mask, r, shift)


if __name__ == "__main__":
    import sys
    t = time.time()
    ai = AISweater()
    print(f"model loaded in {time.time() - t:.1f}s")
