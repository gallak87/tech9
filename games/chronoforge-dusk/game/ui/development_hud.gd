class_name DuskDevelopmentHUD
extends CanvasLayer

signal view_selected(index: int)
signal candidate_selected(index: int)
signal clip_selected(role: String)
signal lighting_changed(enabled: bool)
signal tuning_changed(key: String, value: float)
signal command(action: String)

var status: Label
var diagnostics: Label
var action_status: Label
var save_status: Label
var mode_description: Label
var candidate: OptionButton
var animation: OptionButton
var light: CheckButton
var pause_button: Button
var attack_button: Button
var view_buttons: Array[Button] = []
var knobs: Dictionary = {}
var phase_labels: Dictionary = {}
var error_panel: Label
var tuning_box: VBoxContainer
var side_panel: PanelContainer
var slow_button: Button

func _ready() -> void:
	var ui := Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(ui)
	var theme := Theme.new()
	theme.default_font_size = 21
	for type: String in ["Button", "OptionButton", "SpinBox"]:
		theme.set_stylebox("normal", type, panel(Color("293439"), 7))
		theme.set_stylebox("hover", type, panel(Color("3d4c51"), 7))
		theme.set_stylebox("pressed", type, panel(Color("4d625f"), 7))
		theme.set_stylebox("focus", type, panel(Color("43524e"), 7))
		theme.set_color("font_color", type, Color("e0e7e4"))
	theme.set_color("font_color", "Label", Color("d5dedb"))
	ui.theme = theme
	var header := PanelContainer.new()
	header.position = Vector2(28, 24)
	header.size = Vector2(1864, 92)
	header.add_theme_stylebox_override("panel", panel(Color("172126"), 10))
	ui.add_child(header)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 28)
	header.add_child(head)
	var title := VBoxContainer.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	text_label(title, "CHRONOFORGE  /  DUSK", 28, Color("edf0e8"))
	text_label(title, "03   KAIDA IN GAME     ·     MOVEMENT & STRIKE REVIEW", 16, Color("9caaa7"))
	for i: int in range(3):
		var b: Button = button(head, ["1  Inspect", "2  Traverse", "3  Rehearse"][i], "")
		b.toggle_mode = true
		b.pressed.connect(func() -> void: view_selected.emit(i))
		view_buttons.append(b)
	var side := PanelContainer.new()
	side_panel = side
	side.position = Vector2(28, 134)
	side.size = Vector2(402, 816)
	side.add_theme_stylebox_override("panel", panel(Color("172126"), 10))
	ui.add_child(side)
	var frame := VBoxContainer.new()
	side.add_child(frame)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	frame.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 13)
	scroll.add_child(column)
	text_label(column, "PREPARED CANDIDATE", 17, Color("9caaa7"))
	candidate = OptionButton.new()
	candidate.custom_minimum_size.y = 42
	candidate.focus_mode = Control.FOCUS_NONE
	candidate.item_selected.connect(func(index: int) -> void: candidate_selected.emit(index))
	column.add_child(candidate)
	status = text_label(column, "Loading…", 19, Color("cbd8cf"))
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.custom_minimum_size = Vector2(350, 92)
	button(column, "Reload prepared candidate  [F5]", "reload")
	mode_description = text_label(column, "", 19, Color("a7b9b4"))
	mode_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mode_description.custom_minimum_size.y = 62
	var row := HBoxContainer.new()
	column.add_child(row)
	pause_button = button(row, "Pause  [P]", "pause")
	button(row, "Replay  [R]", "replay")
	button(row, "Step", "step")
	animation = OptionButton.new()
	animation.focus_mode = Control.FOCUS_NONE
	for role: String in ["idle", "walk", "run", "attack", "hurt"]:
		animation.add_item(role.capitalize())
	animation.item_selected.connect(func(index: int) -> void: clip_selected.emit(["idle", "walk", "run", "attack", "hurt"][index]))
	column.add_child(animation)
	attack_button = button(column, "Rehearse strike  [Space]", "attack")
	slow_button = button(column, "Quarter speed  [T]", "slow")
	button(column, "Rig / blade markers  [M]", "markers")
	var reactions := HBoxContainer.new()
	column.add_child(reactions)
	button(reactions, "Hurt  [H]", "hurt")
	button(reactions, "Defeat  [K]", "defeat")
	light = CheckButton.new()
	light.text = "Game lighting  [L]"
	light.focus_mode = Control.FOCUS_NONE
	light.toggled.connect(func(on: bool) -> void: lighting_changed.emit(on))
	column.add_child(light)
	button(column, "Reset camera  [C]", "camera")
	text_label(column, "Orbit: right drag / Q E    Zoom: wheel", 17, Color("9caaa7"))
	var fold: Button = button(column, "Tuning  /  show controls", "")
	tuning_box = VBoxContainer.new()
	tuning_box.visible = false
	column.add_child(tuning_box)
	fold.pressed.connect(func() -> void:
		tuning_box.visible = not tuning_box.visible
		fold.text = "Tuning  /  hide controls" if tuning_box.visible else "Tuning  /  show controls")
	for item: Array in [["walk_speed", "Walk m/s", 0.5, 4.0, 0.1], ["run_speed", "Run m/s", 4.0, 8.0, 0.1], ["turn_speed", "Turn response", 2.0, 24.0, 1.0], ["impact_fraction", "Impact / clip", 0.15, 0.85, 0.01], ["attack_tempo", "Attack tempo", 0.5, 1.8, 0.05], ["hit_stop", "Hit stop (s)", 0.0, 0.12, 0.005], ["walk_stride_speed", "Walk stride m/s", 1.0, 4.0, 0.05], ["run_stride_speed", "Run stride m/s", 3.0, 7.0, 0.05], ["acceleration", "Acceleration", 10.0, 60.0, 1.0], ["braking", "Braking", 10.0, 60.0, 1.0]]:
		var line := HBoxContainer.new()
		tuning_box.add_child(line)
		var caption: Label = text_label(line, str(item[1]), 19, Color("b8c9c2"))
		caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var spin := SpinBox.new()
		spin.min_value = float(item[2])
		spin.max_value = float(item[3])
		spin.step = float(item[4])
		spin.custom_minimum_size.x = 122
		spin.value_changed.connect(func(value: float) -> void: tuning_changed.emit(str(item[0]), value))
		knobs[str(item[0])] = spin
		line.add_child(spin)
	var accepted := VBoxContainer.new()
	frame.add_child(accepted)
	button(accepted, "Save candidate + tuning  [F6]", "save")
	button(accepted, "Restore saved candidate  [F7]", "restore")
	save_status = text_label(accepted, "", 16, Color("9caaa7"))
	save_status.custom_minimum_size.y = 42
	save_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text_label(column, "Kaida r5 is provisional.\nOwner playtesting / acceptance pending.", 17, Color("d0b994"))
	var bottom := PanelContainer.new()
	bottom.position = Vector2(28, 974)
	bottom.size = Vector2(1864, 82)
	bottom.add_theme_stylebox_override("panel", panel(Color("172126"), 10))
	ui.add_child(bottom)
	var bottom_col := VBoxContainer.new()
	bottom.add_child(bottom_col)
	diagnostics = text_label(bottom_col, "Measuring…", 18, Color("b9c9c4"))
	text_label(bottom_col, "WASD: move    Shift: run    3 + Space: strike    K: defeat    R: reset    F1: panel    T: slow    F9: report    Esc: quit", 17, Color("91a39e"))
	var action_panel := VBoxContainer.new()
	action_panel.position = Vector2(468, 142)
	ui.add_child(action_panel)
	action_status = text_label(action_panel, "", 23, Color("e2e7db"))
	var timeline := HBoxContainer.new()
	timeline.add_theme_constant_override("separation", 18)
	action_panel.add_child(timeline)
	for phase: String in ["approach", "plant", "attack", "impact", "recovery", "return"]:
		phase_labels[phase] = text_label(timeline, phase.to_upper(), 17, Color("96a59e"))
	error_panel = text_label(ui, "", 23, Color("ffc0ad"))
	error_panel.position = Vector2(490, 840)
	error_panel.custom_minimum_size = Vector2(1330, 0)
	error_panel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

func set_mode(index: int) -> void:
	for i: int in range(view_buttons.size()):
		view_buttons[i].button_pressed = i == index
	mode_description.text = ["Inspect the imported actor, attachment and in-place clips.", "Walk the collision patch. Facing and displacement belong to the controller.", "Space: strike. K: finishing strike. R: reset / replay. Target is a harmless diagnostic."][index]
	animation.disabled = index != 0
	animation.visible = index == 0
	attack_button.disabled = index != 2
	attack_button.visible = index == 2
	for phase: String in phase_labels:
		phase_labels[phase].visible = index == 2

func set_tuning(values: Dictionary) -> void:
	for key: String in knobs:
		(knobs[key] as SpinBox).set_value_no_signal(float(values[key]))
	light.set_pressed_no_signal(bool(values.light_game))

func set_phase(phase: String, contact: bool) -> void:
	for name: String in phase_labels:
		var active: bool = phase == name or (name == "impact" and contact and phase == "attack")
		(phase_labels[name] as Label).modulate = Color("f4deb0") if active else Color("7e9590")

func button(parent: Node, text: String, action: String) -> Button:
	var node := Button.new()
	node.text = text
	node.custom_minimum_size.y = 42
	node.focus_mode = Control.FOCUS_NONE
	if not action.is_empty():
		node.pressed.connect(func() -> void: command.emit(action))
	parent.add_child(node)
	return node

func text_label(parent: Node, text: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label

func panel(color: Color, radius: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(radius)
	box.content_margin_left = 18
	box.content_margin_right = 18
	box.content_margin_top = 12
	box.content_margin_bottom = 12
	return box
