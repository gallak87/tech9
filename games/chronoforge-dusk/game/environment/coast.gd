class_name DuskCoast
extends Node3D

var actor: DuskCharacter
var camera: DuskCoastCamera
var site: DuskCoastSite
var simulation: Node3D
var tuning := DuskTuning.new()
var perf := DuskDiagnostics.new()
var manually_paused: bool = false
var unfocused: bool = false
var test_mode: bool = false
var test_run_id: String = ""
var test_interference: bool = false
var source_sha256: String = "unrecorded"
var game_revision: String = "development"
var load_error: String = ""
var pause_panel: PanelContainer
var test_banner: Label
var error_label: Label
var zone_label: Label
var input_events: int = 0
var resets: int = 0
var coastal_audio: DuskCoastAudio
var room: DuskWorkshop
var transitioning: bool = false
var waiting_for_release: bool = false
var transition_count: int = 0
var preferred_third_person: bool = false
var guidance: Label
var interaction: Label
var curtain: ColorRect

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	test_mode = "--environment-test" in OS.get_cmdline_user_args() or "--environment-restart" in OS.get_cmdline_user_args() or "--environment-motion" in OS.get_cmdline_user_args() or "--room-test" in OS.get_cmdline_user_args() or "--room-restart" in OS.get_cmdline_user_args()
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--test-run-id="):
			test_run_id = argument.trim_prefix("--test-run-id=")
	if FileAccess.file_exists("res://content/build_info.json"):
		var build: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://content/build_info.json"))
		source_sha256 = build.source_sha256
		game_revision = build.revision
	# Read accepted gameplay values; this scene never writes inspection framing.
	tuning.restore()
	bind_inputs()
	simulation = Node3D.new()
	simulation.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(simulation)
	site = DuskCoastSite.new()
	simulation.add_child(site)
	actor = DuskCharacter.new()
	actor.name = "Kaida"
	actor.place(DuskCoastSite.SPAWN)
	simulation.add_child(actor)
	var asset := DuskAssetAssembly.new()
	actor.add_child(asset)
	if asset.assemble(DuskFoundation.DEFAULT_CANDIDATE):
		actor.remove_child(asset)
		actor.install(asset)
		actor.traversal_enabled = true
	else:
		load_error = asset.load_error
	for key: String in ["walk_speed","run_speed","turn_speed","acceleration","braking","walk_stride_speed","run_stride_speed"]:
		actor.set(key,tuning.values[key])
	camera = DuskCoastCamera.new()
	add_child(camera)
	actor.camera = camera
	camera.follow(actor.position, 1.0, true)
	coastal_audio = DuskCoastAudio.new()
	coastal_audio.actor = actor
	simulation.add_child(coastal_audio)
	build_ui()
	get_window().title = "Chronoforge Dusk — AUTOMATED CHECK, PLEASE WAIT" if test_mode else "Chronoforge Dusk"
	if not test_mode:
		get_window().focus_exited.connect(func() -> void: set_unfocused(true))
		get_window().focus_entered.connect(func() -> void: set_unfocused(false))
	apply_pause()
	print("DUSK_COAST_START ",JSON.stringify(identity()))
	if test_mode and not Engine.has_meta("environment_test_active"):
		Engine.set_meta("environment_test_active",true)
		var runner_path: String = "res://tests/environment_test.gd"
		if "--environment-motion" in OS.get_cmdline_user_args(): runner_path = "res://tests/environment_motion.gd"
		if "--room-test" in OS.get_cmdline_user_args() or "--room-restart" in OS.get_cmdline_user_args(): runner_path = "res://tests/room_test.gd"
		var runner: Node = load(runner_path).new()
		add_child(runner)
		runner.call_deferred("run",self)

func bind_inputs() -> void:
	var bindings: Dictionary = {"move_left":[KEY_A,KEY_LEFT],"move_right":[KEY_D,KEY_RIGHT],"move_forward":[KEY_W,KEY_UP],"move_back":[KEY_S,KEY_DOWN],"run":[KEY_SHIFT]}
	for action: String in bindings:
		if InputMap.has_action(action):
			continue
		InputMap.add_action(action)
		for code: int in bindings[action]:
			var event := InputEventKey.new()
			event.physical_keycode = code
			InputMap.action_add_event(action,event)

func _process(delta: float) -> void:
	perf.sample()
	if room == null:
		camera.follow(actor.position,delta)
		site.kit.reveal_actor(camera,actor.position,delta)
	else:
		room.rig.follow(delta)
	if waiting_for_release and not transitioning and movement_released():
		waiting_for_release = false
		actor.traversal_enabled = true
	if actor.position.y < -4.0:
		reset_spawn()
	zone_label.text = "SEA OVERLOOK" if actor.position.z < -18.5 else ("UPPER RUIN" if actor.position.y > 2.8 else ("SEAWALL WALK" if actor.position.z < 4 else "ARRIVAL QUAY  ·  WORKSHOP ON THE WEST APRON"))
	if room != null: zone_label.text = "COASTAL WORKSHOP  /  " + ("THIRD PERSON" if room.rig.third_person else "CLOSE CUTAWAY")
	guidance.text = "WASD / ARROWS  Walk    SHIFT  Run    E  Door    R  Reset    ESC  Pause    F2  Development"
	if room != null:
		guidance.text = "WASD  Walk    SHIFT  Run    E  Leave    C  Camera    R  Reset    ESC  Pause"
		if room.rig.third_person: guidance.text += "    RMB drag / J L  Look"
	interaction.text = "Release movement to continue" if waiting_for_release else ("E  ·  Leave workshop" if room != null and room.at_door() else ("E  ·  Enter workshop" if room == null and at_workshop_door() else ""))
	error_label.text = load_error + "\n".join(site.import_errors)

func _input(event: InputEvent) -> void:
	if test_mode and not event.has_meta("dusk_test_input") and (event is InputEventKey or event is InputEventMouseButton) and event.is_pressed():
		test_interference = true
		Engine.set_meta("environment_test_interference",true)

func _unhandled_input(event: InputEvent) -> void:
	if room != null and not manually_paused and not unfocused and not transitioning:
		room.rig.handle_input(event)
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	input_events += 1
	if transitioning: return
	match event.physical_keycode:
		KEY_ESCAPE, KEY_P: toggle_pause()
		KEY_R: reset_spawn()
		KEY_E:
			if not manually_paused and not unfocused and not waiting_for_release:
				if room != null and room.at_door(): change_room(false)
				elif room == null and at_workshop_door(): change_room(true)
		KEY_C:
			if room != null and not manually_paused and not unfocused: change_camera()
		KEY_F2: enter_development()
		KEY_F9: write_diagnostics()

func toggle_pause() -> void:
	manually_paused = not manually_paused
	apply_pause()
	perf.begin("paused" if manually_paused else "resumed")

func set_unfocused(value: bool) -> void:
	unfocused = value
	apply_pause()
	perf.begin("inactive" if value else "active")

func apply_pause() -> void:
	get_tree().paused = manually_paused or unfocused
	if room != null and (manually_paused or unfocused): room.rig.release_look()
	Engine.max_fps = 10 if unfocused else (30 if manually_paused else 60)
	if pause_panel != null:
		pause_panel.visible = manually_paused
	if not manually_paused and get_viewport().gui_get_focus_owner() != null:
		get_viewport().gui_get_focus_owner().release_focus()

func reset_spawn() -> void:
	actor.reset_reaction()
	actor.place(DuskCoastSite.SPAWN if room == null else DuskWorkshop.SPAWN)
	if room == null: camera.follow(actor.position,1.0,true)
	else: room.rig.follow(1.0,true)
	resets += 1

func enter_development() -> void:
	get_tree().paused = false
	Engine.max_fps = 60
	get_tree().change_scene_to_file("res://development/foundation.tscn")

func build_ui() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)
	test_banner = Label.new()
	test_banner.text = "AUTOMATED NATIVE CHECK — PLEASE WAIT · Keyboard/mouse input invalidates this run"
	test_banner.position = Vector2(48,102)
	test_banner.add_theme_font_size_override("font_size",22)
	test_banner.add_theme_color_override("font_color",Color("fff0ae"))
	test_banner.add_theme_color_override("font_shadow_color",Color("10292e"))
	test_banner.add_theme_constant_override("shadow_offset_y",2)
	test_banner.visible = test_mode
	canvas.add_child(test_banner)
	var brand := Label.new()
	brand.text = "C H R O N O F O R G E   /   D U S K"
	brand.position = Vector2(48,34)
	brand.add_theme_font_size_override("font_size",20)
	brand.modulate = Color("edf0dc")
	canvas.add_child(brand)
	zone_label = Label.new()
	zone_label.position = Vector2(48,66)
	zone_label.add_theme_font_size_override("font_size",13)
	zone_label.modulate = Color("bfd0c8")
	canvas.add_child(zone_label)
	guidance = Label.new()
	guidance.text = "WASD / ARROWS  Walk     SHIFT  Run     R  Return to arrival     ESC  Pause     F2  Development"
	guidance.position = Vector2(48,1025)
	guidance.add_theme_font_size_override("font_size",17)
	guidance.add_theme_color_override("font_shadow_color",Color("102d35"))
	guidance.add_theme_constant_override("shadow_offset_y",2)
	canvas.add_child(guidance)
	interaction = Label.new()
	interaction.position = Vector2(48,970)
	interaction.add_theme_font_size_override("font_size",23)
	interaction.add_theme_color_override("font_color",Color("ffedc1"))
	interaction.add_theme_color_override("font_shadow_color",Color("10292e"))
	interaction.add_theme_constant_override("shadow_offset_y",2)
	canvas.add_child(interaction)
	curtain = ColorRect.new()
	curtain.color = Color("122529")
	curtain.modulate.a = 0
	curtain.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	curtain.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.add_child(curtain)
	error_label = Label.new()
	error_label.position = Vector2(48,130)
	error_label.modulate = Color("ffaaa0")
	canvas.add_child(error_label)
	pause_panel = PanelContainer.new()
	pause_panel.position = Vector2(735,335)
	pause_panel.custom_minimum_size = Vector2(450,330)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("10292ef2")
	style.content_margin_left = 36
	style.content_margin_right = 36
	style.content_margin_top = 28
	style.content_margin_bottom = 28
	style.corner_radius_top_left = 8
	style.corner_radius_bottom_right = 8
	pause_panel.add_theme_stylebox_override("panel",style)
	canvas.add_child(pause_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",18)
	pause_panel.add_child(column)
	var title := Label.new()
	title.text = "A moment by the sea"
	title.add_theme_font_size_override("font_size",27)
	column.add_child(title)
	for item: Array in [["Resume",toggle_pause],["Reset to safe entry",func() -> void: reset_spawn(); toggle_pause()],["Quit to desktop",func() -> void: get_tree().quit()]]:
		var button := Button.new()
		button.text = item[0]
		button.custom_minimum_size.y = 48
		button.add_theme_font_size_override("font_size",20)
		button.pressed.connect(item[1])
		column.add_child(button)

func identity() -> Dictionary:
	return {"test_run_id":test_run_id,"test_interference":test_interference or bool(Engine.get_meta("environment_test_interference",false)),"source_sha256":source_sha256,"game_revision":game_revision,"native_export":not OS.has_feature("editor"),"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"driver":RenderingServer.get_current_rendering_driver_name(),"gpu":RenderingServer.get_video_adapter_name(),"processor":OS.get_processor_name(),"internal_resolution":[1920,1080],"frame_cap":Engine.max_fps,"asset":actor.visual.descriptor if actor.visual != null else {},"tuning":tuning.values,"camera":{"yaw":camera.YAW,"pitch":camera.PITCH,"size":camera.size},"scene":"coastal-workshop" if room != null else "coastal-reclamation-06","room_view":"third_person" if room != null and room.rig.third_person else "cutaway","room_transitions":transition_count,"scenery":site.kit.identities}

func write_diagnostics() -> void:
	var file := FileAccess.open("user://environment-diagnostics.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"identity":identity(),"intervals":perf.report(),"actor_position":str(actor.position),"input_events":input_events,"resets":resets,"import_errors":site.import_errors,"gui_focus":str(get_viewport().gui_get_focus_owner())},"\t"))
	print("DUSK_COAST_DIAGNOSTICS ",ProjectSettings.globalize_path("user://environment-diagnostics.json"))


func at_workshop_door() -> bool:
	return actor.position.distance_to(DuskCoastSite.WORKSHOP_RETURN) < 1.15

func movement_released() -> bool:
	return Input.get_vector("move_left","move_right","move_forward","move_back").is_zero_approx() and not Input.is_physical_key_pressed(KEY_E) and not Input.is_physical_key_pressed(KEY_C)

func lock_transition() -> void:
	transitioning = true
	waiting_for_release = true
	actor.traversal_enabled = false
	actor.velocity = Vector3.ZERO
	actor.measured_speed = 0
	actor.visual.play_role("idle",true)
	if room != null: room.rig.release_look()

func fade_to(alpha: float) -> void:
	var tween: Tween = create_tween().set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tween.tween_property(curtain,"modulate:a",alpha,.18)
	await tween.finished

func change_room(inside: bool) -> void:
	lock_transition()
	await fade_to(1.0)
	if inside:
		simulation.remove_child(site) # Detach its world, light and collision together.
		room = preload("res://environment/rooms/workshop.tscn").instantiate()
		room.actor = actor
		actor.place(DuskWorkshop.SPAWN)
		simulation.add_child(room)
		if not room.shell.error.is_empty(): load_error = room.shell.error
		if preferred_third_person: room.switch_camera()
		coastal_audio.ambience.volume_db = -27
	else:
		preferred_third_person = room.rig.third_person
		simulation.remove_child(room)
		room.queue_free()
		room = null
		simulation.add_child(site)
		actor.place(DuskCoastSite.WORKSHOP_RETURN,PI)
		actor.camera = camera
		camera.make_current()
		camera.follow(actor.position,1.0,true)
		for node: Node in actor.visual.find_children("*","MeshInstance3D",true,false): (node as MeshInstance3D).transparency = 0.0
		coastal_audio.ambience.volume_db = -12
	await get_tree().physics_frame
	await get_tree().physics_frame
	transition_count += 1
	await fade_to(0.0)
	transitioning = false
	perf.begin("room_third_person" if room != null and room.rig.third_person else ("room_cutaway" if room != null else "outside_after_room"))

func change_camera() -> void:
	lock_transition()
	await fade_to(1.0)
	room.switch_camera()
	room.rig.follow(1.0,true)
	await get_tree().physics_frame
	await fade_to(0.0)
	transitioning = false
	perf.begin("room_third_person" if room.rig.third_person else "room_cutaway")

func _exit_tree() -> void:
	# The outdoor scene is retained only for this visit, never leaked on F2/quit.
	if is_instance_valid(site) and not site.is_inside_tree(): site.free()
