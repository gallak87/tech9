extends Node3D

## CPU/GPU height agreement harness (Phase 1).
##
## Spawns a grid of small emissive spheres at Height.height(x, z) — the CPU
## function. The terrain around them is drawn by terrain_height.gdshaderinc —
## the GPU function. If the two files agree, every sphere sits tangent to a
## block's top face and stays tangent while the field morphs. If a constant is
## mistyped in one of them, spheres visibly float or sink within one frame.
##
## Toggle with P. Left in the tree after Phase 1 as a regression check — any
## future edit to the height function gets verified in one keypress.

@export var grid := 12
@export var spacing := 3.0
@export var radius := 0.08
@export var follow: NodePath

var _dots: Array[MeshInstance3D] = []
var _follow: Node3D
## Snapshot of `grid` at build time. _process must never index off the live
## exported value — poking `grid` from the MCP console after _ready would run
## straight off the end of _dots.
var _n := 0


func _ready() -> void:
	_follow = get_node_or_null(follow) as Node3D
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 6
	mesh.rings = 3

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.1, 0.35)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.1, 0.35)
	mat.emission_energy_multiplier = 6.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	_n = grid
	for i in _n * _n:
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		_dots.append(mi)
	visible = false


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if (event as InputEventKey).physical_keycode == KEY_P:
			visible = not visible


func _process(_delta: float) -> void:
	if not visible:
		return
	var half := (_n - 1) * spacing * 0.5
	var c := _follow.global_position if _follow else Vector3.ZERO
	# snap the sample grid so dots don't crawl relative to the block lattice
	var ox := floorf(c.x / spacing) * spacing
	var oz := floorf(c.z / spacing) * spacing
	for j in _n:
		for i in _n:
			var x := ox + i * spacing - half
			var z := oz + j * spacing - half
			_dots[j * _n + i].global_position = Vector3(x, Height.height(x, z), z)
