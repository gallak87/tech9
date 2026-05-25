class_name Boss
extends Node3D

const GeoManifestScript := preload("res://scripts/GeoManifest.gd")

enum BossType { SENTINEL, INTERCEPTOR, COLOSSUS }

signal died(pos: Vector3, score: int)
signal phase_changed(phase: int)
signal fired_bullet(pos: Vector3, direction: Vector3, fast: bool)

const BASE_HP      := [160, 120, 200]
const BASE_SCORE   := [15000, 18000, 25000]
const PHASE_COLORS := [
	[Color(0.0, 0.75, 1.0),  Color(1.0, 0.3, 0.2),   Color(0.8, 0.0, 1.0)],  # SENTINEL
	[Color(1.0, 0.42, 0.0),  Color(1.0, 0.8, 0.0),   Color(1.0, 0.15, 0.5)], # INTERCEPTOR
	[Color(0.8, 0.0, 1.0),   Color(0.5, 0.0, 1.0),   Color(1.0, 0.0, 0.8)],  # COLOSSUS
]

var boss_type: int = BossType.SENTINEL
var cycle: int = 0
var max_hp: int = 160
var hp: int = 160
var phase: int = 0  # 0, 1, 2
var score_value: int = 15000

var _age := 0.0
var _fire_timer := 0.0
var _move_timer := 0.0
var _entry_done := false
var _entry_target_z := -12.0
var _dash_target := Vector3.ZERO
var _mesh_root: Node3D
var _transitioning := false

func _ready() -> void:
	add_to_group("boss")
	_build_mesh()

func setup(p_type: int, p_cycle: int) -> void:
	boss_type = p_type
	cycle = p_cycle
	max_hp = BASE_HP[p_type] + 40 * p_cycle
	hp = max_hp
	score_value = BASE_SCORE[p_type] + 5000 * p_cycle

func _build_mesh() -> void:
	if _mesh_root:
		_mesh_root.queue_free()
	var key := _mesh_key()
	if GeoManifestScript.ENTITIES.has(key):
		_mesh_root = GeoManifestScript.build_mesh(GeoManifestScript.ENTITIES[key]["parts"] as Array)
	else:
		_mesh_root = _build_fallback()
	add_child(_mesh_root)

func _mesh_key() -> String:
	match boss_type:
		BossType.SENTINEL:    return "sentinel_boss"
		BossType.INTERCEPTOR: return "interceptor_boss"
		BossType.COLOSSUS:    return "colossus_boss"
	return "sentinel_boss"

func _build_fallback() -> Node3D:
	# Generic boss mesh if manifest entry missing
	var root := Node3D.new()
	var parts: Array = [
		{ "type": "sphere", "radius": 1.2,
		  "color": PHASE_COLORS[boss_type][0], "emissive": PHASE_COLORS[boss_type][0],
		  "ei": 1.5, "pos": Vector3.ZERO, "rot": Vector3.ZERO },
		{ "type": "torus", "inner_radius": 1.3, "outer_radius": 1.6,
		  "color": PHASE_COLORS[boss_type][0], "emissive": PHASE_COLORS[boss_type][0],
		  "ei": 2.0, "pos": Vector3.ZERO, "rot": Vector3.ZERO },
		{ "type": "box", "size": Vector3(2.4, 0.12, 1.0),
		  "color": PHASE_COLORS[boss_type][0], "emissive": PHASE_COLORS[boss_type][0],
		  "ei": 0.8, "pos": Vector3.ZERO, "rot": Vector3.ZERO },
	]
	return GeoManifestScript.build_mesh(parts)

func _process(delta: float) -> void:
	_age += delta

	# Entry slide-in
	if not _entry_done:
		position.z = move_toward(position.z, _entry_target_z, 8.0 * delta)
		if abs(position.z - _entry_target_z) < 0.05:
			_entry_done = true
		return

	if _transitioning:
		return

	_mesh_root.rotate_y(delta * 0.4)

	match boss_type:
		BossType.SENTINEL:    _update_sentinel(delta)
		BossType.INTERCEPTOR: _update_interceptor(delta)
		BossType.COLOSSUS:    _update_colossus(delta)

	_check_phase_transition()

# --- Boss movement & attack patterns ---

func _update_sentinel(delta: float) -> void:
	# Drift left/right sinusoidally
	position.x = sin(_age * 0.6) * 3.0
	_fire_timer -= delta
	if _fire_timer <= 0:
		match phase:
			0: _fire_timer = 1.4;  _fire_spread(8,  0.28)
			1: _fire_timer = 1.0;  _fire_spread(12, 0.30); _fire_aimed()
			2: _fire_timer = 0.7;  _fire_spread(16, 0.32); _fire_aimed(); _fire_ring(6)

func _update_interceptor(delta: float) -> void:
	# Dash between fixed positions
	_move_timer -= delta
	if _move_timer <= 0:
		var targets: Array[Vector3] = [
			Vector3(-3, 0, -12), Vector3(3, 0, -12),
			Vector3(0, 0, -14),  Vector3(-2, 0, -10),
			Vector3(2, 0, -10)
		]
		_dash_target = targets[randi() % targets.size()]
		var wait_times := [0.5, 0.8, 1.2, 0.6]
		match phase:
			0: _move_timer = wait_times[randi() % 3 + 1]
			1: _move_timer = wait_times[randi() % 2 + 1]
			2: _move_timer = wait_times[0]
	position = position.move_toward(_dash_target, (8.0 + phase * 4.0) * delta)
	_fire_timer -= delta
	if _fire_timer <= 0:
		match phase:
			0: _fire_timer = 1.2; _fire_aimed(); _fire_aimed_offset(0.3)
			1: _fire_timer = 0.9; _fire_aimed(); _fire_spread(6, 0.25)
			2: _fire_timer = 0.6; _fire_aimed(); _fire_spread(8, 0.28); _fire_ring(4)

func _update_colossus(delta: float) -> void:
	# Slow drift, barely moves
	position.x = sin(_age * 0.3) * 1.5
	position.z = -14.0
	_fire_timer -= delta
	if _fire_timer <= 0:
		match phase:
			0: _fire_timer = 1.8; _fire_ring(12)
			1: _fire_timer = 1.2; _fire_ring(16); _fire_aimed()
			2: _fire_timer = 0.8; _fire_ring(20); _fire_aimed(); _fire_spiral(8)

# --- Fire helpers ---

func _fire_spread(count: int, spread: float) -> void:
	for i in count:
		var angle := (float(i) / float(count)) * TAU
		var dir := Vector3(cos(angle) * spread, 0, sin(angle) * spread + 1.0).normalized()
		fired_bullet.emit(global_position, dir, false)

func _fire_aimed() -> void:
	var player := _find_player()
	if not player:
		return
	var dir := (player.global_position - global_position).normalized()
	fired_bullet.emit(global_position, dir, true)
	fired_bullet.emit(global_position, (dir + Vector3(0.15, 0, 0)).normalized(), false)
	fired_bullet.emit(global_position, (dir - Vector3(0.15, 0, 0)).normalized(), false)

func _fire_aimed_offset(offset: float) -> void:
	var player := _find_player()
	if not player:
		return
	var dir := (player.global_position - global_position).normalized()
	fired_bullet.emit(global_position + Vector3(offset, 0, 0), dir, false)
	fired_bullet.emit(global_position - Vector3(offset, 0, 0), dir, false)

func _fire_ring(count: int) -> void:
	for i in count:
		var angle := (float(i) / float(count)) * TAU
		var dir := Vector3(cos(angle), 0, sin(angle)).normalized()
		fired_bullet.emit(global_position, dir, false)

func _fire_spiral(count: int) -> void:
	for i in count:
		var angle := (float(i) / float(count)) * TAU + _age * 2.0
		var dir := Vector3(cos(angle), 0, sin(angle)).normalized()
		fired_bullet.emit(global_position, dir, false)

# --- Phase transitions ---

func _check_phase_transition() -> void:
	var hp_pct := float(hp) / float(max_hp)
	var new_phase := 0
	if hp_pct <= 0.33:
		new_phase = 2
	elif hp_pct <= 0.66:
		new_phase = 1
	if new_phase > phase:
		_do_phase_transition(new_phase)

func _do_phase_transition(new_phase: int) -> void:
	_transitioning = true
	phase = new_phase
	phase_changed.emit(phase)
	await get_tree().create_timer(1.2).timeout
	_update_emissive_color()
	_fire_timer = 0.5
	_transitioning = false

func _update_emissive_color() -> void:
	var color: Color = PHASE_COLORS[boss_type][phase]
	for child in _mesh_root.get_children():
		if child is MeshInstance3D:
			var mat: StandardMaterial3D = child.material_override
			if mat:
				mat.emission = color
				mat.emission_energy_multiplier = 2.0 + phase * 0.8

# --- Damage ---

func take_damage(dmg: int) -> void:
	hp -= dmg
	if hp <= 0:
		hp = 0
		_die()

func take_bomb_damage() -> void:
	take_damage(int(max_hp * 0.10))

func get_hp_pct() -> float:
	return float(hp) / float(max_hp)

func _die() -> void:
	remove_from_group("boss")
	died.emit(global_position, score_value)
	queue_free()

func _find_player() -> Node3D:
	var players := get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		return players[0]
	return null
