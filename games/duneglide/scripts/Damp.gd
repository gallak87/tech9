class_name Damp
extends RefCounted

## Frame-rate-independent smoothing.
##
## Never write `lerp(a, b, 0.1)` in this project — that is a per-frame constant,
## so the same code settles at a different rate at 60fps and 120fps. Everything
## here takes delta and behaves identically at any frame rate, which matters a
## lot on a 120Hz ProMotion display that drops to 60 on battery.


## Exponential approach. `rate` is in 1/seconds; higher is snappier.
static func exp_to(cur: float, tgt: float, rate: float, dt: float) -> float:
	return tgt + (cur - tgt) * exp(-rate * dt)


static func exp_to_v3(cur: Vector3, tgt: Vector3, rate: float, dt: float) -> Vector3:
	return tgt + (cur - tgt) * exp(-rate * dt)


## Angle-aware exponential approach, taking the shortest arc.
static func exp_to_angle(cur: float, tgt: float, rate: float, dt: float) -> float:
	return tgt + wrapf(cur - tgt, -PI, PI) * exp(-rate * dt)


## Critically damped spring (Game Programming Gems 4). Reaches the target fast
## with no overshoot and no oscillation — the right curve for altitude hold and
## camera follow, where a springy overshoot would read as a bug.
## `vel` is a single-element Array used as an in/out reference.
static func spring(cur: float, tgt: float, vel: Array, smooth_time: float, dt: float) -> float:
	var omega := 2.0 / maxf(smooth_time, 0.0001)
	var x := omega * dt
	var ex := 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
	var change := cur - tgt
	var v0: float = vel[0]
	var temp := (v0 + omega * change) * dt
	vel[0] = (v0 - omega * temp) * ex
	return tgt + (change + temp) * ex


static func spring_v3(cur: Vector3, tgt: Vector3, vel: Array, smooth_time: float, dt: float) -> Vector3:
	var v0: Vector3 = vel[0]
	var vx := [v0.x]
	var vy := [v0.y]
	var vz := [v0.z]
	var r := Vector3(
		spring(cur.x, tgt.x, vx, smooth_time, dt),
		spring(cur.y, tgt.y, vy, smooth_time, dt),
		spring(cur.z, tgt.z, vz, smooth_time, dt))
	vel[0] = Vector3(vx[0], vy[0], vz[0])
	return r
