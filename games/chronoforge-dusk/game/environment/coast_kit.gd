class_name DuskCoastKit
extends Node3D
## Each source is verified once through the existing asset consumer. Copies use
## MultiMesh batches of the imported resources; no alternate importer or format.
const PARTS: Array[String] = ["seawall","arch","bollard","supplies","rocks","grass","bridge","tower","pump"]
var templates: Dictionary = {}
var placements: Dictionary = {}
var errors: Array[String] = []
var identities: Dictionary = {}
var grass_material: ShaderMaterial
var occluders: Array[MeshInstance3D] = []

func _ready() -> void:
	for part: String in PARTS:
		var source := DuskAssetAssembly.new()
		add_child(source)
		var revision: String = "r2" if part == "bridge" else "r1"
		if not source.assemble("res://assets/coast.%s/%s/descriptor.json" % [part,revision]):
			errors.append(source.load_error)
		else:
			identities[part] = source.descriptor
			var pieces: Array[Dictionary] = []
			for node: Node in source.model.find_children("*","MeshInstance3D",true,false):
				var instance: MeshInstance3D = node as MeshInstance3D
				pieces.append({"mesh":instance.mesh,"transform":source.global_transform.affine_inverse()*instance.global_transform})
			templates[part] = pieces
			placements[part] = []
		remove_child(source)
		source.queue_free()
	grass_material = ShaderMaterial.new()
	grass_material.shader = preload("res://environment/grass.gdshader")

func place(part: String, at: Vector3, scale_by: Vector3 = Vector3.ONE, yaw: float = 0) -> void:
	place_transform(part,Transform3D(Basis(Vector3.UP,yaw).scaled(scale_by),at))

func place_transform(part: String, transform: Transform3D) -> void:
	if placements.has(part):
		placements[part].append(transform)

func commit() -> void:
	for part: String in placements:
		if placements[part].is_empty(): continue
		for piece: Dictionary in templates[part]:
			if part in ["arch","pump","supplies"]:
				for transform: Transform3D in placements[part]:
					var arch := MeshInstance3D.new()
					arch.mesh = piece.mesh
					arch.transform = transform*piece.transform
					add_child(arch)
					occluders.append(arch)
				continue
			var batch := MultiMeshInstance3D.new()
			batch.name = "Prepared_"+part
			var multi := MultiMesh.new()
			multi.transform_format = MultiMesh.TRANSFORM_3D
			multi.mesh = piece.mesh
			multi.instance_count = placements[part].size()
			for i: int in range(multi.instance_count):
				multi.set_instance_transform(i,placements[part][i]*piece.transform)
			batch.multimesh = multi
			if part == "grass":
				batch.material_override = grass_material
				batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(batch)

func reveal_actor(camera: Camera3D, at: Vector3, delta: float) -> void:
	for arch: MeshInstance3D in occluders:
		var inv: Transform3D = arch.global_transform.affine_inverse()
		# Orthographic sight lines are parallel, including the off-centre overlook.
		var actor_center: Vector3 = at+Vector3.UP
		var ray_start: Vector3 = actor_center+camera.global_basis.z*camera.far
		var hit: Variant = arch.mesh.get_aabb().grow(0.15).intersects_segment(inv*ray_start,inv*actor_center)
		arch.transparency = move_toward(arch.transparency,0.82 if hit != null else 0.0,delta*3.0)
