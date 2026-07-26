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
// depth), which left the terrain silhouetted against a hard dark band. Matching
// a band under the horizon to fog_color dissolves that edge.
//
// SIZING THIS IS NOT COSMETIC. Rays that would strike terrain past 768 strike
// nothing, so the exposed sky is a band running from the horizon down to
// atan(eye_height_above_the_DISTANT_terrain / 768) — bounded above by the far
// silhouette and below by near terrain, which is what it looks like in game.
// The driver is height above the *distant* terrain, not altitude: skimming a
// ridge crest at 2 units puts the eye ~70 above a far trough, which is 5.2deg.
// The original 0.055 (3.2deg) covered flat ground and failed on every ridge.
// 0.20 is ~11.5deg, which covers the full +-35 heightfield range with margin.
//
// It stays a *band*, not a brighter hemisphere: cosine-weighted irradiance on an
// up-facing surface takes nothing from below the horizon, so widening this does
// not repeat the wash-out from raising `ground` (see above). It does slightly
// enrich the grazing reflection on the glossy floor cells, which is wanted.
uniform vec3 haze_color : source_color = vec3(0.78, 0.73, 0.74);
uniform float haze_depth = 0.20;
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
	// Long tail to `ground` so the shelf's lower edge is never itself a visible
	// line — at this width a short falloff just moves the artifact rather than
	// removing it.
	col = mix(col, ground, smoothstep(-haze_depth, -haze_depth - 0.35, up));

	float d = dot(normalize(EYEDIR), normalize(sun_dir));
	float disc = smoothstep(1.0 - sun_size, 1.0 - sun_size * 0.35, d);
	float halo = pow(max(d, 0.0), halo_power);
	col += sun_tint * (disc * sun_energy + halo * halo_energy);

	COLOR = col;
}
