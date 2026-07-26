extends CanvasLayer

## Dev overlay. Backtick (`) toggles, matching void-fracture's convention.
##
## Phase 2.75: the shell plus live telemetry. The tuning controls are a
## placeholder list for now — the point is that the overlay exists and has a
## home for them, so adding a slider later is a five-line change rather than a
## new subsystem.
##
## Everything here reads state; nothing writes it. When knobs do land they
## should drive the exported vars on Glider / ChaseCamera / TerrainField
## directly, so the overlay stays a view and the defaults stay in the scripts.

@export var ship_path: NodePath
@export var camera_rig_path: NodePath
@export var terrain_path: NodePath
@export var parity_path: NodePath

var _ship: Glider
var _rig: ChaseCamera
var _terrain: TerrainField
var _parity: Node3D
var _label: Label
var _panel: PanelContainer


func _ready() -> void:
	# Keep working if the game pauses (menus, wave transitions) — a dev overlay
	# that dies with the pause state is useless exactly when you need it.
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 100

	_ship = get_node_or_null(ship_path) as Glider
	_rig = get_node_or_null(camera_rig_path) as ChaseCamera
	_terrain = get_node_or_null(terrain_path) as TerrainField
	_parity = get_node_or_null(parity_path) as Node3D

	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.04, 0.07, 0.82)
	style.border_color = Color(0.55, 0.62, 0.85, 0.5)
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	style.set_content_margin_all(10)

	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", style)
	_panel.position = Vector2(12, 12)
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_panel)

	_label = Label.new()
	# Monospace, or none of the column alignment or the [ ] key boxes line up —
	# Godot's default UI font is proportional.
	var mono := SystemFont.new()
	mono.font_names = PackedStringArray(["Menlo", "Monaco", "SF Mono",
		"DejaVu Sans Mono", "Courier New"])
	_label.add_theme_font_override("font", mono)
	_label.add_theme_font_size_override("font_size", 12)
	_label.add_theme_color_override("font_color", Color(0.86, 0.90, 1.0))
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_panel.add_child(_label)

	visible = false


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if (event as InputEventKey).physical_keycode == KEY_QUOTELEFT:
			visible = not visible
			get_viewport().set_input_as_handled()


func _process(_delta: float) -> void:
	if not visible:
		return
	_label.text = _build_text()


func _build_text() -> String:
	var L: Array[String] = []
	L.append("DUNEGLIDE · DEV                    ` close")
	L.append("───────────────────────────────────────────")

	L.append("fps       %5d      draw calls  %4d" % [
		Engine.get_frames_per_second(),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
	])

	if _ship:
		var p := _ship.global_position
		var h := Height.height(p.x, p.z)
		L.append("speed     %5.1f      boost      %4.0f%%" % [
			_ship.speed, _ship.boost_amount() * 100.0])
		L.append("altitude  %5.2f      bank       %4.0f°" % [
			_ship.altitude(), rad_to_deg(_ship.bank)])
		L.append("heading   %5.0f°     terrain h %5.1f" % [
			rad_to_deg(_ship.yaw), h])
		L.append("pos      %6.0f %6.0f" % [p.x, p.z])

	if _rig:
		var lag := rad_to_deg(wrapf(_rig._yaw - (_ship.yaw if _ship else 0.0), -PI, PI))
		L.append("cam lag   %5.0f°     fov       %5.1f" % [
			lag, _rig.get_node("RollPivot/Camera3D").fov])

	if _terrain:
		L.append("wave t    %5.1f / %.1f" % [Height.wave_time, Height.TIME_WRAP])

	L.append("")
	L.append("TUNING — placeholder, not wired yet")
	L.append("  · terrain   amplitude, pitch, fill, depth")
	L.append("  · glide     speed, bank, hover, lookahead")
	L.append("  · camera    distance, lag, roll, fov kick")
	L.append("  · art       palette, fog, glow, sun")
	L.append("")
	L.append("INPUT")
	L.append("      %s          boost %s" % [
		_key("W", "nose_up"), _key("SHIFT", "boost")])
	L.append("   %s %s %s       brake %s" % [
		_key("A", "steer_left"), _key("S", "nose_down"),
		_key("D", "steer_right"), _key("CTRL", "brake")])
	L.append("")
	L.append("KEYS   `  overlay    P  parity dots%s" % [
		"  [ON]" if (_parity and _parity.visible) else ""])

	return "\n".join(L)


## Live key box: filled brackets while held, dim dots when idle. Same character
## width either way so the row doesn't jitter as you fly.
func _key(label: String, action: String) -> String:
	if InputMap.has_action(action) and Input.is_action_pressed(action):
		return "[%s]" % label
	return "·%s·" % label
