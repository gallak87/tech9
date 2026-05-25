extends CanvasLayer

@onready var score_label: Label     = $GameUI/ScoreLabel
@onready var lives_label: Label     = $GameUI/LivesLabel
@onready var wave_label: Label      = $GameUI/WaveLabel
@onready var weapon_label: Label    = $GameUI/WeaponLabel
@onready var bombs_label: Label     = $GameUI/BombsLabel
@onready var flash_label: Label     = $GameUI/FlashLabel
@onready var menu_panel: Panel      = $MenuPanel
@onready var menu_title: Label      = $MenuPanel/VBox/Title
@onready var menu_sub: Label        = $MenuPanel/VBox/Sub
@onready var menu_prompt: Label     = $MenuPanel/VBox/Prompt
@onready var result_panel: Panel    = $ResultPanel
@onready var result_title: Label    = $ResultPanel/VBox/Title
@onready var result_score: Label    = $ResultPanel/VBox/Score
@onready var result_prompt: Label   = $ResultPanel/VBox/Prompt

var _flash_timer := 0.0
var _prompt_blink := 0.0

func _ready() -> void:
	show_menu(true)
	show_game_over(false)
	flash_label.modulate.a = 0.0

func _process(delta: float) -> void:
	if _flash_timer > 0:
		_flash_timer -= delta
		flash_label.modulate.a = _flash_timer * 2.0
	_prompt_blink += delta
	if menu_panel.visible:
		menu_prompt.modulate.a = 0.5 + 0.5 * sin(_prompt_blink * 4.0)
	if result_panel.visible:
		result_prompt.modulate.a = 0.5 + 0.5 * sin(_prompt_blink * 4.0)

func show_menu(visible_: bool) -> void:
	menu_panel.visible = visible_
	if visible_:
		menu_title.text = "VOID FRACTURE"
		menu_sub.text = "ENDLESS WAVES · 3 BOSS CYCLES"
		menu_prompt.text = "PRESS ENTER TO BEGIN"

func show_game_over(visible_: bool, sc: int = 0, hi: int = 0, wave: int = 0) -> void:
	result_panel.visible = visible_
	if visible_:
		result_title.text = "GAME OVER"
		result_title.add_theme_color_override("font_color", Color(1, 0.2, 0.2))
		result_score.text = "SCORE  %08d\nHI     %08d\nWAVE   %d" % [sc, hi, wave]
		result_prompt.text = "PRESS ENTER TO RETRY"

func show_win(sc: int, hi: int) -> void:
	result_panel.visible = true
	result_title.text = "VICTORY"
	result_title.add_theme_color_override("font_color", Color(1, 0.84, 0))
	result_score.text = "SCORE  %08d\nHI     %08d" % [sc, hi]
	result_prompt.text = "PRESS ENTER TO PLAY AGAIN"

func update_score(sc: int) -> void:
	score_label.text = "%08d" % sc

func update_lives(lives: int) -> void:
	lives_label.text = "♥ ".repeat(lives) + "♡ ".repeat(3 - lives)

func update_wave(wave: int) -> void:
	wave_label.text = "WAVE %d" % wave

func update_weapon_tier(tier: int) -> void:
	var names := ["SINGLE","DUAL","SPREAD","PIERCE","BARRAGE","SEEKER","HYBRID"]
	weapon_label.text = "WPN  " + names[clamp(tier, 0, names.size()-1)]

func update_bombs(bombs: int) -> void:
	bombs_label.text = "BMB  " + "● ".repeat(bombs) + "○ ".repeat(4 - bombs)

func flash_wave(wave_num: int, is_boss: bool = false) -> void:
	if is_boss:
		flash_label.text = "⚠ BOSS INCOMING ⚠"
		flash_label.add_theme_color_override("font_color", Color(1, 0.4, 0))
	else:
		flash_label.text = "WAVE %d" % wave_num
		flash_label.add_theme_color_override("font_color", Color(0, 1, 0.6))
	_flash_timer = 1.5

func flash_pickup(text: String) -> void:
	flash_label.text = text
	flash_label.add_theme_color_override("font_color", Color(1, 0.84, 0))
	_flash_timer = 1.0

func flash_bomb() -> void:
	flash_label.text = "BOMB"
	flash_label.add_theme_color_override("font_color", Color(0.7, 0.3, 1.0))
	_flash_timer = 0.6
