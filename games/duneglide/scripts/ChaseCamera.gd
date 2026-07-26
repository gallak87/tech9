class_name ChaseCamera
extends Node3D

## Damped chase camera.
##
## Deliberately NOT a child of the ship. Two ways to get this wrong, both of
## which void-fracture demonstrates or invites:
##  - child of the ship: rigidly inherits every yaw twitch and the full 54-degree
##    bank. Nauseating, and it kills any sense of the ship moving within frame.
##  - world-space sibling at a fixed offset (what void-fracture does, a Camera3D
##    at (0, 1.0, 3.5) that only lerps its Y): cannot follow yaw at all. Fine for
##    a rail shooter, structurally impossible for free roam.
##
## Correct: a script-driven follower with INDEPENDENT time constants for
## position, yaw and roll. The yaw lagging behind the ship's yaw is what makes a
## carve read as a carve — the ship swings toward the edge of frame, then the
## camera catches up.

@export var target: NodePath

@export_group("Placement")
@export var distance := 9.5
@export var height := 3.4
@export var look_ahead := 13.0
@export var look_up := 1.6

@export_group("Damping")
@export var pos_smooth := 0.16
@export var yaw_rate := 4.5
@export var roll_share := 0.28

@export_group("Feel")
@export var base_fov := 72.0
@export var boost_fov_add := 15.0
@export var fov_rate := 3.0
@export var ground_clear := 2.6

var _yaw := 0.0
var _vel := Vector3.ZERO
var _ship: Glider

@onready var _roll: Node3D = $RollPivot
@onready var _cam: Camera3D = $RollPivot/Camera3D


func _ready() -> void:
	_ship = get_node(target) as Glider
	_yaw = _ship.yaw
	top_level = true            # never inherit a parent transform
	global_position = _anchor()
	_cam.near = 0.4
	_cam.far = 900.0


func _process(dt: float) -> void:
	_yaw = Damp.exp_to_angle(_yaw, _ship.yaw, yaw_rate, dt)

	var v := [_vel]
	global_position = Damp.spring_v3(global_position, _anchor(), v, pos_smooth, dt)
	_vel = v[0]

	# Analytic terrain keeps the camera out of dunes for the cost of six sines.
	var gh := Height.height(global_position.x, global_position.z)
	if global_position.y < gh + ground_clear:
		global_position.y = gh + ground_clear
		_vel.y = maxf(_vel.y, 0.0)

	var fwd := _ship.forward()
	look_at(_ship.global_position + fwd * look_ahead + Vector3.UP * look_up, Vector3.UP)

	# Roll lives on the child because look_at() just rewrote this node's basis.
	# Camera copies only a fraction of ship bank — a full copy is sickening.
	_roll.rotation.z = Damp.exp_to(_roll.rotation.z, _ship.bank * roll_share, 6.0, dt)

	_cam.fov = Damp.exp_to(_cam.fov, base_fov + _ship.boost_amount() * boost_fov_add,
		fov_rate, dt)


## Jump straight to the resting pose behind the ship, no damping. Used when the
## dev overlay hands the camera back after an orbit — the point of the orbit is
## to inspect geometry, so easing back from an arbitrary angle would just be a
## second of nausea before gameplay resumes.
func snap() -> void:
	_yaw = _ship.yaw
	_vel = Vector3.ZERO
	global_position = _anchor()
	_roll.rotation.z = _ship.bank * roll_share
	_cam.fov = base_fov + _ship.boost_amount() * boost_fov_add
	var fwd := _ship.forward()
	look_at(_ship.global_position + fwd * look_ahead + Vector3.UP * look_up, Vector3.UP)


func _anchor() -> Vector3:
	var f := Vector3(-sin(_yaw), 0.0, -cos(_yaw))
	return _ship.global_position - f * distance + Vector3.UP * height
