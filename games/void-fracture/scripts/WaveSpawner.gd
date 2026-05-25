extends Node

const EnemyScript := preload("res://scripts/Enemy.gd")

# Seeded wave generator — mulberry32 port, same as void-sentinel
# Deterministic: wave N always produces the same formation set

signal spawn_enemy(type: int, pos: Vector3, hp: int, speed: float, score: int, elite: bool, entry_target: Vector3)
signal wave_complete()
signal boss_wave(wave_num: int, cycle: int)

var current_wave := 0
var _spawn_queue: Array = []
var _spawn_timer := 0.0
var _enemies_alive := 0
var _active := false
var _world_speed := 2.0

func _ready() -> void:
	pass

func start_wave(wave_num: int) -> void:
	current_wave = wave_num
	_world_speed = min(2.0 + (wave_num - 1) * 0.15, 4.5)

	if wave_num % 5 == 0:
		var cycle := (wave_num / 5) - 1
		boss_wave.emit(wave_num, cycle)
		return

	_spawn_queue = _generate_wave(wave_num)
	_enemies_alive = _spawn_queue.size()
	_active = true

func _process(delta: float) -> void:
	if not _active or _spawn_queue.is_empty():
		return
	_spawn_timer -= delta
	if _spawn_timer <= 0 and _spawn_queue.size() > 0:
		var entry: Dictionary = _spawn_queue.pop_front()
		_spawn_timer = entry.get("delay", 0.4)
		_do_spawn(entry)

func _do_spawn(entry: Dictionary) -> void:
	spawn_enemy.emit(
		entry["type"],
		entry["pos"],
		entry["hp"],
		entry["speed"],
		entry["score"],
		entry.get("elite", false),
		entry.get("entry_target", Vector3.ZERO)
	)

func on_enemy_died() -> void:
	_enemies_alive -= 1
	if _enemies_alive <= 0 and _spawn_queue.is_empty():
		_active = false
		await get_tree().create_timer(1.2).timeout
		wave_complete.emit()

# --- Wave generation (seeded RNG) ---

func _generate_wave(wave_num: int) -> Array:
	var rng := _make_rng(wave_num * 9973 + 17)
	var difficulty: float = minf(1.0 + (wave_num - 1) * 0.22, 4.5)
	var is_elite_wave := (wave_num % 3 == 0)
	var formation_count := 2 + _rng_int(rng, 0, 2) + int((wave_num - 1) / 2)
	formation_count = min(formation_count, 6)

	var queue: Array = []
	var t := 0.0

	for _i in formation_count:
		var f_type := _rng_int(rng, 0, 5)
		var formation: Array = _make_formation(f_type, rng, difficulty, is_elite_wave, t)
		queue.append_array(formation)
		t += 1.8 + _rng_float(rng) * 1.5

	return queue

func _make_formation(f_type: int, rng: Array, difficulty: float, elite_wave: bool, base_t: float) -> Array:
	var entries: Array = []
	match f_type:
		0: # LINE — scouts horizontal
			var count := 4 + int(difficulty * 0.5)
			for i in count:
				var x: float = lerpf(-4.0, 4.0, float(i) / float(count - 1))
				entries.append(_scout_entry(Vector3(x, 0, -30), base_t + i * 0.18, elite_wave))
		1: # V FORMATION
			var positions: Array[Vector3] = [Vector3(0,0,-30), Vector3(-1.2,0,-28.5), Vector3(1.2,0,-28.5),
			                  Vector3(-2.4,0,-27), Vector3(2.4,0,-27)]
			for i in positions.size():
				entries.append(_scout_entry(positions[i], base_t + i * 0.12, elite_wave))
		2: # DIAGONAL SWEEP
			for i in 4:
				var x := -4.0 + i * 2.5 if randf() > 0.5 else 4.0 - i * 2.5
				entries.append(_scout_entry(Vector3(x, 0, -28), base_t + i * 0.28, elite_wave))
		3: # BOMBER RUN
			entries.append(_bomber_entry(Vector3(-2, 0, -25), base_t))
			entries.append(_scout_entry(Vector3(-3.5, 0, -28), base_t + 0.3, elite_wave))
			entries.append(_scout_entry(Vector3(-0.5, 0, -28), base_t + 0.3, elite_wave))
		4: # DRONE SWARM
			var count := 2 + int(difficulty * 0.4)
			count = min(count, 5)
			for i in count:
				var x := randf_range(-3.5, 3.5)
				entries.append({
					"type": EnemyScript.Type.DRONE, "pos": Vector3(x, 0, -28),
					"hp": 2, "speed": 3.5, "score": 200, "elite": false,
					"entry_target": Vector3.ZERO, "delay": base_t + i * 0.45
				})
		5: # DUEL — 2 bombers + center drone
			entries.append(_bomber_entry(Vector3(-3, 0, -24), base_t))
			entries.append(_bomber_entry(Vector3( 3, 0, -24), base_t + 0.2))
			entries.append({ "type": EnemyScript.Type.DRONE, "pos": Vector3(0, 0, -26),
				"hp": 2, "speed": 4.0, "score": 200, "elite": false,
				"entry_target": Vector3.ZERO, "delay": base_t + 0.5 })
	return entries

func _scout_entry(pos: Vector3, delay: float, elite: bool) -> Dictionary:
	var is_e := elite and randf() < 0.4
	return {
		"type": EnemyScript.Type.SCOUT, "pos": pos, "hp": 2 if not is_e else 4,
		"speed": 5.5, "score": 100 if not is_e else 200,
		"elite": is_e, "entry_target": Vector3.ZERO, "delay": delay
	}

func _bomber_entry(pos: Vector3, delay: float) -> Dictionary:
	return {
		"type": EnemyScript.Type.BOMBER, "pos": pos, "hp": 6, "speed": 2.2,
		"score": 300, "elite": false,
		"entry_target": Vector3(pos.x * 0.3, 0, -8), "delay": delay
	}

# --- Mulberry32 seeded RNG (same algorithm as void-sentinel JS) ---

func _make_rng(seed: int) -> Array:
	return [seed & 0xFFFFFFFF]

func _rng_next(state: Array) -> float:
	var s: int = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
	state[0] = s
	var z: int = s
	z = ((z ^ (z >> 15)) * (z | 1)) & 0xFFFFFFFF
	z ^= z + ((z ^ (z >> 7)) * (z | 61)) & 0xFFFFFFFF
	z = (z ^ (z >> 14)) & 0xFFFFFFFF
	return float(z) / 4294967296.0

func _rng_float(state: Array) -> float:
	return _rng_next(state)

func _rng_int(state: Array, lo: int, hi: int) -> int:
	return lo + int(_rng_next(state) * (hi - lo + 1))
