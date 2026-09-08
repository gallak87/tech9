class_name DuskRoomCamera
extends Node3D
## Two concrete camera choices for the same small room; no actor/controller fork.
var overview: Camera3D
var arm: SpringArm3D
var third: Camera3D
var actor: DuskCharacter
var third_person: bool = false
var yaw: float = 0.0
var pitch: float = 0.24
var dragging: bool = false
var look_left: bool = false
var look_right: bool = false

func _ready() -> void:
	overview = Camera3D.new()
	overview.projection = Camera3D.PROJECTION_ORTHOGONAL
	overview.size = 8.2
	overview.near = .08
	add_child(overview)
	arm = SpringArm3D.new()
	arm.spring_length = 3.15
	arm.margin = .12
	var clearance := SphereShape3D.new()
	clearance.radius = .22
	arm.shape = clearance
	arm.add_excluded_object(actor.get_rid())
	add_child(arm)
	third = Camera3D.new()
	third.fov = 68
	third.near = .06
	arm.add_child(third)
	set_third_person(false)
	follow(1.0,true)

func active_camera() -> Camera3D:
	return third if third_person else overview

func set_third_person(value: bool) -> void:
	third_person = value
	dragging = false
	look_left = false
	look_right = false
	# Every return to cutaway restores the same keyboard axes as the coast.
	if not value: yaw = 0.0
	active_camera().make_current()
	actor.camera = active_camera()

func follow(delta: float, snap: bool = false) -> void:
	var target: Vector3 = actor.position+Vector3(0,1.35,0)
	if third_person:
		yaw += (float(look_left)-float(look_right))*delta*1.65
	arm.rotation = Vector3(-pitch,yaw,0)
	# Pivot remains close to Kaida; the spring shape protects the near plane.
	arm.position = target+arm.basis.x*.28
	var focus: Vector3 = Vector3(actor.position.x*.2,.75,actor.position.z*.18-.2)
	var desired: Vector3 = focus+Vector3(0,9.83,6.88)
	overview.position = desired if snap else overview.position.lerp(desired,1.0-exp(-8.0*delta))
	overview.look_at(focus)
	# Close wall contact can bring a following camera inside the character.
	var clearance: float = arm.get_hit_length()
	var opacity: float = clampf((clearance-.35)/.7,0.15,1.0) if third_person else 1.0
	for node: Node in actor.visual.find_children("*","MeshInstance3D",true,false):
		(node as MeshInstance3D).transparency = 1.0-opacity

func handle_input(event: InputEvent) -> void:
	if not third_person: return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		dragging = event.pressed
	if event is InputEventMouseMotion and dragging:
		yaw -= event.relative.x*.004
		pitch = clampf(pitch+event.relative.y*.003,0.08,.78)
	if event is InputEventKey:
		if event.physical_keycode == KEY_J: look_left = event.pressed
		if event.physical_keycode == KEY_L: look_right = event.pressed

func release_look() -> void:
	dragging = false
	look_left = false
	look_right = false
