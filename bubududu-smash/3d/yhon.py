"""Yhon Yhon in 3D, built with build123d the same way ~/Desktop/enclosure is.

Every proportion comes from the `Y` table in js/characters.js, so the model and
the canvas drawing agree: horizontal numbers are fractions of body WIDTH (S),
vertical ones fractions of body HEIGHT (V), measured from the body centre with
canvas y pointing down. Here z points up, y points out of his face.

    ~/Desktop/enclosure/.venv/bin/python bubududu-smash/3d/yhon.py

writes, next to this file:
    yhon.glb        coloured, one node per part — what index.html shows
    yhon_print.stl  one watertight solid, flat underneath, nostrils sunk in —
                    what you would send to a print shop (~H mm tall)
"""
import math, os, tempfile
import trimesh
from build123d import Sphere, Box, Plane, Location, Vector, scale, export_stl, Pos

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = tempfile.mkdtemp(prefix="yhon-")  # per-part STLs are only a hop to trimesh

# ---- js/characters.js, Y -------------------------------------------------
COL = dict(
    body="#f7bcc6", innerEar="#e79cab", snout="#f0a6b4", nostril="#d3838f",
    foot="#f2b0bc", eye="#17111a",
    blush="#f1abb7",  # #eb9aa8 at 0.5 alpha over the body, as the canvas composites it
)
ASPECT = 1.07
H = 56.0                 # body height, mm
W = H * ASPECT           # body width
D = W * 0.9              # depth: the art is front-on only, so this is the one invented number
S = lambda n: W * n
V = lambda n: H * n
A, B, C = W / 2, D / 2, H / 2   # body semi-axes (x, y, z)
Z0 = C + V(0.03)          # body centre height, so the feet (not the belly) touch the floor


def ellipsoid(rx, ry, rz):
    return scale(Sphere(1), by=(rx, ry, rz))


def on_body(x, z, lift=0.0):
    """Point on the front of the body at canvas-offset (x, z), plus its normal."""
    t = 1 - (x / A) ** 2 - (z / C) ** 2
    y = B * math.sqrt(max(t, 0.0))
    n = Vector(x / A**2, y / B**2, z / C**2).normalized()
    p = Vector(x, y, z + Z0) + n * lift
    return p, n


def facing(shape, p, n):
    """Lay a shape built facing +z onto the body so its +z follows the normal."""
    xd = Vector(0, 0, 1).cross(n).normalized()
    return Location(Plane(origin=p, x_dir=xd, z_dir=n)) * shape


def tilt(shape, deg_y, at):
    """Rotate about the y axis (in the picture plane) around a point."""
    return Pos(*at) * (Location((0, 0, 0), (0, 1, 0), deg_y) * shape)


parts = {}  # name -> (solid, colour)

parts["body"] = (Pos(0, 0, Z0) * ellipsoid(A, B, C), "body")

# Ears: behind the head, tipped outward 0.34 rad like the canvas, inner ear on the front face.
for side, tag in ((-1, "L"), (1, "R")):
    ex, ez = side * S(0.34), Z0 + V(0.42)
    ey = B * 0.05
    rx, rz, ry = S(0.1), V(0.095), S(0.05)
    ang = -side * math.degrees(0.34)  # canvas rotates clockwise-positive with y down
    ear = Pos(ex, ey, ez) * ellipsoid(rx, ry, rz)
    inner = Pos(ex, ey + ry * 0.62, ez - V(0.012)) * ellipsoid(S(0.05), ry * 0.5, V(0.0475))
    parts[f"ear{tag}"] = (tilt(Pos(-ex, -ey, -ez) * ear, ang, (ex, ey, ez)), "body")
    parts[f"innerEar{tag}"] = (tilt(Pos(-ex, -ey, -ez) * inner, ang, (ex, ey, ez)), "innerEar")

# Arm nubs, half sunk into the sides.
for side, tag in ((-1, "L"), (1, "R")):
    parts[f"arm{tag}"] = (Pos(side * S(0.49), B * 0.1, Z0 - V(0.11)) * ellipsoid(S(0.06), S(0.065), V(0.0775)), "body")

# Feet: poking out under the front of him, and what he stands on.
for side, tag in ((-1, "L"), (1, "R")):
    parts[f"foot{tag}"] = (Pos(side * S(0.17), B * 0.32, Z0 - V(0.47)) * ellipsoid(S(0.066), S(0.1), V(0.0475)), "foot")

# Face features sit on the surface, oriented to it.
for side, tag in ((-1, "L"), (1, "R")):
    p, n = on_body(side * S(0.175), V(0.075))
    parts[f"eye{tag}"] = (facing(ellipsoid(S(0.035), S(0.035), S(0.018)), p, n), "eye")
    p, n = on_body(side * S(0.29), -V(0.07), lift=-0.35)
    parts[f"blush{tag}"] = (facing(ellipsoid(S(0.069), V(0.044), 0.8), p, n), "blush")

p, n = on_body(0, -V(0.16), lift=-S(0.02))
snout_front = p + n * S(0.075)
parts["snout"] = (facing(ellipsoid(S(0.15), V(0.1075), S(0.075)), p, n), "snout")
nostrils = []
for side, tag in ((-1, "L"), (1, "R")):
    q = snout_front + Vector(side * S(0.057), 0, 0) - n * 0.9
    nos = facing(ellipsoid(S(0.0225), V(0.0375), 1.6), q, n)
    nostrils.append(nos)
    parts[f"nostril{tag}"] = (nos, "nostril")


# ---- coloured GLB ---------------------------------------------------------
def material(h, name):
    # glTF colours are LINEAR. Passing the sRGB hex straight through is what
    # made the first render come out nearly white.
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return trimesh.visual.material.PBRMaterial(
        name=name, baseColorFactor=lin + [1.0], metallicFactor=0.0,
        roughnessFactor=0.15 if name == "eye" else 0.62)


scene = trimesh.Scene()
for name, (shape, col) in parts.items():
    f = os.path.join(OUT, f"{name}.stl")
    # Only the body is big enough for its facets to show as bands under the light.
    fine = name == "body"
    export_stl(shape, f, tolerance=0.004 if fine else 0.015, angular_tolerance=0.05 if fine else 0.12)
    m = trimesh.load(f)
    m.visual = trimesh.visual.TextureVisuals(material=material(COL[col], col))
    # glTF is y-up with the viewer on +z: up goes z -> y, his face goes y -> z.
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    m.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [0, 1, 0]))
    scene.add_geometry(m, node_name=name, geom_name=name)
scene.export(os.path.join(HERE, "yhon.glb"))

# ---- printable single solid ----------------------------------------------
solid = parts["body"][0]
for name, (shape, col) in parts.items():
    if name == "body" or col in ("nostril", "blush"):
        continue
    solid = solid + shape
for nos in nostrils:
    solid = solid - nos
floor = solid.bounding_box().min.Z + 1.2  # shave the feet flat so he stands and prints without supports
solid = solid - Pos(0, 0, floor - 50) * Box(200, 200, 100)
solid = Pos(0, 0, -floor) * solid
export_stl(solid, os.path.join(HERE, "yhon_print.stl"), tolerance=0.02, angular_tolerance=0.1)

bb = solid.bounding_box()
print(f"yhon_print.stl  {bb.size.X:.1f} x {bb.size.Y:.1f} x {bb.size.Z:.1f} mm  "
      f"volume {solid.volume / 1000:.1f} cm3  solids {len(solid.solids())}")
