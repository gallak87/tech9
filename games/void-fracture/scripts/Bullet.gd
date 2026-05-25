class_name Bullet
extends Node3D

const BULLET_SPEED := 22.0
const ENEMY_BULLET_SPEED := 12.0
const SEEKER_ACCEL := 40.0
const LIFETIME := 4.0

var direction := Vector3(0, 0, -1)
var speed := BULLET_SPEED
var tier_key := "T1"
var is_enemy := false
var is_seeker := false
var piercing := false
var hit_enemies := []   # track for piercing

var _age := 0.0
var _seeker_vel := Vector3.ZERO
var _target: Node3D = null

func _ready() -> void:
	var mesh := GeoManifest.build_bullet(tier_key)
	add_child(mesh)
	# rotate box to align with direction
	look_at(global_position + direction, Vector3.UP)

func _process(delta: float) -> void:
	_age += delta
	if _age > LIFETIME:
		queue_free()
		return

	if is_seeker:
		_update_seeker(delta)
	else:
		position += direction * speed * delta

	# out of bounds cull
	if position.z > 8 or position.z < -60:
		queue_free()

func _update_seeker(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		_acquire_target()
	if _target and is_instance_valid(_target):
		var to_target := (_target.global_position - global_position).normalized()
		_seeker_vel += to_target * SEEKER_ACCEL * delta
		var max_spd := speed * 1.2
		if _seeker_vel.length() > max_spd:
			_seeker_vel = _seeker_vel.normalized() * max_spd
	else:
		_seeker_vel += direction * speed * delta
	position += _seeker_vel * delta
	if _seeker_vel.length() > 0.1:
		look_at(global_position + _seeker_vel.normalized(), Vector3.UP)

func _acquire_target() -> void:
	var enemies := get_tree().get_nodes_in_group("enemies")
	var best: Node3D = null
	var best_dist := 999.0
	for e in enemies:
		if not is_instance_valid(e):
			continue
		var d := global_position.distance_to(e.global_position)
		if d < best_dist and d < 20.0:
			best_dist = d
			best = e
	_target = best
	_seeker_vel = direction * speed
