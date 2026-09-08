class_name DuskWorkshopShell
extends Node3D
## One prepared shell is used at the same scale outside and inside.
const DESCRIPTOR := "res://assets/coast.workshop/r1/descriptor.json"
var asset: DuskAssetAssembly
var error: String = ""
var roof: Array[MeshInstance3D] = []
var front: Array[MeshInstance3D] = []

func _ready() -> void:
	asset = DuskAssetAssembly.new()
	asset.position.y = -.18 # Prepared floor top meets the game's walking plane.
	add_child(asset)
	if not asset.assemble(DESCRIPTOR):
		error = asset.load_error
		return
	for node: Node in asset.model.find_children("*","MeshInstance3D",true,false):
		if str(node.name).begins_with("Roof"): roof.append(node)
		if str(node.name).begins_with("SouthWall") or str(node.name).begins_with("Door"): front.append(node)
	for item: Array in [
		[Vector3(0,-.12,0),Vector3(6.4,.24,5.2)],
		[Vector3(-3.05,1.77,0),Vector3(.3,3.54,5.2)],
		[Vector3(3.05,1.77,0),Vector3(.3,3.54,5.2)],
		[Vector3(0,1.77,-2.45),Vector3(6.4,3.54,.3)],
		[Vector3(-2.05,1.77,2.45),Vector3(2.3,3.54,.3)],
		[Vector3(2.05,1.77,2.45),Vector3(2.3,3.54,.3)],
		[Vector3(0,1.38,2.46),Vector3(1.8,2.76,.18)],
		[Vector3(0,3.66,0),Vector3(6.4,.24,5.2)],
		[Vector3(0,.55,-1.65),Vector3(3,1.1,.84)],
		[Vector3(2.36,.92,-1.56),Vector3(.8,1.84,.9)]]:
		var body := StaticBody3D.new()
		body.position = item[0]
		var collision := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = item[1]
		collision.shape = shape
		body.add_child(collision)
		add_child(body)

func cutaway(enabled: bool) -> void:
	for mesh: MeshInstance3D in roof: mesh.visible = not enabled
	for mesh: MeshInstance3D in front: mesh.visible = not enabled
