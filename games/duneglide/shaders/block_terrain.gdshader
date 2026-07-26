shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx, depth_draw_opaque;

#include "res://shaders/terrain_height.gdshaderinc"

// SOLID COLUMN TERRAIN.
//
// Every cell is a full-width column and the columns ARE the ground — there is no
// separate floor mesh under them. That is the whole point: the previous design
// had tiles with a short skirt hovering over a smooth substrate sheet, and the
// gap between skirt-bottom and sheet was a free variable that changed with
// slope. Every terrain bug of Phase 3a came out of that one gap (substrate
// punching up through the tops, seeing under the tiles to the far slope, and the
// tall risers added to chase it). With zero gaps and real columns those are not
// bugs that got fixed, they are states that cannot be represented.
//
// The bright-floor / dark-bar value split is now two CELL TYPES on one mesh
// rather than two meshes: bar cells sit bar_height proud and shade dark and
// matte, floor cells shade bright and glossy.

group_uniforms Geometry;
uniform float pitch = 1.0;
// Column depth as a multiple of pitch. Only needs to exceed the largest step to
// a neighbouring column — everything below that is hidden behind the neighbour,
// so being generous is free. Worst-case terrain step is ~1.66 * pitch.
uniform float column_depth = 3.0;

group_uniforms Bars;
// 0 makes the field a plain voxel heightfield with no bar pattern at all.
uniform float bar_height = 0.16;
// Bar row spacing and thickness, in CELLS. period 4 / width 1 = one raised row
// every four.
uniform float bar_period = 4.0;
uniform float bar_width = 1.0;

group_uniforms Look;
uniform vec3 floor_color : source_color = vec3(0.74, 0.72, 0.79);
uniform vec3 bar_color : source_color = vec3(0.13, 0.12, 0.16);
uniform float floor_roughness = 0.07;
uniform float floor_specular = 1.0;
uniform vec3 edge_color : source_color = vec3(1.00, 0.72, 0.55);
// A rim accent on top of sky-ambient shading, not a light source. On a dark bar
// anything past ~0.1 reads as neon piping around every column.
uniform float edge_energy = 0.05;
uniform float rim_width = 0.16;

group_uniforms Grid;
// Coarse seams on the floor cells, much larger than the cell pitch so they read
// as panel joints under the mosaic rather than more mosaic.
uniform float grid_spacing = 24.0;
uniform float grid_width = 0.9;
uniform vec3 grid_color : source_color = vec3(0.30, 0.28, 0.36);
uniform float grid_strength = 0.8;

group_uniforms Fade;
uniform float fade_start = 330.0;
uniform float fade_end = 620.0;
uniform vec3 fog_color : source_color = vec3(0.78, 0.73, 0.74);

varying vec3 v_face;    // (u, v, is_top)
varying vec3 v_world;
varying float v_hash;
varying float v_fade;
varying float v_bar;

void vertex() {
	// UV carries the cell centre in chunk-local space. Chunk nodes have an
	// identity basis and y == 0, so model and world space share a Y axis.
	vec2 centre_world = (MODEL_MATRIX * vec4(UV.x, 0.0, UV.y, 1.0)).xz;
	vec3 hd = terrain_hd(centre_world);
	float is_top = COLOR.b;

	// Bar rows run along X, so the test is on the cell's Z index. mod() before
	// the divide keeps the operand small — cell indices at the world coordinates
	// this thing reaches would otherwise start losing float32 precision.
	float cell_z = floor(mod(centre_world.y, pitch * bar_period) / pitch);
	v_bar = step(cell_z, bar_width - 0.5);

	// VERTEX.y is baked 0 (bottom) or 1 (top). One height for all 20 verts is
	// what makes this a column instead of a smooth surface.
	float top_y = hd.x + v_bar * bar_height;
	VERTEX.y = top_y - (1.0 - VERTEX.y) * column_depth * pitch;

	// Tops take the analytic surface normal so the dune reads as one form under
	// lighting; sides keep their baked face normals. All four top verts sample
	// the same centre, so a cell top is flat-shaded — that IS the voxel read.
	vec3 surf_n = normalize(vec3(-hd.y, 1.0, -hd.z));
	NORMAL = normalize(mix(NORMAL, surf_n, is_top));

	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_world = wpos;
	float d = length(wpos.xz - CAMERA_POSITION_WORLD.xz);
	v_fade = 1.0 - smoothstep(fade_start, fade_end, d);

	// Sink the far edge so a chunk recycled to the back of the clipmap rises out
	// of the fog floor instead of popping in. Applied to top and bottom alike, so
	// it slides the whole column and cannot open a hole.
	// Deliberately NOT scaled by pitch: at LOD3 that sank columns 24 units and
	// carved a visible dark cliff along the whole horizon.
	VERTEX.y -= (1.0 - v_fade) * 3.0;

	v_face = vec3(COLOR.r, COLOR.g, is_top);
	v_hash = fract(sin(dot(centre_world, vec2(12.9898, 78.233))) * 43758.5453);
}

// Distance-aware line mask: width in world units, widened to at least a pixel so
// far seams dim instead of aliasing into a shimmering moire.
float grid_line(vec2 w, float spacing, float width) {
	vec2 g = abs(fract(w / spacing - 0.5) - 0.5) * spacing;
	vec2 fw = fwidth(w) * 1.5 + 1e-4;
	vec2 line = 1.0 - smoothstep(width * 0.5 - fw, width * 0.5 + fw, g);
	return max(line.x, line.y);
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

	// Tight range on purpose: on a dark albedo the same multiplier is a much
	// bigger RELATIVE swing and the field goes speckly.
	float hue = 0.82 + 0.36 * v_hash;

	vec3 albedo = mix(floor_color, bar_color, v_bar) * hue;
	float rough = mix(floor_roughness, 0.90, v_bar);
	float spec = mix(floor_specular, 0.18, v_bar);

	// Seams only on floor-cell tops. On the bars they would read as damage, and
	// on the vertical sides they smear into stripes.
	float g = grid_line(v_world.xz, grid_spacing, grid_width)
		* grid_strength * is_top * (1.0 - v_bar);
	albedo = mix(albedo, grid_color, g);
	rough = mix(rough, 0.85, g);
	spec = mix(spec, 0.15, g);

	ALBEDO = mix(fog_color, albedo, v_fade);
	ROUGHNESS = rough;
	METALLIC = 0.0;
	SPECULAR = spec;

	// Dissolve into the fog wall at the clipmap boundary.
	EMISSION = edge_color * rim * edge_energy * v_fade * v_fade;
}
