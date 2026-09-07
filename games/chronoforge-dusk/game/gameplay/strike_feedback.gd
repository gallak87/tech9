class_name DuskStrikeFeedback
extends Node3D
## Bounded presentation attached to the rehearsal's one impact authority.
var action: DuskRehearsal
var camera: DuskOrbitCamera
var age: float = 1.0
var contact_point: Vector3
var impact_events: int = 0
var swing_events: int = 0
var markers_enabled: bool = false
var trail := ImmediateMesh.new()
var rig_lines := ImmediateMesh.new()
var segments: Array[PackedVector3Array] = []
var particles: Array[MeshInstance3D] = []
var directions: Array[Vector3] = []
var material: StandardMaterial3D
var swing_audio: AudioStreamPlayer
var impact_audio: AudioStreamPlayer
var blade_marker: MeshInstance3D
var contact_marker: MeshInstance3D

func _ready() -> void:
	material = StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.vertex_color_use_as_albedo = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	var ribbon := MeshInstance3D.new()
	ribbon.mesh = trail
	ribbon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(ribbon)
	var skeleton_lines := MeshInstance3D.new()
	skeleton_lines.mesh = rig_lines
	skeleton_lines.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(skeleton_lines)
	for i: int in range(12):
		var spark: MeshInstance3D = bead(0.035, Color("ff88dd"))
		spark.visible = false
		particles.append(spark)
		var angle: float = i * TAU / 12.0
		directions.append(Vector3(cos(angle), sin(angle) * 0.7 + 0.35, sin(angle * 2.0) * 0.55))
	blade_marker = bead(0.06, Color("41fff4"))
	contact_marker = bead(0.065, Color("ffe58e"))
	swing_audio = AudioStreamPlayer.new()
	swing_audio.stream = preload("res://audio/swing.wav")
	swing_audio.volume_db = -8.0
	add_child(swing_audio)
	impact_audio = AudioStreamPlayer.new()
	impact_audio.stream = preload("res://audio/impact.wav")
	impact_audio.volume_db = -6.0
	add_child(impact_audio)
	action.impact.connect(on_impact)
	action.swing_started.connect(func() -> void:
		swing_events += 1
		swing_audio.play())
	action.reset_done.connect(clear)

func bead(radius: float, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = radius
	sphere.height = radius * 2.0
	sphere.radial_segments = 8
	sphere.rings = 4
	node.mesh = sphere
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = color
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	return node

func on_impact(_id: int) -> void:
	age = 0.0
	impact_events += 1
	var blade: PackedVector3Array = action.actor.visual.blade_segment()
	var center: Vector3 = action.target.position + Vector3.UP * 1.0
	contact_point = Geometry3D.get_closest_point_to_segment(center, blade[0], blade[1]) if blade.size() == 2 else center
	impact_audio.play()
	camera.kick = 0.065

func clear() -> void:
	age = 1.0
	segments.clear()
	trail.clear_surfaces()
	camera.kick = 0.0
	for spark: MeshInstance3D in particles:
		spark.visible = false
	if swing_audio != null:
		swing_audio.stop()
		impact_audio.stop()

func _process(delta: float) -> void:
	age += delta
	for i: int in range(particles.size()):
		var spark: MeshInstance3D = particles[i]
		spark.visible = age < 0.25
		if spark.visible:
			spark.position = contact_point + directions[i] * age * 3.4 + Vector3.DOWN * age * age * 4.0
			spark.scale = Vector3.ONE * maxf(0.05, 1.0 - age / 0.25)
	trail.clear_surfaces()
	if action.actor.visual == null:
		return
	var blade: PackedVector3Array = action.actor.visual.blade_segment()
	var fraction: float = action.clip_time / maxf(action.attack_duration, 0.01)
	if action.phase == "attack" and fraction >= 0.34 and fraction < 0.68 and blade.size() == 2:
		if action.stop_remaining <= 0.0:
			segments.append(blade)
			if segments.size() > 5:
				segments.pop_front()
	else:
		segments.clear()
	if segments.size() > 1:
		trail.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
		for i: int in range(1, segments.size()):
			var alpha: float = float(i) / segments.size() * 0.38
			trail.surface_set_color(Color(1.0, 0.12, 0.60, alpha))
			for point: Vector3 in [segments[i - 1][0], segments[i - 1][1], segments[i][1], segments[i - 1][0], segments[i][1], segments[i][0]]:
				trail.surface_add_vertex(point)
		trail.surface_end()
	blade_marker.visible = markers_enabled and blade.size() == 2
	contact_marker.visible = markers_enabled and action.enabled
	if blade_marker.visible:
		blade_marker.position = blade[1]
	contact_marker.position = action.target.position + Vector3.UP
	update_rig()

func update_rig() -> void:
	rig_lines.clear_surfaces()
	if not markers_enabled:
		return
	var skeleton: Skeleton3D = DuskAssetAssembly.find_skeleton(action.actor.visual.model)
	if skeleton == null:
		return
	rig_lines.surface_begin(Mesh.PRIMITIVE_LINES, material)
	rig_lines.surface_set_color(Color(0.25, 1.0, 0.95, 0.8))
	for bone: int in range(skeleton.get_bone_count()):
		var parent: int = skeleton.get_bone_parent(bone)
		if parent >= 0:
			rig_lines.surface_add_vertex(skeleton.to_global(skeleton.get_bone_global_pose(parent).origin))
			rig_lines.surface_add_vertex(skeleton.to_global(skeleton.get_bone_global_pose(bone).origin))
	rig_lines.surface_end()
