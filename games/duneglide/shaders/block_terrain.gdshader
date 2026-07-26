shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx, depth_draw_opaque;

#include "res://shaders/terrain_height.gdshaderinc"

group_uniforms Geometry;
// 1, 2, 4 — one material instance per LOD ring, so the skirt scales with pitch.
uniform float lod_scale = 1.0;
uniform float block_depth = 3.2;

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

	// VERTEX.y is baked 0 (bottom) or 1 (top), so the top face lands exactly
	// on h and the skirt hangs a constant depth below it.
	VERTEX.y = hd.x + (VERTEX.y - 1.0) * block_depth * lod_scale;

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
