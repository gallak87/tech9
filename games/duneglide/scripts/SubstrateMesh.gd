class_name SubstrateMesh
extends RefCounted

## The floor under the blocks.
##
## Blocks extrude only block_depth downward and have gaps between them, so where
## a tall block neighbours a short one you would see straight through to the sky.
## This is a continuous displaced grid that sits just below the block tops and
## closes those holes.
##
## (n+1)^2 verts per chunk vs the block mesh's n^2 * 20 — about 2.5% of the cost.
## Same clipmap, same node positions, same height include.

static func build(n: int, pitch: float) -> ArrayMesh:
	var half := n * pitch * 0.5
	var side := n + 1

	var v := PackedVector3Array();   v.resize(side * side)
	var nrm := PackedVector3Array(); nrm.resize(side * side)
	var idx := PackedInt32Array();   idx.resize(n * n * 6)

	for j in side:
		for i in side:
			v[j * side + i] = Vector3(i * pitch - half, 0.0, j * pitch - half)
			nrm[j * side + i] = Vector3.UP

	var ii := 0
	for j in n:
		for i in n:
			var a := j * side + i
			var b := a + 1
			var c := a + side
			var d := c + 1
			idx[ii + 0] = a;  idx[ii + 1] = c;  idx[ii + 2] = b
			idx[ii + 3] = b;  idx[ii + 4] = c;  idx[ii + 5] = d
			ii += 6

	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = nrm
	arr[Mesh.ARRAY_INDEX] = idx

	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, 0)
	# Same displacement-vs-culling problem as the block mesh — see BlockChunkMesh.
	var pad := Height.MAX_ABS_H + 24.0
	m.custom_aabb = AABB(
		Vector3(-half, -pad, -half),
		Vector3(n * pitch, pad * 2.0, n * pitch))
	return m
