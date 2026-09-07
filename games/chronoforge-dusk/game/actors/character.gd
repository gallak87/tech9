class_name DuskCharacter
extends CharacterBody3D

var visual: DuskAssetAssembly
var walk_speed: float = 2.4
var run_speed: float = 4.8
var turn_speed: float = 12.0
var traversal_enabled: bool = false
var camera: Camera3D
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
	velocity.x = move_toward(velocity.x, direction.x * speed, 18.0 * delta)
	velocity.z = move_toward(velocity.z, direction.z * speed, 18.0 * delta)
	if not is_on_floor():
		velocity.y -= 20.0 * delta
	else:
		velocity.y = 0.0
	move_and_slide()
	if direction.length_squared() > 0.01:
		face(direction, delta)
		visual.play_role("run" if running else "walk")
	else:
		visual.play_role("idle")

func face(direction: Vector3, delta: float) -> void:
	if direction.length_squared() > 0.001:
		rotation.y = lerp_angle(rotation.y, atan2(-direction.x, -direction.z), minf(turn_speed * delta, 1.0))

func place(at: Vector3, yaw: float = 0.0) -> void:
	position = at
	rotation.y = yaw
	velocity = Vector3.ZERO
