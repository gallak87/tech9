shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx, depth_draw_opaque;

#include "res://shaders/terrain_height.gdshaderinc"

group_uniforms Geometry;
// 1, 2, 4 — one material instance per LOD ring, so the skirt scales with pitch.
uniform float lod_scale = 1.0;
// MINIMUM skirt depth, used on flat ground. The actual depth is per-block and
// can be much larger on a slope — see vertex().
uniform float block_depth = 3.2;
// Must match this ring's pitch and the substrate's drop, or the skirt stops
// short of the floor and opens a see-through slot.
uniform float pitch = 1.0;
uniform float substrate_drop = 0.14;
// Block footprint as a fraction of pitch — must match TerrainField's fill_x /
// fill_z. The skirt needs less depth than the full inter-centre step because the
// block does not reach the cell corner; see vertex().
uniform float fill_x = 0.94;
uniform float fill_z = 0.30;
// Slack on the linear step estimate below, to absorb curvature between block
// centres. Cheaper than sampling the neighbours for real. The estimate is exact
// on linear terrain, so this only has to cover curvature — keep it near 1.
uniform float skirt_margin = 1.1;

group_uniforms Look;
// PHASE 3 VALUE INVERSION. These blocks used to be the LIGHT surface and the
// substrate the dark gaps. That is backwards from the reference: there the
// raised marks are DARK slabs sitting on a bright glossy floor, and that
// contrast — not any finish detail on the marks — is what makes it read as
// concrete rather than vector art. Keep this darker than substrate/floor_color.
uniform vec3 base_color : source_color = vec3(0.13, 0.12, 0.16);
uniform vec3 edge_color : source_color = vec3(1.00, 0.72, 0.55);
uniform vec3 cap_color : source_color = vec3(1.00, 0.86, 0.78);
// Zero now. Any body glow on a dark slab just lifts it back toward the floor
// value and undoes the inversion.
uniform float body_energy = 0.0;
// The reference reads as LIT, not glowing. Emission here is a rim accent on top
// of sky-ambient shading, not the primary light source. Much weaker than the
// pre-inversion 0.55 — on a dark slab even 0.14 read as glowing neon piping
// around every single block.
uniform float edge_energy = 0.05;
// NOT void-fracture's 3.5. That was tuned for a 0.06-unit edge strip; here the
// cap is an entire top face and 3.5 blows the whole field out to a white sheet
// under glow_hdr_threshold 0.7. Zero post-inversion: the slab tops are the
// darkest thing in frame.
uniform float cap_energy = 0.0;
uniform float rim_width = 0.16;

group_uniforms Fade;
uniform float fade_start = 330.0;
uniform float fade_end = 620.0;
uniform vec3 fog_color : source_color = vec3(0.78, 0.73, 0.74);

varying vec3 v_face;   // (u, v, is_top)
varying float v_hash;
varying float v_fade;

void vertex() {
	// UV carries the block centre in chunk-local space. Chunk nodes have an
	// identity basis and y == 0, so model space and world space share a Y axis.
	vec2 centre_world = (MODEL_MATRIX * vec4(UV.x, 0.0, UV.y, 1.0)).xz;
	vec3 hd = terrain_hd(centre_world);
	float is_top = COLOR.b;

	// Skirt depth is PER-BLOCK, not constant. The substrate under this block sits
	// at (min of the surrounding block centres) - substrate_drop, so on a slope
	// it is a full inter-centre step below this block's own top. A constant
	// block_depth cannot serve both cases: at 0.22 the skirt stopped short on
	// slopes and left a horizontal slot you could see the far side of the dune
	// through, and at 1.0 (deep enough for the worst slope) flat ground grew tall
	// vertical fins instead of the reference's flat tiles.
	//
	// hd.yz is the gradient we already have. The substrate vert at a cell corner
	// is a full inter-centre step below this centre, but the block stops short of
	// that corner, and the floor between is a bilinear interpolation — so at the
	// block's own edge the floor has only fallen (1 + fill)/2 of that step. Using
	// the full step instead made skirts ~1.4x too deep in X and ~2x in Z, which
	// buried the bright substrate and undid the Phase 3a value inversion.
	float ax = (1.0 + fill_x) * 0.5;
	float az = (1.0 + fill_z) * 0.5;
	float step_down = (abs(hd.y) * ax + abs(hd.z) * az) * pitch * skirt_margin;
	float depth = max(block_depth * lod_scale, step_down + substrate_drop + 0.02);

	// VERTEX.y is baked 0 (bottom) or 1 (top), so the top face lands exactly
	// on h and the skirt hangs below it.
	VERTEX.y = hd.x - (1.0 - VERTEX.y) * depth;

	// Tops adopt the analytic surface normal so the dune reads as a continuous
	// form under lighting; sides keep their baked face normals.
	vec3 surf_n = normalize(vec3(-hd.y, 1.0, -hd.z));
	NORMAL = normalize(mix(NORMAL, surf_n, is_top));

	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float d = length(wpos.xz - CAMERA_POSITION_WORLD.xz);
	v_fade = 1.0 - smoothstep(fade_start, fade_end, d);

	// Sink the far edge so a chunk recycled to the back of the clipmap rises
	// out of the fog floor instead of popping in.
	// Deliberately NOT scaled by lod_scale: at LOD2 that sank blocks 14 units
	// and carved a visible dark cliff along the whole horizon.
	VERTEX.y -= (1.0 - v_fade) * 3.0;

	v_face = vec3(COLOR.r, COLOR.g, is_top);
	v_hash = fract(sin(dot(centre_world, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 f = v_face.xy * 2.0 - 1.0;   // face-local, [-1, 1]
	float is_top = v_face.z;

	// Perimeter distance. On sides we use SIGNED f.y so the buried bottom edge
	// never glows; on tops we want the full box distance.
	float e = mix(max(abs(f.x), f.y), max(abs(f.x), abs(f.y)), is_top);
	// fwidth-based analytic AA — without it, sub-pixel rims at range alias
	// violently and the bloom amplifies the shimmer.
	float aa = fwidth(e) * 1.5;
	float rim = smoothstep(1.0 - rim_width - aa, 1.0 - rim_width * 0.30 + aa, e);
	float cap = is_top * (1.0 - rim);

	vec3 tint = mix(edge_color, cap_color, is_top);
	// Tighter than the pre-inversion 0.72 + 0.56. On a dark albedo the same
	// multiplier range is a much bigger *relative* swing and the field turns
	// speckly; this keeps per-slab variation visible without the noise.
	float hue = 0.82 + 0.36 * v_hash;

	// void-fracture used albedo * 0.12 because its blocks were self-lit neon on
	// black. Here the sky does the lighting, so albedo has to actually carry the
	// surface colour or the field reads as silhouette.
	ALBEDO = base_color * hue;
	// Matte on both faces. The gloss belongs to the substrate now — a glossy dark
	// slab picks up the same dawn sky as the floor and the values converge again.
	ROUGHNESS = mix(0.92, 0.80, is_top);
	METALLIC = 0.0;
	SPECULAR = 0.18;

	EMISSION = base_color * body_energy
		+ tint * rim * edge_energy
		+ cap_color * cap * cap_energy * hue;

	// Dissolve into the fog wall at the clipmap boundary.
	EMISSION *= v_fade * v_fade;
	ALBEDO = mix(fog_color, ALBEDO, v_fade);
}
