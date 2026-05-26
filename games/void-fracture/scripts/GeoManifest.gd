class_name GeoManifest
extends Node

# Central geometry manifest — all 3D entity definitions.
# Each entry describes how to build a mesh from primitives.
# edit this, not the scene files, to tweak ship shapes/colors.

const ENTITIES := {
	"player": {
		"parts": [
			# === FUSELAGE ===
			{ "type": "box", "size": Vector3(0.24, 0.08, 0.88),
			  "color": Color(0.45, 0.8, 0.95), "emissive": Color(0.0, 0.3, 0.5), "ei": 0.4,
			  "pos": Vector3(0, 0, -0.02), "rot": Vector3(0, 0, 0) },
			# Nose cone — rot(-90,0,0): local +Y→world -Z, tip(radius_top=0) faces -Z (forward)
			{ "type": "cylinder", "radius_top": 0.0, "radius_bottom": 0.10, "height": 0.26,
			  "color": Color(0.45, 0.8, 0.95), "emissive": Color(0.0, 0.2, 0.4), "ei": 0.3,
			  "pos": Vector3(0, 0, -0.59), "rot": Vector3(-90, 0, 0) },
			# === LEFT WING — two-box delta sweep ===
			{ "type": "box", "size": Vector3(0.40, 0.024, 0.55),
			  "color": Color(0.38, 0.70, 0.90), "emissive": Color(0.0, 0.15, 0.3), "ei": 0.2,
			  "pos": Vector3(-0.30, -0.010, 0.04), "rot": Vector3(0, 24, 0) },
			{ "type": "box", "size": Vector3(0.26, 0.018, 0.26),
			  "color": Color(0.35, 0.65, 0.85), "emissive": Color(0.0, 0.12, 0.25), "ei": 0.15,
			  "pos": Vector3(-0.62, -0.014, 0.20), "rot": Vector3(0, 44, 0) },
			# === RIGHT WING ===
			{ "type": "box", "size": Vector3(0.40, 0.024, 0.55),
			  "color": Color(0.38, 0.70, 0.90), "emissive": Color(0.0, 0.15, 0.3), "ei": 0.2,
			  "pos": Vector3(0.30, -0.010, 0.04), "rot": Vector3(0, -24, 0) },
			{ "type": "box", "size": Vector3(0.26, 0.018, 0.26),
			  "color": Color(0.35, 0.65, 0.85), "emissive": Color(0.0, 0.12, 0.25), "ei": 0.15,
			  "pos": Vector3(0.62, -0.014, 0.20), "rot": Vector3(0, -44, 0) },
			# === TAIL ===
			# Left horizontal stabilizer
			{ "type": "box", "size": Vector3(0.20, 0.018, 0.14),
			  "color": Color(0.35, 0.65, 0.85), "emissive": Color(0.0, 0.1, 0.2), "ei": 0.15,
			  "pos": Vector3(-0.21, 0.0, 0.44), "rot": Vector3(0, 10, 0) },
			# Right horizontal stabilizer
			{ "type": "box", "size": Vector3(0.20, 0.018, 0.14),
			  "color": Color(0.35, 0.65, 0.85), "emissive": Color(0.0, 0.1, 0.2), "ei": 0.15,
			  "pos": Vector3(0.21, 0.0, 0.44), "rot": Vector3(0, -10, 0) },
			# Left canted vertical tail (15° outward)
			{ "type": "box", "size": Vector3(0.028, 0.22, 0.18),
			  "color": Color(0.4, 0.72, 0.9), "emissive": Color(0.0, 0.15, 0.3), "ei": 0.3,
			  "pos": Vector3(-0.16, 0.11, 0.36), "rot": Vector3(0, 0, -15) },
			# Right canted vertical tail
			{ "type": "box", "size": Vector3(0.028, 0.22, 0.18),
			  "color": Color(0.4, 0.72, 0.9), "emissive": Color(0.0, 0.15, 0.3), "ei": 0.3,
			  "pos": Vector3(0.16, 0.11, 0.36), "rot": Vector3(0, 0, 15) },
			# === DETAILS ===
			# Left DSI intake
			{ "type": "box", "size": Vector3(0.09, 0.06, 0.28),
			  "color": Color(0.3, 0.58, 0.78), "emissive": Color(0.0, 0.12, 0.25), "ei": 0.3,
			  "pos": Vector3(-0.14, -0.04, -0.12), "rot": Vector3(0, 0, 0) },
			# Right DSI intake
			{ "type": "box", "size": Vector3(0.09, 0.06, 0.28),
			  "color": Color(0.3, 0.58, 0.78), "emissive": Color(0.0, 0.12, 0.25), "ei": 0.3,
			  "pos": Vector3(0.14, -0.04, -0.12), "rot": Vector3(0, 0, 0) },
			# Canopy
			{ "type": "sphere", "radius": 0.065,
			  "color": Color(0.55, 0.88, 1.0), "emissive": Color(0.2, 0.6, 1.0), "ei": 1.2,
			  "pos": Vector3(0, 0.075, -0.26), "rot": Vector3(0, 0, 0) },
			# Engine glow — MUST BE LAST (Player.gd grabs last child)
			{ "type": "sphere", "radius": 0.090,
			  "color": Color(0.0, 0.7, 1.0), "emissive": Color(0.0, 1.2, 2.0), "ei": 3.5,
			  "pos": Vector3(0, 0, 0.47), "rot": Vector3(0, 0, 0) },
		]
	},
	"scout": {
		"parts": [
			# Fuselage cone — rot(90,0,0): local +Y→world +Z, tip(radius_top=0) faces +Z (toward player)
			{ "type": "cylinder", "radius_top": 0.0, "radius_bottom": 0.12, "height": 0.65,
			  "color": Color(1.0, 0.18, 0.37), "emissive": Color(0.8, 0.0, 0.15), "ei": 0.8,
			  "pos": Vector3(0, 0, 0.0), "rot": Vector3(90, 0, 0) },
			# Left swept wing
			{ "type": "box", "size": Vector3(0.46, 0.030, 0.40),
			  "color": Color(0.85, 0.1, 0.22), "emissive": Color(0.5, 0.0, 0.08), "ei": 0.4,
			  "pos": Vector3(-0.25, 0.0, -0.06), "rot": Vector3(0, 22, 0) },
			# Right swept wing
			{ "type": "box", "size": Vector3(0.46, 0.030, 0.40),
			  "color": Color(0.85, 0.1, 0.22), "emissive": Color(0.5, 0.0, 0.08), "ei": 0.4,
			  "pos": Vector3(0.25, 0.0, -0.06), "rot": Vector3(0, -22, 0) },
			# Engine glow at rear (-Z = away from player)
			{ "type": "sphere", "radius": 0.07,
			  "color": Color(1.0, 0.4, 0.5), "emissive": Color(2.0, 0.0, 0.3), "ei": 3.0,
			  "pos": Vector3(0, 0, -0.36), "rot": Vector3(0, 0, 0) },
		]
	},
	"bomber": {
		"parts": [
			# Heavy fuselage
			{ "type": "box", "size": Vector3(0.55, 0.22, 0.88),
			  "color": Color(0.54, 0.19, 1.0), "emissive": Color(0.2, 0.0, 0.5), "ei": 0.6,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Left swept wing
			{ "type": "box", "size": Vector3(0.50, 0.06, 0.36),
			  "color": Color(0.4, 0.1, 0.8), "emissive": Color(0.15, 0.0, 0.4), "ei": 0.5,
			  "pos": Vector3(-0.52, -0.05, 0.10), "rot": Vector3(0, 20, 0) },
			# Right swept wing
			{ "type": "box", "size": Vector3(0.50, 0.06, 0.36),
			  "color": Color(0.4, 0.1, 0.8), "emissive": Color(0.15, 0.0, 0.4), "ei": 0.5,
			  "pos": Vector3(0.52, -0.05, 0.10), "rot": Vector3(0, -20, 0) },
			# Left weapon pod — barrel faces player (+Z), rot(90,0,0): +Y→+Z, small end faces +Z
			{ "type": "cylinder", "radius_top": 0.055, "radius_bottom": 0.11, "height": 0.32,
			  "color": Color(0.7, 0.3, 1.0), "emissive": Color(0.4, 0.0, 0.8), "ei": 1.4,
			  "pos": Vector3(-0.44, -0.10, 0.16), "rot": Vector3(90, 0, 0) },
			# Right weapon pod
			{ "type": "cylinder", "radius_top": 0.055, "radius_bottom": 0.11, "height": 0.32,
			  "color": Color(0.7, 0.3, 1.0), "emissive": Color(0.4, 0.0, 0.8), "ei": 1.4,
			  "pos": Vector3(0.44, -0.10, 0.16), "rot": Vector3(90, 0, 0) },
		]
	},
	"drone": {
		"parts": [
			# Core orb
			{ "type": "sphere", "radius": 0.26,
			  "color": Color(0.0, 1.0, 0.6), "emissive": Color(0.0, 0.5, 0.2), "ei": 0.8,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Horizontal ring (XZ plane)
			{ "type": "torus", "inner_radius": 0.30, "outer_radius": 0.44,
			  "color": Color(0.0, 0.8, 0.4), "emissive": Color(0.0, 0.6, 0.2), "ei": 1.2,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Diagonal ring (45° tilt — gives gyroscope read from any angle)
			{ "type": "torus", "inner_radius": 0.30, "outer_radius": 0.44,
			  "color": Color(0.0, 0.6, 0.3), "emissive": Color(0.0, 0.4, 0.15), "ei": 0.9,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(45, 0, 0) },
		]
	},
	"elite_overlay": {
		"parts": [
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
			# Outer orbital ring (XZ plane)
			{ "type": "torus", "inner_radius": 1.10, "outer_radius": 1.40,
			  "color": Color(0.0, 0.5, 1.0), "emissive": Color(0.0, 0.75, 1.0), "ei": 2.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Tilted inner ring
			{ "type": "torus", "inner_radius": 0.80, "outer_radius": 1.05,
			  "color": Color(0.2, 0.4, 1.0), "emissive": Color(0.0, 0.6, 1.0), "ei": 1.8,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(60, 0, 0) },
			# Horizontal cross-arm
			{ "type": "box", "size": Vector3(2.8, 0.10, 0.16),
			  "color": Color(0.0, 0.5, 0.9), "emissive": Color(0.0, 0.6, 1.0), "ei": 1.2,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Fore-aft cross-arm
			{ "type": "box", "size": Vector3(0.16, 0.10, 2.8),
			  "color": Color(0.0, 0.5, 0.9), "emissive": Color(0.0, 0.6, 1.0), "ei": 1.2,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Core emitter glow
			{ "type": "sphere", "radius": 0.35,
			  "color": Color(0.5, 0.9, 1.0), "emissive": Color(0.0, 1.5, 2.5), "ei": 4.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
		]
	},
	"interceptor_boss": {
		"parts": [
			# Main fuselage — long fighter body
			{ "type": "box", "size": Vector3(0.42, 0.26, 2.6),
			  "color": Color(1.0, 0.45, 0.0), "emissive": Color(0.8, 0.2, 0.0), "ei": 1.0,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Left inner wing
			{ "type": "box", "size": Vector3(0.75, 0.06, 0.80),
			  "color": Color(0.85, 0.35, 0.0), "emissive": Color(0.6, 0.15, 0.0), "ei": 0.8,
			  "pos": Vector3(-0.58, -0.02, 0.25), "rot": Vector3(0, -15, 0) },
			# Left outer wing tip
			{ "type": "box", "size": Vector3(0.60, 0.04, 0.45),
			  "color": Color(0.75, 0.28, 0.0), "emissive": Color(0.5, 0.1, 0.0), "ei": 0.6,
			  "pos": Vector3(-1.25, -0.03, 0.42), "rot": Vector3(0, -28, 0) },
			# Right inner wing
			{ "type": "box", "size": Vector3(0.75, 0.06, 0.80),
			  "color": Color(0.85, 0.35, 0.0), "emissive": Color(0.6, 0.15, 0.0), "ei": 0.8,
			  "pos": Vector3(0.58, -0.02, 0.25), "rot": Vector3(0, 15, 0) },
			# Right outer wing tip
			{ "type": "box", "size": Vector3(0.60, 0.04, 0.45),
			  "color": Color(0.75, 0.28, 0.0), "emissive": Color(0.5, 0.1, 0.0), "ei": 0.6,
			  "pos": Vector3(1.25, -0.03, 0.42), "rot": Vector3(0, 28, 0) },
			# Nose cone (faces -Z = forward for this boss), rot(-90): tip at -Z
			{ "type": "cylinder", "radius_top": 0.0, "radius_bottom": 0.16, "height": 0.55,
			  "color": Color(1.0, 0.6, 0.0), "emissive": Color(1.0, 0.8, 0.0), "ei": 2.0,
			  "pos": Vector3(0, 0, -1.55), "rot": Vector3(-90, 0, 0) },
			# Left canted tail fin
			{ "type": "box", "size": Vector3(0.04, 0.38, 0.45),
			  "color": Color(1.0, 0.5, 0.0), "emissive": Color(0.8, 0.3, 0.0), "ei": 1.0,
			  "pos": Vector3(-0.22, 0.18, 0.90), "rot": Vector3(0, 0, -18) },
			# Right canted tail fin
			{ "type": "box", "size": Vector3(0.04, 0.38, 0.45),
			  "color": Color(1.0, 0.5, 0.0), "emissive": Color(0.8, 0.3, 0.0), "ei": 1.0,
			  "pos": Vector3(0.22, 0.18, 0.90), "rot": Vector3(0, 0, 18) },
			# Left engine glow
			{ "type": "sphere", "radius": 0.18,
			  "color": Color(1.0, 0.3, 0.0), "emissive": Color(2.0, 0.6, 0.0), "ei": 3.5,
			  "pos": Vector3(-0.18, 0, 1.35), "rot": Vector3(0, 0, 0) },
			# Right engine glow
			{ "type": "sphere", "radius": 0.18,
			  "color": Color(1.0, 0.3, 0.0), "emissive": Color(2.0, 0.6, 0.0), "ei": 3.5,
			  "pos": Vector3(0.18, 0, 1.35), "rot": Vector3(0, 0, 0) },
		]
	},
	"colossus_boss": {
		"parts": [
			# Main hull
			{ "type": "box", "size": Vector3(2.8, 0.7, 1.8),
			  "color": Color(0.5, 0.0, 0.8), "emissive": Color(0.3, 0.0, 0.5), "ei": 0.8,
			  "pos": Vector3(0, 0, 0), "rot": Vector3(0, 0, 0) },
			# Left shoulder block
			{ "type": "box", "size": Vector3(0.75, 0.65, 1.1),
			  "color": Color(0.4, 0.0, 0.7), "emissive": Color(0.2, 0.0, 0.4), "ei": 0.6,
			  "pos": Vector3(-1.78, 0.10, 0), "rot": Vector3(0, 0, 0) },
			# Right shoulder block
			{ "type": "box", "size": Vector3(0.75, 0.65, 1.1),
			  "color": Color(0.4, 0.0, 0.7), "emissive": Color(0.2, 0.0, 0.4), "ei": 0.6,
			  "pos": Vector3(1.78, 0.10, 0), "rot": Vector3(0, 0, 0) },
			# Command tower
			{ "type": "box", "size": Vector3(0.65, 0.90, 0.65),
			  "color": Color(0.6, 0.0, 1.0), "emissive": Color(0.4, 0.0, 0.8), "ei": 1.5,
			  "pos": Vector3(0, 0.80, -0.2), "rot": Vector3(0, 0, 0) },
			# Forward cannon barrel (faces -Z = toward player since they're in front)
			{ "type": "cylinder", "radius_top": 0.06, "radius_bottom": 0.10, "height": 0.85,
			  "color": Color(0.35, 0.0, 0.6), "emissive": Color(0.2, 0.0, 0.4), "ei": 0.5,
			  "pos": Vector3(0, 0, -1.30), "rot": Vector3(90, 0, 0) },
			# Left broadside cannon
			{ "type": "cylinder", "radius_top": 0.05, "radius_bottom": 0.08, "height": 0.60,
			  "color": Color(0.35, 0.0, 0.6), "emissive": Color(0.2, 0.0, 0.4), "ei": 0.5,
			  "pos": Vector3(-1.78, 0.10, -0.60), "rot": Vector3(0, 0, 90) },
			# Right broadside cannon
			{ "type": "cylinder", "radius_top": 0.05, "radius_bottom": 0.08, "height": 0.60,
			  "color": Color(0.35, 0.0, 0.6), "emissive": Color(0.2, 0.0, 0.4), "ei": 0.5,
			  "pos": Vector3(1.78, 0.10, -0.60), "rot": Vector3(0, 0, 90) },
			# Left core emitter
			{ "type": "sphere", "radius": 0.24,
			  "color": Color(0.8, 0.0, 1.0), "emissive": Color(1.5, 0.0, 2.5), "ei": 3.5,
			  "pos": Vector3(-0.85, 0, 0), "rot": Vector3(0, 0, 0) },
			# Right core emitter
			{ "type": "sphere", "radius": 0.24,
			  "color": Color(0.8, 0.0, 1.0), "emissive": Color(1.5, 0.0, 2.5), "ei": 3.5,
			  "pos": Vector3(0.85, 0, 0), "rot": Vector3(0, 0, 0) },
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
