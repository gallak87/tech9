export const playerWakeReach = 42;

export function glideWakeAnchor(tail) {
  return tail * 0.15;
}

// The geometry supplies the path. A fixed cross-section keeps the luminous
// rims and centerline aligned with that path, with room for the soft halo.
export const wakeProfileGLSL = `
  vec4 wakeProfile(vec3 accent, float across) {
    float lateral = abs(across);
    float edge = lateral - 0.85;
    float rimDistance = abs(edge);
    float body = 1.0 - smoothstep(-0.025, 0.018, edge);
    float rim = 1.0 - smoothstep(0.006, 0.032, rimDistance);
    float halo = 1.0 - smoothstep(0.015, 0.115, rimDistance);
    float filament = 1.0 - smoothstep(0.008, 0.044, lateral);
    vec3 highlight = mix(accent, vec3(0.80, 1.0, 0.93), 0.72) * 1.52;
    vec3 color = mix(accent * 1.12, highlight,
      clamp(0.88 * rim + 0.20 * halo + 0.39 * filament, 0.0, 1.0));
    return vec4(color, 0.78 * body + 1.35 * rim + 0.34 * halo + 0.22 * filament);
  }`;
