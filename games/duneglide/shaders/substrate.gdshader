shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx, depth_draw_opaque;

#include "res://shaders/terrain_height.gdshaderinc"

uniform float drop = 1.4;   // how far below the block tops the floor sits

// PHASE 3 VALUE INVERSION. This used to be the dark "shadow between tiles".
// It is now the BRIGHT GLOSSY SURFACE and the blocks are the dark marks on it —
// that is where the reference's sense of solidity actually comes from. Do not
// darken this back down without darkening the blocks too, or the whole field
// flattens out into the "vectory" read again.
uniform vec3 floor_color : source_color = vec3(0.74, 0.72, 0.79);
uniform float floor_roughness = 0.07;
// Maxed. METALLIC has to stay 0 (the floor is dielectric and metallic would eat
// the albedo the dark slabs are read against), so SPECULAR is the only lever on
// F0, and even at 1.0 the sheen is mostly Fresnel at grazing angles — which is
// exactly the flying-low viewing angle, so it lands where it's wanted.
uniform float floor_specular = 1.0;

group_uniforms Grid;
// The reference has a coarse grid of thin dark lines, much LARGER than the dash
// spacing (block pitch is 1.0) — it reads as panel seams under the mosaic.
uniform float grid_spacing = 24.0;
uniform float grid_width = 0.9;
uniform vec3 grid_color : source_color = vec3(0.30, 0.28, 0.36);
uniform float grid_strength = 0.8;

group_uniforms Fade;
uniform vec3 fog_color : source_color = vec3(0.78, 0.73, 0.74);
uniform float fade_start = 330.0;
uniform float fade_end = 620.0;

varying vec3 v_world;
varying float v_fade;

void vertex() {
	// Sampled per-vertex (smooth), unlike the block shader's per-block sample —
	// this is a continuous surface, so it should follow the dune exactly.
	vec2 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	VERTEX.y = terrain_hd(w).x - drop;
	v_world = vec3(w.x, VERTEX.y, w.y);

	float d = length(w - CAMERA_POSITION_WORLD.xz);
	v_fade = 1.0 - smoothstep(fade_start, fade_end, d);
}

// Distance-aware line mask: width in world units, widened to at least a pixel
// so far-off lines dim instead of aliasing into a shimmering moire.
float grid_line(vec2 w, float spacing, float width) {
	vec2 g = abs(fract(w / spacing - 0.5) - 0.5) * spacing;
	vec2 fw = fwidth(w) * 1.5 + 1e-4;
	vec2 line = 1.0 - smoothstep(width * 0.5 - fw, width * 0.5 + fw, g);
	return max(line.x, line.y);
}

void fragment() {
	// Per-FRAGMENT normal, not the interpolated vertex one. At roughness 0.09 the
	// sky reflection is sharp enough that per-vertex normals show the substrate's
	// triangulation as visible faceted bands across the dune.
	vec3 hd = terrain_hd(v_world.xz);
	vec3 n_world = normalize(vec3(-hd.y, 1.0, -hd.z));
	NORMAL = normalize((VIEW_MATRIX * vec4(n_world, 0.0)).xyz);

	float g = grid_line(v_world.xz, grid_spacing, grid_width) * grid_strength;
	vec3 albedo = mix(floor_color, grid_color, g);

	ALBEDO = mix(fog_color, albedo, v_fade);
	// Grid seams are matte, so they catch none of the sheen and stay legible when
	// the sun streak crosses them.
	ROUGHNESS = mix(floor_roughness, 0.85, g);
	METALLIC = 0.0;
	SPECULAR = mix(floor_specular, 0.15, g);
}
