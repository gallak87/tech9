extends Node
## Opt-in integration checks against the real scene, input handlers and controllers.
## Test saves are isolated from the owner's accepted tuning.
var game: DuskFoundation
var checks: Array[Dictionary] = []
var started: int
var failures: int = 0

func run(root: DuskFoundation) -> void:
	game = root
	process_mode = Node.PROCESS_MODE_ALWAYS
	started = Time.get_ticks_msec()
	# A deterministic test run is allowed to simulate focus explicitly.
	game.get_window().focus_exited.disconnect(game.get_window().focus_exited.get_connections()[0].callable)
	game.get_window().focus_entered.disconnect(game.get_window().focus_entered.get_connections()[0].callable)
	game.set_unfocused(false)
	if "--verify-restart" in OS.get_cmdline_user_args():
		await seconds(2.0)
		check(game.actor.visual != null and game.actor.visual.descriptor.revision == "clay-r1", "Cold restart restores selected revision")
		check(is_equal_approx(game.actor.walk_speed, 2.8), "Cold restart restores walk speed")
		check(is_equal_approx(game.camera.yaw, 60.0), "Cold restart restores camera")
		check(is_equal_approx(game.action.impact_fraction, 0.55), "Cold restart restores contact timing")
		finish("restart")
		return
	await seconds(3.0)
	check(game.actor.visual != null, "Prepared model imported and assembled")
	if game.actor.visual == null:
		finish("foundation")
		return
	check(game.actor.visual.model.get_node_or_null("Fixture/Torso/RightArm/Grip") != null, "Declared grip socket exists")
	check(game.actor.visual.player.get_animation_list().size() >= 5, "Imported animation roles available")
	var descriptor: Dictionary = game.actor.visual.descriptor.duplicate(true)
	var bad: Dictionary = descriptor.duplicate(true)
	bad.clips.attack.name = "missing_attack"
	await rejects(bad, "Missing clip is visible and preserves identified prior actor")
	bad = descriptor.duplicate(true)
	bad.attachments[0].socket_path = "MissingGrip"
	await rejects(bad, "Missing attachment socket rejected")
	bad = descriptor.duplicate(true)
	bad.model.sha256 = "0".repeat(64)
	await rejects(bad, "Altered source hash rejected")
	bad = descriptor.duplicate(true)
	bad.dimensions.height_m = -1
	await rejects(bad, "Invalid physical dimensions rejected")
	bad = descriptor.duplicate(true)
	bad.motion.clips = "root_motion"
	await rejects(bad, "Conflicting motion ownership rejected")
	game.load_candidate_index(0)
	game.tuning.values = DuskTuning.DEFAULTS.duplicate()
	game.apply_tuning()
	await key(KEY_2)
	game.camera.yaw = 0.0
	game.camera.update_camera(1.0)
	game.perf.begin("test_walk")
	var start: Vector3 = game.actor.position
	key_down(KEY_W)
	await seconds(1.0)
	key_up(KEY_W)
	var walking: float = game.actor.position.distance_to(start)
	check(walking > 1.7 and walking < 2.8 and game.actor.position.z < -1.7, "Camera-relative walk uses real input mapping")
	game.actor.place(Vector3.ZERO)
	key_down(KEY_SHIFT)
	key_down(KEY_W)
	await seconds(1.0)
	key_up(KEY_W)
	key_up(KEY_SHIFT)
	var running: float = game.actor.position.length()
	check(running > walking * 1.5 and running < 5.3, "Shift runs faster than walking")
	game.actor.place(Vector3(0, 0, -5.0))
	key_down(KEY_W)
	await seconds(2.0)
	key_up(KEY_W)
	check(game.actor.position.z > -6.65 and game.actor.position.z < -6.2, "Collision wall prevents leaving patch")
	game.actor.place(Vector3.ZERO)
	game.camera.yaw = 90.0
	game.camera.update_camera(1.0)
	key_down(KEY_W)
	await seconds(1.0)
	key_up(KEY_W)
	check(game.actor.position.x < -1.6 and absf(game.actor.position.z) < 0.2, "Orbit changes movement basis and character turning")
	game.actor.place(Vector3(3.8, 0, -2.8))
	game.camera.yaw = 0.0
	game.camera.update_camera(1.0)
	key_down(KEY_W)
	await seconds(1.0)
	key_up(KEY_W)
	check(game.actor.position.y > 0.25, "Controller follows ramp collision")
	await key(KEY_C)
	await key(KEY_1)
	game.perf.begin("neutral_idle")
	await seconds(5.0)
	await capture("inspect")
	game.actor.visual.play_role("walk", true)
	await seconds(0.2)
	await key(KEY_P)
	var paused_clip: float = game.actor.visual.player.current_animation_position
	game.perf.begin("paused")
	await seconds(3.0)
	check(is_equal_approx(paused_clip, game.actor.visual.player.current_animation_position), "Pause freezes imported clip")
	game.command("step")
	await seconds(0.2)
	check(game.actor.visual.player.current_animation_position > paused_clip and game.get_tree().paused, "Step advances paused simulation and pauses again")
	await key(KEY_P)
	await key(KEY_3)
	game.perf.begin("repeated_rehearsal")
	for cycle: int in range(4):
		var before: int = game.action.impact_count
		await key(KEY_SPACE)
		check(game.action.phase == "approach", "Strike %d starts approach via Space" % cycle)
		await key(KEY_SPACE)
		check(game.action.action_impacts == 0, "Repeated trigger cannot duplicate action")
		if cycle == 0:
			await seconds(0.75)
			await key(KEY_P)
			var frozen: float = game.action.elapsed
			await seconds(0.5)
			check(is_equal_approx(frozen, game.action.elapsed), "Pause freezes action timeline before impact")
			await key(KEY_P)
			await capture("rehearse")
		var timeout: int = Time.get_ticks_msec() + 7000
		while game.action.phase != "ready" and Time.get_ticks_msec() < timeout:
			await get_tree().process_frame
		check(game.action.phase == "ready" and game.action.impact_count == before + 1, "Strike %d completes with exactly one impact" % cycle)
		check(game.actor.position.distance_to(DuskRehearsal.HOME) < 0.01, "Strike %d returns exactly to formation" % cycle)
	await key(KEY_2)
	game.perf.begin("continuous_traversal")
	for direction: int in [KEY_W, KEY_D, KEY_S, KEY_A]:
		key_down(direction)
		await seconds(1.5)
		key_up(direction)
	await capture("traverse")
	game.perf.begin("asset_reload")
	await seconds(0.2)
	var baseline_nodes: int = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	var baseline_resources: int = int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT))
	for swap: int in range(16):
		game.load_candidate_index(swap % 2)
		await seconds(0.12)
	await seconds(0.3)
	check(int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)) <= baseline_nodes + 2, "Repeated swaps release previous actor nodes")
	check(int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)) <= baseline_resources + 10, "Repeated swaps do not accumulate imported resources")
	game.perf.begin("six_instances")
	var extras: Array[DuskCharacter] = []
	for i: int in range(4):
		var extra := DuskCharacter.new()
		game.simulation.add_child(extra)
		var asset := DuskAssetAssembly.new()
		extra.add_child(asset)
		check(asset.assemble(DuskFoundation.DEFAULT_CANDIDATE), "Additional instance %d loads" % i)
		extra.remove_child(asset)
		extra.install(asset)
		extra.place(Vector3(i * 1.5 - 2.5, 0, -3))
		extras.append(extra)
	game.target.visible = true
	await seconds(5.0)
	for extra: DuskCharacter in extras:
		extra.queue_free()
	game.target.visible = false
	game.set_unfocused(true)
	game.perf.begin("unfocused")
	var idle_position: Vector3 = game.actor.position
	key_down(KEY_W)
	await seconds(3.0)
	key_up(KEY_W)
	check(game.get_tree().paused and Engine.max_fps == 10 and game.actor.position == idle_position, "Inactive window pauses simulation and caps rendering")
	game.set_unfocused(false)
	game.load_candidate_index(1)
	game.tuning.values.walk_speed = 2.8
	game.tuning.values.camera_yaw = 60.0
	game.tuning.values.impact_fraction = 0.55
	game.apply_tuning()
	game.command("save")
	check(FileAccess.file_exists(game.tuning.path), "Accepted tuning deliberately written")
	game.tuning.values.walk_speed = 1.0
	game.apply_tuning()
	game.command("restore")
	check(is_equal_approx(game.actor.walk_speed, 2.8) and game.actor.visual.descriptor.revision == "clay-r1", "Restore pairs tuning with accepted candidate")
	finish("foundation")

func rejects(descriptor: Dictionary, label: String) -> void:
	var file: FileAccess = FileAccess.open("user://invalid_fixture.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(descriptor))
	file.close()
	var current: DuskAssetAssembly = game.actor.visual
	var result: bool = game.load_candidate("user://invalid_fixture.json")
	check(not result and not game.load_error.is_empty() and game.actor.visual == current, label)
	await get_tree().process_frame

func check(condition: bool, label: String) -> void:
	checks.append({"pass": condition, "check": label})
	if not condition:
		failures += 1
	print("DUSK_TEST ", "PASS " if condition else "FAIL ", label)

func key_down(code: int) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.pressed = true
	Input.parse_input_event(event)

func key_up(code: int) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.pressed = false
	Input.parse_input_event(event)

func key(code: int) -> void:
	key_down(code)
	await get_tree().process_frame
	key_up(code)
	await get_tree().process_frame

func seconds(duration: float) -> void:
	await get_tree().create_timer(duration, true).timeout

func capture(label: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	await RenderingServer.frame_post_draw
	var image: Image = game.get_viewport().get_texture().get_image()
	image.save_png("user://" + label + ".png")

func finish(label: String) -> void:
	var report: Dictionary = {"checks": checks, "failures": failures, "elapsed_seconds": (Time.get_ticks_msec() - started) / 1000.0, "identity": game.identity(), "performance": game.perf.report()}
	var file: FileAccess = FileAccess.open("user://test_" + label + ".json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	file.close()
	print("DUSK_TEST_RESULT ", failures, " failures / ", checks.size(), " checks; ", ProjectSettings.globalize_path("user://test_" + label + ".json"))
	get_tree().quit(0 if failures == 0 else 1)
