class_name GeoManifest
extends Node

# Central geometry manifest — all 3D entity definitions.
# Each entry describes how to build a mesh from primitives.
# edit this, not the scene files, to tweak ship shapes/colors.

const ENTITIES := {
	"player": {
		"parts": [
			# wide flat fuselage body (blended wing-body like F-35)
			{ "type": "box", "size": Vector3(0.22, 0.07, 0.82),
			  "color": Color(0.45, 0.8, 0.95), "emissive": Color(0.0, 0.3, 0.5), "ei": 0.4,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# nose cone (rotated 90° on X so it points along Z, not Y)
			{ "type": "cylinder", "radius_top": 0.02, "radius_bottom": 0.09, "height": 0.28,
			  "color": Color(0.45, 0.8, 0.95), "emissive": Color(0.0, 0.2, 0.4), "ei": 0.3,
			  "pos": Vector3(0, 0, -0.55), "rot": Vector3(90, 0, 0) },
			# left delta wing (swept back: Y rot pushes front inward, rear outward)
			{ "type": "box", "size": Vector3(0.72, 0.03, 0.52),
			  "color": Color(0.35, 0.68, 0.88), "emissive": Color(0.0, 0.15, 0.3), "ei": 0.2,
			  "pos": Vector3(-0.44, -0.01, 0.08), "rot": Vector3(0, 14, 0) },
			# right delta wing
			{ "type": "box", "size": Vector3(0.72, 0.03, 0.52),
			  "color": Color(0.35, 0.68, 0.88), "emissive": Color(0.0, 0.15, 0.3), "ei": 0.2,
			  "pos": Vector3(0.44, -0.01, 0.08), "rot": Vector3(0, -14, 0) },
			# left horizontal stabilizer (rear)
			{ "type": "box", "size": Vector3(0.30, 0.025, 0.20),
			  "color": Color(0.35, 0.65, 0.85), "emissive": Color(0.0, 0.1, 0.2), "ei": 0.2,
			  "pos": Vector3(-0.24, 0, 0.36), "rot": Vector3(0, 8, 0) },
			# right horizontal stabilizer
			{ "type": "box", "size": Vector3(0.30, 0.025, 0.20),
			  "color": Color(0.35, 0.65, 0.85), "emissive": Color(0.0, 0.1, 0.2), "ei": 0.2,
			  "pos": Vector3(0.24, 0, 0.36), "rot": Vector3(0, -8, 0) },
			# vertical tail fin (single, F-35 style — slender, at rear)
			{ "type": "box", "size": Vector3(0.028, 0.22, 0.20),
			  "color": Color(0.4, 0.72, 0.9), "emissive": Color(0.0, 0.15, 0.3), "ei": 0.2,
			  "pos": Vector3(0, 0.11, 0.34), "rot": Vector3(0, 0, 0) },
			# left DSI intake bump
			{ "type": "box", "size": Vector3(0.09, 0.06, 0.26),
			  "color": Color(0.3, 0.58, 0.78), "emissive": Color(0.0, 0.12, 0.25), "ei": 0.3,
			  "pos": Vector3(-0.14, -0.04, -0.12), "rot": Vector3(0, 0, 0) },
			# right DSI intake bump
			{ "type": "box", "size": Vector3(0.09, 0.06, 0.26),
			  "color": Color(0.3, 0.58, 0.78), "emissive": Color(0.0, 0.12, 0.25), "ei": 0.3,
			  "pos": Vector3(0.14, -0.04, -0.12), "rot": Vector3(0, 0, 0) },
			# canopy bubble
			{ "type": "sphere", "radius": 0.065,
			  "color": Color(0.55, 0.88, 1.0), "emissive": Color(0.2, 0.6, 1.0), "ei": 1.2,
			  "pos": Vector3(0, 0.07, -0.22), "rot": Vector3(0, 0, 0) },
			# engine exhaust glow
			{ "type": "sphere", "radius": 0.085,
			  "color": Color(0.0, 0.7, 1.0), "emissive": Color(0.0, 1.2, 2.0), "ei": 3.5,
			  "pos": Vector3(0, 0, 0.42), "rot": Vector3(0, 0, 0) },
		]
	},
	"scout": {
		"parts": [
			{ "type": "cylinder", "radius_top": 0.05, "radius_bottom": 0.28, "height": 0.9,
			  "color": Color(1.0, 0.18, 0.37), "emissive": Color(0.8, 0.0, 0.15), "ei": 0.8,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			{ "type": "box", "size": Vector3(0.75, 0.05, 0.38),
			  "color": Color(0.8, 0.1, 0.2), "emissive": Color(0.5, 0.0, 0.08), "ei": 0.4,
			  "pos": Vector3(0, 0, 0.12), "rot": Vector3(0, 0, 0) },
		]
	},
	"bomber": {
		"parts": [
			{ "type": "box", "size": Vector3(0.7, 0.25, 0.9),
			  "color": Color(0.54, 0.19, 1.0), "emissive": Color(0.2, 0.0, 0.5), "ei": 0.6,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			{ "type": "sphere", "radius": 0.2,
			  "color": Color(0.7, 0.3, 1.0), "emissive": Color(0.4, 0.0, 0.8), "ei": 1.2,
			  "pos": Vector3(0, 0, -0.3), "rot": Vector3(0, 0, 0) },
		]
	},
	"drone": {
		"parts": [
			{ "type": "sphere", "radius": 0.3,
			  "color": Color(0.0, 1.0, 0.6), "emissive": Color(0.0, 0.5, 0.2), "ei": 0.7,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			{ "type": "torus", "inner_radius": 0.28, "outer_radius": 0.38,
			  "color": Color(0.0, 0.8, 0.4), "emissive": Color(0.0, 0.6, 0.2), "ei": 1.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
		]
	},
	"elite_overlay": {
		"parts": [
			# gold pulse ring added on top of base enemy mesh
			{ "type": "torus", "inner_radius": 0.35, "outer_radius": 0.48,
			  "color": Color(1.0, 0.84, 0.0), "emissive": Color(1.0, 0.7, 0.0), "ei": 2.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
		]
	},
	"sentinel_boss": {
		"parts": [
			# Core sphere
			{ "type": "sphere", "radius": 0.8,
			  "color": Color(0.0, 0.6, 1.0), "emissive": Color(0.0, 0.75, 1.0), "ei": 1.5,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Horizontal ring
			{ "type": "torus", "inner_radius": 1.05, "outer_radius": 1.35,
			  "color": Color(0.0, 0.5, 1.0), "emissive": Color(0.0, 0.75, 1.0), "ei": 2.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Vertical ring (tilted 90° on X)
			{ "type": "torus", "inner_radius": 1.05, "outer_radius": 1.35,
			  "color": Color(0.2, 0.4, 1.0), "emissive": Color(0.0, 0.6, 1.0), "ei": 1.8,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(90, 0, 0) },
			# Horizontal arm span
			{ "type": "box", "size": Vector3(2.6, 0.1, 0.16),
			  "color": Color(0.0, 0.5, 0.9), "emissive": Color(0.0, 0.6, 1.0), "ei": 1.2,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Fore-aft arm span
			{ "type": "box", "size": Vector3(0.16, 0.1, 2.6),
			  "color": Color(0.0, 0.5, 0.9), "emissive": Color(0.0, 0.6, 1.0), "ei": 1.2,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
		]
	},
	"interceptor_boss": {
		"parts": [
			# Fuselage
			{ "type": "box", "size": Vector3(0.45, 0.28, 2.4),
			  "color": Color(1.0, 0.45, 0.0), "emissive": Color(0.8, 0.2, 0.0), "ei": 1.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Swept wings
			{ "type": "box", "size": Vector3(2.8, 0.07, 1.0),
			  "color": Color(0.8, 0.35, 0.0), "emissive": Color(0.6, 0.15, 0.0), "ei": 0.8,
			  "pos": Vector3(0, 0, 0.3), "rot": Vector3(0, -10, 0) },
			# Nose tip cone
			{ "type": "cylinder", "radius_top": 0.02, "radius_bottom": 0.16, "height": 0.55,
			  "color": Color(1.0, 0.6, 0.0), "emissive": Color(1.0, 0.8, 0.0), "ei": 2.0,
			  "pos": Vector3(0, 0, -1.48), "rot": Vector3(90, 0, 0) },
			# Left engine glow
			{ "type": "sphere", "radius": 0.17,
			  "color": Color(1.0, 0.3, 0.0), "emissive": Color(2.0, 0.6, 0.0), "ei": 3.2,
			  "pos": Vector3(-0.2, 0, 1.28), "rot": Vector3(0, 0, 0) },
			# Right engine glow
			{ "type": "sphere", "radius": 0.17,
			  "color": Color(1.0, 0.3, 0.0), "emissive": Color(2.0, 0.6, 0.0), "ei": 3.2,
			  "pos": Vector3(0.2, 0, 1.28), "rot": Vector3(0, 0, 0) },
		]
	},
	"colossus_boss": {
		"parts": [
			# Main hull
			{ "type": "box", "size": Vector3(2.4, 0.55, 1.8),
			  "color": Color(0.5, 0.0, 0.8), "emissive": Color(0.3, 0.0, 0.5), "ei": 0.8,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Left heavy block
			{ "type": "box", "size": Vector3(0.75, 0.45, 1.2),
			  "color": Color(0.4, 0.0, 0.7), "emissive": Color(0.2, 0.0, 0.4), "ei": 0.6,
			  "pos": Vector3(-1.58, 0, 0), "rot": Vector3(0, 0, 0) },
			# Right heavy block
			{ "type": "box", "size": Vector3(0.75, 0.45, 1.2),
			  "color": Color(0.4, 0.0, 0.7), "emissive": Color(0.2, 0.0, 0.4), "ei": 0.6,
			  "pos": Vector3(1.58, 0, 0), "rot": Vector3(0, 0, 0) },
			# Command tower
			{ "type": "box", "size": Vector3(0.65, 0.5, 0.65),
			  "color": Color(0.6, 0.0, 1.0), "emissive": Color(0.4, 0.0, 0.8), "ei": 1.5,
			  "pos": Vector3(0, 0.52, -0.2), "rot": Vector3(0, 0, 0) },
			# Left core emitter
			{ "type": "sphere", "radius": 0.22,
			  "color": Color(0.8, 0.0, 1.0), "emissive": Color(1.5, 0.0, 2.5), "ei": 3.5,
			  "pos": Vector3(-0.7, 0, 0), "rot": Vector3(0, 0, 0) },
			# Right core emitter
			{ "type": "sphere", "radius": 0.22,
			  "color": Color(0.8, 0.0, 1.0), "emissive": Color(1.5, 0.0, 2.5), "ei": 3.5,
			  "pos": Vector3(0.7, 0, 0), "rot": Vector3(0, 0, 0) },
		]
	},
}

const BULLETS := {
	"T1": { "color": Color(0.5, 0.81, 1.0), "emissive": Color(0.0, 0.8, 2.0), "ei": 4.0,
	        "size": Vector3(0.1, 0.1, 0.55) },
	"T2": { "color": Color(1.0, 1.0, 0.0), "emissive": Color(1.5, 1.5, 0.0), "ei": 4.0,
	        "size": Vector3(0.1, 0.1, 0.55) },
	"T3": { "color": Color(0.25, 1.0, 0.5), "emissive": Color(0.0, 2.0, 0.5), "ei": 4.0,
	        "size": Vector3(0.11, 0.11, 0.58) },
	"T4": { "color": Color(1.0, 0.0, 1.0), "emissive": Color(2.0, 0.0, 2.0), "ei": 4.0,
	        "size": Vector3(0.11, 0.11, 0.62) },
	"T5": { "color": Color(1.0, 0.6, 0.0), "emissive": Color(2.0, 0.8, 0.0), "ei": 4.0,
	        "size": Vector3(0.12, 0.12, 0.55) },
	"T6": { "color": Color(1.0, 0.25, 0.37), "emissive": Color(2.0, 0.0, 0.5), "ei": 4.0,
	        "size": Vector3(0.12, 0.12, 0.60) },
	"T7": { "color": Color(0.7, 0.0, 1.0), "emissive": Color(1.5, 0.0, 2.5), "ei": 4.0,
	        "size": Vector3(0.14, 0.14, 0.65) },
	"enemy": { "color": Color(1.0, 0.3, 0.1), "emissive": Color(2.0, 0.2, 0.0), "ei": 3.0,
	            "size": Vector3(0.12, 0.12, 0.40) },
	"seeker": { "color": Color(0.25, 1.0, 0.5), "emissive": Color(0.0, 2.5, 1.0), "ei": 4.0,
	             "size": Vector3(0.14, 0.14, 0.45) },
}

const PICKUPS := {
	"weapon": {
		"parts": [
			{ "type": "sphere", "radius": 0.2,
			  "color": Color(1.0, 0.84, 0.0), "emissive": Color(1.5, 1.0, 0.0), "ei": 2.5,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
		]
	},
	"bomb": {
		"parts": [
			{ "type": "sphere", "radius": 0.18,
			  "color": Color(0.7, 0.0, 1.0), "emissive": Color(1.0, 0.0, 2.0), "ei": 2.5,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			{ "type": "torus", "inner_radius": 0.2, "outer_radius": 0.28,
			  "color": Color(0.5, 0.0, 0.8), "emissive": Color(1.0, 0.0, 1.5), "ei": 2.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
		]
	},
}

# Build a MeshInstance3D from a parts array (from ENTITIES or PICKUPS)
static func build_mesh(parts: Array, scale_factor: float = 1.0) -> Node3D:
	var root := Node3D.new()
	for part in parts:
		var mesh_inst := MeshInstance3D.new()
		var mesh: Mesh
		match part.get("type", "box"):
			"box":
				var bm := BoxMesh.new()
				bm.size = part.get("size", Vector3.ONE) * scale_factor
				mesh = bm
			"sphere":
				var sm := SphereMesh.new()
				sm.radius = part.get("radius", 0.3) * scale_factor
				sm.height = sm.radius * 2.0
				mesh = sm
			"cylinder":
				var cm := CylinderMesh.new()
				cm.top_radius = part.get("radius_top", 0.1) * scale_factor
				cm.bottom_radius = part.get("radius_bottom", 0.3) * scale_factor
				cm.height = part.get("height", 1.0) * scale_factor
				mesh = cm
			"torus":
				var tm := TorusMesh.new()
				tm.inner_radius = part.get("inner_radius", 0.2) * scale_factor
				tm.outer_radius = part.get("outer_radius", 0.3) * scale_factor
				mesh = tm
		mesh_inst.mesh = mesh
		var mat := StandardMaterial3D.new()
		mat.albedo_color = part.get("color", Color.WHITE)
		mat.emission_enabled = true
		mat.emission = part.get("emissive", Color.BLACK)
		mat.emission_energy_multiplier = part.get("ei", 1.0)
		mat.roughness = 0.4
		mat.metallic = 0.3
		mesh_inst.material_override = mat
		mesh_inst.position = part.get("pos", Vector3.ZERO)
		var rot_deg: Vector3 = part.get("rot", Vector3.ZERO)
		mesh_inst.rotation_degrees = rot_deg
		root.add_child(mesh_inst)
	return root

# Build a bullet MeshInstance3D from BULLETS dict
static func build_bullet(tier_key: String) -> MeshInstance3D:
	var spec: Dictionary = BULLETS.get(tier_key, BULLETS["T1"])
	var mesh_inst := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = spec["size"]
	mesh_inst.mesh = bm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = spec["color"]
	mat.emission_enabled = true
	mat.emission = spec["emissive"]
	mat.emission_energy_multiplier = spec["ei"]
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.no_depth_test = false
	mesh_inst.material_override = mat
	return mesh_inst
