class_name DuskCoastAudio
extends Node
## Footfalls follow measured displacement and grounding, including collisions.
var actor: DuskCharacter
var ambience: AudioStreamPlayer
var step: AudioStreamPlayer
var travel: float = 0.0
var last_position := Vector3.ZERO
var step_index: int = 0
var step_events: int = 0
var stone: Array[AudioStream] = []
var wood: Array[AudioStream] = []

func _ready() -> void:
	ambience = AudioStreamPlayer.new()
	var stream: AudioStreamWAV = load("res://audio/coast/shore.wav").duplicate()
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_end = int(stream.get_length()*stream.mix_rate)
	ambience.stream = stream
	ambience.volume_db = -12
	add_child(ambience)
	ambience.play()
	step = AudioStreamPlayer.new()
	step.volume_db = -8
	add_child(step)
	for i: int in range(4):
		stone.append(load("res://audio/coast/stone-%d.wav" % i))
		wood.append(load("res://audio/coast/wood-%d.wav" % i))
	last_position = actor.position

func _physics_process(_delta: float) -> void:
	var displacement: float = Vector2(actor.position.x-last_position.x,actor.position.z-last_position.z).length()
	last_position = actor.position
	if displacement > 0.5 or not actor.is_on_floor() or actor.measured_speed < 0.15:
		travel = 0
		return
	travel += displacement
	var running: bool = Input.is_action_pressed("run")
	if travel > (1.15 if running else 0.72):
		travel = 0
		var bridge: bool = actor.position.x > -2 and actor.position.x < 10 and actor.position.z > 6 and actor.position.z < 10
		step.stream = (wood if bridge else stone)[step_index%4]
		step.pitch_scale = 0.95+float(step_index%3)*0.045
		step.volume_db = -5 if running else -8
		step.play()
		step_index += 1
		step_events += 1
