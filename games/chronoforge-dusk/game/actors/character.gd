class_name DuskCharacter
extends CharacterBody3D

var visual: DuskAssetAssembly
var walk_speed: float = 2.3
var run_speed: float = 5.1
var turn_speed: float = 18.0
var traversal_enabled: bool = false
var camera: Camera3D
var acceleration: float = 28.0
var braking: float = 36.0
var measured_speed: float = 0.0
# Source stance travel: walk 0.76 m / 0.333 s; run 3.71188 m / 0.733 s.
var walk_stride_speed: float = 2.28
var run_stride_speed: float = 5.06165
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
	collider.shape = shape
	collider.position.y = shape.height * 0.5

func _physics_process(delta: float) -> void:
	if not traversal_enabled or visual == null:
		return
	var input: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
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
