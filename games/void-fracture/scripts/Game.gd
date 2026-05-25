extends Node3D

const BulletScript  := preload("res://scripts/Bullet.gd")
const EnemyScript   := preload("res://scripts/Enemy.gd")
const GeoManifestScript := preload("res://scripts/GeoManifest.gd")

enum State { MENU, PLAYING, BOSS, GAME_OVER, WIN }

const BULLET_SCENE_PATH := "res://scenes/Bullet.tscn"
const ENEMY_SCENE_PATH  := "res://scenes/Enemy.tscn"

@onready var player: Node3D = $Player
@onready var camera: Camera3D = $Camera3D
@onready var wave_spawner: Node = $WaveSpawner
@onready var hud: CanvasLayer = $HUD
@onready var starfield: Node3D = $Starfield

var state: State = State.MENU
var score := 0
var hi_score := 0
var bombs := 3
var current_wave := 0
var boss_cycles_beaten := 0

var _cam_base_pos := Vector3(0, 2.5, 6)
var _cam_shake := 0.0
var _bullet_scene: PackedScene
var _enemy_scene: PackedScene

func _ready() -> void:
	_bullet_scene = load(BULLET_SCENE_PATH)
	_enemy_scene  = load(ENEMY_SCENE_PATH)
	camera.position = _cam_base_pos
	camera.look_at(Vector3(0, 0, -10), Vector3.UP)

	player.add_to_group("player")
	player.fired.connect(_on_player_fired)
	player.weapon_tier_changed.connect(_on_tier_changed)

	wave_spawner.spawn_enemy.connect(_on_spawn_enemy)
	wave_spawner.wave_complete.connect(_on_wave_complete)
	wave_spawner.boss_wave.connect(_on_boss_wave)

	_show_menu()

func _process(delta: float) -> void:
	_update_camera_shake(delta)
	if state == State.MENU and Input.is_action_just_pressed("ui_accept"):
		_start_game()
	if state == State.GAME_OVER and Input.is_action_just_pressed("ui_accept"):
		_start_game()
	if state == State.WIN and Input.is_action_just_pressed("ui_accept"):
		_start_game()
	if (state == State.PLAYING or state == State.BOSS) and Input.is_action_just_pressed("fire_bomb"):
		_use_bomb()

# --- Camera ---

func _update_camera_shake(delta: float) -> void:
	if _cam_shake > 0:
		camera.position = _cam_base_pos + Vector3(
			randf_range(-1, 1) * _cam_shake * 0.12,
			randf_range(-1, 1) * _cam_shake * 0.06,
			randf_range(-1, 1) * _cam_shake * 0.04
		)
		_cam_shake = max(0.0, _cam_shake - delta * 4.0)
	else:
		camera.position = _cam_base_pos

func _add_shake(amount: float) -> void:
	_cam_shake = min(_cam_shake + amount, 2.5)

# --- State transitions ---

func _show_menu() -> void:
	state = State.MENU
	player.visible = false
	hud.show_menu(true)

func _start_game() -> void:
	score = 0
	bombs = 3
	current_wave = 0
	boss_cycles_beaten = 0
	player.lives = 3
	player.weapon_tier = 0
	player.max_tier = 0
	player.invincible = false
	player.visible = true
	player.position = Vector3(0, 0, 1)
	hud.show_menu(false)
	hud.show_game_over(false)
	hud.update_score(score)
	hud.update_lives(player.lives)
	hud.update_wave(current_wave + 1)
	hud.update_bombs(bombs)
	hud.update_weapon_tier(0)
	_clear_field()
	state = State.PLAYING
	_next_wave()

func _next_wave() -> void:
	current_wave += 1
	hud.flash_wave(current_wave)
	hud.update_wave(current_wave)
	wave_spawner.start_wave(current_wave)

func _game_over() -> void:
	state = State.GAME_OVER
	hi_score = max(hi_score, score)
	hud.show_game_over(true, score, hi_score, current_wave)
	player.visible = false

func _win() -> void:
	state = State.WIN
	hi_score = max(hi_score, score)
	hud.show_win(score, hi_score)
	player.visible = false

func _clear_field() -> void:
	for node in get_tree().get_nodes_in_group("enemies"):
		node.queue_free()
	for node in get_tree().get_nodes_in_group("bullets"):
		node.queue_free()
	for node in get_tree().get_nodes_in_group("pickups"):
		node.queue_free()

# --- Bullet spawning ---

func _on_player_fired(direction: Vector3, tier: int, pos: Vector3) -> void:
	if state != State.PLAYING and state != State.BOSS:
		return
	var b: Node3D = _bullet_scene.instantiate()
	b.direction = direction
	b.tier_key = "T%d" % (tier + 1)
	b.piercing = player.is_piercing()
	b.position = pos
	add_child(b)
	b.add_to_group("bullets")
	b.add_to_group("player_bullets")

	# seeker extras for T6/T7
	if tier == 5:
		for _i in 3:
			_spawn_seeker(pos)
	elif tier == 6:
		for _i in 2:
			_spawn_seeker(pos)

func _spawn_seeker(origin: Vector3) -> void:
	var b: Node3D = _bullet_scene.instantiate()
	b.tier_key = "seeker"
	b.is_seeker = true
	b.speed = BulletScript.BULLET_SPEED * 0.85
	b.position = origin + Vector3(randf_range(-0.3, 0.3), 0, randf_range(-0.2, 0.2))
	add_child(b)
	b.add_to_group("bullets")
	b.add_to_group("player_bullets")

func _spawn_enemy_bullet(pos: Vector3, dir: Vector3) -> void:
	var b: Node3D = _bullet_scene.instantiate()
	b.direction = dir
	b.tier_key = "enemy"
	b.is_enemy = true
	b.speed = BulletScript.ENEMY_BULLET_SPEED
	b.position = pos
	add_child(b)
	b.add_to_group("bullets")
	b.add_to_group("enemy_bullets")

# --- Enemy spawning ---

func _on_spawn_enemy(type: int, pos: Vector3, hp: int, spd: float, sc: int, elite: bool, entry_tgt: Vector3) -> void:
	var e: Node3D = _enemy_scene.instantiate()
	e.setup(type, hp, spd, sc, elite)
	if entry_tgt != Vector3.ZERO:
		e.set_entry_target(entry_tgt)
	e.position = pos
	add_child(e)
	e.died.connect(_on_enemy_died)
	e.fired_bullet.connect(_spawn_enemy_bullet)

func _on_enemy_died(pos: Vector3, type: int, drop_type: String) -> void:
	_add_shake(0.15)
	score += _score_for_type(type)
	hud.update_score(score)
	wave_spawner.on_enemy_died()
	if drop_type != "":
		_spawn_pickup(pos, drop_type)

func _score_for_type(type: int) -> int:
	match type:
		EnemyScript.Type.SCOUT:  return 100
		EnemyScript.Type.BOMBER: return 300
		EnemyScript.Type.DRONE:  return 200
	return 100

# --- Pickups ---

func _spawn_pickup(pos: Vector3, type: String) -> void:
	var pickup := Node3D.new()
	pickup.position = pos
	var mesh_root: Node3D = GeoManifestScript.build_mesh(GeoManifestScript.PICKUPS[type]["parts"] as Array)
	pickup.add_child(mesh_root)
	pickup.set_meta("pickup_type", type)
	pickup.set_meta("age", 0.0)
	add_child(pickup)
	pickup.add_to_group("pickups")

func _physics_process(delta: float) -> void:
	if state != State.PLAYING and state != State.BOSS:
		return
	_check_pickups(delta)
	_check_bullet_hits()
	_check_enemy_player_collision()

func _check_pickups(delta: float) -> void:
	for pickup in get_tree().get_nodes_in_group("pickups"):
		var age: float = pickup.get_meta("age", 0.0) + delta
		pickup.set_meta("age", age)
		pickup.position.z += 6.0 * delta
		pickup.rotate_y(delta * 2.0)
		if age > 12.0 or pickup.position.z > 8:
			pickup.queue_free()
			continue
		var dist: float = player.global_position.distance_to(pickup.global_position)
		if dist < 1.2:
			var ptype: String = pickup.get_meta("pickup_type", "")
			if ptype == "weapon":
				player.collect_weapon()
				hud.flash_pickup("WEAPON UP")
			elif ptype == "bomb":
				bombs = min(bombs + 1, 4)
				hud.update_bombs(bombs)
				hud.flash_pickup("BOMB +1")
			pickup.queue_free()

func _check_bullet_hits() -> void:
	var player_bullets := get_tree().get_nodes_in_group("player_bullets")
	var enemies := get_tree().get_nodes_in_group("enemies")
	for bullet in player_bullets:
		if not is_instance_valid(bullet):
			continue
		for enemy in enemies:
			if not is_instance_valid(enemy):
				continue
			if bullet.hit_enemies.has(enemy):
				continue
			var dist: float = bullet.global_position.distance_to(enemy.global_position)
			if dist < 0.9:
				bullet.hit_enemies.append(enemy)
				enemy.take_damage(1)
				if not bullet.piercing:
					bullet.queue_free()
					break

	var enemy_bullets := get_tree().get_nodes_in_group("enemy_bullets")
	for bullet in enemy_bullets:
		if not is_instance_valid(bullet):
			continue
		var dist: float = bullet.global_position.distance_to(player.global_position)
		if dist < 0.5:
			player.take_hit()
			_add_shake(0.5)
			hud.update_lives(player.lives)
			bullet.queue_free()
			if player.lives <= 0:
				_game_over()
				return

func _check_enemy_player_collision() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var dist: float = enemy.global_position.distance_to(player.global_position)
		if dist < 0.9:
			player.take_hit()
			_add_shake(0.6)
			hud.update_lives(player.lives)
			if player.lives <= 0:
				_game_over()
				return

# --- Wave / boss events ---

func _on_wave_complete() -> void:
	if state != State.PLAYING:
		return
	_next_wave()

func _on_boss_wave(wave_num: int, cycle: int) -> void:
	state = State.BOSS
	hud.flash_wave(wave_num, true)
	# Boss logic in Phase 2 — placeholder for now
	await get_tree().create_timer(2.0).timeout
	# Immediately end boss for Phase 0 skeleton
	boss_cycles_beaten += 1
	if boss_cycles_beaten >= 3:
		_win()
	else:
		state = State.PLAYING
		_next_wave()

# --- Bomb ---

func _use_bomb() -> void:
	if bombs <= 0:
		return
	bombs -= 1
	hud.update_bombs(bombs)
	_add_shake(1.2)
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if is_instance_valid(enemy):
			enemy.queue_free()
	for bullet in get_tree().get_nodes_in_group("enemy_bullets"):
		if is_instance_valid(bullet):
			bullet.queue_free()
	hud.flash_bomb()

# --- Signals from player ---

func _on_tier_changed(tier: int) -> void:
	hud.update_weapon_tier(tier)
