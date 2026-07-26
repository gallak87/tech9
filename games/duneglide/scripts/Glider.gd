class_name Glider
extends Node3D

## Surface-hugging free-roam flight controller.
##
## Runs in _process, not _physics_process: there is no physics body and nothing
## to sync with, so one state update per rendered frame avoids the whole class
## of "stuttery at non-60Hz" interpolation bugs.
##
## No CharacterBody3D, no raycasts, no collision shapes. Every terrain query is
## an analytic Height.height_grad() call. That is the entire reason the terrain
## can morph freely — a physics heightmap would need rebuilding every frame.
##
## This node owns position and YAW ONLY. Bank and pitch are cosmetic and live on
## the $Attitude child, so gameplay direction (where shots go, where the camera
## points) is never contaminated by visual roll.

@export_group("Speed")
@export var cruise_speed := 78.0
@export var boost_speed := 118.0
@export var brake_speed := 46.0
@export var accel := 55.0
@export var decel := 70.0

@export_group("Turning")
@export var max_bank := 0.95        # rad, ~54 deg. Aggressive on purpose.
@export var bank_rate := 5.0
## Coordinated-turn constant. Bank is the state and yaw rate is DERIVED from it,
## which is what makes fast flight turn wide and slow flight turn tight with no
## extra tuning: at 78 u/s a full bank gives a 33m radius, at 118 u/s it gives
## 76m. Boost widens your turns for free.
@export var arcade_g := 150.0
@export var max_yaw_rate := 2.4

@export_group("Hover")
@export var hover_height := 2.2
@export var hover_smooth := 0.20
## Pitch input is a gentle altitude nudge, not a flight stick. At 26.0 it read
## as "the ship can just fly", which breaks the surface-hugging premise.
@export var climb_rate := 11.0
@export var max_offset := 9.0
@export var offset_bleed := 0.95
## Seconds of terrain prediction. This is the difference between a hover racer
## and a rubber band — the ship starts climbing BEFORE the dune arrives.
@export var lookahead_t := 0.28
@export var lookahead_mix := 0.55
@export var min_clearance := 0.40

@export_group("Attitude (cosmetic)")
## Baseline for measuring surface slope, in units. Attitude must NOT use the
## instantaneous gradient: the height function carries terms at wavelength 21
## and 44, so at cruise the point derivative swings at ~3.7Hz and the nose bobs
## constantly for no reason the player can see. Differencing over a baseline
## this long low-passes those away and leaves only real dune slope.
@export var slope_baseline := 9.0
@export var surf_pitch_gain := 0.22
@export var surf_roll_gain := 0.30
@export var attitude_rate := 3.0
## How far the nose leads into a turn. Positive = nose points into the turn,
## which reads as the ship actively steering.
@export var nose_lead := 0.16

@export_group("Hull")
## The ship mesh is a TripoSR-generated GLB carrying its own baked texture,
## which fights the dawn palette. Override it flat, the way void-fracture does.
@export var hull_albedo := Color(0.16, 0.40, 0.90)
@export var hull_emission := Color(0.10, 0.30, 0.82)
@export var hull_emission_energy := 0.5

signal fired(direction: Vector3, tier: int, pos: Vector3)

var speed := 78.0
var yaw := 0.0
var bank := 0.0                     # read by the camera rig
var _alt_off := 0.0
var _y_vel := 0.0
var _surf_pitch := 0.0
var _surf_roll := 0.0
var _climb_pitch := 0.0

var _dbg_lo := INF
var _dbg_hi := -INF
var _dbg_rev := 0
var _dbg_frames := 0
var _dbg_prev := 0.0
var _dbg_rising := true
var _dbg_slope := 0.0
var _dbg_agree := 0
var _dbg_scored := 0

@onready var attitude: Node3D = $Attitude


func _ready() -> void:
	speed = cruise_speed
	global_position.y = Height.height(global_position.x, global_position.z) + hover_height
	_skin_hull(attitude)


func _skin_hull(node: Node) -> void:
	if node is MeshInstance3D:
		var m := StandardMaterial3D.new()
		m.albedo_color = hull_albedo
		m.metallic = 0.15
		m.roughness = 0.34
		m.emission_enabled = true
		m.emission = hull_emission
		m.emission_energy_multiplier = hull_emission_energy
		(node as MeshInstance3D).material_override = m
	for c in node.get_children():
		_skin_hull(c)


## Godot convention: -Z is forward.
func forward() -> Vector3:
	return Vector3(-sin(yaw), 0.0, -cos(yaw))


func right() -> Vector3:
	return Vector3(cos(yaw), 0.0, -sin(yaw))


func _process(dt: float) -> void:
	var steer := Input.get_axis("steer_left", "steer_right")
	var pitch_in := Input.get_axis("nose_down", "nose_up")
	var thr := Input.get_action_strength("boost") - Input.get_action_strength("brake")

	# speed
	var tgt := cruise_speed
	if thr > 0.0:
		tgt = lerpf(cruise_speed, boost_speed, thr)
	elif thr < 0.0:
		tgt = lerpf(cruise_speed, brake_speed, -thr)
	speed = move_toward(speed, tgt, (accel if tgt > speed else decel) * dt)

	# bank -> yaw, coordinated turn
	bank = Damp.exp_to(bank, -steer * max_bank, bank_rate, dt)
	var yaw_rate := clampf(arcade_g * tan(bank) / maxf(speed, 25.0),
		-max_yaw_rate, max_yaw_rate)
	yaw = wrapf(yaw + yaw_rate * dt, -PI, PI)

	var fwd := forward()
	var p := global_position + fwd * speed * dt

	# altitude: critically damped spring to (terrain + hover + commanded offset)
	_alt_off = clampf(_alt_off + pitch_in * climb_rate * dt,
		-hover_height + min_clearance, max_offset)
	_alt_off = Damp.exp_to(_alt_off, 0.0, offset_bleed, dt)

	var g_here := Height.height_grad(p.x, p.z)     # one call gives h and gradient
	var ahead := p + fwd * speed * lookahead_t
	var h_ahead := Height.height(ahead.x, ahead.z)
	var h_ref := lerpf(g_here.x, h_ahead, lookahead_mix)

	var yv := [_y_vel]
	p.y = Damp.spring(p.y, h_ref + hover_height + _alt_off, yv, hover_smooth, dt)
	_y_vel = yv[0]

	# Terrain is SOFT by design — the hover spring always wins and there is no
	# crash case. This clamp is the floor of last resort, not a collision.
	var floor_y := g_here.x + min_clearance
	if p.y < floor_y:
		p.y = floor_y
		_y_vel = maxf(_y_vel, 0.0)

	global_position = p
	rotation.y = yaw            # gameplay orientation only: no roll, no pitch

	# ── visual attitude — no gameplay effect ────────────────
	# Slope measured over a baseline rather than from the point gradient, so the
	# short-wavelength terms in the height function don't shake the nose.
	var rgt := right()
	var L := slope_baseline
	var h_f := Height.height(p.x + fwd.x * L, p.z + fwd.z * L)
	var h_b := Height.height(p.x - fwd.x * L, p.z - fwd.z * L)
	var h_r := Height.height(p.x + rgt.x * L, p.z + rgt.z * L)
	var h_l := Height.height(p.x - rgt.x * L, p.z - rgt.z * L)

	var climb_slope := (h_f - h_b) / (2.0 * L)   # >0 when the ground rises ahead
	var right_slope := (h_r - h_l) / (2.0 * L)   # >0 when it rises to starboard

	# Sign derivation, because getting this backwards is invisible in a still and
	# glaring in motion. Forward is -Z. R_x(t) takes (0,0,-1) to (0, sin t, -cos t),
	# so +X pitches the nose UP and rising ground ahead wants a POSITIVE angle.
	# R_z(t) takes the +X wing to (cos t, sin t, 0), so +Z lifts the starboard
	# wing — ground rising to starboard also wants positive.
	_surf_pitch = Damp.exp_to(_surf_pitch, atan(climb_slope) * surf_pitch_gain,
		attitude_rate, dt)
	_surf_roll = Damp.exp_to(_surf_roll, atan(right_slope) * surf_roll_gain,
		attitude_rate, dt)

	# Vertical velocity is smoothed too — raw _y_vel inherits the spring's own
	# ripple and would put the bob straight back in.
	_climb_pitch = Damp.exp_to(_climb_pitch, clampf(_y_vel / 90.0, -0.30, 0.30),
		attitude_rate, dt)

	# Climbing (_y_vel > 0) also wants nose up, so this ADDS. It was subtracting,
	# which fought the slope term instead of reinforcing it.
	attitude.rotation.x = _surf_pitch + _climb_pitch
	attitude.rotation.z = bank + _surf_roll
	attitude.rotation.y = bank * nose_lead      # nose leads into the turn

	_dbg_slope = climb_slope
	_debug_sample()


## --- attitude tuning telemetry ---------------------------------------------
## Nose bob is the kind of thing that looks "probably fine" in a screenshot and
## is obvious in motion, so measure it instead of eyeballing: reset, fly for a
## second, read. `reversals` is what matters — a nose tracking real dune slope
## changes direction a couple of times a second, one shaking on micro-ripples
## reverses constantly.
func debug_attitude_reset() -> void:
	_dbg_lo = INF
	_dbg_hi = -INF
	_dbg_rev = 0
	_dbg_frames = 0
	_dbg_prev = attitude.rotation.x
	_dbg_rising = true
	_dbg_agree = 0
	_dbg_scored = 0


func debug_attitude_report() -> Dictionary:
	return {
		"pitch_swing_deg": rad_to_deg(_dbg_hi - _dbg_lo),
		"reversals": _dbg_rev,
		"frames": _dbg_frames,
		"reversals_per_sec": _dbg_rev / maxf(_dbg_frames / 60.0, 0.001),
		# Fraction of frames where nose direction matched ground slope. Only
		# frames on a definite slope are scored, and the attitude damping lags
		# by ~0.3s, so expect high-90s rather than a clean 100%.
		"slope_agreement_pct": 100.0 * _dbg_agree / maxi(_dbg_scored, 1),
		"scored_frames": _dbg_scored,
	}


func _debug_sample() -> void:
	var px := attitude.rotation.x
	_dbg_lo = minf(_dbg_lo, px)
	_dbg_hi = maxf(_dbg_hi, px)
	var rising := px > _dbg_prev
	if _dbg_frames > 0 and rising != _dbg_rising:
		_dbg_rev += 1
	_dbg_rising = rising
	_dbg_prev = px
	_dbg_frames += 1

	# Only score frames where the ground is clearly sloping and the nose is
	# clearly off level — near zero the sign is noise, not information.
	if absf(_dbg_slope) > 0.05 and absf(_surf_pitch) > 0.002:
		_dbg_scored += 1
		if (_dbg_slope > 0.0) == (_surf_pitch > 0.0):
			_dbg_agree += 1


## Normalised 0..1 across the cruise->boost band. Drives FOV kick and speed lines.
func boost_amount() -> float:
	return clampf(inverse_lerp(cruise_speed, boost_speed, speed), 0.0, 1.0)


## Height of the ship above the terrain surface directly below it.
func altitude() -> float:
	return global_position.y - Height.height(global_position.x, global_position.z)
