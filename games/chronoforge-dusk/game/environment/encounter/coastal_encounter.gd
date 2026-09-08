class_name DuskCoastalEncounter
extends Node3D
## Bounded encounter staging: same coast, same Kaida, existing strike timeline.
## This is a replayable practice exchange, not the full 07 ATB/progression loop.
const SENTRY := "res://assets/practice.sentry/r1/descriptor.json"
const CENTER := Vector3(0,3,-13.5)
const FRONT_Z := -11.7
var game: DuskCoast
var formation: Node3D
var enemy: DuskCharacter
var action: DuskRehearsal
var feedback: DuskEncounterFeedback
var battle_camera: DuskOrbitCamera
var active: bool = false
var phase: String = "exploration"
var age: float = 0.0
var path: Array[Vector3] = []
var return_at: Vector3
var return_yaw: float = 0.0
var return_side_x: float = 0.0
var start_camera: Transform3D
var start_size: float
var player_health: int = 2
var enemy_health: int = 3
var guarded: bool = false
var counter_fired: bool = false
var counter_age: float = 1.0
var guard_count: int = 0
var hit_count: int = 0
var begin_count: int = 0
var finished_count: int = 0
var error: String = ""
var result_text: String = ""
var overlay: CanvasLayer
var panel: PanelContainer
var status: Label
var player_label: Label
var enemy_label: Label
var strike_button: Button
var guard_button: Button
var leave_button: Button
var marker: Label3D
var ring: MeshInstance3D
var shield: MeshInstance3D
var beam_mesh := ImmediateMesh.new()
var beam_material: StandardMaterial3D

func _ready() -> void:
	formation = Node3D.new()
	formation.position = CENTER
	formation.rotation.y = atan2((DuskRehearsal.TARGET-DuskRehearsal.HOME).z,(DuskRehearsal.TARGET-DuskRehearsal.HOME).x)
	add_child(formation)
	enemy = DuskCharacter.new()
	enemy.name = "PracticeSentry"
	enemy.place(DuskRehearsal.TARGET)
	formation.add_child(enemy)
	var asset := DuskAssetAssembly.new()
	enemy.add_child(asset)
	if not asset.assemble(SENTRY):
		error = asset.load_error
		return
	enemy.remove_child(asset)
	enemy.install(asset)
	enemy.place(DuskRehearsal.TARGET,atan2(DuskRehearsal.TARGET.x-DuskRehearsal.HOME.x,DuskRehearsal.TARGET.z-DuskRehearsal.HOME.z))
	marker = Label3D.new()
	marker.text = "PRACTICE SENTRY"
	marker.position.y = 2.32
	marker.font_size = 36
	marker.pixel_size = .007
	marker.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	enemy.add_child(marker)
	ring = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 1.0
	torus.outer_radius = 1.04
	torus.rings = 32
	torus.ring_segments = 8
	ring.mesh = torus
	ring.material_override = glow(Color("efbd6b"),.65)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ring.position = enemy.global_position+Vector3.UP*.012
	add_child(ring)
	battle_camera = DuskOrbitCamera.new()
	battle_camera.yaw = 0
	battle_camera.pitch = 17
	battle_camera.distance = 6.2
	battle_camera.panel_visible = false
	battle_camera.target_focus = Vector3(-.4,3.38,-13.5)
	battle_camera.focus = battle_camera.target_focus
	add_child(battle_camera)
	game.camera.make_current()
	action = DuskRehearsal.new()
	action.actor = game.actor
	action.target = enemy
	action.impact_fraction = game.tuning.values.impact_fraction
	action.attack_tempo = game.tuning.values.attack_tempo
	action.hit_stop = game.tuning.values.hit_stop
	add_child(action)
	action.impact.connect(on_hit)
	action.completed.connect(on_action_complete)
	feedback = DuskEncounterFeedback.new()
	feedback.action = action
	feedback.camera = battle_camera
	add_child(feedback)
	shield = MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = .86
	sphere.height = 1.95
	shield.mesh = sphere
	shield.material_override = glow(Color("69e9f2"),.18)
	shield.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shield.visible = false
	add_child(shield)
	var beam := MeshInstance3D.new()
	beam.mesh = beam_mesh
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(beam)
	beam_material = glow(Color("ffc780"),.95)
	build_ui()

func glow(color: Color, opacity: float) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(color,opacity)
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat

func can_begin() -> bool:
	if active or game.room != null or not error.is_empty() or game.transitioning or game.waiting_for_release: return false
	var at: Vector3 = game.actor.global_position
	return at.distance_to(enemy.global_position)<2.6 and at.y>2.8 and at.z> -14.8 and at.z< -11.0

func begin() -> bool:
	if not can_begin(): return false
	active = true
	phase = "entering"
	age = 0
	begin_count += 1
	return_at = game.actor.global_position
	return_yaw = game.actor.rotation.y
	return_side_x = return_at.x
	if absf(return_side_x-enemy.global_position.x)<1.3:
		return_side_x = enemy.global_position.x+(1.4 if return_side_x>=enemy.global_position.x else -1.4)
	game.actor.traversal_enabled = false
	game.actor.velocity = Vector3.ZERO
	game.actor.reset_reaction()
	game.waiting_for_release = false
	player_health = 2
	enemy_health = 3
	guarded = false
	counter_fired = false
	enemy.reset_reaction()
	var home: Vector3 = formation.to_global(DuskRehearsal.HOME)
	path = [Vector3(return_side_x,3.02,return_at.z),Vector3(return_side_x,3.02,FRONT_Z),Vector3(home.x,3.02,FRONT_Z),home]
	start_camera = game.camera.global_transform
	start_size = game.camera.size
	battle_camera.global_transform = start_camera
	battle_camera.size = start_size
	battle_camera.make_current()
	marker.visible = false
	ring.visible = false
	game.perf.begin("encounter_entry")
	return true

func _physics_process(delta: float) -> void:
	if not active: return
	age += delta
	if phase in ["entering","leaving"]:
		move_path(delta)
		if path.is_empty() and age>=1.9:
			if phase == "entering":
				game.actor.reparent(formation,true)
				action.reset()
				game.actor.place(DuskRehearsal.HOME,atan2(DuskRehearsal.HOME.x-DuskRehearsal.TARGET.x,DuskRehearsal.HOME.z-DuskRehearsal.TARGET.z))
				action.enabled = true
				phase = "ready"
				age = 0
				game.perf.begin("encounter_ready")
			else: complete_leave()
	elif phase == "response":
		if age>=1.1 and not counter_fired:
			counter_fired = true
			counter_age = 0
			if guarded: guard_count += 1
			else:
				player_health -= 1
				game.actor.start_reaction(player_health == 0)
			feedback.impact_audio.play()
			battle_camera.kick = .045 if guarded else .075
		if age>1.95 and (game.actor.reaction == "ready" or player_health == 0):
			enemy.visual.play_role("idle",true)
			guarded = false
			phase = "result" if player_health == 0 else "ready"
			if player_health == 0: result_text = "Practice ended · return and try guarding the pulse"
			age = 0

func move_path(delta: float) -> void:
	if path.is_empty(): return
	var destination: Vector3 = path[0]
	var difference: Vector3 = destination-game.actor.global_position
	difference.y = 0
	if difference.length()<.10:
		path.pop_front()
		game.actor.velocity = Vector3.ZERO
		if path.is_empty(): game.actor.visual.play_role("idle",true)
		return
	var before: Vector3 = game.actor.global_position
	game.actor.velocity = difference.normalized()*minf(game.actor.run_speed,difference.length()/delta)
	game.actor.velocity.y = -1
	game.actor.move_and_slide()
	game.actor.face(difference,delta)
	game.actor.locomotion(game.actor.global_position.distance_to(before)/delta,true)

func strike() -> void:
	if not active or phase != "ready" or game.get_tree().paused: return
	if get_viewport().gui_get_focus_owner() != null: get_viewport().gui_get_focus_owner().release_focus()
	action.defeat_on_contact = enemy_health == 1
	if action.trigger():
		phase = "action"
		age = 0

func guard() -> void:
	if phase == "response" and not counter_fired and not game.get_tree().paused:
		guarded = true
		if get_viewport().gui_get_focus_owner() != null: get_viewport().gui_get_focus_owner().release_focus()

func on_hit(_id: int) -> void:
	enemy_health = maxi(0,enemy_health-1)
	hit_count += 1

func on_action_complete(_id: int) -> void:
	age = 0
	if enemy_health == 0:
		phase = "result"
		result_text = "Sentry quiet · the terrace is yours again"
	else:
		phase = "response"
		guarded = false
		counter_fired = false
		enemy.visual.play_role("attack",true)

func leave() -> void:
	if not active or phase == "leaving" or game.get_tree().paused: return
	action.enabled = false
	action.phase = "ready"
	feedback.clear()
	game.actor.reset_reaction()
	if game.actor.get_parent() != game.simulation: game.actor.reparent(game.simulation,true)
	game.actor.traversal_enabled = false
	game.actor.velocity = Vector3.ZERO
	phase = "leaving"
	age = 0
	var at: Vector3 = game.actor.global_position
	path = [Vector3(at.x,3.02,FRONT_Z),Vector3(return_side_x,3.02,FRONT_Z),Vector3(return_side_x,3.02,return_at.z),return_at]
	start_camera = battle_camera.global_transform
	start_size = battle_camera.size
	game.camera.follow(return_at,1,true)
	guarded = false
	game.perf.begin("encounter_exit")

func restore_actor() -> void:
	action.enabled = false
	action.phase = "ready"
	feedback.clear()
	if game.actor.get_parent() != game.simulation: game.actor.reparent(game.simulation,true)
	game.actor.reset_reaction()
	game.actor.velocity = Vector3.ZERO
	game.actor.camera = game.camera
	enemy.reset_reaction()
	enemy.place(DuskRehearsal.TARGET,atan2(DuskRehearsal.TARGET.x-DuskRehearsal.HOME.x,DuskRehearsal.TARGET.z-DuskRehearsal.HOME.z))
	active = false
	phase = "exploration"
	overlay.visible = false
	guarded = false
	beam_mesh.clear_surfaces()
	shield.visible = false
	marker.visible = true
	ring.visible = true
	game.camera.make_current()
	game.waiting_for_release = true

func complete_leave() -> void:
	restore_actor()
	game.actor.place(return_at,return_yaw)
	game.camera.follow(return_at,1,true)
	finished_count += 1
	game.perf.begin("after_encounter")

func abort() -> void:
	if not active: return
	restore_actor()
	game.actor.place(return_at,return_yaw)
	game.camera.follow(return_at,1,true)

func handle_key(code: int) -> void:
	match code:
		KEY_SPACE: strike()
		KEY_G: guard()
		KEY_TAB: leave()
		KEY_ENTER:
			if phase == "result": leave()

func _process(delta: float) -> void:
	if not error.is_empty(): return
	formation.visible = game.room == null
	formation.process_mode = Node.PROCESS_MODE_INHERIT if game.room == null else Node.PROCESS_MODE_DISABLED
	ring.visible = not active and game.room == null
	overlay.visible = active
	panel.visible = active
	if not active: return
	battle_camera.update_camera(delta)
	if phase == "entering":
		var goal: Transform3D = battle_camera.global_transform
		var amount: float = smoothstep(0,1,age/1.9)
		battle_camera.global_transform = start_camera.interpolate_with(goal,amount)
		battle_camera.size = lerpf(start_size,battle_camera.distance,amount)
	elif phase == "leaving":
		var amount: float = smoothstep(0,1,age/1.9)
		battle_camera.global_transform = start_camera.interpolate_with(game.camera.global_transform,amount)
		battle_camera.size = lerpf(start_size,game.camera.size,amount)
	game.site.kit.reveal_actor(battle_camera,game.actor.global_position,delta)
	shield.visible = guarded and phase == "response"
	shield.position = game.actor.global_position+Vector3.UP
	counter_age += delta
	beam_mesh.clear_surfaces()
	if counter_age<.18:
		var start: Vector3 = enemy.global_position+Vector3.UP*1.25
		var end: Vector3 = game.actor.global_position+Vector3.UP
		var width: Vector3 = Vector3.UP*.045
		beam_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES,beam_material)
		for point: Vector3 in [start-width,start+width,end+width,start-width,end+width,end-width]: beam_mesh.surface_add_vertex(point)
		beam_mesh.surface_end()
	update_ui()

func build_ui() -> void:
	overlay = CanvasLayer.new()
	overlay.layer = 1
	add_child(overlay)
	panel = PanelContainer.new()
	panel.position = Vector2(48,865)
	panel.custom_minimum_size = Vector2(1824,170)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("10282eef")
	style.border_color = Color("648b87")
	style.border_width_top = 2
	style.content_margin_left = 28
	style.content_margin_right = 28
	style.content_margin_top = 20
	style.content_margin_bottom = 20
	panel.add_theme_stylebox_override("panel",style)
	overlay.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",14)
	panel.add_child(column)
	var names := HBoxContainer.new()
	column.add_child(names)
	player_label = Label.new()
	player_label.add_theme_font_size_override("font_size",25)
	player_label.modulate = Color("99e9e2")
	names.add_child(player_label)
	status = Label.new()
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	status.add_theme_font_size_override("font_size",22)
	names.add_child(status)
	enemy_label = Label.new()
	enemy_label.add_theme_font_size_override("font_size",25)
	enemy_label.modulate = Color("f1c58c")
	names.add_child(enemy_label)
	var commands := HBoxContainer.new()
	commands.add_theme_constant_override("separation",18)
	column.add_child(commands)
	strike_button = command_button("SPACE  ·  Strike",strike,commands)
	guard_button = command_button("G  ·  Guard pulse",guard,commands)
	leave_button = command_button("TAB  ·  Disengage",leave,commands)
	var help := Label.new()
	help.text = "Practice encounter    ·    ESC  Pause    ·    R  Reset"
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	help.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	help.modulate = Color("a9c0bd")
	help.add_theme_font_size_override("font_size",18)
	commands.add_child(help)

func command_button(title: String, callback: Callable, row: HBoxContainer) -> Button:
	var button := Button.new()
	button.text = title
	button.custom_minimum_size = Vector2(260,54)
	button.add_theme_font_size_override("font_size",20)
	button.pressed.connect(callback)
	row.add_child(button)
	return button

func update_ui() -> void:
	player_label.text = "KAIDA   %d / 2" % player_health
	enemy_label.text = "PRACTICE SENTRY   %d / 3" % enemy_health
	match phase:
		"entering": status.text = "Taking position"
		"ready": status.text = "Ready · choose your move"
		"action": status.text = "Kaida · "+action.phase.capitalize()
		"response": status.text = "Guard raised" if guarded else ("Sentry pulse" if counter_fired else "Incoming pulse · G to guard")
		"leaving": status.text = "Returning to the terrace"
		"result": status.text = result_text
	strike_button.disabled = phase != "ready" or game.get_tree().paused
	guard_button.disabled = phase != "response" or counter_fired or guarded or game.get_tree().paused
	leave_button.disabled = phase == "leaving" or game.get_tree().paused
	leave_button.text = "ENTER  ·  Return" if phase == "result" else "TAB  ·  Disengage"
