extends Node
## Existing native gates continue to exercise the original development scene.
func _ready() -> void:
	var development: bool = "--development" in OS.get_cmdline_user_args()
	for argument: String in OS.get_cmdline_user_args():
		if argument in ["--self-test", "--verify-restart", "--kaida-test", "--kaida-restart"]:
			development = true
	get_tree().change_scene_to_file.call_deferred("res://development/foundation.tscn" if development else "res://environment/coast.tscn")
