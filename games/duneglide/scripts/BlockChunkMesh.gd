class_name BlockChunkMesh
extends RefCounted

## Builds ONE shared ArrayMesh holding a whole chunk of blocks. Called once per
## LOD level at startup and never again — every chunk node in a ring reuses the
## same Mesh resource and differs only by its node position.
##
## A block is 5 quads (top + 4 sides, no bottom) = 20 verts / 10 tris.
##
## Channel layout — note that UV and COLOR carry geometry, not texture data:
##   ARRAY_VERTEX  chunk-local (x, y, z) where y is 0 (bottom) or 1 (top)
##   ARRAY_NORMAL  baked face normal
##   ARRAY_TEX_UV  the BLOCK CENTRE in chunk-local space. This is the load-
##                 bearing trick: all 20 verts of a block sample one identical
##                 height, which is what makes a block instead of a smooth
##                 surface.
##   ARRAY_COLOR   (u, v, face_type, 1) — face-local coords in [0,1] for the rim
##                 shading; face_type 1 = top, 0 = side.

## chunk_n^2 * 20 verts must stay under 65536 or Godot silently promotes to
## 32-bit indices and doubles vertex bandwidth. 48^2 * 20 = 46080, 58 overflows.
const MAX_CHUNK_N := 48


static func build(n: int, pitch: float, fill_x: float, fill_z: float) -> ArrayMesh:
	assert(n <= MAX_CHUNK_N, "chunk_n %d overflows 16-bit indices (max %d)" % [n, MAX_CHUNK_N])

	var hw := pitch * fill_x * 0.5
	var hd := pitch * fill_z * 0.5
	var half := n * pitch * 0.5

	var v := PackedVector3Array();  v.resize(n * n * 20)
	var nrm := PackedVector3Array(); nrm.resize(n * n * 20)
	var uv := PackedVector2Array();  uv.resize(n * n * 20)
	var col := PackedColorArray();   col.resize(n * n * 20)
	var idx := PackedInt32Array();   idx.resize(n * n * 30)

	var vi := 0
	var ii := 0
	for j in n:
		for i in n:
			var cx := (i + 0.5) * pitch - half
			var cz := (j + 0.5) * pitch - half
			var c := Vector2(cx, cz)

			# top (CCW from +Y)
			vi = _quad(v, nrm, uv, col, idx, vi, ii, c, Vector3.UP, 1.0, [
				Vector3(cx - hw, 1.0, cz + hd), Vector3(cx + hw, 1.0, cz + hd),
				Vector3(cx + hw, 1.0, cz - hd), Vector3(cx - hw, 1.0, cz - hd)])
			ii += 6
			# +Z side — corner order is bottom-left, bottom-right, top-right, top-left
			# so ARRAY_COLOR.g runs 0 at the bottom to 1 at the top on every side.
			vi = _quad(v, nrm, uv, col, idx, vi, ii, c, Vector3.BACK, 0.0, [
				Vector3(cx - hw, 0.0, cz + hd), Vector3(cx + hw, 0.0, cz + hd),
				Vector3(cx + hw, 1.0, cz + hd), Vector3(cx - hw, 1.0, cz + hd)])
			ii += 6
			# -Z side
			vi = _quad(v, nrm, uv, col, idx, vi, ii, c, Vector3.FORWARD, 0.0, [
				Vector3(cx + hw, 0.0, cz - hd), Vector3(cx - hw, 0.0, cz - hd),
				Vector3(cx - hw, 1.0, cz - hd), Vector3(cx + hw, 1.0, cz - hd)])
			ii += 6
			# +X side
			vi = _quad(v, nrm, uv, col, idx, vi, ii, c, Vector3.RIGHT, 0.0, [
				Vector3(cx + hw, 0.0, cz + hd), Vector3(cx + hw, 0.0, cz - hd),
				Vector3(cx + hw, 1.0, cz - hd), Vector3(cx + hw, 1.0, cz + hd)])
			ii += 6
			# -X side
			vi = _quad(v, nrm, uv, col, idx, vi, ii, c, Vector3.LEFT, 0.0, [
				Vector3(cx - hw, 0.0, cz - hd), Vector3(cx - hw, 0.0, cz + hd),
				Vector3(cx - hw, 1.0, cz + hd), Vector3(cx - hw, 1.0, cz - hd)])
			ii += 6

	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = nrm
	arr[Mesh.ARRAY_TEX_UV] = uv
	arr[Mesh.ARRAY_COLOR] = col
	arr[Mesh.ARRAY_INDEX] = idx

	var m := ArrayMesh.new()
	# flags = 0 on purpose: ARRAY_FLAG_COMPRESS_ATTRIBUTES would half-float the
	# UV channel, and UV here carries block-centre geometry. Compressed, blocks
	# visibly jitter onto the wrong lattice cells.
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, 0)

	# CRITICAL: every vertex moves in the vertex shader, so the AABB Godot bakes
	# from the source verts spans only y in [0,1]. Without this override, chunks
	# blink out of existence the moment the camera pitches up. This is the #1
	# vertex-displacement bug in Godot.
	var pad := Height.MAX_ABS_H + 24.0
	m.custom_aabb = AABB(
		Vector3(-half, -pad, -half),
		Vector3(n * pitch, pad * 2.0, n * pitch))
	return m


static func _quad(v: PackedVector3Array, nrm: PackedVector3Array,
		uv: PackedVector2Array, col: PackedColorArray, idx: PackedInt32Array,
		vi: int, ii: int, center: Vector2, normal: Vector3,
		face_type: float, p: Array) -> int:
	const FUV := [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]
	for k in 4:
		v[vi + k] = p[k]
		nrm[vi + k] = normal
		uv[vi + k] = center
		col[vi + k] = Color(FUV[k].x, FUV[k].y, face_type, 1.0)
	idx[ii + 0] = vi;      idx[ii + 1] = vi + 1;  idx[ii + 2] = vi + 2
	idx[ii + 3] = vi;      idx[ii + 4] = vi + 2;  idx[ii + 5] = vi + 3
	return vi + 4
