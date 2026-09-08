extends "res://tests/environment_test.gd"
## Focused real-input encounter coverage; existing character/rehearsal unchanged.
var encounter: DuskCoastalEncounter

func run(root: DuskCoast) -> void:
	game = root
	encounter = game.encounter
	process_mode = Node.PROCESS_MODE_ALWAYS
	started = Time.get_ticks_msec()
	game.set_unfocused(false)
	var save_before: String = FileAccess.get_sha256("user://accepted_tuning.json") if FileAccess.file_exists("user://accepted_tuning.json") else "absent"
	await seconds(2)
	check(game.actor.is_on_floor() and not encounter.active,"Cold launch remains ordinary coastal exploration")
	check(encounter.error.is_empty() and encounter.enemy.visual.player != null,"Prepared sentry and authored mechanical clips load through the existing consumer")
	check(game.actor.camera == game.camera,"Encounter setup preserves the exploration camera")
	check(not encounter.begin(),"Encounter requires the visible terrace interaction range")
	if "--encounter-restart" in OS.get_cmdline_user_args():
		finish("encounter_restart")
		return
	var actor_id: int = game.actor.get_instance_id()
	var site_id: int = game.site.get_instance_id()
	for point: Vector3 in [Vector3(-5,0,13),Vector3(-5,0,8),Vector3(13.3,0,8),Vector3(13.3,3,-13.5),Vector3(4,3,-13.5)]:
		await walk_to(point,true)
	check(encounter.can_begin(),"Run the real coast, crossing and ascent to the visible sentry")
	await capture("encounter-approach")
	var entry_at: Vector3 = game.actor.global_position
	set_keys([KEY_W])
	await key(KEY_E)
	await seconds(.4)
	check(encounter.active and encounter.battle_camera.size<16.5 and encounter.battle_camera.size>6.2,"Encounter zooms continuously from exploration toward the side shot")
	set_keys([])
	if not await reach_phase("ready"): return
	check(game.site.get_instance_id() == site_id and game.actor.get_instance_id() == actor_id,"Staging retains the exact environment and Kaida instances")
	check(absf(game.actor.global_position.y-3.02)<.03 and game.actor.get_parent() == encounter.formation,"Staging reaches the elevated terrace without falling or scene swapping")
	check((-game.actor.global_basis.z).dot((encounter.enemy.global_position-game.actor.global_position).normalized())>.99,"Kaida faces the sentry when the side shot settles")
	var hero_pixel: Vector2 = encounter.battle_camera.unproject_position(game.actor.global_position+Vector3.UP)
	var enemy_pixel: Vector2 = encounter.battle_camera.unproject_position(encounter.enemy.global_position+Vector3.UP)
	check(hero_pixel.x<enemy_pixel.x and hero_pixel.x>80 and enemy_pixel.x<1840 and hero_pixel.y<820 and enemy_pixel.y<820,"The side shot frames Kaida left, sentry right, above the command bar")
	game.perf.begin("encounter_ready_warmed")
	await seconds(5)
	game.perf.begin("encounter_capture_readback")
	await capture("encounter-ready")
	await key(KEY_SPACE)
	await seconds(.1)
	await key(KEY_ESCAPE)
	var frozen: Vector3 = game.actor.global_position
	var elapsed: float = encounter.action.elapsed
	await seconds(.4)
	check(game.actor.global_position == frozen and is_equal_approx(encounter.action.elapsed,elapsed) and Engine.max_fps == 30,"Pause freezes staging/action and camera at the normal paused cap")
	await key(KEY_ESCAPE)
	game.set_unfocused(true)
	var paused_camera: Transform3D = encounter.battle_camera.global_transform
	var paused_phase_age: float = encounter.age
	await seconds(.35)
	check(Engine.max_fps == 10 and encounter.battle_camera.global_transform == paused_camera and is_equal_approx(encounter.age,paused_phase_age),"Inactive focus freezes the encounter at the normal 10 FPS cap")
	game.set_unfocused(false)
	await key(KEY_SPACE) # Repeated command during an action must not queue a hit.
	if not await wait_hit(1): return
	var blade: PackedVector3Array = game.actor.visual.blade_segment()
	var torso: Vector3 = encounter.enemy.global_position+Vector3.UP
	var contact_distance: float = torso.distance_to(Geometry3D.get_closest_point_to_segment(torso,blade[0],blade[1]))
	check(contact_distance<.65,"Existing sword contact remains aligned after rotating/translating the formation")
	game.perf.begin("encounter_capture_impact")
	await capture("encounter-impact")
	if not await reach_phase("response"): return
	await key(KEY_G)
	await seconds(.2)
	await capture("encounter-guard")
	if not await reach_phase("ready"): return
	check(encounter.guard_count == 1 and encounter.player_health == 2,"Guard blocks the telegraphed sentry pulse")
	check(encounter.hit_count == 1 and encounter.action.action_impacts == 1,"Repeated strike input produces exactly one impact")
	game.perf.begin("encounter_exchange")
	for i: int in range(2):
		await key(KEY_SPACE)
		if i == 0:
			if not await reach_phase("response"): return
			await key(KEY_G)
			if not await reach_phase("ready"): return
		else:
			if not await reach_phase("result"): return
	check(encounter.enemy_health == 0 and encounter.hit_count == 3 and encounter.player_health == 2,"Three staged strikes finish the guarded practice exchange")
	await capture("encounter-result")
	set_keys([KEY_W])
	await key(KEY_ENTER)
	if not await reach_phase("exploration"): return
	check(game.actor.global_position.distance_to(entry_at)<.04 and game.waiting_for_release,"Return restores the actual entry position and holds stale movement")
	check(game.actor.camera == game.camera and game.actor.get_parent() == game.simulation,"Return restores camera and actor ownership")
	set_keys([])
	await seconds(.25)
	await walk_to(Vector3(5,3,-12),false)
	check(game.actor.traversal_enabled and game.actor.global_position.distance_to(entry_at)>.5,"Normal movement resumes after leaving battle")
	# Exercise a different approach, then disengage during the attack.
	await walk_to(Vector3(4,3,FRONT_Z()),false)
	await walk_to(Vector3(-.5,3,FRONT_Z()),false)
	await walk_to(Vector3(-.5,3,-13),false)
	check(encounter.can_begin(),"Sentry can also be engaged from the opposite side")
	await key(KEY_E)
	if not await reach_phase("ready"): return
	await key(KEY_SPACE)
	await seconds(.2)
	await key(KEY_TAB)
	if not await reach_phase("exploration"): return
	check(game.actor.get_parent() == game.simulation and not encounter.action.enabled,"Disengaging mid-action clears the battle timeline")
	# Unguarded counters establish the defeat/retry boundary without progression.
	await key(KEY_E)
	if not await reach_phase("ready"): return
	for i: int in range(2):
		await key(KEY_SPACE)
		if not await reach_phase("ready" if i == 0 else "result"): return
	check(encounter.player_health == 0 and game.actor.reaction == "defeated","Unguarded pulses reach a recoverable practice defeat")
	await key(KEY_ENTER)
	if not await reach_phase("exploration"): return
	await seconds(.2)
	check(game.actor.reaction == "ready" and encounter.enemy.reaction == "ready","Leaving defeat restores both actors for replay")
	await key(KEY_E)
	await seconds(.3)
	await key(KEY_R)
	await seconds(.5)
	check(not encounter.active and game.actor.global_position.distance_to(DuskCoastSite.SPAWN)<.05,"Reset safely aborts a camera/staging transition")
	check(save_before == (FileAccess.get_sha256("user://accepted_tuning.json") if FileAccess.file_exists("user://accepted_tuning.json") else "absent"),"Encounter presentation never writes accepted tuning")
	observations["contact_distance_m"] = contact_distance
	observations["source_scope"] = "Mapped-input encounter, unchanged Kaida/controller/rehearsal. No full ATB, progression, or full character-suite rerun."
	finish("encounter")

func FRONT_Z() -> float:
	return DuskCoastalEncounter.FRONT_Z

func reach_phase(expected: String) -> bool:
	var deadline: int = Time.get_ticks_msec()+12000
	while encounter.phase != expected and Time.get_ticks_msec()<deadline:
		await get_tree().physics_frame
	var reached: bool = encounter.phase == expected
	check(reached,"Encounter reaches "+expected)
	if not reached:
		observations["stuck"] = {"phase":encounter.phase,"position":str(game.actor.global_position),"path":str(encounter.path)}
		await capture("encounter-stuck")
		finish("encounter")
	return reached

func wait_hit(total: int) -> bool:
	var deadline: int = Time.get_ticks_msec()+6000
	while encounter.hit_count<total and Time.get_ticks_msec()<deadline:
		await get_tree().physics_frame
	var reached: bool = encounter.hit_count == total
	check(reached,"Strike reaches its single contact event")
	if not reached: finish("encounter")
	return reached
