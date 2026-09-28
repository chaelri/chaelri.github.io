"""The critters in 3D, built with build123d the same way ~/Desktop/enclosure is.

    ~/Desktop/enclosure/.venv/bin/python bubududu-smash/3d/build.py [id ...]

ids: yhon axolotl capybara hedgehog (default: all). For each one it writes
    <id>.glb        coloured, one node per part — what index.html shows
    <id>_print.stl  one watertight solid with a flat base — for a print shop

Proportions are shared with the 2D drawings so the two cannot drift: Yhon
Yhon's are the `Y` table in js/characters.js (copied below), the others live in
critters.json, which flat.js reads too. Every number is a fraction of body
WIDTH (horizontal) or HEIGHT (vertical) from the body centre, canvas-style with
y pointing down. Here z is up and y points out of the face. Depth is the one
number the front-on art never gives, so each body picks its own.
"""
import json, math, os, sys, tempfile
import trimesh
from build123d import (Sphere, Box, Cone, Cylinder, Compound, Plane, Location, Vector, Axis,
                       Align, Spline, Circle, sweep, scale, export_stl, Pos, Rot)

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix="critters-")  # per-part STLs are only a hop to trimesh
SPEC = json.load(open(os.path.join(HERE, "critters.json")))
H = 56.0  # body height in mm for every critter; the print size follows from it


def ellipsoid(rx, ry, rz):
    return scale(Sphere(1), by=(rx, ry, rz))


def spin(shape, canvas_angle):
    """Canvas rotate(a) — clockwise on screen — is a rotation about +y here."""
    return Location((0, 0, 0), (0, 1, 0), math.degrees(canvas_angle)) * shape


def facing(shape, p, n):
    """Lay a shape built facing +z onto a surface so its +z follows the normal."""
    xd = Vector(0, 0, 1).cross(n).normalized()
    return Location(Plane(origin=p, x_dir=xd, z_dir=n)) * shape


class Rig:
    """Body frame for one critter: canvas fractions in, millimetres out."""

    def __init__(self, aspect, depth):
        self.W, self.H = H * aspect, H
        self.D = self.W * depth
        self.A, self.B, self.C = self.W / 2, self.D / 2, H / 2
        self.Z0 = self.C + H * 0.03  # the feet, not the belly, touch the floor
        self.parts, self.cuts, self.skip, self.print_as = {}, [], set(), {}

    S = lambda self, n: self.W * n
    V = lambda self, n: self.H * n
    z = lambda self, y: self.Z0 - self.H * y

    def add(self, name, shape, col, print_it=True):
        self.parts[name] = (shape, col)
        if not print_it:
            self.skip.add(name)

    def hit(self, shape, x, y):
        """Where a ray from in front of him lands on `shape`, and the normal there."""
        hits = shape.find_intersection_points(Axis((self.S(x), 500, self.z(y)), (0, -1, 0)))
        p, n = max(hits, key=lambda h: h[0].Y)
        return p, n if n.Y > 0 else -n

    def bump(self, on, x, y, rx, ry, depth, lift=0.0):
        """A small feature (eye, nose, blush) sitting on the surface of `on`."""
        p, n = self.hit(on, x, y)
        return facing(ellipsoid(rx, ry, depth), p + n * lift, n)

    def decal(self, on, grow, x, y, rx, rz):
        """A patch of colour that follows the body exactly: the body, grown a
        hair, cut by an elliptic prism through the front half only."""
        shell = Pos(0, 0, self.Z0) * scale(Pos(0, 0, -self.Z0) * on, by=grow)
        prism = Pos(self.S(x), self.B, self.z(y)) * scale(Rot(90, 0, 0) * Cylinder(1, 2 * self.B), by=(rx, 1, rz))
        return shell & prism

    def arc(self, on, x, y, w, sag, r, lift=0.0, n_pts=9):
        """A drawn line (a smile, a closed eye): one round tube swept along the
        surface, capped with balls. It used to be a chain of overlapping beads,
        which OCCT fused wrongly or segfaulted on depending on the order."""
        pts = []
        for i in range(n_pts):
            t = -1 + 2 * i / (n_pts - 1)
            p, n = self.hit(on, x + t * w / 2, y + sag * (1 - t * t))
            pts.append(p + n * lift)
        path = Spline(*pts)
        tube = sweep(Plane(origin=pts[0], z_dir=path.tangent_at(0)) * Circle(r), path=path)
        return tube + Pos(*pts[0]) * Sphere(r) + Pos(*pts[-1]) * Sphere(r)

    def limbs(self, s, arm_y=None):
        for side, tag in ((-1, "L"), (1, "R")):
            ay = self.B * 0.1 if arm_y is None else arm_y
            self.add(f"arm{tag}", Pos(side * self.S(s["armAt"]), ay, self.z(s["armY"]))
                     * ellipsoid(self.S(s["armSize"][0]) / 2, self.S(0.065), self.V(s["armSize"][1]) / 2), "body")
            self.add(f"foot{tag}", Pos(side * self.S(s["footAt"]), self.B * 0.32, self.z(s["footY"]))
                     * ellipsoid(self.S(s["footSize"][0]) / 2, self.S(0.1), self.V(s["footSize"][1]) / 2), "foot")


# ---------------------------------------------------------------- yhon yhon --
def yhon():
    # js/characters.js, Y
    col = dict(body="#f7bcc6", innerEar="#e79cab", snout="#f0a6b4", nostril="#d3838f",
               foot="#f2b0bc", eye="#17111a", blush="#f1abb7")
    r = Rig(1.07, 0.9)
    S, V, z = r.S, r.V, r.z
    body = Pos(0, 0, r.Z0) * ellipsoid(r.A, r.B, r.C)
    r.add("body", body, "body")
    for side, tag in ((-1, "L"), (1, "R")):
        ex, ey, ez = side * S(0.34), r.B * 0.05, z(-0.42)
        ry = S(0.05)
        ear = ellipsoid(S(0.1), ry, V(0.095))
        inner = Pos(0, ry * 0.62, -V(0.012)) * ellipsoid(S(0.05), ry * 0.5, V(0.0475))
        r.add(f"ear{tag}", Pos(ex, ey, ez) * spin(ear, side * 0.34), "body")
        r.add(f"innerEar{tag}", Pos(ex, ey, ez) * spin(inner, side * 0.34), "innerEar")
        r.add(f"eye{tag}", r.bump(body, side * 0.175, -0.075, S(0.035), S(0.035), S(0.018)), "eye")
        r.add(f"blush{tag}", r.decal(body, 1.006, side * 0.29, 0.07, S(0.069), V(0.044)), "blush", print_it=False)
    r.limbs(dict(armAt=0.49, armY=0.11, armSize=[0.12, 0.155], footAt=0.17, footY=0.47, footSize=[0.132, 0.095]))
    snout = r.bump(body, 0, 0.16, S(0.15), V(0.1075), S(0.075), lift=-S(0.02))
    r.add("snout", snout, "snout")
    for side, tag in ((-1, "L"), (1, "R")):
        nos = r.bump(snout, side * 0.057, 0.16, S(0.0225), V(0.0375), 1.6, lift=-0.9)
        r.add(f"nostril{tag}", nos, "nostril", print_it=False)
        r.cuts.append(nos)
    return r, col


# ----------------------------------------------------------------- axolotl --
def axolotl():
    s = SPEC["axolotl"]
    r = Rig(s["aspect"], 0.86)
    S, V, z = r.S, r.V, r.z
    body = Pos(0, 0, r.Z0) * ellipsoid(r.A, r.B, r.C)
    r.add("body", body, "body")
    r.add("belly", r.decal(body, 1.006, 0, s["belly"]["y"], S(s["belly"]["size"][0]) / 2, V(s["belly"]["size"][1]) / 2),
          "belly", print_it=False)
    # Gills: three fronds a side, rooted on the upper flanks and fanned out.
    for side, tag in ((-1, "L"), (1, "R")):
        for i, g in enumerate(s["gills"]):
            a = g["angle"] if side > 0 else math.pi - g["angle"]
            L, T = S(g["len"]), S(g["thick"])
            frond = Pos(L / 2, 0, 0) * ellipsoid(L / 2, T * 0.32, T / 2)
            tip = Pos(L * 0.86, T * 0.12, 0) * ellipsoid(L * 0.2, T * 0.3, T * 0.42)
            at = Pos(side * S(g["x"]), r.B * 0.05, z(g["y"]))
            r.add(f"gill{tag}{i}", at * spin(frond, a), "gill")
            r.add(f"gillTip{tag}{i}", at * spin(tip, a), "gillTip")
    for side, tag in ((-1, "L"), (1, "R")):
        r.add(f"eye{tag}", r.bump(body, side * s["eyeAt"], s["eyeY"], S(s["eyeR"]), S(s["eyeR"]), S(0.018)), "eye")
        r.add(f"blush{tag}", r.decal(body, 1.006, side * s["blushAt"], s["blushY"],
                                     S(s["blushSize"][0]) / 2, V(s["blushSize"][1]) / 2), "blush", print_it=False)
    m = s["smile"]
    r.add("mouth", r.arc(body, 0, m["y"], m["w"], m["sag"], S(m["thick"]) / 2), "mouth")
    r.limbs(s)
    t = s["tail"]
    r.add("tail", Pos(0, -r.B * 0.9 - S(t["len"]) * 0.3, z(0.22)) * ellipsoid(S(0.035), S(t["len"]) / 2, V(t["h"]) / 2), "tail")
    return r, s["col"]


# ---------------------------------------------------------------- capybara --
def capybara():
    s = SPEC["capybara"]
    r = Rig(s["aspect"], 0.88)
    S, V, z = r.S, r.V, r.z
    # A wide, flat-ish ellipsoid. A filleted box read more like a loaf, but its
    # flat-to-round seams made OCCT drop every part fused across them.
    body = Pos(0, 0, r.Z0) * ellipsoid(r.A, r.B, r.C)
    r.add("body", body, "body")
    mz = s["muzzle"]
    muzzle = r.bump(body, 0, mz["y"], S(mz["size"][0]) / 2, V(mz["size"][1]) / 2, S(0.1), lift=-S(0.04))
    r.add("muzzle", muzzle, "muzzle")
    for side, tag in ((-1, "L"), (1, "R")):
        nos = r.bump(muzzle, side * s["nostrilAt"], s["nostrilY"], S(s["nostrilSize"][0]) / 2,
                     V(s["nostrilSize"][1]) / 2, 1.4, lift=-0.5)
        r.add(f"nostril{tag}", nos, "nose", print_it=False)
        r.cuts.append(nos)
        # Sleepy eyes: a short line, not a dot.
        r.add(f"eye{tag}", r.arc(body, side * s["eyeAt"], s["eyeY"], s["eyeW"], 0.018, S(s["eyeThick"]) / 2), "eye")
        r.add(f"blush{tag}", r.decal(body, 1.006, side * s["blushAt"], s["blushY"],
                                     S(s["blushSize"][0]) / 2, V(s["blushSize"][1]) / 2), "blush", print_it=False)
        ex, ez = side * S(s["earAt"]), z(s["earTop"])
        r.add(f"ear{tag}", Pos(ex, r.B * 0.2, ez) * ellipsoid(S(s["earSize"][0]) / 2, S(0.05), V(s["earSize"][1]) / 2), "ear")
        r.add(f"innerEar{tag}", Pos(ex, r.B * 0.2 + S(0.03), ez - V(0.01))
              * ellipsoid(S(s["innerEarSize"][0]) / 2, S(0.025), V(s["innerEarSize"][1]) / 2), "innerEar")
    r.limbs(s)
    # The orange on his head. It is the whole capybara joke.
    o = s["orange"]
    orad = S(o["r"])
    oc = Vector(S(o["x"]), 0, r.Z0 + r.C + orad * 0.78)
    r.add("orange", Pos(*oc) * Sphere(orad), "orange")
    # Sunk well into the orange: a leaf that only grazed the peel segfaulted OCCT's fuse.
    leaf = Pos(oc.X + orad * 0.32, 0, oc.Z + orad * 0.86) * spin(ellipsoid(orad * 0.55, orad * 0.14, orad * 0.26), -0.5)
    r.add("leaf", leaf, "leaf", print_it=False)
    # For the print the leaf goes onto the orange first: added last to the
    # whole finished capybara, the same fuse segfaulted OCCT.
    orange = r.parts["orange"][0]
    r.parts["orange"] = (orange, "orange")
    r.print_as["orange"] = orange + leaf
    return r, s["col"]


# ---------------------------------------------------------------- hedgehog --
def hedgehog():
    s = SPEC["hedgehog"]
    r = Rig(s["aspect"], 0.92)
    S, V, z = r.S, r.V, r.z
    body = Pos(0, 0, r.Z0) * ellipsoid(r.A, r.B, r.C)
    r.add("body", body, "spikes")
    f = s["face"]
    frx, frz, fz = S(f["size"][0]) / 2, V(f["size"][1]) / 2, z(f["y"])
    face = r.decal(body, 1.04, 0, f["y"], frx, frz)
    r.add("face", face, "face")

    # Spikes: spread evenly over the body (a Fibonacci sphere), everywhere
    # except the face and the underside, each swept back a little.
    sp = s["spikes"]
    L, base = S(sp["len"]) * 0.75, S(0.06)
    cones, gold = [], math.pi * (3 - math.sqrt(5))
    n_pts = 230
    for i in range(n_pts):
        u = 1 - 2 * (i + 0.5) / n_pts
        rr = math.sqrt(1 - u * u)
        d = Vector(math.cos(gold * i) * rr, math.sin(gold * i) * rr, u)
        p = Vector(d.X * r.A, d.Y * r.B, r.Z0 + d.Z * r.C)
        polar = math.acos(u)  # 0 = straight up
        if polar > sp["to"] * 0.95:
            continue
        if d.Y > -0.05 and (p.X / (frx * 1.12)) ** 2 + ((p.Z - fz) / (frz * 1.12)) ** 2 < 1:
            continue
        n = Vector(p.X / r.A**2, p.Y / r.B**2, (p.Z - r.Z0) / r.C**2).normalized()
        dirn = (n + Vector(0, -0.45, 0.15)).normalized()
        cones.append(facing(Cone(base, 0.4, L, align=(Align.CENTER, Align.CENTER, Align.MIN)), p - n * 1.5, dirn))
    r.add("spikes", Compound(cones), "spikes")

    for side, tag in ((-1, "L"), (1, "R")):
        p, n = r.hit(body, side * s["earAt"], s["earY"])  # the face ends just below the ears
        ear = ellipsoid(S(s["earSize"][0]) / 2, V(s["earSize"][1]) / 2, S(0.035))
        inner = Pos(0, 0, S(0.025)) * ellipsoid(S(s["innerEarSize"][0]) / 2, V(s["innerEarSize"][1]) / 2, S(0.018))
        r.add(f"ear{tag}", facing(ear, p, n), "ear")
        r.add(f"innerEar{tag}", facing(inner, p, n), "innerEar")
        r.add(f"eye{tag}", r.bump(face, side * s["eyeAt"], s["eyeY"], S(s["eyeR"]), S(s["eyeR"]), S(0.018)), "eye")
        r.add(f"blush{tag}", r.bump(face, side * s["blushAt"], s["blushY"], S(s["blushSize"][0]) / 2,
                                    V(s["blushSize"][1]) / 2, 0.7, lift=-0.3), "blush", print_it=False)
    sn = s["snout"]
    snout = r.bump(face, 0, sn["y"], S(sn["size"][0]) / 2, V(sn["size"][1]) / 2, S(0.13), lift=-S(0.03))
    r.add("snout", snout, "snout")
    r.add("nose", r.bump(snout, 0, s["noseY"], S(s["noseSize"][0]) / 2, V(s["noseSize"][1]) / 2, S(0.03), lift=-S(0.01)), "nose")
    r.limbs(s, arm_y=r.B * 0.55)
    for tag in "LR":
        shp, _ = r.parts[f"arm{tag}"]
        r.parts[f"arm{tag}"] = (shp, "face")
    return r, s["col"]


# ------------------------------------------------------------------ output --
def material(h, name):
    # glTF colours are LINEAR. The sRGB hex straight through rendered Yhon
    # Yhon nearly white.
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return trimesh.visual.material.PBRMaterial(
        name=name, baseColorFactor=lin + [1.0], metallicFactor=0.0,
        roughnessFactor=0.15 if name in ("eye", "nose") else 0.62)


def add(solid, piece):
    """Fuse, and check it. A capybara eye bead that lands exactly on the seam
    where his flat face meets the rounded edge makes OCCT return an EMPTY
    shape — and every later fuse happily builds on nothing. Nudge it a hair
    and try again; the beads overlap so much one moved bead does not show."""
    for d in (0.0, 0.04, -0.04, 0.09, 0.25, -0.25):
        try:
            out = solid + Pos(d, 0, d) * piece
        except ValueError:  # the same failure, reported as a null shape
            continue
        if out.volume >= solid.volume - 1e-3 and len(out.solids()) <= len(solid.solids()) + 1:
            return out
    print("  skipped a piece that would not fuse at", piece.center())
    return solid


def export(cid, r, col):
    scene = trimesh.Scene()
    for name, (shape, c) in r.parts.items():
        f = os.path.join(TMP, f"{cid}-{name}.stl")
        # Only the big curved pieces are big enough for their facets to band.
        fine = name in ("body", "face", "belly", "muzzle", "snout")
        export_stl(shape, f, tolerance=0.004 if fine else 0.02, angular_tolerance=0.05 if fine else 0.2)
        m = trimesh.load(f)
        m.visual = trimesh.visual.TextureVisuals(material=material(col[c], c))
        # glTF is y-up with the viewer on +z: up goes z -> y, the face goes y -> z.
        m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
        m.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [0, 1, 0]))
        scene.add_geometry(m, node_name=name, geom_name=name)
    scene.export(os.path.join(HERE, f"{cid}.glb"))

    # Fuse one solid at a time. Handing OCCT the bead-chain smile as a single
    # Compound silently threw the BODY away (and a multi-fuse of everything
    # returned a null shape), so the smile goes in bead by bead.
    solid = r.parts["body"][0]
    for name, (shape, c) in r.parts.items():
        if name != "body" and name not in r.skip:
            for sol in r.print_as.get(name, shape).solids():
                solid = add(solid, sol)
    for cut in r.cuts:
        solid = solid - cut
    floor = solid.bounding_box().min.Z + 1.2  # shave the feet flat: he stands, and prints without supports
    solid = solid - Pos(0, 0, floor - 50) * Box(300, 300, 100)
    solid = Pos(0, 0, -floor) * solid
    export_stl(solid, os.path.join(HERE, f"{cid}_print.stl"), tolerance=0.02, angular_tolerance=0.1)
    bb = solid.bounding_box()
    print(f"{cid:9} {bb.size.X:5.1f} x {bb.size.Y:5.1f} x {bb.size.Z:5.1f} mm  {solid.volume / 1000:5.1f} cm3  "
          f"solids {len(solid.solids())}  glb {os.path.getsize(os.path.join(HERE, cid + '.glb')) / 1e6:.2f} MB")


BUILDERS = dict(yhon=yhon, axolotl=axolotl, capybara=capybara, hedgehog=hedgehog)

if __name__ == "__main__":
    for cid in sys.argv[1:] or BUILDERS:
        export(cid, *BUILDERS[cid]())
