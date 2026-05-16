"""
Headless Blender script — F-35-inspired player ship GLB.

Coordinate convention (matches procedural geo-manifest builder):
  Blender +Y = nose forward, +Z = top, +X = right wing
  Export uses export_yup=False — GLB stays in Blender Z-up frame.
  game.js applies rotation.x = -pi/2 (same as procedural mesh builder),
  which maps Blender +Y → Three.js -Z (forward in game).

Usage:
  npm run art:player
  # or:
  blender --background --python tools/blender/gen_player.py -- --output src/public/assets/player.glb
"""

import bpy
import bmesh
import sys
import math

# ── Output path ───────────────────────────────────────────────────────────────
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTPUT = args[args.index('--output') + 1] if '--output' in args else './player.glb'

# ── Wipe scene ────────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for m in list(bpy.data.meshes):    bpy.data.meshes.remove(m)

# Global scale — bumped to match procedural V2/V3 ship size in art mode
S = 2.0

# ── Materials ─────────────────────────────────────────────────────────────────
def hex_rgba(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)) + (1.0,)

def make_mat(name, base, emit=None, strength=0.0, rough=0.5, metal=0.2):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_rgba(base)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        for n in ("Emission Color", "Emission"):
            if n in bsdf.inputs:
                bsdf.inputs[n].default_value = hex_rgba(emit)
                break
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat

def set_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)

M_HULL       = make_mat("hull",       "#1A50CC", emit="#1A50CC", strength=0.10, rough=0.4, metal=0.3)
M_HULL_DARK  = make_mat("hull_dark",  "#0A2050", emit="#0A2050", strength=0.05, rough=0.5, metal=0.4)
M_HULL_TRIM  = make_mat("hull_trim",  "#040810",                                rough=0.3, metal=0.6)
M_NOZZLE     = make_mat("nozzle",     "#15151E",                                rough=0.6, metal=0.8)
M_NOZZLE_HOT = make_mat("nozzle_hot", "#2a1a18", emit="#ff5522", strength=0.7,  rough=0.8, metal=0.4)
M_GLOW       = make_mat("glow",       "#00E5FF", emit="#00E5FF", strength=4.5)
M_CANOPY     = make_mat("canopy",     "#0a1a2a", emit="#00E5FF", strength=0.5,  rough=0.05, metal=0.95)
M_WEAPON     = make_mat("weapon",     "#1a1a25",                                rough=0.5,  metal=0.7)

# ── Helpers ───────────────────────────────────────────────────────────────────
def bm_to_obj(bm, name):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj

def add_bevel(obj, width=0.004, segments=2):
    """Beveled edges — what makes meshes look 'modeled' instead of 'primitives stuck together'.
    Modifier is baked into geometry at export time via export_apply=True."""
    m = obj.modifiers.new(name="Bevel", type='BEVEL')
    m.width = width * S
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(30)
    m.miter_outer = 'MITER_ARC'
    return m

def add_subdiv(obj, levels=2):
    """Subdivision surface — smooth organic curves from low-poly cages."""
    m = obj.modifiers.new(name="Subdiv", type='SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return m

def shade_smooth(obj, angle_deg=30):
    """Auto-smooth normals: flat where angle exceeds threshold, smooth elsewhere.
    Keeps stealth facets crisp while smoothing within-facet surfaces."""
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.use_auto_smooth = True if hasattr(obj.data, 'use_auto_smooth') else None
    if hasattr(obj.data, 'auto_smooth_angle'):
        obj.data.auto_smooth_angle = math.radians(angle_deg)

def cube(name, loc, sc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name; o.scale = sc; o.rotation_euler = rot
    return o

def cylinder(name, loc, r, d, verts=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, vertices=verts, location=loc)
    o = bpy.context.active_object
    o.name = name; o.rotation_euler = rot
    return o

def cone(name, loc, r1, r2, d, verts=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=d, vertices=verts, location=loc)
    o = bpy.context.active_object
    o.name = name; o.rotation_euler = rot
    return o

# ── Fuselage — 8-section lofted hex prism (stealth-faceted F-35 profile) ──────
def build_fuselage():
    bm = bmesh.new()
    # (y, half_width, top_z, bot_z, shoulder_factor)
    sections = [
        ( 0.44 * S, 0.000,      0.000,       0.000,       1.0),   # nose tip
        ( 0.32 * S, 0.028 * S,  0.014 * S,  -0.006 * S,   0.70),
        ( 0.18 * S, 0.058 * S,  0.030 * S,  -0.020 * S,   0.62),
        ( 0.05 * S, 0.085 * S,  0.045 * S,  -0.030 * S,   0.55),
        (-0.05 * S, 0.090 * S,  0.048 * S,  -0.032 * S,   0.55),
        (-0.18 * S, 0.080 * S,  0.038 * S,  -0.028 * S,   0.62),
        (-0.28 * S, 0.060 * S,  0.022 * S,  -0.022 * S,   0.80),
        (-0.36 * S, 0.048 * S,  0.016 * S,  -0.016 * S,   1.0),
    ]
    def ring(y, hw, tz, bz, sf):
        if hw < 1e-4:
            return [bm.verts.new((0, y, (tz + bz) / 2))]
        mz = (tz + bz) / 2
        return [
            bm.verts.new(( hw * sf, y, tz)),
            bm.verts.new((-hw * sf, y, tz)),
            bm.verts.new((-hw,      y, mz)),
            bm.verts.new((-hw * sf, y, bz)),
            bm.verts.new(( hw * sf, y, bz)),
            bm.verts.new(( hw,      y, mz)),
        ]
    rings = [ring(*s) for s in sections]
    for i in range(len(rings) - 1):
        ra, rb = rings[i], rings[i+1]
        if len(ra) == 1:
            for j in range(len(rb)):
                nj = (j + 1) % len(rb)
                bm.faces.new([ra[0], rb[j], rb[nj]])
        else:
            for j in range(len(ra)):
                nj = (j + 1) % len(ra)
                bm.faces.new([ra[j], rb[j], rb[nj], ra[nj]])
    if len(rings[-1]) > 1:
        bm.faces.new(list(reversed(rings[-1])))
    obj = bm_to_obj(bm, "fuselage")
    set_mat(obj, M_HULL)
    add_bevel(obj, width=0.005, segments=2)
    shade_smooth(obj, angle_deg=35)

build_fuselage()

# ── Wings — clipped-delta planform, ~36° leading-edge sweep ──────────────────
def build_wing(side):
    bm = bmesh.new()
    s = side
    pts = [
        (s * 0.085 * S,  0.08 * S, 0),  # root leading edge
        (s * 0.36 * S,  -0.11 * S, 0),  # tip leading edge (swept)
        (s * 0.36 * S,  -0.22 * S, 0),  # tip trailing edge
        (s * 0.085 * S, -0.27 * S, 0),  # root trailing edge
    ]
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs if s > 0 else list(reversed(vs)))
    ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    top = [v for v in ret['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, 0.024 * S), verts=top)
    bmesh.ops.translate(bm, vec=(0, 0, -0.012 * S), verts=bm.verts[:])
    obj = bm_to_obj(bm, "wing_r" if s > 0 else "wing_l")
    set_mat(obj, M_HULL_DARK)
    add_bevel(obj, width=0.004, segments=2)
    shade_smooth(obj, angle_deg=35)

build_wing(+1)
build_wing(-1)

# ── V-tails — canted outward 28° ──────────────────────────────────────────────
def build_vtail(side):
    bm = bmesh.new()
    s = side
    pts = [
        (0, -0.17 * S, 0.024 * S),
        (0, -0.32 * S, 0.024 * S),
        (0, -0.30 * S, 0.180 * S),
        (0, -0.14 * S, 0.200 * S),
    ]
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs if s > 0 else list(reversed(vs)))
    ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    top = [v for v in ret['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(s * 0.012 * S, 0, 0), verts=top)
    bmesh.ops.translate(bm, vec=(-s * 0.006 * S, 0, 0), verts=bm.verts[:])
    obj = bm_to_obj(bm, "vtail_r" if s > 0 else "vtail_l")
    obj.location = (s * 0.06 * S, 0, 0.034 * S)
    obj.rotation_euler = (0, s * math.radians(28), 0)
    set_mat(obj, M_HULL)
    add_bevel(obj, width=0.003, segments=2)
    shade_smooth(obj, angle_deg=35)

build_vtail(+1)
build_vtail(-1)

# ── Engine — outer ring + hot inner recess + exit glow + afterburner + 4 petals ─
def build_engine():
    o = cylinder("nozzle_outer", (0, -0.40 * S, 0), r=0.062 * S, d=0.08 * S, verts=16,
                  rot=(math.pi / 2, 0, 0))
    set_mat(o, M_NOZZLE)
    add_bevel(o, width=0.003, segments=2)
    shade_smooth(o, angle_deg=40)
    o = cylinder("nozzle_inner", (0, -0.41 * S, 0), r=0.046 * S, d=0.06 * S, verts=16,
                  rot=(math.pi / 2, 0, 0))
    set_mat(o, M_NOZZLE_HOT)
    shade_smooth(o, angle_deg=40)
    o = cylinder("engine_glow", (0, -0.44 * S, 0), r=0.040 * S, d=0.005 * S, verts=12,
                  rot=(math.pi / 2, 0, 0))
    set_mat(o, M_GLOW)
    # Afterburner cone — default cone tip at +Z; rot=(+pi/2, 0, 0) sends tip to -Y (rearward in Blender). ✓
    o = cone("afterburner", (0, -0.51 * S, 0), r1=0.034 * S, r2=0, d=0.12 * S, verts=8,
             rot=(math.pi / 2, 0, 0))
    set_mat(o, M_GLOW)
    # Petals around the nozzle (4 angular flaps at 45/135/225/315°)
    for deg in (45, 135, 225, 315):
        ang = math.radians(deg)
        x = math.cos(ang) * 0.065 * S
        z = math.sin(ang) * 0.065 * S
        petal = cube(f"petal_{deg}",
                     (x, -0.41 * S, z),
                     (0.020 * S, 0.060 * S, 0.008 * S),
                     rot=(0, ang, 0))
        set_mat(petal, M_NOZZLE)

build_engine()

# ── Canopy — bubble + dark frame ring ─────────────────────────────────────────
def build_canopy():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05 * S, segments=14, ring_count=8,
                                          location=(0, 0.18 * S, 0.055 * S))
    c = bpy.context.active_object
    c.name = "canopy"
    c.scale = (0.75, 1.7, 0.55)
    set_mat(c, M_CANOPY)
    # Dark frame ring at canopy base
    bpy.ops.mesh.primitive_torus_add(major_radius=0.05 * S, minor_radius=0.005 * S,
                                      major_segments=16, minor_segments=6,
                                      location=(0, 0.18 * S, 0.04 * S))
    f = bpy.context.active_object
    f.name = "canopy_frame"
    f.scale = (0.75, 1.7, 0.6)
    set_mat(f, M_HULL_TRIM)

build_canopy()

# ── Spine antenna — small dorsal blade behind canopy ──────────────────────────
def build_spine():
    bm = bmesh.new()
    pts = [
        (0,  0.02 * S, 0.045 * S),
        (0, -0.10 * S, 0.045 * S),
        (0, -0.09 * S, 0.095 * S),
        (0, -0.01 * S, 0.100 * S),
    ]
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)
    ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    top = [v for v in ret['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0.006 * S, 0, 0), verts=top)
    bmesh.ops.translate(bm, vec=(-0.003 * S, 0, 0), verts=bm.verts[:])
    obj = bm_to_obj(bm, "spine_fin")
    set_mat(obj, M_HULL_DARK)

build_spine()

# ── Wing pylons + missiles (2 per wing) ───────────────────────────────────────
def build_pylons(side):
    s = side
    wing_bot_z = -0.012 * S
    for i, x_off in enumerate((0.17, 0.27)):
        pylon = cube(
            f"pylon_{('r' if s > 0 else 'l')}_{i}",
            (s * x_off * S, -0.13 * S, wing_bot_z - 0.018 * S),
            (0.014 * S, 0.06 * S, 0.030 * S),
        )
        set_mat(pylon, M_HULL_TRIM)
        # Missile body below pylon
        missile = cylinder(
            f"missile_{('r' if s > 0 else 'l')}_{i}",
            (s * x_off * S, -0.13 * S, wing_bot_z - 0.050 * S),
            r=0.012 * S, d=0.11 * S, verts=8,
            rot=(math.pi / 2, 0, 0),
        )
        set_mat(missile, M_WEAPON)
        # Missile nose (cone tip → +Y forward via rot=(-pi/2, 0, 0))
        tip = cone(
            f"missile_tip_{('r' if s > 0 else 'l')}_{i}",
            (s * x_off * S, -0.06 * S, wing_bot_z - 0.050 * S),
            r1=0.012 * S, r2=0, d=0.028 * S, verts=8,
            rot=(-math.pi / 2, 0, 0),
        )
        set_mat(tip, M_WEAPON)

build_pylons(+1)
build_pylons(-1)

# ── Export — yup=False so GLB stays Z-up; game.js applies rotation.x=-pi/2 ────
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    export_materials='EXPORT',
    export_apply=True,
    export_yup=False,
    use_selection=False,
)
print(f"[gen_player] exported → {OUTPUT}")
