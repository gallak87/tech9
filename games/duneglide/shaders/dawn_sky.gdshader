shader_type sky;

// Custom sky rather than ProceduralSkyMaterial: the built-in ties its sun disc
// to DirectionalLight3D.angular_distance and can't make a big soft orb for the
// bloom to chew on, which is the whole dawn look.

uniform vec3 zenith : source_color = vec3(0.34, 0.42, 0.66);
uniform vec3 horizon : source_color = vec3(0.80, 0.72, 0.72);
// Mostly not seen directly (terrain covers it), but ambient_light_source is SKY,
// so this is half the irradiance hitting the ground plane. At 0.26 the glossy
// terrain rendered as a dark slate and the Phase 3 inversion didn't read.
// Do NOT just raise this to the fog colour to hide the terrain edge (see
// haze_color): a bright lower hemisphere both floods the ambient and gets
// mirrored by the roughness-0.07 floor cells at grazing angles, and the whole
// scene washes to white.
uniform vec3 ground : source_color = vec3(0.40, 0.38, 0.46);

// The clipmap ends at +-768 while the terrain shaders fade to fog_color by 620,
// so past the edge you see straight through to the sky. fog_sky_affect is 0
// (turning it on would flatten the whole dawn gradient, since sky is at infinite
// depth), which left the terrain silhouetted against a hard dark band — it read
// in game as distant mountains showing THROUGH the near terrain wherever a
// valley dipped below the edge. Matching a narrow band under the horizon to
// fog_color dissolves that edge. Narrow on purpose: it is a few degrees of the
// hemisphere, so it barely moves the sky's irradiance.
uniform vec3 haze_color : source_color = vec3(0.78, 0.73, 0.74);
uniform float haze_depth = 0.055;
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
	// Haze shelf first, then fall away to the dark ground below it.
	col = mix(col, haze_color, smoothstep(0.01, -haze_depth * 0.5, up));
	col = mix(col, ground, smoothstep(-haze_depth, -haze_depth - 0.16, up));

	float d = dot(normalize(EYEDIR), normalize(sun_dir));
	float disc = smoothstep(1.0 - sun_size, 1.0 - sun_size * 0.35, d);
	float halo = pow(max(d, 0.0), halo_power);
	col += sun_tint * (disc * sun_energy + halo * halo_energy);

	COLOR = col;
}
