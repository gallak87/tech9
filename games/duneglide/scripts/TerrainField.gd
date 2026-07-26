class_name TerrainField
extends Node3D

## Player-centred terrain clipmap.
##
## LOD_COUNT nested rings. Each ring is 4x4 chunks minus its hollow inner 2x2,
## so ring L+1 exactly surrounds ring L. Block pitch doubles per ring, so each
## ring covers 4x the area of the one inside it for the same chunk count.
##
## Every chunk in a ring shares ONE baked Mesh resource — built once in _ready
## and never touched again. Streaming is purely "reassign global_position", so
## a recycle frame costs 80 Vector3 writes and cannot allocate or hitch.
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
## Block footprint as a fraction of pitch. Wider than deep gives the reference's
## "raised dash" mosaic rather than a checkerboard.
@export var fill_x := 0.94
## Narrow in Z gives the reference's "raised dash" striation rather than a
## checkerboard of cubes. Was widened to 0.76 only because the dark substrate
## read as holes between the dashes; post-inversion (Phase 3) the substrate is
## the bright surface and the dashes should be sparse marks ON it again.
@export var fill_z := 0.30
## Skirt depth. Deep blocks read as vertical fins from a low angle rather than
## the reference's flat tiles — keep this just long enough to show a side face.
@export var block_depth := 0.22
@export var substrate_drop := 0.14
@export var target: NodePath

var _rings: Array = []
var _tgt: Node3D


func _ready() -> void:
	_tgt = get_node_or_null(target) as Node3D
	for l in lod_count:
		var pitch: float = pitch0 * pow(2.0, l)
		var size: float = chunk_n * pitch
		var block_mesh := BlockChunkMesh.build(chunk_n, pitch, fill_x, fill_z)
		var sub_mesh := SubstrateMesh.build(chunk_n, pitch)
		var bmat := _block_mat(pow(2.0, l))
		var smat := _substrate_mat()

		var nodes: Array = []
		for oz in range(-2, 2):
			for ox in range(-2, 2):
				# LOD > 0 rings are hollow — the inner 2x2 is already covered at
				# finer detail by the ring inside.
				if l > 0 and ox >= -1 and ox <= 0 and oz >= -1 and oz <= 0:
					continue
				nodes.append({
					"b": _spawn(block_mesh, bmat),
					"s": _spawn(sub_mesh, smat),
					"off": Vector2i(ox, oz),
				})
		_rings.append({"size": size, "snap": Vector2(NAN, NAN), "nodes": nodes})

	_relocate(true)


func _block_mat(lod_scale: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/block_terrain.gdshader")
	m.set_shader_parameter("lod_scale", lod_scale)
	m.set_shader_parameter("block_depth", block_depth)
	return m


func _substrate_mat() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/substrate.gdshader")
	m.set_shader_parameter("drop", substrate_drop)
	return m


func _spawn(m: Mesh, mat: ShaderMaterial) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	# 64k emissive blocks in a shadow pass is a second (and third, and fourth,
	# per cascade) full geometry draw. The look is emissive/ambient — nothing
	# is lost by opting out entirely.
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(mi)
	return mi


func _process(delta: float) -> void:
	Height.advance(delta)
	RenderingServer.global_shader_parameter_set("h_time", Height.wave_time)
	RenderingServer.global_shader_parameter_set("h_amplitude", Height.amplitude)
	if _tgt:
		_relocate(false)


func _relocate(force: bool) -> void:
	var p := _tgt.global_position if _tgt else Vector3.ZERO
	for r in _rings:
		var s: float = r["size"]
		# Snap to this ring's own chunk grid so blocks stay locked to the world
		# lattice instead of sliding along with the player.
		var snap := Vector2(
			floor(p.x / s + 0.5) * s,
			floor(p.z / s + 0.5) * s)
		if not force and snap.is_equal_approx(r["snap"]):
			continue
		r["snap"] = snap
		for c in r["nodes"]:
			var o: Vector2i = c["off"]
			var wp := Vector3(snap.x + (o.x + 0.5) * s, 0.0, snap.y + (o.y + 0.5) * s)
			c["b"].global_position = wp
			c["s"].global_position = wp
