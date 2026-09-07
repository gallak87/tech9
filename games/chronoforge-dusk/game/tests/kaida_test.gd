extends "res://tests/foundation_test.gd"
## Rendered checks for the actual r4 actor. Captures have separate perf intervals.
var first_contact: Dictionary = {}

func run(root: DuskFoundation) -> void:
	game = root
	process_mode = Node.PROCESS_MODE_ALWAYS
	started = Time.get_ticks_msec()
	game.set_unfocused(false)
	if "--kaida-restart" in OS.get_cmdline_user_args():
		await seconds(2.0)
		check(game.actor.visual.descriptor.asset_id == "kaida" and game.actor.visual.descriptor.revision == "r4", "Cold launch restores Kaida r4")
		check(game.tuning.values == DuskTuning.DEFAULTS, "Cold launch reproduces all saved gameplay tuning")
		check(game.tuning.saved.source_sha256 == game.source_sha256, "Save identifies tested game source digest")
		check(is_equal_approx(game.action.hit_stop, 0.065) and is_equal_approx(game.actor.run_stride_speed, 5.06165), "Cold launch applies action and stride settings")
		finish("kaida_restart")
		return
	game.tuning.values = DuskTuning.DEFAULTS.duplicate()
	game.load_candidate_index(game.candidates.find(DuskFoundation.DEFAULT_CANDIDATE))
	game.apply_tuning()
	await seconds(3.0)
	check(game.actor.visual != null and game.load_error.is_empty(), "Kaida default candidate loads without fallback")
	if game.actor.visual == null:
		finish("kaida")
		return
	check(game.actor.visual.descriptor.asset_id == "kaida" and game.actor.visual.descriptor.revision == "r4", "Displayed actor is Kaida r4")
	var skeleton: Skeleton3D = DuskAssetAssembly.find_skeleton(game.actor.visual.model)
	check(skeleton != null and skeleton.get_bone_count() == 67, "Real 67-bone Kaida rig present")
	check(game.actor.visual.equipment.size() == 1 and game.actor.visual.equipment[0].get_parent() is BoneAttachment3D, "Separate sword uses skeletal socket")
	observations["asset_hash"] = game.actor.visual.descriptor.model.sha256
	await key(KEY_1)
	game.tuning.values.light_game = false
	game.apply_tuning()
	await seconds(3.0)
	game.perf.begin("kaida_neutral_idle_10s")
	await seconds(10.0)
	game.perf.begin("captures_not_normal_play")
	await capture("kaida-neutral")
	# Sample complete cycles, including MotionRoot and actual socket transforms.
	var root_bone: int = skeleton.find_bone("MotionRoot")
	var maximum_root_drift: float = 0.0
	var socket_positions: Array[Vector3] = []
	for role: String in ["idle", "walk", "run", "attack", "hurt"]:
		game.actor.visual.player.stop()
		game.actor.visual.player.play(role, 0.0)
		game.actor.visual.player.advance(0.0)
		game.actor.visual.player.pause()
		for sample: int in range(25):
			game.actor.visual.player.seek(game.actor.visual.clip_length(role) * sample / 24.0, true)
			game.actor.visual.player.advance(0.0)
			skeleton.force_update_all_bone_transforms()
			await get_tree().process_frame
			var root_position: Vector3 = skeleton.get_bone_pose_position(root_bone)
			maximum_root_drift = maxf(maximum_root_drift, Vector2(root_position.x, root_position.z).length())
			var segment: PackedVector3Array = game.actor.visual.blade_segment()
			check_finite(segment)
			if role == "attack":
				socket_positions.append(segment[1])
			if role == "attack" and sample in [0, 8, 12, 16, 24]:
				game.hud.animation.select(3)
				await capture("kaida-attack-%02d" % sample)
	check(maximum_root_drift < 0.002, "All five complete clips preserve controller-owned root motion")
	check(socket_positions[0].distance_to(socket_positions[12]) > 0.25, "Sword socket follows actual strike motion")
	observations["maximum_root_xz_m"] = maximum_root_drift
	game.tuning.values.light_game = true
	game.apply_tuning()
	await key(KEY_2)
	game.camera.yaw = 0.0
	game.camera.update_camera(1.0)
	var start: Vector3 = game.actor.position
	key_down(KEY_W)
	await seconds(1.0)
	var walk_distance: float = start.distance_to(game.actor.position)
	check(walk_distance > 2.0 and walk_distance < 2.5, "Kaida responds to mapped walking input")
	check(absf(game.actor.visual.player.speed_scale - game.actor.walk_speed / game.actor.walk_stride_speed) < 0.03, "Walk playback matches measured stride travel")
	key_up(KEY_W)
	await seconds(0.2)
	check(game.actor.visual.active_role == "idle" and game.actor.velocity.length() < 0.02, "Release brakes and blends to idle within 200 ms")
	game.actor.place(Vector3.ZERO)
	key_down(KEY_W)
	key_down(KEY_D)
	await seconds(1.0)
	key_up(KEY_W)
	key_up(KEY_D)
	check(game.actor.position.length() < 2.55, "Diagonal input has no speed boost")
	game.actor.place(Vector3.ZERO)
	key_down(KEY_SHIFT)
	key_down(KEY_W)
	await seconds(1.0)
	check(game.actor.position.length() > 4.5 and absf(game.actor.visual.player.speed_scale - game.actor.run_speed / game.actor.run_stride_speed) < 0.03, "Run displacement and imported playback agree")
	key_up(KEY_W)
	key_up(KEY_SHIFT)
	var release: Vector3 = game.actor.position
	await seconds(0.25)
	check(game.actor.position.distance_to(release) < 0.4 and game.actor.visual.active_role == "idle", "Run stops within 40 cm without residual skating")
	game.actor.place(Vector3(0, 0, -5.8))
	key_down(KEY_W)
	await seconds(1.2)
	check(game.actor.position.z > -6.65 and game.actor.visual.active_role == "idle", "Wall blocks Kaida and stops in-place walking")
	key_up(KEY_W)
	game.actor.place(Vector3(3.8, 0, -2.8))
	key_down(KEY_W)
	await seconds(1.0)
	key_up(KEY_W)
	check(game.actor.position.y > 0.25, "Kaida maintains ground contact on authored ramp")
	await key(KEY_2)
	await key(KEY_C)
	await seconds(2.0)
	game.perf.begin("kaida_traversal_turning_10s")
	key_down(KEY_SHIFT)
	for code: int in [KEY_W, KEY_D, KEY_S, KEY_A, KEY_W, KEY_D, KEY_S, KEY_A]:
		key_down(code)
		await seconds(1.25)
		key_up(code)
	key_up(KEY_SHIFT)
	game.perf.begin("captures_not_normal_play")
	await seconds(0.4)
	await capture("kaida-traverse")
	check(game.camera.focus.distance_to(game.actor.position) < 0.08, "Follow camera settles after repeated running turns")
	await key(KEY_H)
	key_down(KEY_W)
	var hurt_at: Vector3 = game.actor.position
	await seconds(0.2)
	key_up(KEY_W)
	check(game.actor.reaction == "hurt" and game.actor.position == hurt_at, "Hurt temporarily locks traversal and plays real reaction")
	await seconds(0.8)
	check(game.actor.reaction == "ready", "Hurt recovers to controllable state")
	await key(KEY_K)
	await seconds(0.8)
	check(game.actor.reaction == "defeated" and game.actor.visual.rotation.z > 1.4, "Basic defeat stays down until reset")
	await capture("kaida-defeat")
	await key(KEY_R)
	check(game.actor.reaction == "ready" and game.actor.visual.transform == Transform3D.IDENTITY, "Reset clears defeat pose without accumulated offsets")
	await key(KEY_3)
	game.action.impact.connect(record_first_contact, CONNECT_ONE_SHOT)
	await key(KEY_SPACE)
	await phase("attack")
	await key(KEY_P)
	var frozen: float = game.action.clip_time
	await seconds(0.3)
	check(is_equal_approx(game.action.clip_time, frozen), "Pause freezes action clip and timeline together")
	game.command("step")
	await seconds(0.15)
	check(game.action.clip_time > frozen and game.action.clip_time - frozen < 0.03 and game.get_tree().paused, "Step advances one physics tick of attack")
	await key(KEY_P)
	var deadline: int = Time.get_ticks_msec() + 5000
	while not game.action.contact_sent and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	check(game.action.contact_sent, "Attack reaches contact")
	check(absf(game.actor.visual.player.current_animation_position - game.action.attack_duration * game.action.impact_fraction) < 0.002, "Impact lands on exact imported contact pose")
	check(first_contact.get("hit_stop", false), "Contact freezes both actors during hit stop")
	var contact_distance: float = float(first_contact.get("distance", 100.0))
	observations["contact"] = first_contact
	observations["blade_distance_to_target_center_m"] = contact_distance
	check(contact_distance < 0.40, "Physical blade reaches target torso at logical impact")
	await seconds(0.3)
	await capture("kaida-contact")
	game.command("pause")
	await phase("ready")
	await key(KEY_T)
	await key(KEY_SPACE)
	await phase("attack")
	await seconds(0.12)
	check(game.slow_motion and game.action.clip_time < 0.12, "Quarter-speed control slows actual action timeline")
	await key(KEY_T)
	await phase("ready")
	game.perf.begin("kaida_repeated_strikes_8_cycles")
	for cycle: int in range(8):
		var impacts: int = game.action.impact_count
		var feedback_impacts: int = game.feedback.impact_events
		var swings: int = game.feedback.swing_events
		await key(KEY_SPACE)
		await key(KEY_SPACE)
		await phase("ready")
		check(game.action.impact_count == impacts + 1 and game.feedback.impact_events == feedback_impacts + 1 and game.feedback.swing_events == swings + 1, "Cycle %d has one strike, one impact and one sound/effect event" % cycle)
		check(game.actor.position.distance_to(DuskRehearsal.HOME) < 0.001 and game.target.reaction == "ready", "Cycle %d returns home with target recovered" % cycle)
	game.perf.begin("defeat_and_reset")
	await key(KEY_K)
	await phase("ready")
	check(game.target.reaction == "defeated", "Finishing strike defeats target on contact")
	var completed_before: int = game.action.action_id
	await key(KEY_SPACE)
	check(game.action.action_id == completed_before, "Downed target cannot receive another strike")
	await capture("kaida-target-down")
	await key(KEY_R)
	await phase("ready")
	check(game.target.reaction == "ready", "Replay restores target and completes a fresh action")
	await key(KEY_SPACE)
	await phase("attack")
	await key(KEY_2)
	check(game.action.phase == "ready" and game.action.stop_remaining == 0 and not game.target.reaction_frozen and game.feedback.segments.is_empty(), "Mode change cancels action and clears hit stop/trail")
	await seconds(1.0)
	game.perf.begin("kaida_reload_6")
	var baseline_nodes: int = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	var baseline_resources: int = int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT))
	var baseline_video: float = game.perf.video_mb
	for i: int in range(6):
		game.command("reload")
		await seconds(0.3)
	await seconds(1.0)
	check(int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)) <= baseline_nodes + 2, "Reloading r4 releases prior mesh, rig and equipment nodes")
	check(int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)) <= baseline_resources + 10 and game.perf.video_mb < baseline_video + 5.0, "Reloading r4 does not accumulate resources or video memory")
	var extras: Array[DuskCharacter] = []
	for i: int in range(3):
		var extra := DuskCharacter.new()
		game.simulation.add_child(extra)
		var asset := DuskAssetAssembly.new()
		extra.add_child(asset)
		check(asset.assemble(DuskFoundation.DEFAULT_CANDIDATE), "Additional Kaida %d loads" % i)
		extra.remove_child(asset)
		extra.install(asset)
		extra.place(Vector3(i * 1.6 - 1.6, 0, -2.5))
		extras.append(extra)
	await seconds(2.0)
	game.perf.begin("four_kaida_instances_10s")
	await seconds(10.0)
	game.perf.begin("cleanup")
	for extra: DuskCharacter in extras:
		extra.queue_free()
	await seconds(1.0)
	await key(KEY_P)
	game.perf.begin("kaida_paused_5s")
	await seconds(5.0)
	check(Engine.max_fps == 30 and game.get_tree().paused, "Paused mode caps rendering at 30 FPS")
	await key(KEY_P)
	game.set_unfocused(true)
	game.perf.begin("kaida_unfocused_3s_simulated")
	await seconds(3.0)
	check(Engine.max_fps == 10 and game.get_tree().paused, "Unfocused handler suspends simulation and caps rendering at 10 FPS")
	game.set_unfocused(false)
	game.tuning.values = DuskTuning.DEFAULTS.duplicate()
	game.apply_tuning()
	await key(KEY_F6)
	check(game.tuning.saved.get("asset_id") == "kaida" and game.tuning.saved.get("source_sha256") == game.source_sha256, "Saved tuning pairs actual Kaida hash and game source")
	game.tuning.values.attack_tempo = 0.5
	game.tuning.values.run_stride_speed = 3.0
	game.apply_tuning()
	await key(KEY_F7)
	check(game.tuning.values == DuskTuning.DEFAULTS and is_equal_approx(game.action.attack_tempo, 1.0), "Restore reapplies complete traversal/action/camera tuning")
	observations["captures_excluded_from_normal_play_intervals"] = true
	observations["focus_checks"] = "simulated handler; OS focus and audible quality require direct play"
	finish("kaida")

func check_finite(segment: PackedVector3Array) -> void:
	if segment.size() != 2 or not segment[0].is_finite() or not segment[1].is_finite():
		check(false, "Sword socket contains non-finite or missing points")

func phase(expected: String) -> void:
	var deadline: int = Time.get_ticks_msec() + 12000
	while game.action.phase != expected and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	if game.action.phase != expected:
		check(false, "Timed out waiting for phase " + expected)

func record_first_contact(_id: int) -> void:
	var blade: PackedVector3Array = game.actor.visual.blade_segment()
	var center: Vector3 = game.target.position + Vector3.UP
	first_contact = {"hit_stop": game.action.stop_remaining > 0 and game.target.reaction_frozen, "distance": Geometry3D.get_closest_point_to_segment(center, blade[0], blade[1]).distance_to(center), "base": str(blade[0]), "tip": str(blade[1]), "target": str(center), "clip_time": game.action.clip_time}
	# Allow the current skeleton update to reach the renderer before pausing.
	game.call_deferred("command", "pause")

func seconds(duration: float) -> void:
	# Measurement windows and test waits are wall time, including in slow motion.
	await get_tree().create_timer(duration, true, false, true).timeout
