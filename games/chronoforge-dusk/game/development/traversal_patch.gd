class_name DuskTraversalPatch
extends Node3D

var environment: Environment
var sun: DirectionalLight3D
var fill: DirectionalLight3D

func _ready() -> void:
	var world := WorldEnvironment.new()
	environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("20282c")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("c9d5da")
	environment.ambient_light_energy = 0.65
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = environment
	add_child(world)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -32, 0)
	sun.light_energy = 1.5
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 32
	add_child(sun)
	fill = DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-30, 140, 0)
	fill.light_energy = 0.35
	add_child(fill)
	var ground: Node3D = box("Ground", Vector3(0, -0.25, 0), Vector3(18, 0.5, 14), Color("616c6d"), true)
	var grid_material := ShaderMaterial.new()
	grid_material.shader = preload("res://development/ground.gdshader")
	(ground.get_child(0) as MeshInstance3D).material_override = grid_material
	for x: float in [-9.0, 9.0]:
		box("Boundary", Vector3(x, 0.25, 0), Vector3(0.25, 0.6, 14.2), Color("3d484c"), true)
	for z: float in [-7.0, 7.0]:
		box("Boundary", Vector3(0, 0.25, z), Vector3(18.2, 0.6, 0.25), Color("3d484c"), true)
	box("CollisionBlock", Vector3(-4.7, 0.55, -2.6), Vector3(1.5, 1.1, 2), Color("909b98"), true)
	box("LowBlock", Vector3(4.8, 0.25, 2.6), Vector3(2.0, 0.5, 1.1), Color("858f8c"), true)
	var ramp: Node3D = box("Ramp", Vector3(3.8, 0.20, -4.8), Vector3(2.0, 0.35, 3.2), Color("84918f"), true)
	ramp.rotation.x = deg_to_rad(12)
	label("TRAVERSAL  /  1 m GRID", Vector3(-4.4, 0.04, 4.8), 28)
	label("COLLISION", Vector3(-4.7, 1.25, -2.6), 22)
	label("SLOPE", Vector3(3.8, 0.9, -5.6), 22)

func set_game_lighting(enabled: bool) -> void:
	environment.background_color = Color("272930") if enabled else Color("20282c")
	environment.ambient_light_color = Color("bacad6") if enabled else Color("c9d5da")
	environment.ambient_light_energy = 0.45 if enabled else 0.65
	sun.light_color = Color("ffe0b3") if enabled else Color.WHITE
	sun.light_energy = 1.8 if enabled else 1.5
	fill.light_color = Color("adcae4") if enabled else Color.WHITE

func box(title: String, at: Vector3, size: Vector3, color: Color, solid: bool = false) -> Node3D:
	var node: Node3D = StaticBody3D.new() if solid else Node3D.new()
	node.name = title
	node.position = at
	add_child(node)
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.9
	mesh_instance.material_override = material
	node.add_child(mesh_instance)
	if solid:
		var collision := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = size
		collision.shape = shape
		node.add_child(collision)
	return node

func label(text: String, at: Vector3, font_size: int) -> void:
	var node := Label3D.new()
	node.text = text
	node.position = at
	node.font_size = font_size
	node.pixel_size = 0.007
	node.modulate = Color("d4dcd8")
	node.outline_size = 0
	node.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(node)
