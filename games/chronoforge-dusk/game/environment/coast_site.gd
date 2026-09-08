class_name DuskCoastSite
extends Node3D
## Metre-scale layout. Physics stays game-owned; ramps need no new animation.
const SPAWN := Vector3(-11, 0.025, 13)
const WORKSHOP_AT := Vector3(-22.2,0,13)
const WORKSHOP_RETURN := Vector3(-22.2,.025,16.9)
var workshop: DuskWorkshopShell
var import_errors: Array[String] = []
var surface_material: Material
var wall_material: Material
var kit: DuskCoastKit
var shore_edges: Array[Array] = []
var sea_material: ShaderMaterial
var coast_time: float = 0.0

func _ready() -> void:
	var stone := ShaderMaterial.new()
	stone.shader = preload("res://environment/stone.gdshader")
	surface_material = stone
	var wall := ShaderMaterial.new()
	wall.shader = stone.shader
	wall.set_shader_parameter("vertical",true)
	wall.set_shader_parameter("tint",Color("677c78"))
	wall_material = wall
	kit = DuskCoastKit.new()
	add_child(kit)
	import_errors = kit.errors
	build_route()
	build_light()
	dress_site()
	workshop = DuskWorkshopShell.new()
	workshop.position = WORKSHOP_AT
	add_child(workshop)
	if not workshop.error.is_empty(): import_errors.append(workshop.error)

func build_route() -> void:
	slab("Arrival quay", Rect2(-18, 6, 16, 14), 0, 0)
	slab("Workshop apron", Rect2(-26,9.8,8,8.2),0,0)
	slab("Repaired crossing", Rect2(-2, 6, 12, 4), 0, 0)
	slab("East landing", Rect2(10, 3, 7, 10), 0, 0)
	slab("East ascent", Rect2(10, -10, 7, 13), 3, 0)
	slab("Upper ruin terrace", Rect2(-15, -18, 32, 8), 3, 3)
	slab("West return", Rect2(-15, -10, 6, 16), 3, 0)
	slab("Sea overlook", Rect2(-15, -24, 8, 6), 3, 3)
	# Continuous low parapets explain every impassable drop. Connections are open.
	for edge: Array in [
		[Vector3(-18,0,20),Vector3(-2,0,20)], [Vector3(-18,0,6),Vector3(-18,0,16)],
		[Vector3(-18,0,18),Vector3(-18,0,20)],
		[Vector3(-26,0,9.8),Vector3(-18,0,9.8)],
		[Vector3(-26,0,9.8),Vector3(-26,0,18)],
		[Vector3(-26,0,18),Vector3(-18,0,18)],
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
	if title == "Repaired crossing":
		mesh.visible = false
		return
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
	shore_edges.append([a,b])
	var direction: Vector3 = (b-a).normalized()
	var across: Vector3 = direction.cross(Vector3.UP).normalized()
	var up: Vector3 = across.cross(direction)
	var count: int = maxi(1,int(ceil(a.distance_to(b)/3.0)))
	for i: int in range(count):
		var at: Vector3 = a.lerp(b,(i+.5)/count)-up*2.05
		if a.z in [6.0,10.0] and b.x == 10.0: continue
		kit.place_transform("seawall",Transform3D(Basis(direction,up,across).scaled_local(Vector3(a.distance_to(b)/count/3.0,1.0,.58)),at))
	var center: Vector3 = (a+b)*0.5 + Vector3.UP*0.36
	var length: float = a.distance_to(b)
	var body: Node3D = box("Salt-worn parapet", center, Vector3(0.40,0.72,length+0.12), wall_material, true)
	body.look_at_from_position(center, center + (b-a))
	body.get_child(0).visible = false
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
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("537e93")
	sky_material.sky_horizon_color = Color("b2c5c5")
	sky_material.ground_bottom_color = Color("243c45")
	sky_material.ground_horizon_color = Color("b2c5c5")
	sky.sky_material = sky_material
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("bddee1")
	env.ambient_light_energy = 0.34
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = env
	add_child(world)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-34,-48,0)
	sun.light_color = Color("fff0d5")
	sun.light_energy = 1.20
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 92.0
	sun.light_angular_distance = 0.5
	add_child(sun)
	sea_material = ShaderMaterial.new()
	sea_material.shader = preload("res://environment/sea.gdshader")
	box("Sea",Vector3(0,-1.85,0),Vector3(300,0.1,300),sea_material)

func _process(delta: float) -> void:
	coast_time += delta
	sea_material.set_shader_parameter("coast_time",coast_time)
	kit.grass_material.set_shader_parameter("coast_time",coast_time)

func dress_site() -> void:
	# Furniture is kept to the edge; the 4 m crossing and both ramps stay clear.
	for at: Vector3 in [Vector3(-16.5,0,18),Vector3(-3.3,0,18.5),Vector3(-3.2,0,11.5),Vector3(15.6,0,11.5),Vector3(15.9,3,-16.8),Vector3(-8.2,3,-22.8),Vector3(-13.8,3,-22.8)]:
		kit.place("bollard",at)
		obstacle(at+Vector3.UP*.4,Vector3(.6,.8,.6))
	for at: Vector3 in [Vector3(-16.2,0,12.0),Vector3(15.6,0,4.2),Vector3(7.5,3,-16.4)]:
		kit.place("supplies",at,Vector3.ONE,0.15)
		obstacle(at+Vector3.UP*.8,Vector3(2,1.6,1.7))
	kit.place("pump",Vector3(-14.8,0,8.5),Vector3.ONE,-.12)
	obstacle(Vector3(-14.8,1.2,8.5),Vector3(3.3,2.4,2.2))
	# The bridge has a continuous controller-owned walking plane. Planks sit flush.
	for x: float in [-0.5,2.5,5.5,8.5]:
		kit.place("bridge",Vector3(x,-.31,8),Vector3.ONE,PI*.5)
	for x: float in [1.0,7.0]:
		for z: float in [7.0,9.0]:
			kit.place("seawall",Vector3(x,-3.0,z),Vector3(.2,1.0,.4))
	# Open arches and a collapsed rear wall make a ruin, with no roof occlusion.
	for x: float in [-3.5,3.0,11.0]:
		kit.place("arch",Vector3(x,3,-16.8))
		for dx: float in [-2.53,2.53]:
			obstacle(Vector3(x+dx,5.6,-16.8),Vector3(1.2,5.2,1.6))
	# Partial cross wall at the arrival defines an entrance without hiding Kaida.
	kit.place("arch",Vector3(-13.3,0,18.4),Vector3(.8,.72,.8))
	for dx: float in [-2.02,2.02]:
		obstacle(Vector3(-13.3+dx,1.8,18.4),Vector3(1.0,3.6,1.3))
	# Distant broken signal station, on an isolated tidal stack.
	kit.place("tower",Vector3(-1,-1.6,-34),Vector3.ONE,0.28)
	kit.place("rocks",Vector3(-1,-3,-34),Vector3(3.8,2.7,3.1),0.2)
	var rng := RandomNumberGenerator.new()
	rng.seed = 606
	# Natural rock aprons obscure the square foundations at the tide line.
	for edge: Array in shore_edges:
		var a: Vector3 = edge[0]
		var b: Vector3 = edge[1]
		if a.z in [6.0,10.0] and b.x == 10.0: continue
		var count: int = maxi(1,int(a.distance_to(b)/2.3))
		for i: int in range(count):
			var at: Vector3 = a.lerp(b,(i+.5)/count)
			at.y = -2.4+rng.randf_range(-.2,.3)
			var scale_by: float = rng.randf_range(.7,1.4)
			kit.place("rocks",at,Vector3(scale_by,scale_by*.85,scale_by),rng.randf()*TAU)
	# Low grasses are concentrated in the margins, not spread over walking space.
	for edge: Array in shore_edges:
		var a: Vector3 = edge[0]
		var b: Vector3 = edge[1]
		if a.z in [6.0,10.0] and b.x == 10.0: continue
		var count: int = maxi(1,int(a.distance_to(b)/1.15))
		for i: int in range(count):
			if rng.randf()<.26: continue
			var at: Vector3 = a.lerp(b,(i+.5)/count)
			at.x += rng.randf_range(-.32,.32)
			at.z += rng.randf_range(-.32,.32)
			var s: float = rng.randf_range(.55,.95)
			kit.place("grass",at+Vector3.UP*.05,Vector3(s,s,s),rng.randf()*TAU)
	# Broken slabs and salvage on the unused island edges, plus offshore stacks.
	for at: Vector3 in [Vector3(-23,-2,11),Vector3(-26,-2,-9),Vector3(23,-2,-6),Vector3(21,-2,17),Vector3(-7,-2,-31),Vector3(12,-2,-33)]:
		kit.place("rocks",at,Vector3(2.4,1.9,2),rng.randf()*TAU)
	# Damp planting pockets make the generous arrival paving feel occupied.
	for at: Vector3 in [Vector3(-16,0,15.5),Vector3(-4,0,17),Vector3(15.8,1.8,-5),Vector3(-13.8,3,-20),Vector3(-7.5,3,-11.2)]:
		kit.place("grass",at,Vector3.ONE,0.5)
		kit.place("rocks",at-Vector3.UP*.55,Vector3(.55,.55,.55),0.4)
	kit.commit()

func obstacle(at: Vector3, size: Vector3) -> void:
	var body := StaticBody3D.new()
	body.position = at
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	add_child(body)
