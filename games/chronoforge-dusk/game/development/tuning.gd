class_name DuskTuning
extends RefCounted

const DEFAULTS: Dictionary = {"walk_speed": 2.3, "run_speed": 5.1, "turn_speed": 18.0, "camera_yaw": 25.0, "camera_pitch": 34.0, "camera_distance": 9.6, "impact_fraction": 0.5, "light_game": true}
const LIMITS: Dictionary = {"walk_speed": [0.5, 4.0], "run_speed": [4.0, 8.0], "turn_speed": [2.0, 24.0], "camera_yaw": [-180.0, 180.0], "camera_pitch": [15.0, 75.0], "camera_distance": [4.0, 24.0], "impact_fraction": [0.15, 0.85]}
var values: Dictionary = DEFAULTS.duplicate()
var path: String = "user://accepted_tuning.json"
var saved: Dictionary = {}
var message: String = "Factory tuning · not saved"

func restore() -> bool:
	if not FileAccess.file_exists(path):
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary or parsed.get("format") != 1 or not parsed.get("values") is Dictionary:
		message = "SAVE ERROR: invalid accepted tuning; factory settings active"
		return false
	var config: Dictionary = parsed.values
	for key: String in LIMITS:
		if not DuskAssetAssembly.number_in_range(config.get(key), LIMITS[key][0], LIMITS[key][1]):
			message = "SAVE ERROR: invalid " + key + "; factory settings active"
			return false
	if not config.get("light_game") is bool:
		message = "SAVE ERROR: invalid lighting setting"
		return false
	saved = parsed
	values = config.duplicate()
	message = "Restored saved candidate tuning"
	return true

func accept(asset: DuskAssetAssembly, game_revision: String) -> bool:
	var record: Dictionary = {"format": 1, "descriptor": asset.descriptor_path, "asset_id": asset.descriptor.asset_id, "asset_revision": asset.descriptor.revision, "model_sha256": asset.descriptor.model.sha256, "game_revision": game_revision, "values": values.duplicate(), "accepted_unix": Time.get_unix_time_from_system(), "scope": "gameplay tuning; owner visual and motion acceptance pending"}
	var file: FileAccess = FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		message = "SAVE ERROR: " + error_string(FileAccess.get_open_error())
		return false
	file.store_string(JSON.stringify(record, "\t"))
	file.flush()
	file.close()
	# Retain the preceding accepted record for comparison/rollback.
	if FileAccess.file_exists(path):
		var backup_error: Error = DirAccess.copy_absolute(path, path + ".previous")
		if backup_error != OK:
			message = "SAVE ERROR: could not preserve previous acceptance"
			return false
	var result: Error = DirAccess.rename_absolute(path + ".tmp", path)
	if result != OK:
		message = "SAVE ERROR: " + error_string(result)
		return false
	saved = record
	message = "Candidate tuning saved · survives restart"
	return true
