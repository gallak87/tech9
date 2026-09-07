class_name DuskRehearsal
extends Node
## One owner for contact; clips never dispatch gameplay events.
signal impact(action_id: int)
signal completed(action_id: int)

const HOME := Vector3(-2.2, 0.02, 1.4)
const TARGET := Vector3(1.5, 0.02, -1.0)
const CONTACT := Vector3(0.55, 0.02, -0.38)

var actor: DuskCharacter
var target: DuskCharacter
var phase: String = "ready"
var elapsed: float = 0.0
var attack_duration: float = 0.9
var impact_fraction: float = 0.5
var approach_duration: float = 0.65
var recovery_duration: float = 0.3
var return_duration: float = 0.8
var action_id: int = 0
var impact_count: int = 0
var action_impacts: int = 0
var completed_count: int = 0
var contact_sent: bool = false
var enabled: bool = false
var history: Array[String] = []

func reset() -> void:
	phase = "ready"
	elapsed = 0.0
	contact_sent = false
	if actor.visual == null or target.visual == null:
		return
	actor.place(HOME)
	target.place(TARGET, atan2(TARGET.x - HOME.x, TARGET.z - HOME.z))
	actor.visual.play_role("idle", true)
	target.visual.play_role("idle", true)

func trigger() -> bool:
	if not enabled or phase != "ready" or actor.visual == null:
		return false
	action_id += 1
	action_impacts = 0
	contact_sent = false
	attack_duration = actor.visual.clip_length("attack")
	enter("approach")
	actor.visual.play_role("run", true)
	return true

func enter(next: String) -> void:
	phase = next
	elapsed = 0.0
	history.append("%d:%s" % [action_id, phase])
	if history.size() > 30:
		history.pop_front()

func _physics_process(delta: float) -> void:
	if not enabled or phase == "ready":
		return
	elapsed += delta
	match phase:
		"approach":
			actor.position = HOME.lerp(CONTACT, smoothstep(0.0, 1.0, minf(elapsed / approach_duration, 1.0)))
			actor.face(TARGET - actor.position, delta)
			if elapsed >= approach_duration:
				actor.position = CONTACT
				enter("attack")
				actor.visual.play_role("attack", true)
		"attack":
			if not contact_sent and elapsed >= attack_duration * impact_fraction:
				contact_sent = true
				action_impacts += 1
				impact_count += 1
				target.visual.play_role("hurt", true)
				impact.emit(action_id)
			if elapsed >= attack_duration:
				enter("recovery")
				actor.visual.play_role("idle")
		"recovery":
			if elapsed >= recovery_duration:
				enter("return")
				actor.visual.play_role("run", true)
		"return":
			actor.position = CONTACT.lerp(HOME, smoothstep(0.0, 1.0, minf(elapsed / return_duration, 1.0)))
			actor.face(HOME - actor.position, delta)
			if elapsed >= return_duration:
				actor.place(HOME)
				actor.visual.play_role("idle")
				target.visual.play_role("idle")
				enter("ready")
				completed_count += 1
				completed.emit(action_id)
