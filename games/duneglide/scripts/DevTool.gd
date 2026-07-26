extends CanvasLayer

## Dev overlay. Backtick (`) toggles, matching void-fracture's convention.
##
## Everything except the knobs reads state; it never writes it. The knobs drive
## the exported vars on TerrainField directly, so the overlay stays a view and
## the defaults stay in the scripts.
##
## The pause/orbit rig at the bottom is TEMPORARY — it exists to inspect terrain
## geometry up close while tuning the cell look, and should come out once that
## is settled. It is not a game pause and makes no attempt to be one.

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

# Orbit state, only meaningful while _frozen.
var _frozen := false
var _dragging := false
var _orb_yaw := 0.0
var _orb_pitch := 0.5
var _orb_dist := 14.0


func _ready() -> void:
	# Keep working if the game pauses (menus, wave transitions) — a dev overlay
	# that dies with the pause state is useless exactly when you need it. It is
	# also what lets the orbit rig drive the camera while the tree is paused.
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


const BAR_H_STEP := 0.02
const FILL_STEP := 0.02
const ORBIT_SENS := 0.006
const ZOOM_STEP := 1.15


func _input(event: InputEvent) -> void:
	if _frozen and _orbit_input(event):
		return
	if not (event is InputEventKey and event.pressed):
		return
	var key := (event as InputEventKey).physical_keycode

	if not event.echo:
		match key:
			KEY_QUOTELEFT:
				visible = not visible
				get_viewport().set_input_as_handled()
				return
			KEY_BACKSLASH:
				_set_frozen(not _frozen)
				get_viewport().set_input_as_handled()
				return

	# Knobs only bind while the overlay is open, so they can use plain keys
	# without stealing them from flight controls during normal play.
	if not visible or not _terrain:
		return
	# echo IS allowed here (unlike the toggles) so holding a key sweeps a value.
	var bh := _terrain.bar_height
	var bp := _terrain.bar_period
	var bw := _terrain.bar_width
	match key:
		KEY_BRACKETLEFT:  bh -= BAR_H_STEP
		KEY_BRACKETRIGHT: bh += BAR_H_STEP
		KEY_MINUS:        bp -= 1.0
		KEY_EQUAL:        bp += 1.0
		KEY_SEMICOLON:    bw -= 1.0
		KEY_APOSTROPHE:   bw += 1.0
		# fill < 1.0 opens real holes in the ground. Kept on a knob purely to
		# show that it does; the intended value is 1.0.
		KEY_COMMA:
			_terrain.set_fill(_terrain.fill_x - FILL_STEP, _terrain.fill_z - FILL_STEP)
			get_viewport().set_input_as_handled()
			return
		KEY_PERIOD:
			_terrain.set_fill(_terrain.fill_x + FILL_STEP, _terrain.fill_z + FILL_STEP)
			get_viewport().set_input_as_handled()
			return
		_: return
	_terrain.set_bars(bh, bp, bw)
	get_viewport().set_input_as_handled()


## Returns true if the event was an orbit gesture and should not fall through.
func _orbit_input(event: InputEvent) -> bool:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		match mb.button_index:
			MOUSE_BUTTON_LEFT:
				_dragging = mb.pressed
				return true
			MOUSE_BUTTON_WHEEL_UP:
				if mb.pressed:
					_orb_dist = maxf(_orb_dist / ZOOM_STEP, 1.5)
				return true
			MOUSE_BUTTON_WHEEL_DOWN:
				if mb.pressed:
					_orb_dist = minf(_orb_dist * ZOOM_STEP, 400.0)
				return true
	elif event is InputEventMouseMotion and _dragging:
		var rel := (event as InputEventMouseMotion).relative
		_orb_yaw -= rel.x * ORBIT_SENS
		# Stop just short of the poles; at exactly +-90 the look_at up vector is
		# parallel to the view direction and the basis blows up.
		_orb_pitch = clampf(_orb_pitch + rel.y * ORBIT_SENS, -1.5, 1.5)
		return true
	return false


func _set_frozen(on: bool) -> void:
	if on == _frozen:
		return
	_frozen = on
	get_tree().paused = on
	if not _rig:
		return
	var cam := _rig.get_node("RollPivot/Camera3D") as Camera3D
	if on:
		# Seed the orbit from wherever the chase camera happens to be, so
		# freezing doesn't jump the view.
		var off := cam.global_position - _pivot()
		_orb_dist = maxf(off.length(), 2.0)
		_orb_yaw = atan2(off.x, off.z)
		_orb_pitch = asin(clampf(off.y / _orb_dist, -1.0, 1.0))
	else:
		_dragging = false
		# The orbit drove the Camera3D's own transform; hand it back to the rig
		# and jump to the resting pose so play resumes from behind the ship.
		cam.transform = Transform3D.IDENTITY
		_rig.get_node("RollPivot").transform = Transform3D.IDENTITY
		_rig.snap()


func _pivot() -> Vector3:
	return _ship.global_position if _ship else Vector3.ZERO


func _process(_delta: float) -> void:
	if _frozen and _rig and _ship:
		# The rig's _process is halted by the pause, so writing the Camera3D's
		# global transform here is uncontested.
		var cam := _rig.get_node("RollPivot/Camera3D") as Camera3D
		var p := _pivot()
		var dir := Vector3(
			sin(_orb_yaw) * cos(_orb_pitch),
			sin(_orb_pitch),
			cos(_orb_yaw) * cos(_orb_pitch))
		cam.global_position = p + dir * _orb_dist
		cam.look_at(p, Vector3.UP)
	if visible:
		_label.text = _build_text()


func _build_text() -> String:
	# Deliberately sparse. This is read at a glance while flying, not a metrics
	# dump. fps and draw calls came out: they are better measured properly via
	# game_performance over MCP than squinted at mid-carve.
	var L: Array[String] = []
	L.append("DUNEGLIDE")
	L.append("")

	if _ship:
		L.append("  SPEED      %5.0f" % _ship.speed)
		L.append("  ALTITUDE   %5.1f" % _ship.altitude())
		L.append("  BANK       %4.0f°" % rad_to_deg(_ship.bank))
		L.append("")

	if _terrain:
		L.append("  BAR  height %.2f   [ ]" % _terrain.bar_height)
		L.append("       every  %d      - =" % int(_terrain.bar_period))
		L.append("       thick  %d      ; '" % int(_terrain.bar_width))
		L.append("  CELL fill   %.2f   , ." % _terrain.fill_z)
		L.append("")

	L.append("  %s %s %s %s" % [
		_key("W", "nose_up"), _key("A", "steer_left"),
		_key("S", "nose_down"), _key("D", "steer_right")])
	L.append("  %s boost  %s brake" % [
		_key("SHIFT", "boost"), _key("CTRL", "brake")])
	L.append("")
	L.append("  \\  %s   P  parity%s" % [
		"UNFREEZE " if _frozen else "freeze   ",
		"  [ON]" if (_parity and _parity.visible) else ""])
	if _frozen:
		L.append("     drag to orbit, wheel to zoom")
	L.append("  `  close")

	return "\n".join(L)


## Live key box: filled brackets while held, dim dots when idle. Same character
## width either way so the row doesn't jitter as you fly.
func _key(label: String, action: String) -> String:
	if InputMap.has_action(action) and Input.is_action_pressed(action):
		return "[%s]" % label
	return "·%s·" % label
