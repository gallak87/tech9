export const playerWakeReach = 42;

const rippleCycle = 2 * Math.PI;
const rippleRadiansPerMetre = rippleCycle / 3.1;

export function wakeRipplePhase(distance, previous = 0) {
  return (previous + distance * rippleRadiansPerMetre) % rippleCycle;
}

// The geometry supplies the path and width. Both ribbons use the same
// livery-colored cross-section, with room inside the mesh for the soft rim.
export const wakeProfileGLSL = `
  vec4 wakeProfile(vec3 accent, float across, float along, float ripplePhase) {
    float phase = along * ${rippleRadiansPerMetre} - ripplePhase;
    float scallop = smoothstep(-0.5, 0.94, sin(phase + 0.85 * sign(across)));
    float edge = abs(across) - (0.83 + 0.05 * scallop);
    float rimDistance = abs(edge);
    float body = 1.0 - smoothstep(-0.025, 0.018, edge);
    float rim = 1.0 - smoothstep(0.006, 0.032, rimDistance);
    float halo = 1.0 - smoothstep(0.015, 0.115, rimDistance);
    float filament = 1.0 - smoothstep(0.008, 0.044, abs(across - 0.07 * sin(phase + 0.6)));
    vec3 highlight = mix(accent, vec3(0.80, 1.0, 0.93), 0.72) * 1.52;
    vec3 color = mix(accent * 1.12, highlight,
      clamp(0.88 * rim + 0.20 * halo + 0.39 * filament, 0.0, 1.0));
    return vec4(color, 0.78 * body + 1.35 * rim + 0.34 * halo + 0.22 * filament);
  }`;
