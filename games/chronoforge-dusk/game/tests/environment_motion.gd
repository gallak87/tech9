extends "res://tests/environment_test.gd"
## Dedicated native readback run; never used for frame-pacing acceptance.
var recording: bool = false
var capture_clock: float = 0.0
var frame_times: Array[int] = []
var capture_directory: String = "user://environment-motion"

func run(root: DuskCoast) -> void:
	game = root
	process_mode = Node.PROCESS_MODE_ALWAYS
	started = Time.get_ticks_msec()
	game.set_unfocused(false)
	DirAccess.make_dir_recursive_absolute(capture_directory)
	await seconds(3)
	game.perf.begin("motion_readback_not_normal_play")
	game.test_banner.visible = false
	recording = true
	for point: Vector3 in [Vector3(-5,0,13),Vector3(-5,0,8),Vector3(13.3,0,8),Vector3(13.3,3,-13.5),Vector3(-11,3,-13.5),Vector3(-11,3,-21)]:
		await walk_to(point,true)
	recording = false
	await seconds(1)
	await capture("overlook")
	check(game.actor.position.distance_to(Vector3(-11,3,-21))<0.9,"Native motion run reaches the overlook through mapped running input")
	observations["frame_times_ms"] = frame_times
	observations["capture_directory"] = ProjectSettings.globalize_path(capture_directory)
	observations["capture_scope"] = "Continuous exported native route, real controller and mapped input. Readback and PNG compression stalls are NOT normal play measurements. Frames reduced from 1920x1080 to 960x540 for the motion artifact."
	finish("environment_motion")

func _process(delta: float) -> void:
	if not recording: return
	capture_clock += delta
	if capture_clock < .1: return
	capture_clock = 0
	var frame: Image = get_viewport().get_texture().get_image()
	frame.resize(960,540,Image.INTERPOLATE_LANCZOS)
	frame.save_png(capture_directory+"/frame-%04d.png" % frame_times.size())
	frame_times.append(Time.get_ticks_msec())
