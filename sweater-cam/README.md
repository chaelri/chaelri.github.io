# sweater-cam

Live camera filter that repaints your clothes as a plain black sweater and feeds it to Teams as a camera.

MediaPipe multiclass selfie segmentation finds clothes (and with `--sleeves`, bare arms below the collar line, hands kept via the hand landmarker). The area is repainted dark with the original folds kept, then sent to the OBS Virtual Camera.

## Use

1. `./setup.sh` (once)
2. Open OBS once, click **Start Virtual Camera**, approve the system extension, quit OBS.
3. Give your terminal camera access (System Settings > Privacy & Security > Camera).
4. `./run.sh --sleeves`
5. Teams > Settings > Devices > Camera > **OBS Virtual Camera**.

Preview keys: `s` sweater on/off, `a` sleeves on/off, `q` quit.
Flags: `--camera 1` (other camera), `--no-preview`, `--no-vcam`, `--snapshot out.jpg`.
