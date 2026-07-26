class_name Height
extends RefCounted

## Analytic terrain heightfield — the CPU source of truth.
##
## MUST STAY IDENTICAL TO res://shaders/terrain_height.gdshaderinc.
## The GPU draws the terrain from that file; everything on the CPU (ship
## altitude, enemy placement, camera clearance, bullet impacts) samples this
## one. If they drift, the ship flies through hills. DebugParity.gd is the
## harness that catches it.
##
## Why an analytic function rather than a heightmap texture or CPU noise:
##  - the GPU needs it per-vertex for ~64k blocks with zero CPU cost
##  - the CPU needs to sample it at arbitrary (x, z) with no GPU readback
##  - it must morph over time without either side desyncing
##
## Three properties make CPU/GPU parity provable rather than hopeful:
##  - all spatial coefficients are INTEGERS, so the field is exactly periodic
##    at PERIOD units. Both sides pre-reduce with mod(), so the phase argument
##    never exceeds ~2100 rad and float32 error stays under 1e-4 rad, i.e.
##    < 0.002 units of height against 1-unit blocks.
##  - all time harmonics are INTEGER multiples of OMEGA0, so every term's phase
##    is continuous when wave_time wraps at TIME_WRAP. No drift, no pop.
##  - the fundamental is ridged — A*(1 - 2*|sin p|) — giving sharp crests and
##    round troughs (the dune silhouette) while keeping a trivial derivative.

const PERIOD    := 8192.0
const KW        := TAU / PERIOD          # 0.000766990393942820
const OMEGA0    := 0.05
const TIME_WRAP := TAU / OMEGA0          # 125.66370614359172
const MAX_ABS_H := 35.45                 # sum of all amplitudes; used for custom_aabb

## Global scale on the whole field. 1.0 = shipping dunes, 0.6 = gentler world.
static var amplitude := 1.0
## Wrapped animation clock. Driven by TerrainField._process, mirrored to the
## GPU as the `h_time` global shader parameter.
static var wave_time := 0.0


static func advance(delta: float) -> void:
	wave_time = fposmod(wave_time + delta, TIME_WRAP)


## Height only. 6 sin. ~0.1 us/call.
static func height(x: float, z: float) -> float:
	var px := fposmod(x, PERIOD)
	var pz := fposmod(z, PERIOD)
	var t := wave_time

	var p := KW * (21.0 * px + 10.0 * pz) + OMEGA0 * 1.0 * t
	var h := 16.00 * (1.0 - 2.0 * absf(sin(p)))
	p = KW * (   7.0 * px +  14.0 * pz) + OMEGA0 *  2.0 * t;  h += 11.00 * sin(p)
	p = KW * ( -18.0 * px +  39.0 * pz) + OMEGA0 *  3.0 * t;  h +=  5.00 * sin(p)
	p = KW * (  68.0 * px -  52.0 * pz) + OMEGA0 *  5.0 * t;  h +=  2.20 * sin(p)
	p = KW * ( -45.0 * px + 180.0 * pz) + OMEGA0 *  8.0 * t;  h +=  0.90 * sin(p)
	p = KW * ( 330.0 * px - 207.0 * pz) + OMEGA0 * 13.0 * t;  h +=  0.35 * sin(p)
	return h * amplitude


## Returns Vector3(height, dh/dx, dh/dz). 6 sin + 6 cos, ~0.15 us/call.
## Prefer this over calling height() twice — the ship needs h and the gradient
## in the same frame, and the gradient is what gives surface-normal alignment
## without finite differences or a second sample.
static func height_grad(x: float, z: float) -> Vector3:
	var px := fposmod(x, PERIOD)
	var pz := fposmod(z, PERIOD)
	var t := wave_time

	# ridged fundamental: d/dp [1 - 2|sin p|] = -2*sign(sin p)*cos p
	var p := KW * (21.0 * px + 10.0 * pz) + OMEGA0 * 1.0 * t
	var s := sin(p)
	var h := 16.00 * (1.0 - 2.0 * absf(s))
	var d := -2.0 * 16.00 * signf(s) * cos(p)
	var gx := d * KW * 21.0
	var gz := d * KW * 10.0

	p = KW * (   7.0 * px +  14.0 * pz) + OMEGA0 *  2.0 * t
	h += 11.00 * sin(p);  d = 11.00 * cos(p);  gx += d * KW *    7.0;  gz += d * KW *   14.0
	p = KW * ( -18.0 * px +  39.0 * pz) + OMEGA0 *  3.0 * t
	h +=  5.00 * sin(p);  d =  5.00 * cos(p);  gx += d * KW *  -18.0;  gz += d * KW *   39.0
	p = KW * (  68.0 * px -  52.0 * pz) + OMEGA0 *  5.0 * t
	h +=  2.20 * sin(p);  d =  2.20 * cos(p);  gx += d * KW *   68.0;  gz += d * KW *  -52.0
	p = KW * ( -45.0 * px + 180.0 * pz) + OMEGA0 *  8.0 * t
	h +=  0.90 * sin(p);  d =  0.90 * cos(p);  gx += d * KW *  -45.0;  gz += d * KW *  180.0
	p = KW * ( 330.0 * px - 207.0 * pz) + OMEGA0 * 13.0 * t
	h +=  0.35 * sin(p);  d =  0.35 * cos(p);  gx += d * KW *  330.0;  gz += d * KW * -207.0

	return Vector3(h, gx, gz) * amplitude


## Unit surface normal at (x, z).
static func normal(x: float, z: float) -> Vector3:
	var g := height_grad(x, z)
	return Vector3(-g.y, 1.0, -g.z).normalized()
