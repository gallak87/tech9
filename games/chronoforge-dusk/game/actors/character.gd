class_name DuskCharacter
extends CharacterBody3D

var visual: DuskAssetAssembly
var walk_speed: float = 4.485
var run_speed: float = 6.63
var turn_speed: float = 18.0
var traversal_enabled: bool = false
var camera: Camera3D
var acceleration: float = 28.0
var braking: float = 36.0
var measured_speed: float = 0.0
# Source cycle travel: Running 3.51136 m / 0.7 s; Fast Run 3.45806 m / 0.53333 s.
var walk_stride_speed: float = 5.01623
var run_stride_speed: float = 6.48387
var reaction: String = "ready"
var reaction_time: float = 0.0
var reaction_frozen: bool = false
var collider: CollisionShape3D

func _ready() -> void:
	floor_snap_length = 0.3
	floor_max_angle = deg_to_rad(45)
	collider = CollisionShape3D.new()
	add_child(collider)

func install(asset: DuskAssetAssembly) -> void:
	if visual != null:
		remove_child(visual)
		visual.queue_free()
	visual = asset
	add_child(visual)
	var shape := CapsuleShape3D.new()
	shape.radius = float(asset.descriptor.dimensions.radius_m)
	shape.height = maxf(float(asset.descriptor.dimensions.height_m), shape.radius * 2.0)
	# Set the offset before activating a new shape, so it never overlaps
	# the floor at the body origin during native physics registration.
	collider.position.y = shape.height * 0.5
	collider.shape = shape

func _physics_process(delta: float) -> void:
	if reaction != "ready":
		update_reaction(delta)
		return
	if not traversal_enabled or visual == null:
		return
	var input: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if get_viewport().gui_get_focus_owner() != null:
		input = Vector2.ZERO
	var direction: Vector3 = camera.global_basis.x * input.x + camera.global_basis.z * input.y
	direction.y = 0
	direction = direction.normalized()
	var running: bool = Input.is_action_pressed("run")
	var speed: float = run_speed if running else walk_speed
	var response: float = braking if direction.is_zero_approx() else acceleration
	var horizontal := Vector2(velocity.x, velocity.z).move_toward(Vector2(direction.x, direction.z) * speed, response * delta)
	velocity.x = horizontal.x
	velocity.z = horizontal.y
	if not is_on_floor():
		velocity.y -= 20.0 * delta
	else:
		velocity.y = 0.0
	var before: Vector3 = position
	move_and_slide()
	measured_speed = Vector2(position.x - before.x, position.z - before.z).length() / delta
	if direction.length_squared() > 0.01:
		face(direction, delta)
	locomotion(measured_speed, running)

func locomotion(speed: float, running: bool) -> void:
	if speed < 0.12:
		visual.play_role("idle")
		return
	var nominal: float = run_stride_speed if running else walk_stride_speed
	# Playback follows real travel, including acceleration, braking and collision.
	visual.play_role("run" if running else "walk", false, clampf(speed / nominal, 0.15, 2.5))

func face(direction: Vector3, delta: float) -> void:
	if direction.length_squared() > 0.001:
		rotation.y = lerp_angle(rotation.y, atan2(-direction.x, -direction.z), 1.0 - exp(-turn_speed * delta))

func place(at: Vector3, yaw: float = 0.0) -> void:
	position = at
	rotation.y = yaw
	velocity = Vector3.ZERO
	measured_speed = 0.0

func start_reaction(defeat: bool = false) -> void:
	reset_reaction()
	velocity = Vector3.ZERO
	reaction = "defeated" if defeat else "hurt"
	visual.play_role("hurt", true)

func reset_reaction() -> void:
	reaction = "ready"
	reaction_time = 0.0
	reaction_frozen = false
	if visual != null:
		visual.transform = Transform3D.IDENTITY
		visual.play_role("idle", true)

func update_reaction(delta: float) -> void:
	if reaction_frozen:
		return
	reaction_time += delta
	if reaction == "hurt":
		if reaction_time >= visual.clip_length("hurt"):
			reset_reaction()
	else:
		# Basic held hurt + fall presentation; no new source clip or ragdoll.
		var t: float = smoothstep(0.08, 0.60, reaction_time)
		visual.rotation.z = deg_to_rad(86.0) * t
		visual.position.y = 0.24 * t
		if reaction_time >= 0.18:
			visual.player.pause()
