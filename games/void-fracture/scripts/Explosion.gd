class_name Explosion
extends Node3D

var color: Color = Color(1.0, 0.4, 0.1)
var count: int = 10
var speed: float = 4.0
var lifetime: float = 0.55

var _age := 0.0
var _particles: Array = []

func _ready() -> void:
	for i in count:
		var p := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.07
		sm.height = 0.14
		sm.radial_segments = 4
		sm.rings = 2
		p.mesh = sm
		var mat := StandardMaterial3D.new()
		mat.albedo_color = color
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 4.0
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		mat.no_depth_test = false
		p.material_override = mat
		var angle := (float(i) / float(count)) * TAU + randf_range(-0.2, 0.2)
		var vspread := randf_range(-0.4, 0.4)
		var spd := speed * randf_range(0.5, 1.5)
		var vel := Vector3(cos(angle), vspread, sin(angle)) * spd
		add_child(p)
		_particles.append({ "node": p, "vel": vel })

func _process(delta: float) -> void:
	_age += delta
	var t := _age / lifetime
	if t >= 1.0:
		queue_free()
		return
	var fade := 1.0 - t
	for particle in _particles:
		var n: MeshInstance3D = particle["node"]
		particle["vel"] = (particle["vel"] as Vector3) * (1.0 - delta * 5.0)
		n.position += (particle["vel"] as Vector3) * delta
		var mat: StandardMaterial3D = n.material_override
		mat.albedo_color.a = fade
		mat.emission_energy_multiplier = 4.0 * fade
