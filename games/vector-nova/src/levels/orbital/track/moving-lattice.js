import { Float32BufferAttribute, MathUtils } from 'three';
import { createAmbientClock } from '../../../presentation/ambient-clock.js';
import {
  appendShaderPatch,
  replaceShader,
} from '../../../renderer/shader-patch.js';
import {
  LATTICE_GAPS,
  LATTICE_RIB_SPACING,
  LATTICE_RIB_WIDTH,
} from './lattice.js';

const initialCentre = 210;
const travelSpeed = 175;
const openRadius = 74;
const taperEnd = 108;
const stagger = 1.9;
const gaps = LATTICE_GAPS.map(([left, right]) => ({
  centre: (left + right) / 2,
  halfWidth: (right - left) / 2,
}));
const gl = (value) => value.toFixed(6);

export function createMovingLattice(trackLength, devices, permanentSpans) {
  const period = trackLength / Math.max(1, Math.round(trackLength / 640));
  const ribPitch =
    trackLength / Math.max(1, Math.round(trackLength / LATTICE_RIB_SPACING));
  const phase = { value: initialCentre / period };
  const clock = createAmbientClock();
  let previous;
  const exclusions = [
    { distance: 0, halfLength: 19 },
    ...devices.map(({ distance, length }) => ({
      distance,
      halfLength: length / 2 + 5,
    })),
    ...permanentSpans.map(({ start, end }) => ({
      distance: (start + end) / 2,
      halfLength: (end - start) / 2,
    })),
  ];
  const wrappedDistance = (distance, length) =>
    Math.abs(
      MathUtils.euclideanModulo(distance + length / 2, length) - length / 2,
    );
  // The shadow samples several hundred points per frame. Reuse the same
  // station rows as the road mesh for its authored exclusion mask.
  const rows = Math.ceil(trackLength / 4);
  const permits = Float32Array.from({ length: rows + 1 }, (_, index) => {
    const station = (index * trackLength) / rows;
    return exclusions.reduce((available, { distance, halfLength }) => {
      const delta = wrappedDistance(station - distance, trackLength);
      return Math.min(
        available,
        MathUtils.smoothstep(delta, halfLength, halfLength + 16),
      );
    }, 1);
  });
  const availability = (station) => {
    const row =
      (MathUtils.euclideanModulo(station, trackLength) * rows) / trackLength;
    const index = Math.floor(row);
    return MathUtils.lerp(permits[index], permits[index + 1], row - index);
  };
  const aperture = (station, centre) => {
    const distance = wrappedDistance(
      station + centre * stagger - phase.value * period,
      period,
    );
    return MathUtils.clamp(
      (taperEnd - distance) / (taperEnd - openRadius),
      0,
      1,
    );
  };
  const openingGLSL = `
    uniform float orbitalLatticePhase;
    float orbitalAperture(float station, float centre, float available) {
      float shift = (station + centre * ${gl(stagger)}) / ${gl(period)};
      float distanceToFront = abs(fract(shift - orbitalLatticePhase + 0.5) - 0.5) * ${gl(period)};
      return clamp((${gl(taperEnd)} - distanceToFront) / ${gl(taperEnd - openRadius)}, 0.0, 1.0) * available;
    }
    float orbitalRib(float station) {
      return abs(fract(station / ${gl(ribPitch)} + 0.5) - 0.5) * ${gl(ribPitch)};
    }`;
  const apertures = gaps
    .map(
      ({ centre }) => `orbitalAperture(vLattice.x, ${gl(centre)}, vLattice.z)`,
    )
    .join(', ');
  const gapTest = gaps
    .map(
      ({ centre, halfWidth }, index) =>
        `abs(vLattice.y - ${gl(centre)}) < ${gl(halfWidth)} * orbitalOpenings[${index}]`,
    )
    .join(' ||\n        ');
  const keepRib = `orbitalRib(vLattice.x) <= ${gl(LATTICE_RIB_WIDTH / 2)}`;

  return {
    update(frame, now) {
      const time = clock(frame, now);
      if (
        previous !== undefined &&
        !frame.reset &&
        !frame.settings?.reducedMotion &&
        ['title', 'countdown', 'racing'].includes(frame.mode)
      ) {
        const seconds = MathUtils.clamp(time - previous, 0, 0.1);
        phase.value = (phase.value + (seconds * travelSpeed) / period) % 1;
      }
      previous = time;
    },
    prepare(geometry) {
      const coordinates = geometry.getAttribute('roadCoord');
      const values = new Float32Array(coordinates.count);
      for (let i = 0; i < values.length; i++)
        values[i] = availability(coordinates.getX(i));
      geometry.setAttribute(
        'latticeAvailable',
        new Float32BufferAttribute(values, 1),
      );
      return geometry;
    },
    coverage(station, lateral) {
      const available = availability(station);
      if (
        !available ||
        wrappedDistance(station, ribPitch) <= LATTICE_RIB_WIDTH / 2
      )
        return 1;
      for (const { centre, halfWidth } of gaps) {
        // The shared contact shadow samples before this frame advances the
        // road animation. Keep shadows just inside the closing panel edge.
        const width = Math.max(
          aperture(station, centre),
          aperture(station - 4, centre),
        );
        const edge = halfWidth * width * available - Math.abs(lateral - centre);
        if (edge > 0) return 1 - MathUtils.smoothstep(edge, 0, 0.14);
      }
      return 1;
    },
    bind(material, part) {
      const wall = part === 'wall';
      const openOnly = part === 'bottom' || part === 'rib';
      appendShaderPatch(
        material,
        `-orbital-moving-lattice-${trackLength}-${part}`,
        (shader) => {
          shader.uniforms.orbitalLatticePhase = phase;
          // The main running material already declares roadCoord for its inlays.
          const coordinates =
            part === 'road' ? '' : 'attribute vec2 roadCoord;';
          shader.vertexShader = replaceShader(
            `${coordinates}
          attribute float latticeAvailable;
          varying vec3 vLattice;
          ${wall ? `attribute vec3 latticeWallShift;\n${openingGLSL}` : ''}
          ${shader.vertexShader}`,
            '#include <begin_vertex>',
            `#include <begin_vertex>
          vLattice = vec3(roadCoord, latticeAvailable);
          ${wall ? 'transformed += latticeWallShift * (orbitalAperture(roadCoord.x, roadCoord.y, latticeAvailable) - 1.0);' : ''}`,
          );
          const cutout = wall
            ? `if (orbitalAperture(vLattice.x, vLattice.y, vLattice.z) < 0.02 || ${keepRib}) discard;`
            : `float orbitalWindow = 0.0;
          if (vLattice.z > 0.0) {
            vec3 orbitalOpenings = vec3(${apertures});
            orbitalWindow = max(orbitalOpenings.x, max(orbitalOpenings.y, orbitalOpenings.z));
            ${
              part === 'shell'
                ? 'if (orbitalWindow > 0.02) discard;'
                : part === 'rib'
                  ? ''
                  : `if (orbitalWindow > 0.0 && !(${keepRib}) && (${gapTest})) discard;`
            }
          }
          ${openOnly ? 'if (orbitalWindow <= 0.02) discard;' : ''}`;
          shader.fragmentShader = replaceShader(
            `varying vec3 vLattice;
          ${openingGLSL}
          ${shader.fragmentShader}`,
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
          ${cutout}`,
          );
          if (part === 'road') {
            // The exposed induction ribs have a broader highlight than the
            // sealed plates. The permanent colored spans retain their finish.
            shader.fragmentShader = replaceShader(
              shader.fragmentShader,
              '#include <normal_fragment_begin>',
              `roughnessFactor = max(roughnessFactor, 0.42 * orbitalWindow);
            #include <normal_fragment_begin>`,
            );
            shader.fragmentShader = replaceShader(
              shader.fragmentShader,
              '#include <opaque_fragment>',
              `outgoingLight = mix(outgoingLight,
              outgoingLight * vec3(0.55, 0.83, 1.0) + vec3(0.018, 0.23, 0.33),
              orbitalWindow * (1.0 - vRoadNeon.a));
            #include <opaque_fragment>`,
            );
          }
        },
      );
    },
  };
}
