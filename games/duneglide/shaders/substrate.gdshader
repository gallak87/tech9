shader_type spatial;
render_mode cull_back, diffuse_lambert, depth_draw_opaque;

#include "res://shaders/terrain_height.gdshaderinc"

uniform float drop = 1.4;   // how far below the block tops the floor sits
// Must read as the SHADOW BETWEEN TILES, not a void. Near-black (0.06) turned
// every dune trough into a hole in the world — with fill_z ~0.6 the substrate
// is a third of all visible surface, so it carries real weight in the image.
uniform vec3 floor_color : source_color = vec3(0.44, 0.42, 0.52);
uniform vec3 fog_color : source_color = vec3(0.78, 0.73, 0.74);
uniform float fade_start = 330.0;
uniform float fade_end = 620.0;

varying float v_fade;

void vertex() {
	// Sampled per-vertex (smooth), unlike the block shader's per-block sample —
	// this is a continuous surface, so it should follow the dune exactly.
	vec2 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	vec3 hd = terrain_hd(w);
	VERTEX.y = hd.x - drop;
	NORMAL = normalize(vec3(-hd.y, 1.0, -hd.z));

	float d = length(w - CAMERA_POSITION_WORLD.xz);
	v_fade = 1.0 - smoothstep(fade_start, fade_end, d);
}

void fragment() {
	ALBEDO = mix(fog_color, floor_color, v_fade);
	ROUGHNESS = 0.95;
	METALLIC = 0.0;
	SPECULAR = 0.1;
}
