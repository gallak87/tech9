class_name DuskWorkshop
extends Node3D
const SPAWN := Vector3(0,.025,1.25)
var actor: DuskCharacter
var shell: DuskWorkshopShell
var rig: DuskRoomCamera

func _ready() -> void:
	shell = DuskWorkshopShell.new()
	add_child(shell)
	shell.cutaway(true)
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("13262b")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("c0d6d0")
	env.ambient_light_energy = .55
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = env
	add_child(world)
	var warm := OmniLight3D.new()
	warm.position = Vector3(.8,2.8,.6)
	warm.light_color = Color("ffe6bd")
	warm.light_energy = 2.4
	warm.omni_range = 8.0
	warm.shadow_enabled = true
	add_child(warm)
	var utility := OmniLight3D.new()
	utility.position = Vector3(0,2.3,-1.7)
	utility.light_color = Color("a5e6dc")
	utility.light_energy = .7
	utility.omni_range = 3.0
	add_child(utility)
	rig = DuskRoomCamera.new()
	rig.actor = actor
	add_child(rig)

func switch_camera() -> void:
	rig.set_third_person(not rig.third_person)
	shell.cutaway(not rig.third_person)

func at_door() -> bool:
	return Vector2(actor.position.x,actor.position.z-1.5).length() < 1.25 and actor.position.z > .6
