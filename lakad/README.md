# lakad

Chibi Karla walking around a pastel playground. Her face comes from her 3D scan; the body, hair and world are built in code.

```
python3 play.py        # serves the repo root, opens /lakad/
```

| Key | Does |
|---|---|
| WASD / arrows | walk, relative to the camera |
| Shift | sprint |
| Space | jump; hold for higher, tap for a hop |
| Drag / scroll | orbit / zoom the camera (double-click for mouse-look, Esc releases) |
| K / Skeleton button | show the bone skeleton |

## How she's made

- **Face:** `tools/face_photo.py` renders her face from the scan's splats: real Gaussian footprints, front-to-back compositing, and half of the view-dependent colour. It writes `assets/face.png`, her face feathered into a skin-tone square at a fixed slot, plus `face.json`. The head is a sphere with planar front UVs, so the photo lands in the same slot.
  - The phone saw her about 39° to the side and tilted down. Rendering fully frontal shows the far cheek nobody captured, with hair showing through as blotches, so `--straighten 0.6` turns her only 60% of the way.
  - Two earlier tries were dropped: a marching-cubes head mesh, where the dense hair won the surface and the face vanished, and a depth-relief mask, which smeared from any angle but straight on.
- **Hair:** a single shell all round the head. The face opening (rounded, curved bangs, centre-part notch) is an alpha mask in the same planar mapping. Framing locks sit at the sides, and a shoulder-length fall hangs on its own spring bone.
- **Body:** chibi proportions (head about 42% of a ~1 m height), in her scan colours: black tee, light pants, and skin matched to the face.
- **Skeleton:** 18 `THREE.Bone`s: hips → spine → chest → neck → head (+ hair), plus upper arm → forearm → hand and thigh → shin → foot on each side. Rigid parts ride on the bones, and `THREE.SkeletonHelper` draws them.
- **Animation:** procedural poses (`poseIdle`, `poseWalk`, `poseRun`, `poseAir`), blended by weights that ease between states. The stride phase advances with distance travelled, so feet don't skate. There's squash-and-stretch on take-off and landing, a lean into turns, and the hair spring trails her motion.
- **Movement:** fixed 120 Hz sub-steps, jump buffer + coyote time, variable jump height, a 0.2 m step-up, box platforms you can stand on, and round tree trunks.

`assets/` is gitignored (it's her face). Without it the head wears a drawn chibi face, so the GitHub Pages copy still works.

Rebuild the face:

```
~/Desktop/enclosure/.venv/bin/python tools/face_photo.py ../splat/scans/Karla.ply assets/face.png
```
