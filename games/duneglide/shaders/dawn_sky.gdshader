shader_type sky;

// Custom sky rather than ProceduralSkyMaterial: the built-in ties its sun disc
// to DirectionalLight3D.angular_distance and can't make a big soft orb for the
// bloom to chew on, which is the whole dawn look.

uniform vec3 zenith : source_color = vec3(0.34, 0.42, 0.66);
uniform vec3 horizon : source_color = vec3(0.80, 0.72, 0.72);
uniform vec3 ground : source_color = vec3(0.26, 0.24, 0.32);
uniform vec3 sun_tint : source_color = vec3(1.00, 0.84, 0.66);
uniform vec3 sun_dir = vec3(0.32, 0.075, -0.945);
uniform float sun_size = 0.012;
// Above glow_hdr_threshold 0.7 so the orb blooms, but the disc is small — at
// sun_size 0.055 / energy 9 it filled a third of the sky and washed the scene.
uniform float sun_energy = 4.0;
uniform float halo_power = 90.0;
uniform float halo_energy = 0.9;

void sky() {
	float up = EYEDIR.y;
	vec3 col = mix(horizon, zenith, pow(clamp(up, 0.0, 1.0), 0.42));
	col = mix(col, ground, smoothstep(0.0, -0.10, up));

	float d = dot(normalize(EYEDIR), normalize(sun_dir));
	float disc = smoothstep(1.0 - sun_size, 1.0 - sun_size * 0.35, d);
	float halo = pow(max(d, 0.0), halo_power);
	col += sun_tint * (disc * sun_energy + halo * halo_energy);

	COLOR = col;
}
