class_name DuskRehearsal
extends Node
## One physics timeline owns travel, clip time, contact and hit stop.
signal impact(action_id: int)
signal completed(action_id: int)
signal phase_changed(phase: String)
signal swing_started
signal reset_done

const HOME := Vector3(-2.2, 0.02, 1.4)
const TARGET := Vector3(1.5, 0.02, -1.0)
const CONTACT := Vector3(0.79, 0.02, -0.54)

var actor: DuskCharacter
var target: DuskCharacter
var phase: String = "ready"
var elapsed: float = 0.0
var attack_duration: float = 0.9
var clip_time: float = 0.0
var impact_fraction: float = 0.5
var attack_tempo: float = 1.0
var hit_stop: float = 0.065
var stop_remaining: float = 0.0
var approach_duration: float = 0.65
var recovery_duration: float = 0.09
var return_duration: float = 0.8
var contact_fraction_for_action: float = 0.5
var tempo_for_action: float = 1.0
var stop_for_action: float = 0.065
var action_id: int = 0
var impact_count: int = 0
var action_impacts: int = 0
var completed_count: int = 0
var swing_sent: bool = false
var contact_sent: bool = false
var enabled: bool = false
var defeat_on_contact: bool = false
var history: Array[String] = []

func reset() -> void:
	phase = "ready"
	elapsed = 0.0
	clip_time = 0.0
	stop_remaining = 0.0
	contact_sent = false
	swing_sent = false
	defeat_on_contact = false
	reset_done.emit()
	if actor.visual == null or target.visual == null:
		return
	actor.reset_reaction()
	target.reset_reaction()
	actor.place(HOME)
	target.place(TARGET, atan2(TARGET.x - HOME.x, TARGET.z - HOME.z))
	actor.visual.play_role("idle", true)
	target.visual.play_role("idle", true)

func trigger() -> bool:
	if not enabled or phase != "ready" or actor.visual == null or target.reaction == "defeated":
		return false
	action_id += 1
	action_impacts = 0
	contact_sent = false
	swing_sent = false
	clip_time = 0.0
	attack_duration = actor.visual.clip_length("attack")
	contact_fraction_for_action = impact_fraction
	tempo_for_action = attack_tempo
	stop_for_action = hit_stop
	approach_duration = HOME.distance_to(CONTACT) / actor.run_speed
	return_duration = approach_duration * 1.1
	enter("approach")
	actor.visual.play_role("run", true)
	return true

func enter(next: String) -> void:
	phase = next
	elapsed = 0.0
	history.append("%d:%s" % [action_id, phase])
	if history.size() > 40:
		history.pop_front()
	phase_changed.emit(phase)

func travel(from: Vector3, to: Vector3, duration: float, delta: float) -> void:
	var before: Vector3 = actor.position
	# Nearly constant stride with a short ease at each end, no root-motion offsets.
	var t: float = minf(elapsed / duration, 1.0)
	var eased: float = t - sin(TAU * t) * 0.065
	actor.position = from.lerp(to, eased)
	actor.face(to - from, delta)
	actor.locomotion(actor.position.distance_to(before) / delta, true)

func _physics_process(delta: float) -> void:
	if not enabled or phase == "ready":
		return
	if stop_remaining > 0.0:
		stop_remaining = maxf(0.0, stop_remaining - delta)
		if stop_remaining == 0.0:
			target.reaction_frozen = false
			target.visual.player.speed_scale = 1.0
		return
	elapsed += delta
	match phase:
		"approach":
			travel(HOME, CONTACT, approach_duration, delta)
			if elapsed >= approach_duration:
				# Aim this cross-body slash through the torso, not beside its left edge.
				var yaw_offset: float = deg_to_rad(-20.0) if actor.visual.descriptor.asset_id == "kaida" else 0.0
				actor.place(CONTACT, atan2(CONTACT.x - TARGET.x, CONTACT.z - TARGET.z) + yaw_offset)
				actor.visual.play_role("idle")
				enter("plant")
		"plant":
			if elapsed >= 0.065:
				actor.visual.begin_action()
				enter("attack")
		"attack":
			# Preserve all source poses: readable wind-up, brisk cut, full follow-through.
			var fraction: float = clip_time / attack_duration
			var rate: float = (1.35 if fraction < 0.34 else (2.5 if fraction < 0.60 else 1.5)) * tempo_for_action
			var next_time: float = minf(clip_time + delta * rate, attack_duration)
			var contact_time: float = attack_duration * contact_fraction_for_action
			if not contact_sent:
				next_time = minf(next_time, contact_time)
			actor.visual.player.advance(next_time - clip_time)
			clip_time = next_time
			if not swing_sent and clip_time >= attack_duration * 0.34:
				swing_sent = true
				swing_started.emit()
			if not contact_sent and clip_time >= contact_time:
				contact_sent = true
				action_impacts += 1
				impact_count += 1
				target.start_reaction(defeat_on_contact)
				stop_remaining = stop_for_action
				target.reaction_frozen = stop_for_action > 0.0
				target.visual.player.speed_scale = 0.0 if stop_for_action > 0.0 else 1.0
				impact.emit(action_id)
			if clip_time >= attack_duration:
				enter("recovery")
				actor.visual.play_role("idle")
		"recovery":
			if elapsed >= recovery_duration:
				enter("return")
				actor.visual.play_role("run", true)
		"return":
			travel(CONTACT, HOME, return_duration, delta)
			if elapsed >= return_duration:
				# Turn back toward the target before settling into ready.
				actor.position = HOME
				actor.visual.play_role("idle")
				enter("settle")
		"settle":
			actor.face(TARGET - HOME, delta)
			if elapsed >= 0.15:
				actor.place(HOME, atan2(HOME.x - TARGET.x, HOME.z - TARGET.z))
				enter("ready")
				defeat_on_contact = false
				completed_count += 1
				completed.emit(action_id)
