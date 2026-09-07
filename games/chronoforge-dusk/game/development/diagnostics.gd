class_name DuskDiagnostics
extends RefCounted

var samples: Array[float] = []
var intervals: Dictionary = {}
var tag: String = "startup"
var last_tick: int = 0
var draw_calls: int = 0
var objects: int = 0
var primitives: int = 0
var video_mb: float = 0.0
var cpu_ms: float = 0.0

func sample() -> void:
	var tick: int = Time.get_ticks_usec()
	if last_tick > 0:
		var ms: float = (tick - last_tick) / 1000.0
		samples.append(ms)
		if samples.size() > 600:
			samples.pop_front()
	last_tick = tick
	draw_calls = int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	objects = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	primitives = int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
	video_mb = Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0
	cpu_ms = Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0

func begin(label: String) -> void:
	if not samples.is_empty():
		var key: String = tag
		var suffix: int = 2
		while intervals.has(key):
			key = "%s_%d" % [tag, suffix]
			suffix += 1
		intervals[key] = snapshot()
	tag = label
	samples.clear()
	last_tick = 0

func snapshot() -> Dictionary:
	var sorted: Array[float] = samples.duplicate()
	sorted.sort()
	if sorted.is_empty():
		return {"samples": 0}
	var sum: float = 0.0
	var spikes: int = 0
	for ms: float in sorted:
		sum += ms
		if ms > 33.34:
			spikes += 1
	return {"samples": sorted.size(), "mean_ms": sum / sorted.size(), "p50_ms": sorted[int((sorted.size() - 1) * 0.5)], "p95_ms": sorted[int((sorted.size() - 1) * 0.95)], "p99_ms": sorted[int((sorted.size() - 1) * 0.99)], "max_ms": sorted.back(), "over_33ms": spikes, "draw_calls": draw_calls, "primitives": primitives, "nodes": objects, "video_mb": video_mb, "engine_process_ms": cpu_ms, "gpu_ms": "unavailable (not measured)"}

func report() -> Dictionary:
	var result: Dictionary = intervals.duplicate(true)
	var key: String = tag
	var suffix: int = 2
	while result.has(key):
		key = "%s_%d" % [tag, suffix]
		suffix += 1
	result[key] = snapshot()
	return result
