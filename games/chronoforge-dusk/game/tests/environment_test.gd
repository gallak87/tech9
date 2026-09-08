extends Node
## Focused native route regression. Every route segment uses mapped input events.
var game: DuskCoast
var checks: Array[Dictionary] = []
var observations: Dictionary = {}
var failures: int = 0
var held: Array[int] = []
var started: int
var minimum_y: float = 100.0
var max_air_frames: int = 0
var air_frames: int = 0
var measured_intervals: Dictionary = {}

func run(root: DuskCoast) -> void:
	game = root
	process_mode = Node.PROCESS_MODE_ALWAYS
	started = Time.get_ticks_msec()
	game.set_unfocused(false)
	var save_before: String = FileAccess.get_sha256("user://accepted_tuning.json") if FileAccess.file_exists("user://accepted_tuning.json") else "absent"
	await seconds(3)
	check(game.actor.visual != null and game.load_error.is_empty(),"Real Kaida loads through the existing assembly")
	check(game.actor.position.distance_to(Vector3(-11,0,13)) < 0.05 and game.actor.is_on_floor(),"Cold start is grounded before any reset")
	check(game.site.import_errors.is_empty(),"All selected static scenery imports validate")
	check(game.actor.visual.descriptor.revision == "a1","Kaida a1 package retained")
	check(is_equal_approx(game.actor.walk_speed,float(game.tuning.values.walk_speed)),"Accepted movement tuning applied")
	check(is_equal_approx(game.camera.size,16.5),"Authored framing independent of saved inspection camera")
	if "--environment-restart" in OS.get_cmdline_user_args():
		finish("environment_restart")
		return
	if "--locomotion-only" in OS.get_cmdline_user_args():
		await check_locomotion()
		check(save_before == (FileAccess.get_sha256("user://accepted_tuning.json") if FileAccess.file_exists("user://accepted_tuning.json") else "absent"),"Locomotion check preserves accepted tuning")
		finish("environment")
		return
	game.perf.begin("arrival_stationary_10s")
	await seconds(10)
	game.perf.begin("captures_readback")
	await capture("arrival")
	game.perf.begin("complete_route_walk")
	var route: Array[Vector3] = [Vector3(-5,0,13),Vector3(-5,0,8),Vector3(12.8,0,8),Vector3(13.3,0,2),Vector3(13.3,3,-13.5),Vector3(-3,3,-14),Vector3(-11,3,-14),Vector3(-11,3,-21),Vector3(-11,3,-14),Vector3(-12,0,8),Vector3(-11,0,13)]
	for i: int in range(route.size()):
		if i in [2,4]:
			var start_axis: Vector3 = game.actor.position
			await straight_to(route[i],KEY_D if i == 2 else KEY_W)
			check(absf(game.actor.position.z-start_axis.z) < 0.02 if i == 2 else absf(game.actor.position.x-start_axis.x) < 0.02,"A single held %s follows the %s without corrective strafing" % ["D" if i == 2 else "W","crossing" if i == 2 else "ascent"])
		else:
			await walk_to(route[i],false)
		check(game.actor.position.distance_to(route[i]) < 0.85,"Walk route waypoint %02d reached at expected height" % i)
		if i == 7:
			await seconds(.8)
			var tower_top: Vector2 = game.camera.unproject_position(Vector3(-1,15.4,-34))
			check(tower_top.y > 24 and tower_top.y < 1056,"Overlook framing includes the full signal tower mast")
		if i in [2,5,7]:
			game.perf.begin("captures_readback")
			await capture(["crossing","upper-ruin","overlook"][[2,5,7].find(i)])
			game.perf.begin("walk_after_capture_%d" % i)
	game.perf.begin("complete_route_run")
	route.reverse()
	for i: int in range(route.size()):
		await walk_to(route[i],true)
		check(game.actor.position.distance_to(route[i]) < 0.9,"Run return waypoint %02d reached at expected height" % i)
	check(minimum_y > -0.08 and max_air_frames < 12,"Route stays grounded across slope seams without falling")
	observations["route_contact"] = {"minimum_y_m":minimum_y,"max_consecutive_air_frames":max_air_frames}
	game.perf.begin("boundary_checks")
	await walk_to(Vector3(-16.8,0,18.8),true)
	# Run deliberately into the south parapet, then release and turn away.
	set_keys([KEY_S,KEY_SHIFT])
	await seconds(1.5)
	set_keys([])
	await seconds(0.25)
	check(game.actor.position.z < 19.55 and game.actor.position.y < 0.08,"Outer parapet stops a running capsule without climbing or falling")
	await walk_to(Vector3(-12,0,15),false)
	check(game.actor.position.distance_to(Vector3(-12,0,15)) < 0.9,"Can turn out of a boundary corner")
	await walk_to(Vector3(-13.3,0,17.4),false)
	await seconds(0.6)
	var faded: bool = false
	for occluder: MeshInstance3D in game.site.kit.occluders:
		faded = faded or occluder.transparency > 0.7
	check(faded,"Foreground architecture fades before it can hide Kaida")
	game.perf.begin("captures_readback")
	await capture("foreground")
	await key(KEY_ESCAPE)
	var paused_at: Vector3 = game.actor.position
	set_keys([KEY_W])
	game.perf.begin("pause_4s")
	await seconds(4)
	set_keys([])
	check(game.actor.position == paused_at and Engine.max_fps == 30 and game.pause_panel.visible,"Pause freezes movement and shows resume/reset/quit at 30 FPS")
	await key(KEY_ESCAPE)
	await walk_to(Vector3(-11,0,12),false)
	check(not game.get_tree().paused and game.actor.position.distance_to(paused_at) > 1,"Input works after resuming")
	game.set_unfocused(true)
	game.perf.begin("inactive_handler_3s")
	await seconds(3)
	check(Engine.max_fps == 10 and game.get_tree().paused,"Inactive handler pauses at 10 FPS")
	game.set_unfocused(false)
	await key(KEY_R)
	await seconds(0.5)
	check(game.actor.position.distance_to(Vector3(-11,0,13)) < 0.05 and game.actor.is_on_floor(),"R restores safe spawn and grounded feet")
	check(game.coastal_audio.step_events > 20,"Grounded walking and running generate surface-aware footfalls")
	# Keep this one bounded runner across genuine scene changes; no second actor.
	measured_intervals = game.perf.report()
	var tree: SceneTree = get_tree()
	get_parent().remove_child(self)
	tree.root.add_child(self)
	await key(KEY_F2)
	await seconds(2)
	var development: DuskFoundation = tree.current_scene as DuskFoundation
	if development != null:
		development.set_unfocused(false)
		await key(KEY_1)
		await key(KEY_2)
		await key(KEY_3)
		await key(KEY_SPACE)
		await seconds(0.3)
		var tools_work: bool = development.mode == 2 and development.action.phase != "ready"
		await key(KEY_F2)
		await seconds(2)
		game = tree.current_scene as DuskCoast
		check(tools_work and game != null,"F2 opens the actual Inspect/Traverse/Rehearse tools and returns to coast")
		game.set_unfocused(false)
		await walk_to(Vector3(-11,0,11),false)
		check(game.actor.position.z < 11.4 and not game.get_tree().paused,"Movement works after the development round trip")
		await key(KEY_R)
	else:
		check(false,"Development scene could not open")
	var save_after: String = FileAccess.get_sha256("user://accepted_tuning.json") if FileAccess.file_exists("user://accepted_tuning.json") else "absent"
	check(save_before == save_after,"Exploration leaves owner acceptance file byte-for-byte intact")
	observations["accepted_tuning_sha256"] = save_after
	observations["focus_checks"] = "Simulated game focus handler; direct OS focus separately recorded"
	observations["input_path"] = "Input.parse_input_event, physical WASD and Shift; no route teleporting"
	finish("environment")

func straight_to(target: Vector3, code: int) -> void:
	var deadline: int = Time.get_ticks_msec()+22000
	set_keys([code])
	while (target.x-game.actor.position.x if code == KEY_D else game.actor.position.z-target.z) > 0.18 and Time.get_ticks_msec()<deadline:
		await get_tree().physics_frame
	set_keys([])
	await seconds(.18)

func walk_to(target: Vector3, running: bool) -> void:
	var deadline: int = Time.get_ticks_msec()+22000
	while Vector2(target.x-game.actor.position.x,target.z-game.actor.position.z).length() > (0.38 if running else 0.25) and Time.get_ticks_msec()<deadline:
		var desired: Vector3 = (target-game.actor.position)
		desired.y = 0
		desired = desired.normalized()
		var best: float = -2
		var chosen: Array[int] = []
		for pair: Vector2 in [Vector2(0,-1),Vector2(1,-1),Vector2(1,0),Vector2(1,1),Vector2(0,1),Vector2(-1,1),Vector2(-1,0),Vector2(-1,-1)]:
			var direction: Vector3 = game.camera.global_basis.x*pair.x + game.camera.global_basis.z*pair.y
			direction.y = 0
			var score: float = direction.normalized().dot(desired)
			if score > best:
				best = score
				chosen = []
				if pair.x != 0: chosen.append(KEY_D if pair.x>0 else KEY_A)
				if pair.y != 0: chosen.append(KEY_S if pair.y>0 else KEY_W)
		if running: chosen.append(KEY_SHIFT)
		set_keys(chosen)
		await get_tree().physics_frame
		minimum_y = minf(minimum_y,game.actor.position.y)
		air_frames = 0 if game.actor.is_on_floor() else air_frames+1
		max_air_frames = maxi(max_air_frames,air_frames)
	set_keys([])
	await seconds(0.18)

func set_keys(keys: Array[int]) -> void:
	for code: int in held:
		if code not in keys: send_key(code,false)
	for code: int in keys:
		if code not in held: send_key(code,true)
	held = keys.duplicate()

func check_locomotion() -> void:
	check(is_equal_approx(game.actor.walk_speed,2.99) and is_equal_approx(game.actor.run_speed,6.63),"Walk and run use the requested 30 percent speed increase")
	var skeleton: Skeleton3D = DuskAssetAssembly.find_skeleton(game.actor.visual.model)
	var left_hand: int = skeleton.find_bone("mixamorig_LeftHand")
	var right_hand: int = skeleton.find_bone("mixamorig_RightHand")
	for running: bool in [false,true]:
		game.reset_spawn()
		await seconds(.2)
		var movement_keys: Array[int] = [KEY_D]
		if running: movement_keys.append(KEY_SHIFT)
		set_keys(movement_keys)
		await seconds(.3)
		await get_tree().physics_frame
		var start: Vector3 = game.actor.position
		var min_z: float = INF
		var max_z: float = -INF
		var clearance: float = INF
		var max_right_step: float = 0.0
		var last_right: Vector3 = skeleton.get_bone_global_pose(right_hand).origin
		for frame: int in range(60):
			await get_tree().physics_frame
			var hand: Vector3 = skeleton.get_bone_global_pose(left_hand).origin
			min_z = minf(min_z,hand.z)
			max_z = maxf(max_z,hand.z)
			clearance = minf(clearance,Vector2(hand.x,hand.z).length())
			var right: Vector3 = skeleton.get_bone_global_pose(right_hand).origin
			max_right_step = maxf(max_right_step,right.distance_to(last_right))
			last_right = right
		var speed: float = game.actor.run_speed if running else game.actor.walk_speed
		var stride: float = game.actor.run_stride_speed if running else game.actor.walk_stride_speed
		var distance: float = game.actor.position.distance_to(start)
		check(absf(distance-speed) < .12,"%s covers the expected distance in one second" % ("Run" if running else "Walk"))
		check(absf(game.actor.visual.player.speed_scale-speed/stride) < .03,"Animation stride matches actual travel")
		if not running:
			check(max_z-min_z > .4 and clearance > .20,"Normal movement uses a free running arm swing with clearance from the torso")
		else:
			check(max_right_step < .08,"Faster running keeps sword-hand motion continuous")
		observations["run" if running else "walk"] = {"speed_m_s":speed,"distance_in_one_second_m":distance,"left_hand_forward_span_m":max_z-min_z,"left_hand_horizontal_clearance_m":clearance,"max_right_hand_step_m":max_right_step}
		game.perf.begin("locomotion_capture")
		await capture("locomotion-run" if running else "locomotion-walk")
		set_keys([])
		await seconds(.25)
		check(game.actor.visual.active_role == "idle" and game.actor.measured_speed < .02,"Release stops movement and returns to idle")
	game.reset_spawn()

func send_key(code: int, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.pressed = pressed
	event.set_meta("dusk_test_input",true)
	Input.parse_input_event(event)

func key(code: int) -> void:
	send_key(code,true)
	await get_tree().process_frame
	send_key(code,false)
	await get_tree().process_frame

func seconds(duration: float) -> void:
	await get_tree().create_timer(duration,true,false,true).timeout

func check(passed: bool, title: String) -> void:
	checks.append({"pass":passed,"check":title})
	if not passed: failures += 1
	print("DUSK_ENV_CHECK ","PASS " if passed else "FAIL ",title," ",game.actor.position)

func capture(label: String) -> void:
	game.test_banner.visible = false
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://environment-"+label+".png")
	game.test_banner.visible = true

func finish(label: String) -> void:
	set_keys([])
	measured_intervals.merge(game.perf.report(),false)
	var report: Dictionary = {"identity":game.identity(),"checks":checks,"failures":failures,"observations":observations,"intervals":measured_intervals,"duration_seconds":(Time.get_ticks_msec()-started)/1000.0}
	var file := FileAccess.open("user://test_"+label+".json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"))
	file.close()
	print("DUSK_ENV_FINISHED ",label," ",failures)
	get_tree().quit(1 if failures else 0)
