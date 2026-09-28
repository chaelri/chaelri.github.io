"""The critters in 3D, built with build123d the same way ~/Desktop/enclosure is.

    ~/Desktop/enclosure/.venv/bin/python -B bubududu-smash/3d/build.py [id ...]

ids: yhon axolotl capybara hedgehog (default: all). For each one it writes
    <id>.glb        coloured, one node per part — what index.html shows
    <id>_print.stl  one watertight solid with a flat base — for a print shop

Every proportion lives in critters.json, which flat.js reads for the 2D
drawings too, so the flat and round versions cannot drift. Numbers there are
fractions of body WIDTH (horizontal) or HEIGHT (vertical) from the body
centre, canvas-style with y pointing down. Here z is up and y points out of
the face. Depth is the one number front-on art never gives, so each critter
picks its own.
"""
import json, math, os, sys, tempfile
import trimesh
from build123d import (Sphere, Box, Cone, Cylinder, Torus, Compound, Plane, Location, Vector, Axis, Edge,
                       Align, Spline, Circle, sweep, scale, export_stl, Pos, Rot)

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix="critters-")  # per-part STLs are only a hop to trimesh
SPEC = json.load(open(os.path.join(HERE, "critters.json")))
H = 56.0  # body height in mm for every critter; the print size follows from it
WHITE = "#ffffff"


def ellipsoid(rx, ry, rz):
    return scale(Sphere(1), by=(rx, ry, rz))


def spin(shape, canvas_angle):
    """Canvas rotate(a) — clockwise on screen — is a rotation about +y here."""
    return Location((0, 0, 0), (0, 1, 0), math.degrees(canvas_angle)) * shape


def facing(shape, p, n):
    """Lay a shape built facing +z onto a surface so its +z follows the normal."""
    xd = Vector(0, 0, 1).cross(n).normalized()
    return Location(Plane(origin=p, x_dir=xd, z_dir=n)) * shape


def tube(pts, r):
    """A round tube through 3D points, capped with balls."""
    path = Spline(*pts)
    t = sweep(Plane(origin=pts[0], z_dir=path.tangent_at(0)) * Circle(r), path=path)
    return t + Pos(*pts[0]) * Sphere(r) + Pos(*pts[-1]) * Sphere(r)


class Rig:
    """Body frame for one critter: canvas fractions in, millimetres out."""

    def __init__(self, s):
        self.s, self.col = s, dict(s["col"], glint=WHITE)
        self.W, self.H = H * s["aspect"], H
        self.D = self.W * s["depth"]
        self.A, self.B, self.C = self.W / 2, self.D / 2, H / 2
        self.Z0 = self.C + H * 0.03  # the feet, not the belly, touch the floor
        self.parts, self.cuts, self.skip, self.print_as = {}, [], set(), {}
        self.body = Pos(0, 0, self.Z0) * ellipsoid(self.A, self.B, self.C)

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
        """A small feature (eye, nose) sitting on the surface of `on`."""
        p, n = self.hit(on, x, y)
        return facing(ellipsoid(rx, ry, depth), p + n * lift, n)

    def shell(self, on, grow):
        return Pos(0, 0, self.Z0) * scale(Pos(0, 0, -self.Z0) * on, by=grow)

    def prism(self, x, y, rx, rz):
        """An elliptic prism through the front half, for cutting decals."""
        return Pos(self.S(x), self.B, self.z(y)) * scale(Rot(90, 0, 0) * Cylinder(1, 2 * self.B), by=(rx, 1, rz))

    def decal(self, on, grow, x, y, rx, rz):
        """A patch of colour that follows the body exactly: the body, grown a
        hair, cut by an elliptic prism through the front half only."""
        return self.shell(on, grow) & self.prism(x, y, rx, rz)

    def line(self, on, x1, y1, x2, y2, sag, r, lift=0.0, n_pts=9):
        """A drawn line (brow, smile, closed eye) as a tube laid on the surface.
        It used to be a chain of overlapping beads, which OCCT fused wrongly or
        segfaulted on depending on the order."""
        pts = []
        for i in range(n_pts):
            t = i / (n_pts - 1)
            p, n = self.hit(on, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + sag * 4 * t * (1 - t))
            pts.append(p + n * lift)
        return tube(pts, r)

    def eyes(self, on, s):
        """Round glossy eyes with a white catchlight, which is most of what
        makes them read as alive rather than as two dots."""
        S = self.S
        for side, tag in ((-1, "L"), (1, "R")):
            p, n = self.hit(on, side * s["eyeAt"], s["eyeY"])
            R = S(s["eyeR"])
            self.add(f"eye{tag}", facing(ellipsoid(R, R, R * 0.5), p, n), "eye")
            gp, gn = self.hit(on, side * s["eyeAt"] + s["eyeR"] * 0.35, s["eyeY"] - s["eyeR"] * 0.4)
            self.add(f"glint{tag}", facing(ellipsoid(R * 0.32, R * 0.32, R * 0.2), gp + gn * R * 0.42, gn), "glint", print_it=False)

    def brows(self, on, b):
        for side, tag in ((-1, "L"), (1, "R")):
            inner, outer = side * (b["at"] - b["w"] / 2), side * (b["at"] + b["w"] / 2)
            drop = b["tilt"] * b["w"] / 2
            self.add(f"brow{tag}", self.line(on, inner, b["y"] + drop, outer, b["y"] - drop, -0.012,
                                             self.S(b["thick"]) / 2, lift=0.3), "brow")

    def blush(self, on, s, grow=1.006):
        for side, tag in ((-1, "L"), (1, "R")):
            self.add(f"blush{tag}", self.decal(on, grow, side * s["blushAt"], s["blushY"],
                                               self.S(s["blushSize"][0]) / 2, self.V(s["blushSize"][1]) / 2),
                     "blush", print_it=False)

    def open_mouth(self, on, m, grow=1.006):
        """A D-shaped open mouth with a tongue, as a decal. The flat top is the
        prism cut off at the mouth line."""
        rx, rz = self.S(m["w"]) / 2, self.V(m["h"])
        region = self.prism(m["x"], m["y"], rx, rz) & (Pos(0, 0, self.z(m["y"]) - 100) * Box(400, 400, 200))
        self.add("mouth", self.shell(on, grow) & region, "mouth", print_it=False)
        tongue = self.shell(on, grow + 0.003) & region & self.prism(m["x"], m["y"] + m["h"] * 0.85, rx * 0.55, rz * 0.5)
        self.add("tongue", tongue, "tongue", print_it=False)
        self.cuts.append(self.shell(on, 1.2) & region - self.shell(on, 0.975))  # a shallow recess in the print

    def band(self, y, r, col, name="band", knot=True):
        """A band right round the body at canvas height y (a headband, a strap)."""
        f = math.sqrt(max(0.0, 1 - (2 * y) ** 2))
        a, b = self.A * f + r * 0.35, self.B * f + r * 0.35
        path = Edge.make_ellipse(a, b, Plane.XY.offset(self.z(y)))
        ring = sweep(Plane(origin=path @ 0, z_dir=path % 0) * Circle(r), path=path)
        self.add(name, ring, col)
        if knot:
            k = Vector(0, -b - r * 0.4, self.z(y))
            self.add(f"{name}Knot", Pos(*k) * ellipsoid(r * 1.4, r * 1.1, r * 1.3), col)
            for side, tag in ((-1, "L"), (1, "R")):
                tail = Pos(side * r * 1.6, -r * 0.6, -r * 2.2) * spin(ellipsoid(r * 0.9, r * 0.45, r * 2.6), side * -0.5)
                self.add(f"{name}Tail{tag}", Pos(*k) * tail, col)
        return a, b

    def limbs(self, s, arm_y=None, arm_col="body"):
        for side, tag in ((-1, "L"), (1, "R")):
            ay = self.B * 0.1 if arm_y is None else arm_y
            self.add(f"arm{tag}", Pos(side * self.S(s["armAt"]), ay, self.z(s["armY"]))
                     * ellipsoid(self.S(s["armSize"][0]) / 2, self.S(0.065), self.V(s["armSize"][1]) / 2), arm_col)
            self.add(f"foot{tag}", Pos(side * self.S(s["footAt"]), self.B * 0.32, self.z(s["footY"]))
                     * ellipsoid(self.S(s["footSize"][0]) / 2, self.S(0.1), self.V(s["footSize"][1]) / 2), "foot")


# ---------------------------------------------------------------- yhon yhon --
def yhon():
    s = SPEC["yhon"]
    r = Rig(s)
    S, V, z, body = r.S, r.V, r.z, r.body
    r.add("body", body, "body")
    for side, tag in ((-1, "L"), (1, "R")):
        ex, ey, ez = side * S(s["earAt"]), r.B * 0.05, z(s["earTop"])
        ry = S(0.05)
        ear = ellipsoid(S(s["earSize"][0]) / 2, ry, V(s["earSize"][1]) / 2)
        inner = Pos(0, ry * 0.62, -V(0.012)) * ellipsoid(S(s["innerEarSize"][0]) / 2, ry * 0.5, V(s["innerEarSize"][1]) / 2)
        r.add(f"ear{tag}", Pos(ex, ey, ez) * spin(ear, side * s["earTilt"]), "body")
        r.add(f"innerEar{tag}", Pos(ex, ey, ez) * spin(inner, side * s["earTilt"]), "innerEar")
    r.eyes(body, s)
    r.brows(body, s["brow"])
    r.blush(body, s)
    r.open_mouth(body, s["mouth"])
    r.limbs(s)
    snout = r.bump(body, 0, s["snoutY"], S(s["snoutSize"][0]) / 2, V(s["snoutSize"][1]) / 2, S(0.075), lift=-S(0.02))
    r.add("snout", snout, "snout")
    for side, tag in ((-1, "L"), (1, "R")):
        nos = r.bump(snout, side * s["nostrilAt"], s["snoutY"], S(s["nostrilSize"][0]) / 2, V(s["nostrilSize"][1]) / 2, 1.6, lift=-0.9)
        r.add(f"nostril{tag}", nos, "nostril", print_it=False)
        r.cuts.append(nos)
    return r


# ----------------------------------------------------------------- axolotl --
def axolotl():
    s = SPEC["axolotl"]
    r = Rig(s)
    S, V, z, body = r.S, r.V, r.z, r.body
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
    r.eyes(body, s)
    r.blush(body, s)
    r.open_mouth(body, s["mouth"], grow=1.009)
    # Swim goggles pushed up on his forehead: a strap right round, two rims, two lenses.
    g = s["goggles"]
    r.band(g["y"], V(g["strap"]) / 2, "strap", name="strap", knot=False)
    for side, tag in ((-1, "L"), (1, "R")):
        p, n = r.hit(body, side * g["at"], g["y"])
        R, rim = S(g["r"]), S(g["rim"]) / 2
        r.add(f"goggle{tag}", facing(Pos(0, 0, rim * 1.4) * Torus(R, rim), p, n), "frame")
        r.add(f"lens{tag}", facing(Pos(0, 0, rim * 1.2) * ellipsoid(R, R, rim * 1.1), p, n), "lens")
    r.limbs(s)
    t = s["tail"]
    r.add("tail", Pos(0, -r.B * 0.9 - S(t["len"]) * 0.3, z(0.22)) * ellipsoid(S(0.035), S(t["len"]) / 2, V(t["h"]) / 2), "tail")
    return r


# ---------------------------------------------------------------- capybara --
def capybara():
    s = SPEC["capybara"]
    r = Rig(s)
    S, V, z, body = r.S, r.V, r.z, r.body
    r.add("body", body, "body")
    mz = s["muzzle"]
    muzzle = r.bump(body, 0, mz["y"], S(mz["size"][0]) / 2, V(mz["size"][1]) / 2, S(0.1), lift=-S(0.04))
    r.add("muzzle", muzzle, "muzzle")
    for side, tag in ((-1, "L"), (1, "R")):
        nos = r.bump(muzzle, side * s["nostrilAt"], s["nostrilY"], S(s["nostrilSize"][0]) / 2,
                     V(s["nostrilSize"][1]) / 2, 1.4, lift=-0.5)
        r.add(f"nostril{tag}", nos, "nose", print_it=False)
        r.cuts.append(nos)
        # Sleepy eyes: a short drooping line, not a dot.
        x = side * s["eyeAt"]
        r.add(f"eye{tag}", r.line(body, x - s["eyeW"] / 2, s["eyeY"], x + s["eyeW"] / 2, s["eyeY"], 0.018,
                                  S(s["eyeThick"]) / 2), "eye")
        ex, ez = side * S(s["earAt"]), z(s["earTop"])
        r.add(f"ear{tag}", Pos(ex, r.B * 0.2, ez) * ellipsoid(S(s["earSize"][0]) / 2, S(0.05), V(s["earSize"][1]) / 2), "ear")
        r.add(f"innerEar{tag}", Pos(ex, r.B * 0.2 + S(0.03), ez - V(0.01))
              * ellipsoid(S(s["innerEarSize"][0]) / 2, S(0.025), V(s["innerEarSize"][1]) / 2), "innerEar")
    m = s["smile"]
    r.add("mouth", r.line(muzzle, -m["w"] / 2, m["y"], m["w"] / 2, m["y"], m["sag"], S(m["thick"]) / 2), "mouth")
    r.blush(body, s)
    r.limbs(s)
    # The swim ring he is sitting in, red and white. The stripes are separate
    # sweeps for the colour; the print gets one whole ring, because stripes
    # that share end faces are exactly what OCCT's fuse chokes on.
    rg = s["ring"]
    rr = V(rg["r"])
    f = math.sqrt(1 - (2 * rg["y"]) ** 2)
    a, b = r.A * f + rr * 0.55, r.B * f + rr * 0.55
    plane = Plane.XY.offset(z(rg["y"]))
    n = rg["stripes"]
    for i in range(n):
        seg = Edge.make_ellipse(a, b, plane, 360 * i / n, 360 * (i + 1) / n)
        piece = sweep(Plane(origin=seg @ 0, z_dir=seg % 0) * Circle(rr), path=seg)
        r.add(f"ring{i}", piece, "ringA" if i % 2 else "ringB", print_it=False)
    whole = Edge.make_ellipse(a, b, plane)
    r.print_as["ringWhole"] = sweep(Plane(origin=whole @ 0, z_dir=whole % 0) * Circle(rr), path=whole)
    # The orange on his head. It is the whole capybara joke.
    o = s["orange"]
    orad = S(o["r"])
    oc = Vector(S(o["x"]), 0, r.Z0 + r.C + orad * 0.78)
    orange = Pos(*oc) * Sphere(orad)
    leaf = Pos(oc.X + orad * 0.32, 0, oc.Z + orad * 0.86) * spin(ellipsoid(orad * 0.55, orad * 0.14, orad * 0.26), -0.5)
    r.add("orange", orange, "orange")
    r.add("leaf", leaf, "leaf", print_it=False)
    # For the print the leaf goes onto the orange first: added last to the
    # whole finished capybara, the same fuse segfaulted OCCT.
    r.print_as["orange"] = orange + leaf
    return r


# ---------------------------------------------------------------- hedgehog --
def hedgehog():
    s = SPEC["hedgehog"]
    r = Rig(s)
    S, V, z, body = r.S, r.V, r.z, r.body
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
        if math.acos(u) > sp["to"] * 0.95:
            continue
        if d.Y > -0.05 and (p.X / (frx * 1.12)) ** 2 + ((p.Z - fz) / (frz * 1.12)) ** 2 < 1:
            continue
        n = Vector(p.X / r.A**2, p.Y / r.B**2, (p.Z - r.Z0) / r.C**2).normalized()
        dirn = (n + Vector(0, -0.45, 0.15)).normalized()
        cones.append(facing(Cone(base, 0.4, L, align=(Align.CENTER, Align.CENTER, Align.MIN)), p - n * 1.5, dirn))
    r.add("spikes", Compound(cones), "spikes")

    # The red bandana, tied at the back. It is what makes him a tough guy.
    bd = s["band"]
    r.band(bd["y"], V(bd["thick"]) / 2, "band")

    for side, tag in ((-1, "L"), (1, "R")):
        p, n = r.hit(body, side * s["earAt"], s["earY"])
        ear = ellipsoid(S(s["earSize"][0]) / 2, V(s["earSize"][1]) / 2, S(0.035))
        inner = Pos(0, 0, S(0.025)) * ellipsoid(S(s["innerEarSize"][0]) / 2, V(s["innerEarSize"][1]) / 2, S(0.018))
        r.add(f"ear{tag}", facing(ear, p, n), "ear")
        r.add(f"innerEar{tag}", facing(inner, p, n), "innerEar")
        r.add(f"blush{tag}", r.bump(face, side * s["blushAt"], s["blushY"], S(s["blushSize"][0]) / 2,
                                    V(s["blushSize"][1]) / 2, 0.7, lift=-0.3), "blush", print_it=False)
    r.eyes(face, s)
    r.brows(face, s["brow"])
    sn = s["snout"]
    snout = r.bump(face, 0, sn["y"], S(sn["size"][0]) / 2, V(sn["size"][1]) / 2, S(0.13), lift=-S(0.03))
    r.add("snout", snout, "snout")
    r.add("nose", r.bump(snout, 0, s["noseY"], S(s["noseSize"][0]) / 2, V(s["noseSize"][1]) / 2, S(0.03), lift=-S(0.01)), "nose")
    # Gritted teeth: a white bar with the line between the rows.
    g = s["grit"]
    r.add("teeth", r.bump(face, 0, g["y"], S(g["w"]) / 2, V(g["h"]) / 2, 1.2, lift=-0.4), "teeth")
    r.add("mouth", r.line(face, -g["w"] * 0.42, g["y"], g["w"] * 0.42, g["y"], 0, 0.45, lift=0.55), "mouth", print_it=False)
    r.limbs(s, arm_y=r.B * 0.55, arm_col="face")
    return r


# ------------------------------------------------------------------ output --
def material(h, name):
    # glTF colours are LINEAR. The sRGB hex straight through rendered Yhon
    # Yhon nearly white.
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return trimesh.visual.material.PBRMaterial(
        name=name, baseColorFactor=lin + [1.0], metallicFactor=0.0,
        roughnessFactor=0.12 if name in ("eye", "nose", "lens", "glint") else 0.5)


def mesh(shape, tag, tol=0.02):
    """Tessellate a shape and weld its seam: OCCT leaves the pole and seam
    vertices of every sphere a hair apart, so without the weld not one part
    counts as a closed volume."""
    f = os.path.join(TMP, f"print-{tag}.stl")
    export_stl(shape, f, tolerance=tol, angular_tolerance=0.1)
    m = trimesh.load(f, process=False)
    m.merge_vertices(digits_vertex=3)
    m.update_faces(m.nondegenerate_faces())
    m.remove_unreferenced_vertices()
    return m


def union(meshes):
    return trimesh.boolean.union(meshes, engine="manifold")


def export(cid, r):
    col = r.col
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

    # The printable solid is unioned as welded MESHES with manifold3d. OCCT's
    # B-rep fuse was the first try and kept failing in ways that depended on
    # the order parts went in: a Compound or a bead chain silently threw the
    # body away, a tangent seam returned nothing, a leaf grazing an orange
    # segfaulted. Manifold has done every critter first time.
    parts = [(n, sh) for n, (sh, c) in r.parts.items() if n not in r.skip]
    parts += [(n, sh) for n, sh in r.print_as.items() if n not in r.parts]  # print-only stand-ins
    pieces = []
    for name, shape in parts:
        for i, sol in enumerate(r.print_as.get(name, shape).solids()):
            m = mesh(sol, f"{cid}-{name}-{i}")
            if m.is_volume:
                pieces.append(m)
            else:
                print(f"  {name}[{i}] would not close, left out of the print")
    solid = union(pieces)
    if r.cuts:
        solid = trimesh.boolean.difference([solid, union([mesh(c, f"{cid}-cut{i}") for i, c in enumerate(r.cuts)])],
                                           engine="manifold")
    floor = solid.bounds[0][2] + 1.2  # shave the feet flat: he stands, and prints without supports
    below = trimesh.creation.box(extents=[400, 400, 200])
    below.apply_translation([0, 0, floor - 100])
    solid = trimesh.boolean.difference([solid, below], engine="manifold")
    solid.apply_translation([0, 0, -floor])
    solid.export(os.path.join(HERE, f"{cid}_print.stl"))
    size = solid.bounds[1] - solid.bounds[0]
    bodies = len(solid.split(only_watertight=False, engine="scipy"))
    print(f"{cid:9} {size[0]:5.1f} x {size[1]:5.1f} x {size[2]:5.1f} mm  {solid.volume / 1000:5.1f} cm3  "
          f"volume {solid.is_volume}  bodies {bodies}  glb {os.path.getsize(os.path.join(HERE, cid + '.glb')) / 1e6:.2f} MB")


BUILDERS = dict(yhon=yhon, axolotl=axolotl, capybara=capybara, hedgehog=hedgehog)

if __name__ == "__main__":
    for cid in sys.argv[1:] or BUILDERS:
        export(cid, BUILDERS[cid]())
