extends Node3D

const WALL_X       := 5.0
const SCROLL_SPEED := 7.0
const SPAWN_Z      := -52.0
const DESPAWN_Z    := 9.0

const NUM_COLS     := 12
const COL_SPACING  := 5.0

const FLOOR_Y          := -1.8
const NUM_FLOOR_TILES  := 5
const FLOOR_TILE_DEPTH := 16.0

var _left_cols:  Array = []
var _right_cols: Array = []
var _floor_tiles: Array = []

const _LEFT_COLORS := [
	Color(0.0, 1.0, 0.5),
	Color(0.0, 0.8, 1.0),
	Color(0.2, 0.9, 0.4),
	Color(0.0, 0.5, 0.9),
]
const _RIGHT_COLORS := [
	Color(1.0, 0.2, 0.6),
	Color(0.9, 0.0, 1.0),
	Color(1.0, 0.5, 0.0),
	Color(0.8, 0.1, 0.8),
]

func _ready() -> void:
	_build_columns()
	_build_floor()

func _build_columns() -> void:
	for i in NUM_COLS:
		var z := SPAWN_Z + i * COL_SPACING
		_left_cols.append(_make_building(Vector3(-WALL_X, 0.0, z), _LEFT_COLORS, true))
		_right_cols.append(_make_building(Vector3(WALL_X, 0.0, z), _RIGHT_COLORS, false))

func _make_building(pos: Vector3, colors: Array, left_side: bool) -> Node3D:
	var node    := Node3D.new()
	var height  := randf_range(3.0, 7.5)
	var width_x := randf_range(0.9, 2.2)
	var depth_z := randf_range(1.0, 2.5)
	var color: Color = colors[randi() % colors.size()]

	# Dark main body
	var body := MeshInstance3D.new()
	var bm   := BoxMesh.new()
	bm.size  = Vector3(width_x, height, depth_z)
	body.mesh = bm
	var mat  := StandardMaterial3D.new()
	mat.albedo_color              = color * 0.12
	mat.emission_enabled          = true
	mat.emission                  = color
	mat.emission_energy_multiplier = 0.15
	mat.roughness                  = 0.85
	body.material_override = mat
	body.position.y = FLOOR_Y + height * 0.5
	node.add_child(body)

	# Inner vertical neon edge
	var glow := MeshInstance3D.new()
	var gbm  := BoxMesh.new()
	gbm.size = Vector3(0.06, height + 0.06, 0.06)
	glow.mesh = gbm
	var gmat := StandardMaterial3D.new()
	gmat.albedo_color              = color
	gmat.emission_enabled          = true
	gmat.emission                  = color
	gmat.emission_energy_multiplier = 5.0
	gmat.transparency  = BaseMaterial3D.TRANSPARENCY_ALPHA
	gmat.blend_mode    = BaseMaterial3D.BLEND_MODE_ADD
	glow.material_override = gmat
	var edge_x := (width_x * 0.5 + 0.02) * (1.0 if left_side else -1.0)
	glow.position = Vector3(edge_x, FLOOR_Y + height * 0.5, 0.0)
	node.add_child(glow)

	# Top cap neon edge
	var top  := MeshInstance3D.new()
	var tbm  := BoxMesh.new()
	tbm.size = Vector3(width_x + 0.08, 0.06, depth_z + 0.08)
	top.mesh = tbm
	var tmat := StandardMaterial3D.new()
	tmat.albedo_color              = color
	tmat.emission_enabled          = true
	tmat.emission                  = color
	tmat.emission_energy_multiplier = 3.5
	tmat.transparency  = BaseMaterial3D.TRANSPARENCY_ALPHA
	tmat.blend_mode    = BaseMaterial3D.BLEND_MODE_ADD
	top.material_override = tmat
	top.position = Vector3(0.0, FLOOR_Y + height + 0.03, 0.0)
	node.add_child(top)

	# Small window lights (3 scattered dots on the face)
	for _i in 3:
		var win := MeshInstance3D.new()
		var wbm := BoxMesh.new()
		wbm.size = Vector3(0.12, 0.12, 0.05)
		win.mesh = wbm
		var wmat := StandardMaterial3D.new()
		wmat.albedo_color              = color
		wmat.emission_enabled          = true
		wmat.emission                  = color
		wmat.emission_energy_multiplier = 2.5
		wmat.transparency  = BaseMaterial3D.TRANSPARENCY_ALPHA
		wmat.blend_mode    = BaseMaterial3D.BLEND_MODE_ADD
		win.material_override = wmat
		win.position = Vector3(
			randf_range(-width_x * 0.3, width_x * 0.3),
			FLOOR_Y + randf_range(height * 0.2, height * 0.8),
			depth_z * 0.5 + 0.01
		)
		node.add_child(win)

	node.position = pos
	add_child(node)
	return node

func _build_floor() -> void:
	for i in NUM_FLOOR_TILES:
		var z := SPAWN_Z + FLOOR_TILE_DEPTH * (i + 0.5)
		_floor_tiles.append(_make_floor_tile(z))

func _make_floor_tile(z: float) -> Node3D:
	var node := Node3D.new()
	var mi   := MeshInstance3D.new()
	var pm   := PlaneMesh.new()
	pm.size = Vector2(WALL_X * 2.0 + 3.0, FLOOR_TILE_DEPTH)
	mi.mesh = pm
	var mat := StandardMaterial3D.new()
	mat.albedo_color              = Color(0.0, 0.07, 0.03)
	mat.emission_enabled          = true
	mat.emission                  = Color(0.0, 0.4, 0.18)
	mat.emission_energy_multiplier = 0.3
	mat.roughness                  = 0.95
	mi.material_override = mat
	node.add_child(mi)
	node.position = Vector3(0.0, FLOOR_Y, z)
	add_child(node)
	return node

func _process(delta: float) -> void:
	var dz := SCROLL_SPEED * delta
	var col_span   := NUM_COLS * COL_SPACING
	var floor_span := NUM_FLOOR_TILES * FLOOR_TILE_DEPTH

	for col in _left_cols:
		col.position.z += dz
		if col.position.z > DESPAWN_Z:
			col.position.z -= col_span
	for col in _right_cols:
		col.position.z += dz
		if col.position.z > DESPAWN_Z:
			col.position.z -= col_span
	for tile in _floor_tiles:
		tile.position.z += dz
		if tile.position.z > DESPAWN_Z + FLOOR_TILE_DEPTH * 0.5:
			tile.position.z -= floor_span
