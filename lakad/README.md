# lakad

Anime-chibi Karla walking around a pastel playground. Everything is built in code: body, painted face, strand hair, skeleton and world.

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

**Style:** anime chibi, matched to a low-poly hand-painted chibi reference (kept local, not committed). That means flat painted colour with a soft two-tone toon light (`MeshToonMaterial` + a 2-step ramp), ink outlines from an inverted hull pushed out along normals (`style.js`), painted eyes, and hair built from pointed strands.

**Likeness:** from what her scan shows, not a photo:
- dark shoulder-length hair with a centre part and curtain bangs, plus a cowlick (ahoge)
- thin round glasses
- warm brown eyes and her skin tone
- black tee with its white handwritten print, light grey pants, white sneakers

**Face:** painted on a canvas in the head's planar front UVs, with a separate closed-eye texture for blinking every 2.5–5.5 s. The face is unlit, so the eyes stay crisp.

**Earlier tries, dropped:**
- A photo of her face from the scan (`tools/face_photo.py`, still here). It was recognisable but uncanny, and the scan is too soft.
- A marching-cubes head mesh, where the hair won the surface and the face vanished.
- A depth-relief face mask, which smeared off-axis.

**UV seam gotcha:** `frontMappedSphere` maps the back half to the texture's top row with u kept continuous. Mapping the back to a corner or to the edge columns made triangles across the seam sweep through the middle of the texture: a see-through stripe in the hair cap, or a smear of the face.

- **Body:** chibi proportions (head about 42% of a ~1 m height), in her scan colours: black tee, light pants, and skin matched to the face.
- **Skeleton:** 18 `THREE.Bone`s: hips → spine → chest → neck → head (+ hair), plus upper arm → forearm → hand and thigh → shin → foot on each side. Rigid parts ride on the bones, and `THREE.SkeletonHelper` draws them.
- **Animation:** procedural poses (`poseIdle`, `poseWalk`, `poseRun`, `poseAir`), blended by weights that ease between states. The stride phase advances with distance travelled, so feet don't skate. There's squash-and-stretch on take-off and landing, a lean into turns, and the hair spring trails her motion.
- **Movement:** fixed 120 Hz sub-steps, jump buffer + coyote time, variable jump height, a 0.2 m step-up, box platforms you can stand on, and round tree trunks.

`assets/` is gitignored: the photo-face output and the style reference live there. The game needs nothing from it, so the GitHub Pages copy is the full game.
