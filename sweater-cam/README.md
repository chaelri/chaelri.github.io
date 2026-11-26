# sweater-cam

Live virtual try-on: a real black knit sweater photo is warped onto your shoulders (MediaPipe Pose) and fed to Teams as a camera. Face, hair and hands stay on top; your neck shows through the collar.

Under the sweater, MediaPipe multiclass selfie segmentation also darkens your own clothes (and bare arms below the collar line, hands kept via the hand landmarker). The area is repainted dark with the original folds kept, then sent to the OBS Virtual Camera.

## Use

1. `./setup.sh` (once)
2. Open OBS once, click **Start Virtual Camera**, approve the system extension, quit OBS.
3. Give your terminal camera access (System Settings > Privacy & Security > Camera).
4. `./run.sh` (add `--no-sleeves` to leave bare arms)
5. Teams > Settings > Devices > Camera > **OBS Virtual Camera**.

Preview keys: `s` sweater on/off, `a` sleeves on/off, `q` quit.
Flags: `--camera 1` (other camera), `--no-preview`, `--no-vcam`, `--snapshot out.jpg`.

Tuning: `TryOn(widen=1.5, drop=-0.14)` in `sweater_cam.py` (width vs shoulders, vertical offset). `--paint-only` = old recolour mode. `--image photo.jpg --snapshot out.jpg` tests on a still.

Sweater photo: "2008 ROCN acrylic wool sweater" by Solomon203, CC BY-SA 4.0, via Wikimedia Commons (anchor patch removed, cut out, brightened). `assets/sweater.png` is shared under the same licence.

## AI pass (default)

`ai_sweater.py` runs SD-Turbo (img2img, fp16, Mac GPU via MPS) on the sweater area in a background thread: about 0.6-1 s per update, and the camera reuses the latest result between updates. First run downloads the model (~2.5 GB, Hugging Face cache). `--ai-strength 0.4-0.8` = how much it redraws; `--no-ai` = procedural only.
