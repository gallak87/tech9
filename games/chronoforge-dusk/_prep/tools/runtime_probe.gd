extends SceneTree
## Opt-in verification in the actual Dusk scene; never writes accepted tuning.
var game: DuskFoundation
var checks: Array[Dictionary] = []
var failures: int = 0
var output: String
const CHARACTER := "res://assets/diagnostic.skin-probe/r1/descriptor.json"
const PROP := "res://assets/diagnostic.grip-probe/r1/descriptor.json"

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, label: String) -> void:
	checks.append({"pass": condition, "check": label})
	if not condition:
		failures += 1
	print("PIPELINE_PROBE ", "PASS " if condition else "FAIL ", label)

func mesh_nodes(node: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	if node is MeshInstance3D:
		result.append(node)
	for child: Node in node.get_children():
		result.append_array(mesh_nodes(child))
	return result

func sample(asset: DuskAssetAssembly, role: String, time: float) -> void:
	game.hud.animation.select(["idle", "walk", "run", "attack", "hurt"].find(role))
	asset.player.play(str(asset.descriptor.clips[role].name))
	asset.player.advance(0)
	asset.player.seek(time, true)
	asset.player.pause()
	await process_frame
	await process_frame

func capture(name: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	RenderingServer.force_draw(false)
	var captured: Image = root.get_texture().get_image()
	check(captured.save_png(output.path_join(name + ".png")) == OK, "Saved rendered " + name)

func run() -> void:
	create_timer(30.0).timeout.connect(func() -> void:
		check(false, "Runtime probe timed out")
		finish())
	output = ProjectSettings.globalize_path("res://").path_join("../_prep/evidence/proofs-r1").simplify_path()
	DirAccess.make_dir_recursive_absolute(output)
	game = load("res://development/foundation.tscn").instantiate() as DuskFoundation
	game.tuning.path = output.path_join("unused-tuning.json")
	root.add_child(game)
	for connection: Dictionary in root.focus_exited.get_connections():
		root.focus_exited.disconnect(connection.callable)
	game.set_unfocused(false)
	game.tuning.values = DuskTuning.DEFAULTS.duplicate()
	game.tuning.values.camera_distance = 6.2
	game.tuning.values.camera_pitch = 25.0
	game.tuning.values.camera_yaw = 20.0
	game.apply_tuning()
	game.set_mode(0)
	game.load_candidate_index(game.candidates.find(CHARACTER))
	var loaded: bool = game.load_error.is_empty() and game.actor.visual.descriptor.asset_id == "diagnostic.skin-probe"
	check(loaded, "Game importer assembles skeletal candidate and bone attachment: " + game.load_error)
	if not loaded:
		finish()
		return
	var asset: DuskAssetAssembly = game.actor.visual
	var skeleton: Skeleton3D = DuskAssetAssembly.find_skeleton(asset.model)
	check(skeleton != null and skeleton.get_bone_count() == 16, "Imported all 16 diagnostic bones")
	var meshes: Array[MeshInstance3D] = []
	for mesh: MeshInstance3D in mesh_nodes(asset.model):
		if mesh.skin != null:
			meshes.append(mesh)
	check(meshes.size() == 12, "Imported 12 model meshes without Blender bone-display geometry")
	var all_skinned := true
	for mesh: MeshInstance3D in meshes:
		all_skinned = all_skinned and mesh.skin != null and mesh.get_node_or_null(mesh.skeleton) == skeleton
	check(all_skinned, "Every character mesh binds to the imported skeleton")
	for role: String in ["idle", "walk", "run", "attack", "hurt"]:
		check(asset.clip_length(role) > 0.1, "Real AnimationPlayer resolves " + role)
	var grip: BoneAttachment3D
	for child: Node in skeleton.get_children():
		if child is BoneAttachment3D:
			grip = child
	check(grip != null and grip.bone_name == "Hand.R", "Separate prop attaches to the right-hand bone")
	var prop := DuskAssetAssembly.new()
	game.simulation.add_child(prop)
	check(prop.assemble(PROP), "Same game importer assembles the standalone static prop")
	prop.position = Vector3(-1.1, 0, 0)
	var textured := false
	for mesh: MeshInstance3D in mesh_nodes(prop):
		for surface: int in range(mesh.mesh.get_surface_count()):
			var mat := mesh.get_active_material(surface) as BaseMaterial3D
			textured = textured or (mat != null and mat.albedo_texture != null)
	check(textured and not FileAccess.file_exists("res://assets/diagnostic.grip-probe/r1/model_calibration-basecolor.png"), "Godot material has the embedded calibration texture without an extracted image dependency")
	await sample(asset, "idle", 0.0)
	await create_timer(0.5).timeout
	await capture("idle")
	var arm: MeshInstance3D
	for mesh: MeshInstance3D in meshes:
		if mesh.name in ["Arm.R", "Arm_R", "ArmR"]:
			arm = mesh
	check(arm != null, "Imported right-arm mesh is available for deformation measurement")
	if arm == null:
		asset.model.print_tree_pretty()
		finish()
		return
	await sample(asset, "attack", 0.0)
	var grip_start: Vector3 = grip.global_position
	var first_mesh: ArrayMesh = arm.bake_mesh_from_current_skeleton_pose()
	await sample(asset, "attack", asset.clip_length("attack") * 0.5)
	var mid_mesh: ArrayMesh = arm.bake_mesh_from_current_skeleton_pose()
	var first: PackedVector3Array = first_mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	var middle: PackedVector3Array = mid_mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	var max_motion: float = 0.0
	for index: int in range(first.size()):
		max_motion = maxf(max_motion, first[index].distance_to(middle[index]))
	check(max_motion > 0.05, "Godot evaluated arm skin changes during attack (%.3f m)" % max_motion)
	check(grip.global_position.distance_to(grip_start) > 0.05, "Bone attachment follows the animated hand")
	await capture("attack")
	for role: String in ["walk", "run"]:
		await sample(asset, role, 0.0)
		var first_root: Vector3 = skeleton.get_bone_global_pose(skeleton.find_bone("Root")).origin
		await sample(asset, role, asset.clip_length(role) * 0.75)
		var last_root: Vector3 = skeleton.get_bone_global_pose(skeleton.find_bone("Root")).origin
		check(Vector2(first_root.x, first_root.z).distance_to(Vector2(last_root.x, last_root.z)) < 0.0001, role + " has no horizontal root displacement in Godot")
	game.set_mode(2)
	game.command("attack")
	await create_timer(4.0).timeout
	check(game.action.phase == "ready" and game.action.impact_count == 1, "Skeletal candidate completes real rehearsal with exactly one impact")
	check(game.actor.position.distance_to(DuskRehearsal.HOME) < .01, "Controller returns skeletal candidate to formation")
	check(not FileAccess.file_exists(game.tuning.path), "Probe did not create accepted tuning")
	finish()

func finish() -> void:
	var report := {"checks": checks, "failures": failures, "identity": game.identity(), "scope": "Diagnostic source/export/import proof; not Kaida visual acceptance"}
	var file := FileAccess.open(output.path_join("runtime.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	file.close()
	print("PIPELINE_PROBE_RESULT ", failures, " failures / ", checks.size(), " checks")
	quit(0 if failures == 0 else 1)
