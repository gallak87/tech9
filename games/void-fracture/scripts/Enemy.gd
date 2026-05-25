class_name Enemy
extends Node3D

const GeoManifestScript := preload("res://scripts/GeoManifest.gd")

enum Type { SCOUT, BOMBER, DRONE }

signal died(pos: Vector3, type: int, drop_type: String)
signal fired_bullet(pos: Vector3, direction: Vector3)

const DROP_CHANCES := {
	Type.SCOUT:  { "weapon": 0.18, "bomb": 0.00 },
	Type.BOMBER: { "weapon": 0.00, "bomb": 0.42 },
	Type.DRONE:  { "weapon": 0.28, "bomb": 0.00 },
}

var type: int = Type.SCOUT
var hp := 1
var speed := 5.0
var score_value := 100
var is_elite := false

var _age := 0.0
var _fire_timer := 0.0
var _fire_interval := 1.8
var _phase := "enter"   # bomber state machine
var _phase_timer := 0.0
var _entry_target := Vector3.ZERO
var _sine_offset := 0.0

var _mesh_root: Node3D
var _player_ref: Node3D = null

func _ready() -> void:
	add_to_group("enemies")
	var entity_key := _entity_key()
	_mesh_root = GeoManifestScript.build_mesh(GeoManifestScript.ENTITIES[entity_key]["parts"] as Array)
	add_child(_mesh_root)
	if is_elite:
		var overlay: Node3D = GeoManifestScript.build_mesh(GeoManifestScript.ENTITIES["elite_overlay"]["parts"] as Array)
		add_child(overlay)
	_sine_offset = randf() * TAU
	_fire_interval = randf_range(1.5, 2.8)
	_fire_timer = _fire_interval * randf()

func setup(p_type: int, p_hp: int, p_speed: float, p_score: int, elite: bool) -> void:
	type = p_type
	hp = p_hp
	speed = p_speed
	score_value = p_score
	is_elite = elite

func _entity_key() -> String:
	match type:
		Type.SCOUT:  return "scout"
		Type.BOMBER: return "bomber"
		Type.DRONE:  return "drone"
	return "scout"

func _process(delta: float) -> void:
	_age += delta
	_player_ref = _find_player()
	match type:
		Type.SCOUT:  _update_scout(delta)
		Type.BOMBER: _update_bomber(delta)
		Type.DRONE:  _update_drone(delta)

	# out of bounds — route through _die() so wave spawner counter stays accurate
	if position.z > 5:
		_die()

func _update_scout(delta: float) -> void:
	# sine-wave horizontal + forward drift
	position.z += speed * delta
	position.x += sin(_age * 2.5 + _sine_offset) * 2.0 * delta
	_fire_timer -= delta
	if _fire_timer <= 0 and _player_ref and position.z > -8:
		_fire_timer = _fire_interval
		var to_player := (_player_ref.global_position - global_position).normalized()
		fired_bullet.emit(global_position, to_player)
		fired_bullet.emit(global_position, (to_player + Vector3(0.15, 0, 0)).normalized())

func _update_bomber(delta: float) -> void:
	match _phase:
		"enter":
			var t := position.move_toward(_entry_target, speed * delta)
			position = t
			if position.distance_to(_entry_target) < 0.1:
				_phase = "hold"
				_phase_timer = 2.0
		"hold":
			_phase_timer -= delta
			_fire_timer -= delta
			if _fire_timer <= 0:
				_fire_timer = _fire_interval
				_fire_spread()
			if _phase_timer <= 0:
				_phase = "exit"
		"exit":
			position.z += speed * delta

func _update_drone(delta: float) -> void:
	# sweep then track
	if _age < 1.2:
		position.z += speed * delta
	else:
		if _player_ref:
			var to_p := (_player_ref.global_position - global_position)
			to_p.y = 0
			position += to_p.normalized() * speed * delta
	_fire_timer -= delta
	if _fire_timer <= 0 and position.z > -5:
		_fire_timer = _fire_interval + 0.5

func _fire_spread() -> void:
	if not _player_ref:
		return
	var to_p := (_player_ref.global_position - global_position).normalized()
	fired_bullet.emit(global_position, to_p)
	fired_bullet.emit(global_position, (to_p + Vector3( 0.35, 0, 0)).normalized())
	fired_bullet.emit(global_position, (to_p + Vector3(-0.35, 0, 0)).normalized())
	fired_bullet.emit(global_position, (to_p + Vector3( 0.18, 0, 0.18)).normalized())

func take_damage(dmg: int) -> void:
	hp -= dmg
	# flash white briefly
	_flash_hit()
	if type == Type.DRONE:
		# retaliate
		fired_bullet.emit(global_position, Vector3(0, 0, 1))
		fired_bullet.emit(global_position, Vector3( 0.3, 0, 1).normalized())
		fired_bullet.emit(global_position, Vector3(-0.3, 0, 1).normalized())
	if hp <= 0:
		_die()

func _die() -> void:
	remove_from_group("enemies")
	var drop := _roll_drop()
	died.emit(global_position, type, drop)
	queue_free()

func _roll_drop() -> String:
	if is_elite:
		return "weapon"
	var chances: Dictionary = DROP_CHANCES[type]
	var r := randf()
	if r < chances.get("weapon", 0.0):
		return "weapon"
	if r < chances.get("weapon", 0.0) + chances.get("bomb", 0.0):
		return "bomb"
	return ""

func set_entry_target(t: Vector3) -> void:
	_entry_target = t

func _flash_hit() -> void:
	# briefly lighten emissive
	for child in _mesh_root.get_children():
		if child is MeshInstance3D:
			var mat: StandardMaterial3D = child.material_override
			if mat:
				mat.emission = Color.WHITE
				mat.emission_energy_multiplier = 4.0
	await get_tree().create_timer(0.08).timeout
	# restore (re-read from manifest)
	var parts: Array = GeoManifestScript.ENTITIES[_entity_key()]["parts"] as Array
	var i := 0
	for child in _mesh_root.get_children():
		if child is MeshInstance3D and i < parts.size():
			var mat: StandardMaterial3D = child.material_override
			if mat:
				mat.emission = parts[i]["emissive"]
				mat.emission_energy_multiplier = parts[i]["ei"]
			i += 1

func _find_player() -> Node3D:
	var players := get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		return players[0]
	return null
