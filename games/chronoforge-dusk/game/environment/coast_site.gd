class_name DuskCoastSite
extends Node3D
## Metre-scale layout. Physics stays game-owned; ramps need no new animation.
const SPAWN := Vector3(-11, 0.025, 13)
var import_errors: Array[String] = []
var surface_material: Material
var wall_material: Material

func _ready() -> void:
	surface_material = material(Color("8b9288"))
	wall_material = material(Color("52676a"))
	build_route()
	build_light()

func build_route() -> void:
	slab("Arrival quay", Rect2(-18, 6, 16, 14), 0, 0)
	slab("Repaired crossing", Rect2(-2, 6, 12, 4), 0, 0)
	slab("East landing", Rect2(10, 3, 7, 10), 0, 0)
	slab("East ascent", Rect2(10, -10, 7, 13), 3, 0)
	slab("Upper ruin terrace", Rect2(-15, -18, 32, 8), 3, 3)
	slab("West return", Rect2(-15, -10, 6, 16), 3, 0)
	slab("Sea overlook", Rect2(-15, -24, 8, 6), 3, 3)
	# Continuous low parapets explain every impassable drop. Connections are open.
	for edge: Array in [
		[Vector3(-18,0,20),Vector3(-2,0,20)], [Vector3(-18,0,6),Vector3(-18,0,20)],
		[Vector3(-18,0,6),Vector3(-15,0,6)], [Vector3(-9,0,6),Vector3(-2,0,6)],
		[Vector3(-2,0,10),Vector3(-2,0,20)], [Vector3(-2,0,6),Vector3(10,0,6)],
		[Vector3(-2,0,10),Vector3(10,0,10)], [Vector3(10,0,10),Vector3(10,0,13)],
		[Vector3(10,0,13),Vector3(17,0,13)], [Vector3(17,0,13),Vector3(17,0,3)],
		[Vector3(17,0,3),Vector3(17,3,-10)], [Vector3(10,0,3),Vector3(10,3,-10)],
		[Vector3(17,3,-10),Vector3(17,3,-18)], [Vector3(-7,3,-18),Vector3(17,3,-18)],
		[Vector3(-9,3,-10),Vector3(10,3,-10)], [Vector3(-9,3,-10),Vector3(-9,0,6)],
		[Vector3(-15,3,-10),Vector3(-15,0,6)], [Vector3(-15,3,-24),Vector3(-15,3,-10)],
		[Vector3(-15,3,-24),Vector3(-7,3,-24)], [Vector3(-7,3,-24),Vector3(-7,3,-18)]]:
		parapet(edge[0], edge[1])

func material(color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.92
	return mat

func slab(title: String, rect: Rect2, north: float, south: float) -> void:
	var x: float = rect.position.x
	var z: float = rect.position.y
	var w: float = rect.size.x
	var d: float = rect.size.y
	var points := PackedVector3Array([Vector3(x,north,z), Vector3(x+w,north,z), Vector3(x+w,south,z+d), Vector3(x,south,z+d)])
	var vertices := PackedVector3Array()
	# Godot front faces wind clockwise when viewed from above.
	for i: int in [0,1,2,0,2,3]:
		vertices.append(points[i])
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for vertex: Vector3 in vertices:
		st.set_uv(Vector2(vertex.x,vertex.z))
		st.add_vertex(vertex)
	st.generate_normals()
	var mesh := MeshInstance3D.new()
	mesh.mesh = st.commit()
	mesh.material_override = surface_material
	mesh.name = title
	add_child(mesh)
	var body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(vertices)
	collision.shape = shape
	body.add_child(collision)
	add_child(body)
	# Deep seawall skirts reach the intertidal rocks; never a floating floor.
	for i: int in range(4):
		var a: Vector3 = points[i]
		var b: Vector3 = points[(i+1)%4]
		var side := SurfaceTool.new()
		side.begin(Mesh.PRIMITIVE_TRIANGLES)
		for v: Vector3 in [a,Vector3(a.x,-3.2,a.z),b,b,Vector3(a.x,-3.2,a.z),Vector3(b.x,-3.2,b.z)]:
			side.add_vertex(v)
		side.generate_normals()
		var skirt := MeshInstance3D.new()
		skirt.mesh = side.commit()
		skirt.material_override = wall_material
		add_child(skirt)

func parapet(a: Vector3, b: Vector3) -> void:
	var center: Vector3 = (a+b)*0.5 + Vector3.UP*0.36
	var length: float = a.distance_to(b)
	var body: Node3D = box("Salt-worn parapet", center, Vector3(0.40,0.72,length+0.12), wall_material, true)
	body.look_at_from_position(center, center + (b-a))
	# A taller invisible solid on the same visible edge prevents capsule climbing.
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(0.40,2.2,length+0.12)
	collision.position.y = 0.65
	collision.shape = shape
	body.add_child(collision)

func box(title: String, at: Vector3, size: Vector3, mat: Material, solid: bool = false) -> Node3D:
	var body: Node3D = StaticBody3D.new() if solid else Node3D.new()
	body.name = title
	body.position = at
	add_child(body)
	var mesh := MeshInstance3D.new()
	var shape := BoxMesh.new()
	shape.size = size
	mesh.mesh = shape
	mesh.material_override = mat
	body.add_child(mesh)
	if solid:
		var collision := CollisionShape3D.new()
		var collider := BoxShape3D.new()
		collider.size = size
		collision.shape = collider
		body.add_child(collision)
	return body

func build_light() -> void:
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("7cabad")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("bddee1")
	env.ambient_light_energy = 0.48
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = env
	add_child(world)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-43,-37,0)
	sun.light_color = Color("ffdfac")
	sun.light_energy = 1.65
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 100.0
	add_child(sun)
	box("Sea",Vector3(0,-2.0,0),Vector3(300,0.1,300),material(Color("267e89")))
