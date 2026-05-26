extends Node3D

# Two concentric rings: a fast outer and a slower inner, both fading out.

const LIFETIME    := 0.65
const MAX_SCALE   := 40.0
const INNER_DELAY := 0.08  # inner ring lags this many seconds behind

var _age := 0.0
var _outer_mat: StandardMaterial3D
var _inner_mat: StandardMaterial3D

func _ready() -> void:
	_outer_mat = _add_ring(1.0)
	_inner_mat = _add_ring(0.72)

func _add_ring(scale_factor: float) -> StandardMaterial3D:
	var tm := TorusMesh.new()
	tm.inner_radius = 0.88 * scale_factor
	tm.outer_radius = 1.00 * scale_factor
	tm.rings = 64
	tm.ring_segments = 8

	var mi  := MeshInstance3D.new()
	mi.mesh = tm

	var mat := StandardMaterial3D.new()
	mat.albedo_color              = Color(1.0, 0.5, 0.05)
	mat.emission_enabled          = true
	mat.emission                  = Color(2.0, 0.6, 0.0)
	mat.emission_energy_multiplier = 6.0
	mat.transparency  = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode    = BaseMaterial3D.BLEND_MODE_ADD
	mat.cull_mode     = BaseMaterial3D.CULL_DISABLED
	mi.material_override = mat
	add_child(mi)
	return mat

func _process(delta: float) -> void:
	_age += delta
	if _age >= LIFETIME:
		queue_free()
		return

	var t_outer := clampf(_age / LIFETIME, 0.0, 1.0)
	var t_inner := clampf((_age - INNER_DELAY) / LIFETIME, 0.0, 1.0)

	# ease-out expansion so it bursts fast then slows
	var s_outer := _ease_out(t_outer) * MAX_SCALE
	var s_inner := _ease_out(maxf(t_inner, 0.0)) * MAX_SCALE

	scale = Vector3(s_outer, 1.0, s_outer)

	# inner ring is a child mesh — drive it via its own scale on the parent node
	# instead, update via the second MeshInstance3D's parent transform trick:
	# since both are children of this node which scales uniformly, drive inner
	# by adjusting its mesh radii relative to outer. Simpler: just fade differently.
	var children := get_children()
	if children.size() >= 2 and children[1] is MeshInstance3D:
		var inner_mi: MeshInstance3D = children[1]
		if t_inner > 0.0:
			inner_mi.scale = Vector3(s_inner / s_outer, 1.0, s_inner / s_outer) if s_outer > 0.01 else Vector3.ONE
		else:
			inner_mi.scale = Vector3.ZERO

	_outer_mat.emission_energy_multiplier = 6.0 * _fade(t_outer)
	if t_inner > 0.0:
		_inner_mat.emission_energy_multiplier = 4.5 * _fade(t_inner)

func _ease_out(t: float) -> float:
	return 1.0 - pow(1.0 - t, 2.5)

func _fade(t: float) -> float:
	return clamp(1.0 - t * 1.4, 0.0, 1.0)
