class_name DuskEncounterFeedback
extends DuskStrikeFeedback
## The established strike runs in a translated/rotated formation. Blade samples
## are world-space, so impact particles also need the target's world position.
func on_impact(_id: int) -> void:
	age = 0.0
	impact_events += 1
	var blade: PackedVector3Array = action.actor.visual.blade_segment()
	var center: Vector3 = action.target.global_position+Vector3.UP
	contact_point = Geometry3D.get_closest_point_to_segment(center,blade[0],blade[1]) if blade.size() == 2 else center
	impact_audio.play()
	camera.kick = .065
