extends Node3D

const GeoManifestScript := preload("res://scripts/GeoManifest.gd")

signal fired(direction: Vector3, tier: int, pos: Vector3)
signal bomb_used()
signal weapon_tier_changed(tier: int)

const SPEED := 8.0
const BOUNDS_X     :=  3.2
const BOUNDS_Y_MIN := -1.2
const BOUNDS_Y_MAX :=  1.2

const WEAPON_TIERS := [
	{ "name": "SINGLE",   "fire_rate": 9.0, "pierce": false, "seeker": 0 },
	{ "name": "DUAL",     "fire_rate": 9.0, "pierce": false, "seeker": 0 },
	{ "name": "SPREAD",   "fire_rate": 9.0, "pierce": false, "seeker": 0 },
	{ "name": "PIERCING", "fire_rate": 9.0, "pierce": true,  "seeker": 0 },
	{ "name": "BARRAGE",  "fire_rate": 9.0, "pierce": false, "seeker": 0 },
	{ "name": "SEEKER",   "fire_rate": 7.0, "pierce": true,  "seeker": 3 },
	{ "name": "HYBRID",   "fire_rate": 9.0, "pierce": true,  "seeker": 2 },
]

var weapon_tier := 0          # current active tier (0-indexed)
var max_tier := 0             # highest unlocked tier
var lives := 3
var invincible := false
var god_mode := false
var _invincible_timer := 0.0
var _fire_timer := 0.0
var _blink_timer := 0.0
var _mesh_root: Node3D
var _engine_glow: StandardMaterial3D = null
var _thrust_timer := 0.0

func _ready() -> void:
	_mesh_root = GeoManifestScript.build_mesh(GeoManifestScript.ENTITIES["player"]["parts"] as Array)
	add_child(_mesh_root)
	# Last part in player manifest is the engine glow sphere — grab its material
	var children := _mesh_root.get_children()
	if children.size() > 0:
		var last: MeshInstance3D = children[children.size() - 1]
		if last is MeshInstance3D:
			_engine_glow = last.material_override

func _process(delta: float) -> void:
	_handle_movement(delta)
	_handle_fire(delta)
	_handle_invincibility(delta)
	_handle_thrust(delta)

func _handle_movement(delta: float) -> void:
	var dir := Vector3.ZERO
	if Input.is_action_pressed("move_left"):  dir.x -= 1
	if Input.is_action_pressed("move_right"): dir.x += 1
	if Input.is_action_pressed("move_up"):    dir.y += 1
	if Input.is_action_pressed("move_down"):  dir.y -= 1
	if dir.length_squared() > 0:
		dir = dir.normalized()
	position += dir * SPEED * delta
	position.x = clamp(position.x, -BOUNDS_X, BOUNDS_X)
	position.y = clamp(position.y, BOUNDS_Y_MIN, BOUNDS_Y_MAX)
	_mesh_root.rotation.z = lerp(_mesh_root.rotation.z, -dir.x * 0.35, delta * 8.0)
	_mesh_root.rotation.x = lerp(_mesh_root.rotation.x,  dir.y * 0.20, delta * 8.0)

func _handle_fire(delta: float) -> void:
	_fire_timer -= delta
	if _fire_timer <= 0:
		var tier_data: Dictionary = WEAPON_TIERS[weapon_tier]
		_fire_timer = 1.0 / tier_data["fire_rate"]
		_emit_shots(weapon_tier)

func _emit_shots(tier: int) -> void:
	match tier:
		0: # SINGLE
			fired.emit(Vector3(0, 0, -1), tier, position)
		1: # DUAL
			fired.emit(Vector3(-0.07, 0, -1).normalized(), tier, position + Vector3(-0.15, 0, 0))
			fired.emit(Vector3( 0.07, 0, -1).normalized(), tier, position + Vector3( 0.15, 0, 0))
		2: # SPREAD
			fired.emit(Vector3(0, 0, -1), tier, position)
			fired.emit(Vector3(-0.25, 0, -1).normalized(), tier, position)
			fired.emit(Vector3( 0.25, 0, -1).normalized(), tier, position)
		3: # PIERCING
			fired.emit(Vector3(0, 0, -1), tier, position)
			fired.emit(Vector3(-0.14, 0, -1).normalized(), tier, position)
			fired.emit(Vector3( 0.14, 0, -1).normalized(), tier, position)
		4: # BARRAGE
			fired.emit(Vector3(-0.32, 0, -1).normalized(), tier, position)
			fired.emit(Vector3(-0.10, 0, -1).normalized(), tier, position)
			fired.emit(Vector3( 0.10, 0, -1).normalized(), tier, position)
			fired.emit(Vector3( 0.32, 0, -1).normalized(), tier, position)
		5: # SEEKER — center pierce + 3 seekers via signal data
			fired.emit(Vector3(0, 0, -1), tier, position)
			# seekers are spawned by Game.gd on receiving this signal
		6: # HYBRID
			fired.emit(Vector3(0, 0, -1), tier, position)
			fired.emit(Vector3(-0.32, 0, -1).normalized(), tier, position)
			fired.emit(Vector3( 0.32, 0, -1).normalized(), tier, position)

func _handle_thrust(delta: float) -> void:
	if not _engine_glow:
		return
	_thrust_timer += delta
	# Pulse engine glow: base 3.5 + sine wave + fire flash on shot
	var pulse := 3.5 + sin(_thrust_timer * 12.0) * 0.8
	_engine_glow.emission_energy_multiplier = lerpf(_engine_glow.emission_energy_multiplier, pulse, delta * 14.0)

func _handle_invincibility(delta: float) -> void:
	if invincible:
		_invincible_timer -= delta
		_blink_timer -= delta
		if _blink_timer <= 0:
			_blink_timer = 0.1
			visible = !visible
		if _invincible_timer <= 0:
			invincible = false
			visible = true

func take_hit() -> void:
	if invincible or god_mode:
		return
	lives -= 1
	weapon_tier = 0
	weapon_tier_changed.emit(weapon_tier)
	invincible = true
	_invincible_timer = 1.6
	_blink_timer = 0.1
	visible = true

func collect_weapon() -> void:
	max_tier = min(max_tier + 1, WEAPON_TIERS.size() - 1)
	weapon_tier = max_tier
	weapon_tier_changed.emit(weapon_tier)

func collect_bomb() -> void:
	pass  # handled by Game.gd via signal

func get_tier_name() -> String:
	return WEAPON_TIERS[weapon_tier]["name"]

func is_piercing() -> bool:
	return WEAPON_TIERS[weapon_tier]["pierce"]
