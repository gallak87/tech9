extends Node3D

# 3-layer parallax starfield — GPUParticles3D equivalent via manual star nodes
# Stars are small emissive spheres spread across the play volume

const LAYERS := [
	{ "count": 80,  "speed": 4.0,  "spread": 12.0, "z_range": [-60, 0], "size": 0.04, "brightness": 0.6 },
	{ "count": 52,  "speed": 10.0, "spread": 10.0, "z_range": [-50, 0], "size": 0.06, "brightness": 0.8 },
	{ "count": 30,  "speed": 20.0, "spread": 8.0,  "z_range": [-40, 0], "size": 0.09, "brightness": 1.2 },
]

var _stars: Array = []

func _ready() -> void:
	for layer_idx in LAYERS.size():
		var layer: Dictionary = LAYERS[layer_idx]
		for _i in layer["count"]:
			var star := MeshInstance3D.new()
			var sm := SphereMesh.new()
			sm.radius = layer["size"]
			sm.height = layer["size"] * 2
			sm.radial_segments = 4
			sm.rings = 2
			star.mesh = sm
			var mat := StandardMaterial3D.new()
			var brightness: float = layer["brightness"]
			mat.albedo_color = Color(brightness, brightness, brightness)
			mat.emission_enabled = true
			mat.emission = Color(brightness, brightness, brightness * 1.2)
			mat.emission_energy_multiplier = brightness * 2.0
			star.material_override = mat
			star.position = Vector3(
				randf_range(-layer["spread"], layer["spread"]),
				randf_range(-3.0, 3.0),
				randf_range(layer["z_range"][0], layer["z_range"][1])
			)
			add_child(star)
			_stars.append({ "node": star, "speed": layer["speed"],
			                "layer": layer_idx, "spread": layer["spread"] })

func _process(delta: float) -> void:
	for s in _stars:
		var n: MeshInstance3D = s["node"]
		n.position.z += s["speed"] * delta
		if n.position.z > 2.0:
			var layer: Dictionary = LAYERS[s["layer"]]
			n.position.z = layer["z_range"][0]
			n.position.x = randf_range(-s["spread"], s["spread"])
			n.position.y = randf_range(-3.0, 3.0)
