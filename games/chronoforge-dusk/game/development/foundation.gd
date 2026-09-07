class_name DuskFoundation
extends Node3D

const DEFAULT_CANDIDATE: String = "res://assets/fixtures/mannequin-slate-r1.json"
var simulation: Node3D
var actor: DuskCharacter
var target: DuskCharacter
var patch: DuskTraversalPatch
var camera: DuskOrbitCamera
var action: DuskRehearsal
var hud: DuskDevelopmentHUD
var tuning := DuskTuning.new()
var perf := DuskDiagnostics.new()
var candidates: Array[String] = []
var selected_index: int = 0
var mode: int = 1
var manually_paused: bool = false
var unfocused: bool = false
var stepping: bool = false
var step_frames: int = 0
var load_status: String = "Not loaded"
var load_error: String = ""
var flash: float = 0.0
var startup_ms: int = 0
var ui_elapsed: float = 0.0
var input_events: int = 0
var last_input: String = "none"
var game_revision: String = "development"
var test_mode: bool = false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	startup_ms = Time.get_ticks_msec()
	test_mode = "--self-test" in OS.get_cmdline_user_args() or "--verify-restart" in OS.get_cmdline_user_args()
	if test_mode:
		tuning.path = "user://foundation_test_tuning.json"
	if FileAccess.file_exists("res://content/build_info.json"):
		var build: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/build_info.json"))
		if build is Dictionary:
			game_revision = str(build.get("revision", "development"))
	bind_inputs()
	tuning.restore()
	var prepared: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/candidates.json"))
	if prepared is Array:
		for candidate_path: Variant in prepared:
			if candidate_path is String:
				candidates.append(candidate_path)
	simulation = Node3D.new()
	simulation.name = "Simulation"
	simulation.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(simulation)
	patch = DuskTraversalPatch.new()
	simulation.add_child(patch)
	actor = DuskCharacter.new()
	actor.name = "ControlledActor"
	simulation.add_child(actor)
	target = DuskCharacter.new()
	target.name = "HarmlessTarget"
	simulation.add_child(target)
	var target_label := Label3D.new()
	target_label.text = "HARMLESS TARGET"
	target_label.position.y = 2.2
	target_label.font_size = 24
	target_label.pixel_size = 0.006
	target_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	target.add_child(target_label)
	var target_asset := DuskAssetAssembly.new()
	target.add_child(target_asset)
	if target_asset.assemble("res://assets/fixtures/mannequin-clay-r1.json"):
		target.remove_child(target_asset)
		target.install(target_asset)
	else:
		load_error = "Target import failed: " + target_asset.load_error
		target_asset.queue_free()
	camera = DuskOrbitCamera.new()
	add_child(camera)
	actor.camera = camera
	action = DuskRehearsal.new()
	action.actor = actor
	action.target = target
	simulation.add_child(action)
	action.impact.connect(func(_id: int) -> void: flash = 0.3)
	hud = DuskDevelopmentHUD.new()
	add_child(hud)
	for path: String in candidates:
		hud.candidate.add_item(path.get_file().get_basename().replace("mannequin-", "Fixture / "))
	hud.view_selected.connect(set_mode)
	hud.candidate_selected.connect(load_candidate_index)
	hud.clip_selected.connect(func(role: String) -> void:
		if mode == 0 and actor.visual != null:
			actor.visual.play_role(role, true))
	hud.lighting_changed.connect(func(on: bool) -> void:
		tuning.values.light_game = on
		apply_tuning()
		mark_dirty())
	hud.tuning_changed.connect(func(key: String, value: float) -> void:
		tuning.values[key] = value
		apply_tuning()
		mark_dirty())
	hud.command.connect(command)
	apply_tuning()
	var initial: String = str(tuning.saved.get("descriptor", DEFAULT_CANDIDATE))
	if initial in candidates:
		load_candidate_index(candidates.find(initial))
	else:
		load_error = "Accepted descriptor is no longer prepared: " + initial + ". Select a candidate explicitly."
	set_mode(1)
	get_window().focus_exited.connect(func() -> void: set_unfocused(true))
	get_window().focus_entered.connect(func() -> void: set_unfocused(false))
	print("DUSK_START ", JSON.stringify(identity()))
	if test_mode:
		var runner: Node = load("res://tests/foundation_test.gd").new()
		add_child(runner)
		runner.call_deferred("run", self)

func bind_inputs() -> void:
	var bindings: Dictionary = {"move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT], "move_forward": [KEY_W, KEY_UP], "move_back": [KEY_S, KEY_DOWN], "run": [KEY_SHIFT]}
	for name: String in bindings:
		InputMap.add_action(name)
		for code: int in bindings[name]:
			var key := InputEventKey.new()
			key.physical_keycode = code
			InputMap.action_add_event(name, key)

func load_candidate_index(index: int) -> void:
	if index < 0 or index >= candidates.size():
		return
	selected_index = index
	hud.candidate.select(index)
	load_candidate(candidates[index])

func load_candidate(path: String) -> bool:
	var pending := DuskAssetAssembly.new()
	pending.visible = false
	simulation.add_child(pending)
	var start: int = Time.get_ticks_msec()
	if not pending.assemble(path):
		load_error = "IMPORT FAILED · " + pending.load_error
		pending.queue_free()
		# Explicitly retain and label the previous actor; never report the failed one loaded.
		print("DUSK_LOAD_FAILED ", load_error)
		return false
	if tuning.saved.get("descriptor") == path and tuning.saved.get("model_sha256") != pending.descriptor.model.sha256:
		load_error = "Accepted revision hash changed. Publish a new immutable revision and select it explicitly."
		pending.queue_free()
		return false
	simulation.remove_child(pending)
	actor.install(pending)
	pending.visible = true
	load_status = "LOADED · %s\n%s · %d ms\n%s" % [pending.descriptor.asset_id, pending.descriptor.revision, Time.get_ticks_msec() - start, "TEMPORARY FIXTURE / NOT KAIDA" if pending.descriptor.get("placeholder", false) else "Candidate · visual acceptance pending"]
	load_error = ""
	apply_tuning()
	set_mode(mode)
	perf.begin("asset_reload")
	print("DUSK_LOADED ", pending.descriptor.asset_id, " ", pending.descriptor.revision)
	return true

func set_mode(index: int) -> void:
	mode = index
	action.enabled = false
	action.reset()
	actor.traversal_enabled = index == 1 and actor.visual != null
	target.visible = index == 2
	target.collider.set_deferred("disabled", index != 2)
	camera.inspecting = index == 0
	if index != 2:
		actor.place(Vector3(0, 0.02, 0), deg_to_rad(camera.yaw) + PI if index == 0 else 0.0)
	else:
		action.enabled = actor.visual != null and target.visual != null
	camera.target_focus = Vector3.ZERO
	camera.focus = Vector3.ZERO
	if actor.visual != null:
		actor.visual.play_role("idle", true)
	hud.animation.select(0)
	hud.set_mode(index)
	perf.begin(["inspection_idle", "traversal", "rehearsal"][index])

func _process(delta: float) -> void:
	perf.sample()
	camera.target_focus = actor.position if mode == 1 else Vector3.ZERO
	camera.update_camera(delta)
	if not get_tree().paused:
		flash = maxf(0.0, flash - delta)
	ui_elapsed += delta
	if ui_elapsed < 0.25:
		return
	ui_elapsed = 0.0
	hud.status.text = load_status
	hud.error_panel.text = load_error
	hud.save_status.text = tuning.message
	hud.pause_button.text = "Resume  [P]" if manually_paused else "Pause  [P]"
	hud.action_status.text = "Strike %02d   /   %s   /   impacts %d" % [action.action_id, action.phase.to_upper(), action.impact_count] if mode == 2 else ["ASSET INSPECTION", "TRAVERSAL PATCH", ""][mode]
	if mode == 2 and flash > 0:
		hud.action_status.text += "    CONTACT"
	hud.set_phase(action.phase, action.contact_sent)
	var stats: Dictionary = perf.snapshot()
	hud.diagnostics.text = "%d FPS  ·  p95 %.1f ms  ·  %d draws  ·  %d primitives  ·  %.1f MB video  ·  1920 × 1080  ·  Forward+ / Metal  ·  %s" % [Engine.get_frames_per_second(), float(stats.get("p95_ms", 0.0)), perf.draw_calls, perf.primitives, perf.video_mb, "inactive / 10 FPS" if unfocused else ("paused / 30 FPS" if manually_paused else "60 FPS cap")]

func _physics_process(_delta: float) -> void:
	if stepping:
		step_frames += 1
		if step_frames > 1:
			stepping = false
			apply_pause()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		camera.orbit(event.relative)
		remember_camera()
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera.zoom(-0.6)
			remember_camera()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera.zoom(0.6)
			remember_camera()
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	input_events += 1
	last_input = OS.get_keycode_string(event.physical_keycode)
	match event.physical_keycode:
		KEY_1: set_mode(0)
		KEY_2: set_mode(1)
		KEY_3: set_mode(2)
		KEY_SPACE: command("attack")
		KEY_P: command("pause")
		KEY_R: command("replay")
		KEY_C: command("camera")
		KEY_L:
			tuning.values.light_game = not tuning.values.light_game
			apply_tuning()
			mark_dirty()
		KEY_Q:
			camera.orbit(Vector2(40, 0))
			remember_camera()
		KEY_E:
			camera.orbit(Vector2(-40, 0))
			remember_camera()
		KEY_F5: command("reload")
		KEY_F6: command("save")
		KEY_F7: command("restore")
		KEY_F9: command("diagnostics")
		KEY_ESCAPE: get_tree().quit()

func command(name: String) -> void:
	match name:
		"attack":
			if not get_tree().paused:
				action.trigger()
		"pause":
			manually_paused = not manually_paused
			apply_pause()
			perf.begin("paused" if manually_paused else "resumed")
		"step":
			if manually_paused and not unfocused:
				stepping = true
				step_frames = 0
				get_tree().paused = false
		"replay":
			if mode == 2:
				action.reset()
				action.trigger()
			elif actor.visual != null:
				actor.visual.play_role(actor.visual.active_role, true)
		"reload": load_candidate_index(selected_index)
		"camera":
			for key: String in ["camera_yaw", "camera_pitch", "camera_distance"]:
				tuning.values[key] = DuskTuning.DEFAULTS[key]
			apply_tuning()
			mark_dirty()
		"save":
			if actor.visual != null and load_error.is_empty():
				remember_camera(false)
				tuning.accept(actor.visual, game_revision)
		"restore":
			if tuning.restore():
				var path: String = str(tuning.saved.descriptor)
				if path in candidates:
					load_candidate_index(candidates.find(path))
				else:
					load_error = "Accepted descriptor is not in the prepared catalog: " + path
				apply_tuning()
		"diagnostics": write_diagnostics()

func apply_tuning() -> void:
	actor.walk_speed = float(tuning.values.walk_speed)
	actor.run_speed = float(tuning.values.run_speed)
	actor.turn_speed = float(tuning.values.turn_speed)
	camera.yaw = float(tuning.values.camera_yaw)
	camera.pitch = float(tuning.values.camera_pitch)
	camera.distance = float(tuning.values.camera_distance)
	action.impact_fraction = float(tuning.values.impact_fraction)
	patch.set_game_lighting(bool(tuning.values.light_game))
	hud.set_tuning(tuning.values)

func remember_camera(dirty: bool = true) -> void:
	tuning.values.camera_yaw = camera.yaw
	tuning.values.camera_pitch = camera.pitch
	tuning.values.camera_distance = camera.distance
	if dirty:
		mark_dirty()

func mark_dirty() -> void:
	tuning.message = "Unsaved tuning · F6 to accept deliberately"

func set_unfocused(value: bool) -> void:
	unfocused = value
	apply_pause()
	perf.begin("unfocused" if value else "focused")

func apply_pause() -> void:
	get_tree().paused = manually_paused or unfocused
	Engine.max_fps = 10 if unfocused else (30 if manually_paused else 60)

func identity() -> Dictionary:
	return {"game_revision": game_revision, "engine": Engine.get_version_info().string, "renderer": RenderingServer.get_current_rendering_method(), "driver": RenderingServer.get_current_rendering_driver_name(), "gpu": RenderingServer.get_video_adapter_name(), "os": OS.get_name() + " " + OS.get_version(), "processor": OS.get_processor_name(), "internal_resolution": [1920, 1080], "window_pixels": [get_window().size.x, get_window().size.y], "display_scale": DisplayServer.screen_get_scale(), "frame_cap": Engine.max_fps, "asset": actor.visual.descriptor if actor.visual != null else {}, "tuning": tuning.values, "native_export": not OS.has_feature("editor")}

func write_diagnostics() -> void:
	var report: Dictionary = {"identity": identity(), "intervals": perf.report(), "action": {"count": action.action_id, "impacts": action.impact_count, "completed": action.completed_count, "phase": action.phase}, "actor_position": [actor.position.x, actor.position.y, actor.position.z], "input_events": input_events, "last_input": last_input, "load_error": load_error, "nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT)}
	var path: String = "user://diagnostics.json"
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(report, "\t"))
		tuning.message = "Diagnostics written to " + ProjectSettings.globalize_path(path)
		print("DUSK_DIAGNOSTICS ", ProjectSettings.globalize_path(path))
