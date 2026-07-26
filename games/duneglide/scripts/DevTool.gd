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
	_label.add_theme_color_override("font_color", Color(0.88, 0.92, 1.0))
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_panel.add_child(_label)

	# Scale the overlay with the window ourselves rather than setting
	# window/stretch/mode = canvas_items: on a 3D game that stretch mode renders
	# the 3D at base resolution and upscales it, which would soften the whole
	# terrain just to fix text size.
	get_viewport().size_changed.connect(_rescale)
	_rescale()

	visible = false


const BASE_HEIGHT := 800.0
const BASE_FONT := 17


func _rescale() -> void:
	var h := float(get_viewport().get_visible_rect().size.y)
	var s := clampf(h / BASE_HEIGHT, 1.0, 3.0)
	_label.add_theme_font_size_override("font_size", int(round(BASE_FONT * s)))
	_panel.position = Vector2(16.0 * s, 16.0 * s)


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
	# Deliberately sparse. This is read at a glance while flying, not a metrics
	# dump. fps and draw calls came out: they are better measured properly via
	# game_performance over MCP than squinted at mid-carve, and they were the
	# densest, least actionable rows on the panel.
	var L: Array[String] = []
	L.append("DUNEGLIDE")
	L.append("")

	if _ship:
		L.append("  SPEED      %5.0f" % _ship.speed)
		L.append("  ALTITUDE   %5.1f" % _ship.altitude())
		L.append("  BANK       %4.0f°" % rad_to_deg(_ship.bank))
		L.append("")

	L.append("  %s %s %s %s" % [
		_key("W", "nose_up"), _key("A", "steer_left"),
		_key("S", "nose_down"), _key("D", "steer_right")])
	L.append("  %s boost  %s brake" % [
		_key("SHIFT", "boost"), _key("CTRL", "brake")])
	L.append("")
	L.append("  tuning knobs — todo")
	L.append("")
	L.append("  `  close     P  parity%s" % [
		"  [ON]" if (_parity and _parity.visible) else ""])

	return "\n".join(L)


## Live key box: filled brackets while held, dim dots when idle. Same character
## width either way so the row doesn't jitter as you fly.
func _key(label: String, action: String) -> String:
	if InputMap.has_action(action) and Input.is_action_pressed(action):
		return "[%s]" % label
	return "·%s·" % label
