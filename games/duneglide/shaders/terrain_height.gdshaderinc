// Analytic terrain heightfield — the GPU source of truth.
//
// MUST STAY IDENTICAL TO res://scripts/Height.gd.
// Included by block_terrain.gdshader so there is exactly one GPU copy of the
// function. Any edit here must be mirrored in Height.gd;
// DebugParity.gd is the harness that catches a mismatch in one frame.
//
// The octaves are macro-unrolled rather than looped over a const array on
// purpose: dynamic indexing into constant arrays goes through a scratch-memory
// path in Godot's SPIR-V -> MSL translation on Metal. Unrolled constants fold
// into the shader.

const float H_PERIOD = 8192.0;
const float H_KW     = 0.000766990393942820;   // TAU / 8192
const float H_OMEGA0 = 0.05;
const float H_MAXABS = 35.45;

// Declared in Project Settings -> Shader Globals so one
// RenderingServer.global_shader_parameter_set() updates every terrain shader
// atomically. h_time is wrapped to [0, 125.66370614359172) by Height.advance().
global uniform float h_time;
global uniform float h_amplitude;

// Returns vec3(height, dh/dx, dh/dz).
vec3 terrain_hd(vec2 w) {
	vec2 q = mod(w, H_PERIOD);
	float t = h_time;
	float p, s, d, h, gx, gz;

	// ridged fundamental: sharp crests, round troughs
	p  = H_KW * (21.0 * q.x + 10.0 * q.y) + H_OMEGA0 * 1.0 * t;
	s  = sin(p);
	h  = 16.00 * (1.0 - 2.0 * abs(s));
	d  = -2.0 * 16.00 * sign(s) * cos(p);
	gx = d * H_KW * 21.0;
	gz = d * H_KW * 10.0;

	#define H_OCT(NX, NZ, A, M) \
		p = H_KW * ((NX) * q.x + (NZ) * q.y) + H_OMEGA0 * (M) * t; \
		h += (A) * sin(p); d = (A) * cos(p); \
		gx += d * H_KW * (NX); gz += d * H_KW * (NZ);

	H_OCT(   7.0,   14.0, 11.00,  2.0)
	H_OCT( -18.0,   39.0,  5.00,  3.0)
	H_OCT(  68.0,  -52.0,  2.20,  5.0)
	H_OCT( -45.0,  180.0,  0.90,  8.0)
	H_OCT( 330.0, -207.0,  0.35, 13.0)
	#undef H_OCT

	return vec3(h, gx, gz) * h_amplitude;
}

float terrain_h(vec2 w) {
	return terrain_hd(w).x;
}
