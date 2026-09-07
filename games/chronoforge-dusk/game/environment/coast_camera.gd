class_name DuskCoastCamera
extends Camera3D
## Authored framing is deliberately independent of accepted inspection tuning.
const YAW: float = 0.0
const PITCH: float = 43.0
var focus := Vector3.ZERO

func _ready() -> void:
	projection = PROJECTION_ORTHOGONAL
	size = 16.5
	near = 0.1
	far = 220.0
	current = true

func follow(at: Vector3, delta: float, snap: bool = false) -> void:
	var overlook: float = smoothstep(-15.0,-22.0,at.z)
	var desired: Vector3 = at + Vector3(4.0*overlook, 0.7+overlook*0.8, -1.5-overlook*6.5)
	var desired_size: float = lerpf(16.5,27.0,overlook)
	size = desired_size if snap else lerpf(size,desired_size,1.0-exp(-3.0*delta))
	focus = desired if snap else focus.lerp(desired, 1.0 - exp(-7.0 * delta))
	var yaw: float = deg_to_rad(YAW)
	var pitch: float = deg_to_rad(PITCH)
	position = focus + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * 65.0
	look_at(focus)
