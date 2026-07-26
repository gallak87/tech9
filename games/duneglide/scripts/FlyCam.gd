extends Node3D

## Temporary free-flight camera for verifying Phases 1-3.
## Replaced by ShipController + ChaseCamera in Phase 2; kept afterwards as a
## dev-tool camera mode for inspecting terrain away from the ship.

@export var speed := 78.0
@export var boost_mult := 2.2
@export var look_speed := 0.0035
@export var hover := 14.0
@export var auto_forward := false

var _yaw := 0.0
var _pitch := -0.18


func _ready() -> void:
	global_position = Vector3(0.0, Height.height(0.0, 0.0) + hover, 0.0)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := event as InputEventMouseMotion
		_yaw -= mm.relative.x * look_speed
		_pitch = clampf(_pitch - mm.relative.y * look_speed, -1.4, 1.4)
	if event is InputEventKey and event.pressed and not event.echo:
		var k := (event as InputEventKey).physical_keycode
		if k == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif k == KEY_M:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		elif k == KEY_F:
			auto_forward = not auto_forward


func _process(delta: float) -> void:
	rotation = Vector3(_pitch, _yaw, 0.0)

	var dir := Vector3.ZERO
	if Input.is_action_pressed("steer_left"):  dir.x -= 1.0
	if Input.is_action_pressed("steer_right"): dir.x += 1.0
	if Input.is_action_pressed("nose_up"):     dir.z -= 1.0
	if Input.is_action_pressed("nose_down"):   dir.z += 1.0
	if auto_forward:
		dir.z -= 1.0

	var s := speed * (boost_mult if Input.is_action_pressed("boost") else 1.0)
	global_position += (basis * dir) * s * delta

	# never let the flycam sink into the dunes
	var floor_y := Height.height(global_position.x, global_position.z) + 2.5
	global_position.y = maxf(global_position.y, floor_y)
