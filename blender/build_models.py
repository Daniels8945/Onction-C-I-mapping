# Builds the miniature 3D models for the Connect view and exports them as
# GLB into public/models/. Run headless from the repo root:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#       -P blender/build_models.py
#
# The models are deliberately simple — recognisable at ~40–90 px on screen,
# a few hundred to a couple of thousand triangles each — and are authored in
# normalised units (Z up, origin at the base centre): the tower is 1.0 tall,
# the substation yard ~1.0 wide. The app scales them to a fixed on-screen
# size, so real-world metres don't matter.
#
#   tower_330kv.glb   double-circuit lattice tower: tapered legs, bracing,
#                     three cross-arms a side with insulator strings, earth peak
#   substation.glb    yard: gravel pad, fence, two power transformers,
#                     busbar gantries, switchgear posts, control building
#   customer_site.glb a works: sawtooth-roof shed, office block, chimney

import os
import bpy
import bmesh
from mathutils import Vector, Matrix

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgb, metallic=0.0, roughness=0.7, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1.0)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1.0)
        p.inputs["Emission Strength"].default_value = 1.0
    return m


def srgb(hex_):
    """'#rrggbb' → linear RGB (glTF base colours are linear)."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


class Builder:
    """Accumulates boxes/cylinders per material into one bmesh per material."""

    def __init__(self):
        self.parts = {}

    def _bm(self, mat):
        if mat.name not in self.parts:
            self.parts[mat.name] = (bmesh.new(), mat)
        return self.parts[mat.name][0]

    def box(self, mat, center, size):
        bm = self._bm(mat)
        geom = bmesh.ops.create_cube(bm, size=1.0)
        verts = geom["verts"]
        bmesh.ops.scale(bm, vec=Vector(size), verts=verts)
        bmesh.ops.translate(bm, vec=Vector(center), verts=verts)

    def beam(self, mat, a, b, t):
        """A square beam of thickness t from point a to point b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        length = d.length
        if length < 1e-6:
            return
        bm = self._bm(mat)
        geom = bmesh.ops.create_cube(bm, size=1.0)
        verts = geom["verts"]
        bmesh.ops.scale(bm, vec=Vector((t, t, length)), verts=verts)
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=verts)

    def cyl(self, mat, center, radius, depth, segments=8, axis="Z"):
        bm = self._bm(mat)
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=depth)
        verts = geom["verts"]
        if axis == "X":
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(1.5708, 3, "Y"), verts=verts)
        elif axis == "Y":
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(1.5708, 3, "X"), verts=verts)
        bmesh.ops.translate(bm, vec=Vector(center), verts=verts)

    def prism(self, mat, x0, x1, y0, y1, z0, z_low, z_high):
        """Sawtooth roof tooth: vertical face at x0 (height z_high), sloping to x1 (z_low)."""
        bm = self._bm(mat)
        v = [bm.verts.new(p) for p in [
            (x0, y0, z0), (x1, y0, z0), (x1, y0, z_low), (x0, y0, z_high),
            (x0, y1, z0), (x1, y1, z0), (x1, y1, z_low), (x0, y1, z_high)]]
        for f in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)]:
            bm.faces.new([v[i] for i in f])

    def finish(self, name):
        objs = []
        for key, (bm, mat) in self.parts.items():
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            me = bpy.data.meshes.new(f"{name}_{key}")
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mat)
            ob = bpy.data.objects.new(f"{name}_{key}", me)
            bpy.context.scene.collection.objects.link(ob)
            objs.append(ob)
        # One object, several materials — one draw call per material in three.js.
        bpy.ops.object.select_all(action="DESELECT")
        for ob in objs:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = name
        return joined


def export(path):
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, path), export_format="GLB",
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False, export_materials="EXPORT")
    print("wrote", path)


# ── 330 kV double-circuit lattice tower ──────────────────────────────────
def tower():
    reset()
    steel = material("steel", srgb("#dbe4ee"), metallic=0.35, roughness=0.4)
    insulator = material("insulator", srgb("#e7eef5"), roughness=0.3)
    b = Builder()
    H, base, waist, top = 1.0, 0.30, 0.11, 0.07
    t = 0.014

    def leg_xy(z):
        # Half-width at height z: taper fast to the waist (z=0.55), then slowly.
        w = base + (waist - base) * (z / 0.55) if z <= 0.55 else waist + (top - waist) * ((z - 0.55) / (H - 0.55))
        return w / 2

    levels = [0.0, 0.16, 0.32, 0.47, 0.6, 0.74, 0.88, H]
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    for i in range(len(levels) - 1):
        z0, z1 = levels[i], levels[i + 1]
        h0, h1 = leg_xy(z0), leg_xy(z1)
        for k in range(4):
            sx, sy = corners[k]
            nx, ny = corners[(k + 1) % 4]
            b.beam(steel, (sx * h0, sy * h0, z0), (sx * h1, sy * h1, z1), t)          # leg
            b.beam(steel, (sx * h1, sy * h1, z1), (nx * h1, ny * h1, z1), t * 0.6)    # horizontal
            if z1 <= 0.6:                                                              # X-bracing on the body
                b.beam(steel, (sx * h0, sy * h0, z0), (nx * h1, ny * h1, z1), t * 0.5)
                b.beam(steel, (nx * h0, ny * h0, z0), (sx * h1, sy * h1, z1), t * 0.5)

    # Cross-arms (both sides) with suspension insulator strings.
    for z, reach in [(0.62, 0.30), (0.76, 0.36), (0.90, 0.30)]:
        h = leg_xy(z)
        for side in (1, -1):
            tip = (side * reach, 0, z)
            b.beam(steel, (side * h, h, z), tip, t * 0.8)
            b.beam(steel, (side * h, -h, z), tip, t * 0.8)
            b.beam(steel, (side * h, 0, z + 0.06), tip, t * 0.6)                       # top tie
            b.cyl(insulator, (side * (reach - 0.01), 0, z - 0.055), 0.012, 0.09, segments=6)
    # Earth-wire peak.
    b.beam(steel, (top / 2, 0, H), (0, 0, H + 0.08), t * 0.7)
    b.beam(steel, (-top / 2, 0, H), (0, 0, H + 0.08), t * 0.7)
    b.finish("tower_330kv")
    export("tower_330kv.glb")


# ── Transmission substation yard ─────────────────────────────────────────
def substation():
    reset()
    pad = material("gravel", srgb("#3b4656"), roughness=0.95)
    fence = material("fence", srgb("#94a3b8"), metallic=0.4, roughness=0.5)
    steel = material("steel", srgb("#dbe4ee"), metallic=0.35, roughness=0.4)
    tx = material("transformer", srgb("#6b7f95"), metallic=0.3, roughness=0.55)
    bushing = material("insulator", srgb("#e7eef5"), roughness=0.3)
    accent = material("accent", srgb("#38bdf8"), roughness=0.4, emission=srgb("#0e7490"))
    bldg = material("building", srgb("#cbd5e1"), roughness=0.8)
    b = Builder()
    W, D = 1.0, 0.7
    b.box(pad, (0, 0, 0.01), (W, D, 0.02))
    # Fence: posts + top rail.
    for x in [i * W / 8 - W / 2 for i in range(9)]:
        for y in (-D / 2, D / 2):
            b.box(fence, (x, y, 0.045), (0.008, 0.008, 0.07))
    for y in [i * D / 6 - D / 2 for i in range(7)]:
        for x in (-W / 2, W / 2):
            b.box(fence, (x, y, 0.045), (0.008, 0.008, 0.07))
    for y in (-D / 2, D / 2):
        b.box(fence, (0, y, 0.08), (W, 0.006, 0.006))
    for x in (-W / 2, W / 2):
        b.box(fence, (x, 0, 0.08), (0.006, D, 0.006))

    # Two power transformers: tank, radiator fins, three HV bushings.
    for x in (-0.22, 0.05):
        b.box(tx, (x, -0.14, 0.09), (0.16, 0.12, 0.14))
        for i in range(5):
            b.box(tx, (x - 0.06 + i * 0.03, -0.22, 0.085), (0.012, 0.04, 0.11))
        b.box(accent, (x, -0.14, 0.165), (0.17, 0.13, 0.012))
        for i in (-1, 0, 1):
            b.cyl(bushing, (x + i * 0.045, -0.12, 0.2), 0.009, 0.07, segments=6)

    # Busbar gantries: portal frames and three busbars along the yard.
    for x in (-0.38, -0.05, 0.28):
        for y in (0.05, 0.27):
            b.beam(steel, (x, y, 0.02), (x, y, 0.28), 0.014)
        b.beam(steel, (x, 0.05, 0.28), (x, 0.27, 0.28), 0.014)
    for y in (0.09, 0.16, 0.23):
        b.cyl(accent, (-0.05, y, 0.255), 0.005, 0.68, segments=6, axis="X")
    # Switchgear: rows of post insulators.
    for x in (-0.3, -0.2, -0.1, 0.0, 0.1, 0.2):
        for y in (0.09, 0.16, 0.23):
            b.cyl(bushing, (x, y, 0.07), 0.008, 0.1, segments=6)
            b.box(steel, (x, y, 0.025), (0.02, 0.02, 0.03))
    # Control building.
    b.box(bldg, (0.36, -0.14, 0.06), (0.18, 0.2, 0.1))
    b.box(fence, (0.36, -0.14, 0.115), (0.19, 0.21, 0.01))
    b.finish("substation")
    export("substation.glb")


# ── Customer site (works / factory) ──────────────────────────────────────
def customer_site():
    reset()
    wall = material("wall", srgb("#e2e8f0"), roughness=0.8)
    roof = material("roof", srgb("#f43f5e"), roughness=0.55)
    glass = material("glass", srgb("#7dd3fc"), roughness=0.15, emission=srgb("#0c4a6e"))
    stack = material("stack", srgb("#94a3b8"), metallic=0.3, roughness=0.5)
    base = material("yard", srgb("#334155"), roughness=0.95)
    b = Builder()
    b.box(base, (0, 0, 0.005), (0.78, 0.56, 0.01))
    # Main shed with a three-tooth sawtooth roof.
    x0, x1, y0, y1, h = -0.3, 0.18, -0.2, 0.14, 0.13
    b.box(wall, ((x0 + x1) / 2, (y0 + y1) / 2, h / 2 + 0.01), (x1 - x0, y1 - y0, h))
    n = 3
    step = (x1 - x0) / n
    for i in range(n):
        b.prism(roof, x0 + i * step, x0 + (i + 1) * step, y0, y1, h + 0.01, h + 0.012, h + 0.075)
        b.box(glass, (x0 + i * step + 0.003, (y0 + y1) / 2, h + 0.045), (0.006, (y1 - y0) * 0.9, 0.05))
    # Office block with a window band.
    b.box(wall, (0.27, -0.08, 0.075), (0.16, 0.18, 0.15))
    b.box(glass, (0.27, -0.172, 0.1), (0.14, 0.004, 0.035))
    b.box(roof, (0.27, -0.08, 0.155), (0.17, 0.19, 0.01))
    # Chimney.
    b.cyl(stack, (-0.22, 0.2, 0.15), 0.022, 0.3, segments=10)
    b.cyl(roof, (-0.22, 0.2, 0.3), 0.025, 0.02, segments=10)
    b.finish("customer_site")
    export("customer_site.glb")


tower()
substation()
customer_site()
