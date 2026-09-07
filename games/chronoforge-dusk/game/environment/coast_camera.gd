class_name DuskCoastCamera
extends Camera3D
## Authored framing is deliberately independent of accepted inspection tuning.
const YAW: float = 18.0
const PITCH: float = 49.0
var focus := Vector3.ZERO

func _ready() -> void:
	projection = PROJECTION_ORTHOGONAL
	size = 19.5
	near = 0.1
	far = 220.0
	current = true

func follow(at: Vector3, delta: float, snap: bool = false) -> void:
	var desired: Vector3 = at + Vector3(0, 0.7, -1.5)
	focus = desired if snap else focus.lerp(desired, 1.0 - exp(-7.0 * delta))
	var yaw: float = deg_to_rad(YAW)
	var pitch: float = deg_to_rad(PITCH)
	position = focus + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * 65.0
	look_at(focus)
