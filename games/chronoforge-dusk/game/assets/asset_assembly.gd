class_name DuskAssetAssembly
extends Node3D
## Only prepared, Godot-imported resources under res://. No runtime importer.

var descriptor: Dictionary = {}
var model: Node3D
var player: AnimationPlayer
var load_error: String = ""
var descriptor_path: String = ""
var active_role: String = ""
var equipment: Array[Node3D] = []

func assemble(path: String) -> bool:
	descriptor_path = path
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return fail("Descriptor is missing or invalid JSON: " + path)
	descriptor = parsed
	if descriptor.get("format") != 1:
		return fail("Unsupported descriptor format; expected 1")
	for field: String in ["asset_id", "revision", "label"]:
		if not descriptor.get(field) is String or str(descriptor[field]).is_empty():
			return fail("Missing identity field: " + field)
	if descriptor.get("kind") not in ["character", "prop"]:
		return fail("kind must be character or prop")
	if descriptor.get("animation_mode") not in ["none", "rigid", "skeletal"]:
		return fail("animation_mode must be none, rigid or skeletal")
	for section: String in ["dimensions", "model", "clips", "motion"]:
		if not descriptor.get(section, {}) is Dictionary:
			return fail("Expected object: " + section)
	if not descriptor.get("attachments", []) is Array:
		return fail("attachments must be an array")
	var dimensions: Dictionary = descriptor.get("dimensions", {})
	if dimensions.get("forward") != "-Z" or dimensions.get("up") != "+Y" or dimensions.get("origin") != "ground":
		return fail("Expected metres, +Y up, -Z forward, ground origin; fix export")
	if not number_in_range(dimensions.get("height_m"), 0.1, 20.0) or not number_in_range(dimensions.get("radius_m"), 0.05, 5.0):
		return fail("Invalid physical dimensions (height_m/radius_m)")
	var motion: Dictionary = descriptor.get("motion", {})
	if descriptor.kind == "character" and (motion.get("traversal") != "controller" or motion.get("action") != "controller" or motion.get("clips") != "in_place"):
		return fail("Character requires controller displacement and in-place clips")
	model = load_model(descriptor.get("model", {}))
	if model == null:
		return false
	add_child(model)
	player = find_player(model)
	var clips: Dictionary = descriptor.get("clips", {})
	if descriptor.kind == "character":
		for role: String in ["idle", "walk", "run", "attack", "hurt"]:
			if not clips.has(role):
				return fail("Missing character clip role: " + role)
	if descriptor.animation_mode == "none" and not clips.is_empty():
		return fail("Static assets must not declare clips")
	if not clips.is_empty() and player == null:
		return fail("Model has no imported AnimationPlayer")
	# Duplicate libraries so per-instance loop tuning never mutates imported resources.
	if player != null:
		player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS
		for library_name: StringName in player.get_animation_library_list():
			var library: AnimationLibrary = player.get_animation_library(library_name).duplicate(true)
			player.remove_animation_library(library_name)
			player.add_animation_library(library_name, library)
		for role: String in clips:
			if not clips[role] is Dictionary:
				return fail("Invalid clip mapping: " + role)
			var clip: Dictionary = clips[role]
			if clip.get("file") != descriptor.model.path:
				return fail("Clip %s must be embedded in model GLB in format 1" % role)
			if not clip.get("name") is String or not clip.get("loop") is bool or not player.has_animation(clip.name):
				return fail("Missing/invalid imported clip: " + str(clip.get("name", role)))
			var animation: Animation = player.get_animation(clip.name)
			animation.loop_mode = Animation.LOOP_LINEAR if clip.loop else Animation.LOOP_NONE
	if descriptor.animation_mode == "skeletal" and find_skeleton(model) == null:
		return fail("Skeletal asset has no imported Skeleton3D")
	for entry: Variant in descriptor.get("attachments", []):
		if not entry is Dictionary:
			return fail("Attachment must be an object")
		var attachment: Dictionary = entry
		if not attachment.get("model") is Dictionary:
			return fail("Attachment model must be an object")
		for field: String in ["position_m", "rotation_degrees"]:
			var components: Variant = attachment.get(field)
			if not components is Array or components.size() != 3:
				return fail("Attachment " + field + " must contain three numbers")
			for component: Variant in components:
				if not number_in_range(component, -360.0, 360.0):
					return fail("Invalid attachment transform: " + field)
		var socket: Node3D
		if attachment.has("bone"):
			var skeleton: Skeleton3D = model.get_node_or_null(str(attachment.get("skeleton_path", ""))) as Skeleton3D
			if skeleton == null or skeleton.find_bone(str(attachment.bone)) < 0:
				return fail("Attachment %s: skeleton/bone missing" % attachment.get("id", "?"))
			var bone_socket := BoneAttachment3D.new()
			skeleton.add_child(bone_socket)
			bone_socket.bone_name = attachment.bone
			socket = bone_socket
		else:
			socket = model.get_node_or_null(str(attachment.get("socket_path", ""))) as Node3D
		if socket == null:
			return fail("Attachment %s: socket missing: %s" % [attachment.get("id", "?"), attachment.get("socket_path", "?")])
		var item: Node3D = load_model(attachment.get("model", {}))
		if item == null:
			return false
		socket.add_child(item)
		equipment.append(item)
		item.position = vector3(attachment.get("position_m", [0, 0, 0]))
		item.rotation_degrees = vector3(attachment.get("rotation_degrees", [0, 0, 0]))
	if clips.has("idle"):
		play_role("idle")
	return true

func load_model(reference: Dictionary) -> Node3D:
	var path: String = str(reference.get("path", ""))
	if not path.begins_with("res://assets/") or not path.ends_with(".glb") or ".." in path:
		fail("Model must be a prepared res://assets/*.glb: " + path)
		return null
	var expected_hash: String = str(reference.get("sha256", ""))
	# Original bytes are deliberately included alongside imported resources in exports.
	if expected_hash.length() != 64 or FileAccess.get_sha256(path) != expected_hash:
		fail("Missing file or SHA-256 mismatch: " + path)
		return null
	if not ResourceLoader.exists(path, "PackedScene"):
		fail("Godot import missing: " + path + " — run native import before export")
		return null
	var packed: PackedScene = load(path) as PackedScene
	if packed == null:
		fail("Godot failed to load model: " + path)
		return null
	return packed.instantiate() as Node3D

func play_role(role: String, restart: bool = false, speed: float = 1.0) -> void:
	if player == null or not descriptor.get("clips", {}).has(role):
		return
	player.speed_scale = speed
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS
	if active_role == role and not restart:
		return
	active_role = role
	player.play(str(descriptor.clips[role].name), 0.12)
	if restart:
		player.seek(0.0, true)

func clip_length(role: String) -> float:
	return player.get_animation(str(descriptor.clips[role].name)).length

func begin_action() -> void:
	play_role("attack", true)
	# The rehearsal advances this player and contact on the same physics timeline.
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL

func blade_segment() -> PackedVector3Array:
	if descriptor.asset_id != "kaida" or equipment.is_empty():
		return PackedVector3Array()
	# Kaida sword r2: game-owned diagnostic points along the separate +Y blade.
	var attachment: Dictionary = descriptor.attachments[0]
	var skeleton: Skeleton3D = model.get_node(attachment.skeleton_path) as Skeleton3D
	# BoneAttachment3D updates later in the frame. Contact needs the just-evaluated pose.
	var pose: Transform3D = skeleton.global_transform * skeleton.get_bone_global_pose(skeleton.find_bone(attachment.bone)) * equipment[0].transform
	return PackedVector3Array([pose * Vector3(0, 0.30, 0), pose * Vector3(0, 1.20, 0)])

func fail(message: String) -> bool:
	load_error = message
	return false

static func number_in_range(value: Variant, low: float, high: float) -> bool:
	return (value is float or value is int) and is_finite(float(value)) and float(value) >= low and float(value) <= high

static func vector3(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))

static func find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child: Node in node.get_children():
		var found: AnimationPlayer = find_player(child)
		if found != null:
			return found
	return null

static func find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child: Node in node.get_children():
		var found: Skeleton3D = find_skeleton(child)
		if found != null:
			return found
	return null
