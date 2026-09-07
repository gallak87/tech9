shader_type spatial;
// Metre grid filtered in screen space. One surface, no near-coplanar line meshes.
varying vec2 world_xz;
void vertex() {
	world_xz = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}
void fragment() {
	vec2 distance_to_line = abs(fract(world_xz - 0.5) - 0.5);
	vec2 footprint = max(fwidth(world_xz), vec2(0.0001));
	vec2 grid = 1.0 - smoothstep(vec2(0.0), footprint * 1.1, distance_to_line);
	float line = max(grid.x, grid.y);
	ALBEDO = mix(vec3(0.12, 0.15, 0.15), vec3(0.20, 0.24, 0.24), line * 0.45);
	ROUGHNESS = 0.9;
}
