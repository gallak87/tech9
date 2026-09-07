extends SceneTree
## Real-game candidate smoke check. No accepted tuning or gameplay code changes.
## godot --path game --script _prep/tools/character_probe.gd -- --descriptor res://assets/kaida/a1/descriptor.json --output ABSOLUTE_DIRECTORY
var game: DuskFoundation
var checks: Array[Dictionary] = []
var failures := 0
var output := ""
var descriptor := ""
var measured: Dictionary = {}
var finished := false

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	for i in range(args.size() - 1):
		if args[i] == "--descriptor": descriptor = args[i + 1]
		if args[i] == "--output": output = args[i + 1]
	call_deferred("run")

func check(ok: bool, label: String) -> void:
	checks.append({"pass": ok, "check": label})
	if not ok: failures += 1
	print("CHARACTER_PROBE ", "PASS " if ok else "FAIL ", label)

func meshes(node: Node) -> Array[MeshInstance3D]:
	var found: Array[MeshInstance3D] = []
	if node is MeshInstance3D: found.append(node)
	for child in node.get_children(): found.append_array(meshes(child))
	return found

func sample(asset: DuskAssetAssembly, role: String, at: float) -> void:
	game.hud.animation.select(["idle", "walk", "run", "attack", "hurt"].find(role))
	asset.player.stop()
	asset.player.play(str(asset.descriptor.clips[role].name), 0)
	asset.player.advance(0)
	asset.player.seek(at, true)
	asset.player.advance(0)
	asset.player.pause()
	await process_frame
	await process_frame

func capture(label: String) -> void:
	RenderingServer.force_draw(false)
	check(root.get_texture().get_image().save_png(output.path_join(label + ".png")) == OK, "Captured " + label)

func run() -> void:
	if descriptor.is_empty() or not output.is_absolute_path():
		push_error("Supply --descriptor and an absolute --output directory")
		quit(1)
		return
	if DisplayServer.get_name() == "headless":
		push_error("Character probe requires a native window for capture checks")
		quit(1)
		return
	if DirAccess.dir_exists_absolute(output) or FileAccess.file_exists(output):
		push_error("Evidence output already exists; choose a fresh directory")
		quit(1)
		return
	if DirAccess.make_dir_recursive_absolute(output) != OK:
		push_error("Cannot create evidence output directory: " + output)
		quit(1)
		return
	create_timer(45).timeout.connect(func() -> void:
		if not finished:
			check(false, "Probe timeout")
			finish())
	game = load("res://development/foundation.tscn").instantiate() as DuskFoundation
	game.tuning.path = output.path_join("unused-tuning.json")
	root.add_child(game)
	for connection in root.focus_exited.get_connections(): root.focus_exited.disconnect(connection.callable)
	game.set_unfocused(false)
	game.tuning.values = DuskTuning.DEFAULTS.duplicate()
	game.tuning.values.camera_distance = 5.3
	game.tuning.values.camera_pitch = 15.0
	game.tuning.values.camera_yaw = 20.0
	game.apply_tuning()
	game.set_mode(0)
	var index := game.candidates.find(descriptor)
	check(index >= 0, "Candidate registered in game")
	if index < 0:
		finish()
		return
	game.load_candidate_index(index)
	check(game.load_error.is_empty(), "Game importer assembles candidate: " + game.load_error)
	if not game.load_error.is_empty():
		finish()
		return
	var asset := game.actor.visual
	var skeleton := DuskAssetAssembly.find_skeleton(asset.model)
	check(skeleton != null, "Imported Skeleton3D")
	if skeleton == null:
		finish()
		return
	measured.bones = skeleton.get_bone_count()
	var skinned: Array[MeshInstance3D] = []
	for mesh in meshes(asset.model):
		if mesh.skin != null: skinned.append(mesh)
	check(not skinned.is_empty(), "Imported skinned character mesh")
	var binding_ok := true
	for mesh in skinned: binding_ok = binding_ok and mesh.get_node_or_null(mesh.skeleton) == skeleton
	check(binding_ok, "Character skin binds to the imported skeleton")
	var material_ok := false
	for mesh in skinned:
		for surface in range(mesh.mesh.get_surface_count()):
			var mat := mesh.get_active_material(surface) as BaseMaterial3D
			material_ok = material_ok or (mat != null and mat.albedo_texture != null and mat.normal_texture != null)
	check(material_ok, "Imported embedded base color and normal maps")
	var sockets: Array[BoneAttachment3D] = []
	for child in skeleton.get_children():
		if child is BoneAttachment3D: sockets.append(child)
	check(sockets.size() == asset.descriptor.attachments.size() and not sockets.is_empty(), "Separate equipment resolves declared bone sockets")
	if skinned.is_empty() or sockets.is_empty():
		finish()
		return
	measured.clip_seconds = {}
	for role in ["idle", "walk", "run", "attack", "hurt"]:
		measured.clip_seconds[role] = asset.clip_length(role)
		check(asset.clip_length(role) > .1, "AnimationPlayer resolves " + role)
		await sample(asset, role, asset.clip_length(role)*.25)
		await capture(role)
	await sample(asset, "attack", 0)
	var start_pose := skinned[0].bake_mesh_from_current_skeleton_pose()
	var start_vertices: PackedVector3Array = start_pose.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	var grip_start := sockets[0].global_position
	await sample(asset, "attack", asset.clip_length("attack")*.5)
	var contact_pose := skinned[0].bake_mesh_from_current_skeleton_pose()
	var contact_vertices: PackedVector3Array = contact_pose.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	var max_motion := 0.0
	for i in range(start_vertices.size()): max_motion = maxf(max_motion, start_vertices[i].distance_to(contact_vertices[i]))
	measured.attack_skin_motion_m = max_motion
	check(max_motion > .05, "Godot skin deforms during the sword attack")
	check(sockets[0].global_position.distance_to(grip_start) > .05, "Equipment follows the animated hand")
	await capture("attack-contact")
	var motion_root := skeleton.find_bone("MotionRoot")
	check(motion_root >= 0, "Declared motion carrier survived import")
	if motion_root >= 0:
		for role in ["walk", "run", "attack"]:
			var first := Vector3.ZERO
			var max_travel := 0.0
			for i in range(9):
				await sample(asset, role, asset.clip_length(role)*i/8.0)
				var pos := skeleton.get_bone_global_pose(motion_root).origin
				if i == 0: first = pos
				max_travel = maxf(max_travel, Vector2(pos.x, pos.z).distance_to(Vector2(first.x, first.z)))
			check(max_travel < .0001, role + " remains in place in Godot")
	# Exercise the same reaction clip on a second instance through the actual
	# rehearsal controller; the game's default target selection is unchanged.
	var target_asset := DuskAssetAssembly.new()
	game.simulation.add_child(target_asset)
	var target_ready := target_asset.assemble(descriptor)
	check(target_ready, "Second character instance resolves independently")
	if not target_ready:
		target_asset.queue_free()
		finish()
		return
	game.simulation.remove_child(target_asset)
	game.target.install(target_asset)
	game.set_mode(2)
	game.command("attack")
	await game.action.impact
	await process_frame
	await process_frame
	await capture("rehearsal-contact")
	await create_timer(game.action.attack_duration + game.action.recovery_duration + game.action.return_duration + .2).timeout
	check(game.action.phase == "ready" and game.action.impact_count == 1, "Approach / strike / recovery / return completes with exactly one hit")
	check(game.actor.position.distance_to(DuskRehearsal.HOME) < .01, "Controller returns character to formation")
	check(not FileAccess.file_exists(game.tuning.path), "Probe did not write accepted tuning")
	finish()

func finish() -> void:
	if finished: return
	finished = true
	var file := FileAccess.open(output.path_join("runtime.json"), FileAccess.WRITE)
	if file == null:
		push_error("Cannot write character probe report: " + error_string(FileAccess.get_open_error()))
		quit(1)
		return
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"measurements":measured,"identity":game.identity() if game else {},"scope":"Candidate integration smoke check; owner visual acceptance and plan 03 polish pending"}, "\t"))
	file.close()
	print("CHARACTER_PROBE_RESULT ", failures, " failures / ", checks.size(), " checks")
	quit(0 if failures == 0 else 1)
