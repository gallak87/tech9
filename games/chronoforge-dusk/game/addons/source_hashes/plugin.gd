@tool
extends EditorPlugin

class SourceHashes extends EditorExportPlugin:
	func _get_name() -> String:
		return "DuskSourceHashes"

	func _export_file(path: String, _type: String, _features: PackedStringArray) -> void:
		# ResourceLoader still uses Godot's imported scene. FileAccess reads these
		# source bytes solely for identity verification; this is not an importer.
		if path.begins_with("res://assets/") and path.ends_with(".glb"):
			add_file(path, FileAccess.get_file_as_bytes(path), false)

var exporter: EditorExportPlugin

func _enter_tree() -> void:
	exporter = SourceHashes.new()
	add_export_plugin(exporter)

func _exit_tree() -> void:
	remove_export_plugin(exporter)
