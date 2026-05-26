extends Node

# In-game dev tool — toggle with backtick (`)
# Keys work even when overlay is hidden.

const GeoManifestScript := preload("res://scripts/GeoManifest.gd")

@onready var _game: Node3D = get_parent()

var _overlay: Label
var _gallery_active := false
var _gallery_nodes: Array = []
var _saved_cam_pos := Vector3.ZERO
var _saved_cam_basis := Basis.IDENTITY

func _ready() -> void:
	_build_overlay()

func _build_overlay() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 10
	_overlay = Label.new()
	_overlay.visible = false
	_overlay.layout_mode = 1
	_overlay.set_anchor(SIDE_LEFT, 1.0)
	_overlay.set_anchor(SIDE_RIGHT, 1.0)
	_overlay.set_anchor(SIDE_TOP, 1.0)
	_overlay.set_anchor(SIDE_BOTTOM, 1.0)
	_overlay.offset_left = -260.0
	_overlay.offset_right = -12.0
	_overlay.offset_top = -200.0
	_overlay.offset_bottom = -12.0
	_overlay.add_theme_font_size_override("font_size", 13)
	_overlay.add_theme_color_override("font_color", Color(1.0, 1.0, 0.0, 0.9))
	_overlay.text = "── DEV  (` to close) ──\n[  /  ]  weapon tier\nB        spawn boss\nN        skip wave\nG        geo gallery\nK        kill enemies\n1/2/3    boss type\n\n★ GOD MODE ACTIVE ★"
	canvas.add_child(_overlay)
	add_child(canvas)

func _input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed:
		return
	match event.keycode:
		KEY_QUOTELEFT:
			_overlay.visible = !_overlay.visible
			_game.player.god_mode = _overlay.visible
		KEY_BRACKETLEFT:
			_cycle_weapon(-1)
		KEY_BRACKETRIGHT, KEY_SLASH:
			_cycle_weapon(1)
		KEY_B:
			_drop_boss(-1)
		KEY_1:
			_drop_boss(0)
		KEY_2:
			_drop_boss(1)
		KEY_3:
			_drop_boss(2)
		KEY_N:
			_skip_wave()
		KEY_G:
			_toggle_gallery()
		KEY_K:
			_kill_enemies()

# --- Actions ---

func _cycle_weapon(dir: int) -> void:
	var p = _game.player
	p.weapon_tier = clampi(p.weapon_tier + dir, 0, p.WEAPON_TIERS.size() - 1)
	p.max_tier = max(p.max_tier, p.weapon_tier)
	p.weapon_tier_changed.emit(p.weapon_tier)

func _drop_boss(boss_type: int) -> void:
	if _gallery_active:
		return
	if _game._active_boss and is_instance_valid(_game._active_boss):
		return
	var cycle: int = _game.boss_cycles_beaten
	if boss_type >= 0:
		# Override: temporarily set boss_cycles_beaten to target type
		var saved: int = _game.boss_cycles_beaten
		_game.boss_cycles_beaten = boss_type
		_game.state = _game.State.BOSS
		_game._spawn_boss(cycle)
		_game.boss_cycles_beaten = saved
	else:
		_game.state = _game.State.BOSS
		_game._spawn_boss(cycle)

func _skip_wave() -> void:
	_kill_enemies()
	_game.wave_spawner._enemies_alive = 0
	_game.wave_spawner._spawn_queue.clear()
	_game.wave_spawner._active = false
	await get_tree().create_timer(0.1).timeout
	_game.wave_spawner.wave_complete.emit()

func _kill_enemies() -> void:
	for e in get_tree().get_nodes_in_group("enemies"):
		if is_instance_valid(e):
			e.queue_free()
	_game.wave_spawner.on_enemy_died()

# --- Geo Gallery ---

func _toggle_gallery() -> void:
	if _gallery_active:
		_exit_gallery()
	else:
		_enter_gallery()

func _enter_gallery() -> void:
	_gallery_active = true
	_game._clear_field()
	_game.player.visible = false
	_game.hud.visible = false
	_game.state = _game.State.MENU

	# Save camera and move it close to the gallery plane
	var cam: Camera3D = _game.camera
	_saved_cam_pos = cam.position
	_saved_cam_basis = cam.basis
	cam.position = Vector3(0, 0.5, 4)
	cam.look_at(Vector3(0, 0, -5), Vector3.UP)

	var small_keys: Array = []
	var boss_keys: Array = []
	for k in GeoManifestScript.ENTITIES.keys():
		if "boss" in k:
			boss_keys.append(k)
		else:
			small_keys.append(k)

	# Small entities: y=1.5, z=-5, 2.5 unit spacing
	var sx: float = -(small_keys.size() - 1) * 2.5 / 2.0
	for i in small_keys.size():
		_make_gallery_entity(small_keys[i], Vector3(sx + i * 2.5, 1.5, -5.0))

	# Boss entities: y=-1.5, z=-5, 5 unit spacing
	var bx: float = -(boss_keys.size() - 1) * 5.0 / 2.0
	for i in boss_keys.size():
		_make_gallery_entity(boss_keys[i], Vector3(bx + i * 5.0, -1.5, -5.0))

func _make_gallery_entity(key: String, pos: Vector3) -> void:
	var root := Node3D.new()
	root.position = pos
	var parts: Array = GeoManifestScript.ENTITIES[key]["parts"] as Array
	var mesh := GeoManifestScript.build_mesh(parts)
	root.add_child(mesh)

	var label := Label3D.new()
	label.text = key
	label.font_size = 20
	label.modulate = Color(1, 1, 0)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position = Vector3(0, 2.2, 0)
	label.no_depth_test = true
	root.add_child(label)

	root.set_meta("spin_mesh", mesh)
	_game.add_child(root)
	_gallery_nodes.append(root)

func _exit_gallery() -> void:
	_gallery_active = false
	for n in _gallery_nodes:
		if is_instance_valid(n):
			n.queue_free()
	_gallery_nodes.clear()
	# Restore camera
	var cam: Camera3D = _game.camera
	cam.position = _saved_cam_pos
	cam.basis = _saved_cam_basis
	_game.hud.visible = true
	_game._start_game()
	_game.player.god_mode = _overlay.visible

func _process(delta: float) -> void:
	if not _gallery_active:
		return
	for n in _gallery_nodes:
		if is_instance_valid(n) and n.has_meta("spin_mesh"):
			var mesh: Node3D = n.get_meta("spin_mesh")
			mesh.rotate_y(delta * 0.8)
