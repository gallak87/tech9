import {
  Float32BufferAttribute,
  MathUtils,
  MeshDepthMaterial,
  RGBADepthPacking,
  Vector3,
} from 'three';
import { createAmbientClock } from '../../../presentation/ambient-clock.js';
import {
  appendShaderPatch,
  replaceShader,
} from '../../../renderer/shader-patch.js';
import {
  movingLatticeGaps,
  movingLatticeRibPitch,
  LATTICE_REFERENCE_WIDTH,
  LATTICE_RIB_WIDTH,
} from './lattice.js';

const initialCentre = 210;
const travelSpeed = 175;
const openRadius = 74;
const taperEnd = 108;
const gl = (value) => value.toFixed(6);
const openingGLSL = `
    uniform float orbitalLatticePhase;
    uniform float orbitalLatticePeriod;
    uniform float orbitalLatticeStagger;
    uniform float orbitalLatticeRibPitch;
    uniform vec3 orbitalLatticeCentres;
    uniform vec3 orbitalLatticeHalfWidths;
    float orbitalAperture(float station, float centre, float available) {
      float shift = (station + centre * orbitalLatticeStagger) / orbitalLatticePeriod;
      float distanceToFront = abs(fract(shift - orbitalLatticePhase + 0.5) - 0.5) * orbitalLatticePeriod;
      return clamp((${gl(taperEnd)} - distanceToFront) / ${gl(taperEnd - openRadius)}, 0.0, 1.0) * available;
    }
    float orbitalRib(float station) {
      return abs(fract(station / orbitalLatticeRibPitch + 0.5) - 0.5) * orbitalLatticeRibPitch;
    }`;
const keepRib = `orbitalRib(vLattice.x) <= ${gl(LATTICE_RIB_WIDTH / 2)}`;

export function createMovingLattice(track, { protectedSpans = [] } = {}) {
  const { length, width, closed = true } = track;
  const period = closed ? length / Math.max(1, Math.round(length / 640)) : 640;
  const ribPitch = movingLatticeRibPitch(track);
  const stagger = 1.9 * (LATTICE_REFERENCE_WIDTH / width);
  const gaps = movingLatticeGaps(width).map(([left, right]) => ({
    centre: (left + right) / 2,
    halfWidth: (right - left) / 2,
  }));
  const phase = { value: initialCentre / period };
  // Course rebuilds replace instance data without creating a shader program
  // for each new length or width. Every visible/depth layer shares these values.
  const uniforms = {
    orbitalLatticePhase: phase,
    orbitalLatticePeriod: { value: period },
    orbitalLatticeStagger: { value: stagger },
    orbitalLatticeRibPitch: { value: ribPitch },
    orbitalLatticeCentres: {
      value: new Vector3(...gaps.map(({ centre }) => centre)),
    },
    orbitalLatticeHalfWidths: {
      value: new Vector3(...gaps.map(({ halfWidth }) => halfWidth)),
    },
  };
  const clock = createAmbientClock();
  const bindings = new WeakSet();
  let previous;
  const exclusions = [
    { distance: 0, halfLength: 19 },
    ...(!closed ? [{ distance: length, halfLength: 19 }] : []),
    ...protectedSpans.map(({ start, end }) => ({
      distance: (start + end) / 2,
      halfLength: (end - start) / 2,
    })),
  ];
  const wrappedDistance = (distance, period) =>
    Math.abs(
      MathUtils.euclideanModulo(distance + period / 2, period) - period / 2,
    );
  // The shadow samples several hundred points per frame. Reuse the same
  // station rows as the road mesh for its authored exclusion mask.
  const rows = Math.ceil(length / 4);
  const permits = Float32Array.from({ length: rows + 1 }, (_, index) => {
    const station = (index * length) / rows;
    return exclusions.reduce((available, { distance, halfLength }) => {
      const delta = closed
        ? wrappedDistance(station - distance, length)
        : Math.abs(station - distance);
      return Math.min(
        available,
        MathUtils.smoothstep(delta, halfLength, halfLength + 16),
      );
    }, 1);
  });
  const availability = (station) => {
    if (!closed && (station <= 0 || station >= length)) return 0;
    const distance = closed
      ? MathUtils.euclideanModulo(station, length)
      : station;
    const row = (distance * rows) / length;
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
  return {
    update(frame, now) {
      const time = clock(frame, now);
      if (
        previous !== undefined &&
        !frame.reset &&
        !frame.settings?.reducedMotion &&
        ['title', 'countdown', 'racing', 'editor'].includes(frame.mode)
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
    bind(material, part, { roadNeon = false } = {}) {
      if (bindings.has(material)) return;
      bindings.add(material);
      const wall = part === 'wall';
      const openOnly = part === 'bottom' || part === 'rib';
      const roadFinish = part === 'road' && material.isMeshStandardMaterial;
      appendShaderPatch(
        material,
        `-orbital-moving-lattice-${part}-${roadNeon}-${roadFinish}`,
        (shader) => {
          Object.assign(shader.uniforms, uniforms);
          // The campaign induction sweep already declares its deck coordinates.
          const coordinates = roadNeon ? '' : 'attribute vec2 roadCoord;';
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
            vec3 orbitalOpenings = vec3(
              orbitalAperture(vLattice.x, orbitalLatticeCentres.x, vLattice.z),
              orbitalAperture(vLattice.x, orbitalLatticeCentres.y, vLattice.z),
              orbitalAperture(vLattice.x, orbitalLatticeCentres.z, vLattice.z)
            );
            orbitalWindow = max(orbitalOpenings.x, max(orbitalOpenings.y, orbitalOpenings.z));
            ${
              part === 'shell'
                ? 'if (orbitalWindow > 0.02) discard;'
                : part === 'rib'
                  ? ''
                  : `vec3 fromCentres = abs(vec3(vLattice.y) - orbitalLatticeCentres);
            if (orbitalWindow > 0.0 && !(${keepRib}) &&
                any(lessThan(fromCentres, orbitalLatticeHalfWidths * orbitalOpenings))) discard;`
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
          if (roadFinish) {
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
              orbitalWindow${roadNeon ? ' * (1.0 - vRoadNeon.a)' : ''});
            #include <opaque_fragment>`,
            );
          }
        },
      );
    },
    bindMesh(mesh, part, options) {
      this.prepare(mesh.geometry);
      this.bind(mesh.material, part, options);
      if (!mesh.castShadow) return null;
      const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
      this.bind(depth, part);
      mesh.customDepthMaterial = depth;
      return depth;
    },
  };
}
