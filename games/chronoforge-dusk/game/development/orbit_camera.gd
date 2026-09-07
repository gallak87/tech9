class_name DuskOrbitCamera
extends Camera3D

var yaw: float = 35.0
var pitch: float = 46.0
var distance: float = 12.5
var focus: Vector3 = Vector3.ZERO
var target_focus: Vector3 = Vector3.ZERO
var inspecting: bool = false
var panel_visible: bool = true
var kick: float = 0.0
var kick_phase: float = 0.0

func _ready() -> void:
	projection = Camera3D.PROJECTION_ORTHOGONAL
	near = 0.1
	far = 100.0
	current = true

func update_camera(delta: float) -> void:
	focus = focus.lerp(target_focus, 1.0 - exp(-18.0 * delta))
	if focus.distance_squared_to(target_focus) < 0.0001:
		focus = target_focus
	var angle: float = deg_to_rad(yaw)
	var elevation: float = deg_to_rad(pitch)
	var offset := Vector3(sin(angle) * cos(elevation), sin(elevation), cos(angle) * cos(elevation))
	var right := Vector3(cos(angle), 0, -sin(angle))
	var center: Vector3 = focus + Vector3.UP * (0.9 if inspecting else 0.5) - right * (distance * 0.14 if panel_visible else 0.0)
	kick_phase += delta * 95.0
	kick = maxf(0.0, kick - delta * 0.42)
	center += right * sin(kick_phase) * kick
	position = center + offset * 24.0
	look_at(center)
	size = distance * (0.52 if inspecting else 1.0)

func orbit(relative: Vector2) -> void:
	yaw = wrapf(yaw - relative.x * 0.25, -180.0, 180.0)
	pitch = clampf(pitch + relative.y * 0.2, 15.0, 75.0)

func zoom(amount: float) -> void:
	distance = clampf(distance + amount, 4.0, 24.0)
