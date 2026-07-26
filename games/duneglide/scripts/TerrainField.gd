class_name TerrainField
extends Node3D

## Player-centred terrain clipmap.
##
## LOD_COUNT nested rings. Each ring is 4x4 chunks minus its hollow inner 2x2,
## so ring L+1 exactly surrounds ring L. Cell pitch doubles per ring, so each
## ring covers 4x the area of the one inside it for the same chunk count.
##
## Every chunk in a ring shares ONE baked Mesh resource — built once in _ready
## and never touched again. Streaming is purely "reassign global_position", so
## a recycle frame costs 80 Vector3 writes and cannot allocate or hitch.
##
## The terrain is SOLID COLUMNS and nothing else. There used to be a second mesh
## (SubstrateMesh) providing a smooth floor under gapped tiles; it is gone, along
## with the whole class of bugs that came from a smooth sheet trying to stay a
## constant distance under a stepped surface. See block_terrain.gdshader.
##
## There is deliberately no collision geometry anywhere. Every terrain query in
## the game (ship altitude, camera clearance, enemy hover, bullet impacts) is a
## Height.height() call, which is why the terrain can morph freely without any
## per-frame physics-server rebuild.

## 48 is the hard cap — 48^2 * 20 = 46080 verts, and 58 would overflow 16-bit
## indices. Bigger chunks push the LOD seams further out, which matters more
## than it sounds: ring L reaches +-(2 * chunk_n * pitch_L), so at chunk_n 40 /
## pitch 1.0 the LOD0->LOD1 seam landed at 80 units, in plain sight well inside
## the fog, where the two rings' differing sample points leave a visible crack.
@export var chunk_n := 48
@export var pitch0 := 1.0
## 4 rings: +-96 / +-192 / +-384 / +-768.
@export var lod_count := 4

@export_group("Cells")
## Cell footprint as a fraction of pitch. **1.0 is the intended value** — the
## columns are the ground, so any gap is a hole you can see the far side of the
## dune through. Exposed only so the dev overlay can demonstrate that.
@export var fill_x := 1.0
@export var fill_z := 1.0
## Column depth, as a multiple of pitch. Only has to exceed the biggest step to a
## neighbour (~1.66 * pitch); the rest is hidden behind the neighbouring column.
@export var column_depth := 3.0

@export_group("Bars")
## How far a bar cell stands proud of a floor cell. At 0 the bars are pure
## albedo — dark rows on a bright floor with no relief of their own, which is
## what reviewed best. Small positive values (~0.06) give them physical
## thickness that catches light on the riser; worth revisiting.
@export var bar_height := 0.0
## Bar row spacing and thickness, in cells.
@export var bar_period := 4.0
@export var bar_width := 1.0

@export var target: NodePath

var _rings: Array = []
var _tgt: Node3D


func _ready() -> void:
	# Every ring snaps on the finest ring's grid (see _relocate), so that step
	# has to be a whole number of cells for the COARSEST ring too, or its cells
	# slide off the world lattice and the terrain visibly crawls. chunk_n 48 with
	# 4 LODs gives 48 / 8 = 6 cells per step; a 6th LOD would need 48 / 32 and
	# would break it.
	assert(chunk_n % int(pow(2, lod_count - 1)) == 0,
		"chunk_n %d must divide by 2^(lod_count-1) = %d" % [
			chunk_n, int(pow(2, lod_count - 1))])

	_tgt = get_node_or_null(target) as Node3D
	for l in lod_count:
		var pitch: float = pitch0 * pow(2.0, l)
		var size: float = chunk_n * pitch
		var mesh := BlockChunkMesh.build(chunk_n, pitch, fill_x, fill_z, _depth(pitch))
		var mat := _block_mat(pitch)

		var nodes: Array = []
		for oz in range(-2, 2):
			for ox in range(-2, 2):
				# LOD > 0 rings are hollow — the inner 2x2 is already covered at
				# finer detail by the ring inside.
				if l > 0 and ox >= -1 and ox <= 0 and oz >= -1 and oz <= 0:
					continue
				nodes.append({
					"b": _spawn(mesh, mat),
					"off": Vector2i(ox, oz),
				})
		_rings.append({"size": size, "pitch": pitch, "snap": Vector2(NAN, NAN),
			"nodes": nodes})

	_relocate(true)


## How far below the analytic surface a column bottoms out, for the mesh AABB.
## Includes the far-edge sink applied in the vertex shader.
func _depth(pitch: float) -> float:
	return column_depth * pitch + bar_height + 3.0


func _block_mat(pitch: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/block_terrain.gdshader")
	m.set_shader_parameter("pitch", pitch)
	m.set_shader_parameter("column_depth", column_depth)
	_push_bars(m)
	return m


func _push_bars(m: ShaderMaterial) -> void:
	m.set_shader_parameter("bar_height", bar_height)
	m.set_shader_parameter("bar_period", bar_period)
	m.set_shader_parameter("bar_width", bar_width)


func _spawn(m: Mesh, mat: ShaderMaterial) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	# 120k columns in a shadow pass is a second (and third, and fourth, per
	# cascade) full geometry draw. The look is sky-ambient — nothing is lost.
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(mi)
	return mi


## Dev-overlay knob. Bar shape is pure shader state, so this is free — unlike
## set_fill(), which has to rebuild geometry.
func set_bars(height: float, period: float, width: float) -> void:
	bar_height = maxf(height, 0.0)
	bar_period = maxf(period, 1.0)
	bar_width = clampf(width, 0.0, bar_period)
	for r in _rings:
		for c in r["nodes"]:
			_push_bars(c["b"].material_override)


## Dev-overlay knob. fill is baked into vertex positions, so unlike every other
## terrain parameter this one cannot be a shader uniform — it costs a full
## ArrayMesh rebuild per LOD (4 x 46080 verts). Fine on a keypress, never per
## frame. Anything below 1.0 opens real holes in the ground; that is the point of
## having it on a knob.
func set_fill(fx: float, fz: float) -> void:
	fill_x = clampf(fx, 0.04, 1.0)
	fill_z = clampf(fz, 0.04, 1.0)
	for r in _rings:
		var pitch: float = r["pitch"]
		var mesh := BlockChunkMesh.build(chunk_n, pitch, fill_x, fill_z, _depth(pitch))
		# Every chunk in a ring shares one Mesh resource — assign the same one.
		for c in r["nodes"]:
			c["b"].mesh = mesh


func _process(delta: float) -> void:
	Height.advance(delta)
	RenderingServer.global_shader_parameter_set("h_time", Height.wave_time)
	RenderingServer.global_shader_parameter_set("h_amplitude", Height.amplitude)
	if _tgt:
		_relocate(false)


func _relocate(force: bool) -> void:
	var p := _tgt.global_position if _tgt else Vector3.ZERO

	# ONE snap point for every ring, on the FINEST ring's grid.
	#
	# Rings used to snap to their own grid, which silently tore holes in the
	# ground. Ring L covers snap_L +- 2*s_L, and ring L+1's hollow inner 2x2 is
	# exactly snap_(L+1) +- 2*s_L — same size, so they only line up when the two
	# snaps are equal. They differ by +-s_L for about half of all player
	# positions, and whenever they do, a one-chunk-wide strip of the hole is
	# covered by NOTHING and you see straight through the world. That is the
	# chunk-sized patch that blinked in and out while flying (dark before the
	# haze shelf widened, pale after).
	#
	# A shared snap makes coverage and hole identical by construction. Cells stay
	# locked to the world lattice as long as the step is a whole number of cells
	# for every ring, which is what the assert below guarantees.
	var s0: float = chunk_n * pitch0
	var snap := Vector2(
		floor(p.x / s0 + 0.5) * s0,
		floor(p.z / s0 + 0.5) * s0)

	for r in _rings:
		if not force and snap.is_equal_approx(r["snap"]):
			continue
		r["snap"] = snap
		var s: float = r["size"]
		for c in r["nodes"]:
			var o: Vector2i = c["off"]
			var wp := Vector3(snap.x + (o.x + 0.5) * s, 0.0, snap.y + (o.y + 0.5) * s)
			c["b"].global_position = wp
