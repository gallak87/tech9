import * as T from 'three';
import {
  RING_CENTER,
  UMBRA_EVENT_START,
  UMBRA_EVENT_END,
} from './constants.js';
import { assetGroup } from './assets.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export function sampleUmbraAccretion(time) {
  const elapsed = Math.max(0, Number.isFinite(time) ? time : 0);
  const stretch = smooth((elapsed - UMBRA_EVENT_START) / 15);
  const fracture = smooth((elapsed - 29) / 10);
  const infall = smooth((elapsed - 37) / 17);
  const phase =
    elapsed < UMBRA_EVENT_START
      ? 'intact'
      : elapsed < 29
        ? 'stretching'
        : elapsed < 37
          ? 'fragmenting'
          : elapsed < UMBRA_EVENT_END
            ? 'spiralling'
            : 'consumed';
  return {
    elapsed,
    stretch,
    fracture,
    infall,
    phase,
    progress: clamp(
      (elapsed - UMBRA_EVENT_START) / (UMBRA_EVENT_END - UMBRA_EVENT_START),
    ),
  };
}

/** A coherent ribbed architecture stretches first, then separates into its actual
 * modeled structural members. Absolute simulation-time sampling makes replay,
 * pause, recovery and fresh-session reset independent of the display frame rate. */
export function createUmbraAccretion(assets) {
  const group = new T.Group();
  group.name = 'Umbra / architecture consumption';
  const center = new T.Vector3(...RING_CENTER);
  const origin = new T.Vector3(-300, 220, -1050);
  const direction = center.clone().sub(origin).normalize();
  const lean = new T.Quaternion().setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    direction,
  );
  const identity = new T.Quaternion();
  const event = new T.Group();
  event.name = 'Enormous meridian instrument / staged tidal failure';
  group.add(event);
  const pieces = assets.eventPieces.map(({ parts, center: pieceCenter }, i) => {
    const object = assetGroup(parts, `Tidal architectural member ${i}`);
    event.add(object);
    return { object, center: pieceCenter };
  });
  const threadsGeometry = new T.BufferGeometry();
  const threadPositions = new Float32Array(32 * 2 * 3);
  threadsGeometry.setAttribute(
    'position',
    new T.BufferAttribute(threadPositions, 3),
  );
  const threads = new T.LineSegments(
    threadsGeometry,
    new T.LineBasicMaterial({
      color: '#ffd6a0',
      transparent: true,
      opacity: 0.56,
      blending: T.AdditiveBlending,
      depthWrite: false,
    }),
  );
  threads.name = 'Tension strands pulled from instrument ribs';
  group.add(threads);
  const light = new T.PointLight('#ffd7a4', 130000, 1300, 2);
  light.position.copy(origin).add(new T.Vector3(-100, 180, -120));
  group.add(light);
  const streams = Array.from({ length: 6 }, (_, index) => {
    const root = new T.Group();
    root.name = `Continuous architectural accretion ${index}`;
    const intact = assetGroup(
      assets.templates.instrument,
      'Intact distant instrument',
    );
    root.add(intact);
    const fragments = Array.from({ length: 4 }, (_, j) => {
      const part = assetGroup(
        assets.templates.rib,
        `Separated curved structural fragment ${j}`,
      );
      root.add(part);
      return part;
    });
    group.add(root);
    return { root, intact, fragments, index };
  });
  let last = sampleUmbraAccretion(0),
    decorativeTime = 0;
  const worldStart = new T.Vector3(),
    worldEnd = new T.Vector3();
  function update(time = 0, { reducedMotion = false, quality = 'high' } = {}) {
    last = sampleUmbraAccretion(time);
    decorativeTime = reducedMotion ? 0 : last.elapsed;
    const { stretch, fracture, infall } = last;
    event.visible = infall < 0.998;
    const orbit = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      infall * 1.1,
    );
    event.position
      .copy(origin)
      .sub(center)
      .applyQuaternion(orbit)
      .multiplyScalar(1 - infall * 0.96)
      .add(center);
    event.quaternion
      .copy(identity)
      .slerp(lean, stretch * 0.91)
      .premultiply(orbit);
    event.position.y += stretch * 200 * (1 - infall);
    const size = (1.6 / (1 + stretch * 0.6)) * (1 - infall * 0.93);
    event.scale.setScalar(size);
    for (let i = 0; i < pieces.length; i++) {
      const { object, center: p } = pieces[i],
        angle = i * 2.399 + infall * 7.3;
      const separation = fracture * (52 + i * 7) * (1 - infall * 0.72);
      object.position.set(
        p.x / (1 + stretch * 0.56) + Math.cos(angle) * separation,
        p.y * (1 + stretch * 2.5) + Math.sin(angle * 0.7) * separation * 0.44,
        p.z / (1 + stretch * 0.56) + Math.sin(angle) * separation,
      );
      object.scale.set(
        1 / (1 + stretch * 0.5),
        1 + stretch * 2.5 * (1 - fracture * 0.67),
        1 / (1 + stretch * 0.5),
      );
      object.rotation.set(
        fracture * Math.sin(i) * 0.45,
        fracture * (i % 2 ? 0.48 : -0.39) + infall * 2,
        fracture * Math.cos(i) * 0.32,
      );
    }
    event.updateMatrixWorld(true);
    threads.visible = stretch > 0.04 && infall < 0.97;
    for (let i = 0; i < 32; i++) {
      const p = pieces[i % pieces.length].object;
      worldStart
        .set(Math.sin(i * 8) * 9, 0, Math.cos(i * 4) * 9)
        .applyMatrix4(p.matrixWorld);
      worldEnd
        .copy(worldStart)
        .lerp(center, 0.06 + stretch * 0.15 + infall * 0.3);
      const offset = i * 6;
      worldStart.toArray(threadPositions, offset);
      worldEnd.toArray(threadPositions, offset + 3);
    }
    threadsGeometry.attributes.position.needsUpdate = true;
    threadsGeometry.computeBoundingSphere();
    light.intensity = 85000 + stretch * (1 - infall) * 70000;
    for (const { root, intact, fragments, index } of streams) {
      root.visible = quality !== 'low' || index < 4;
      const cycle = (decorativeTime / (46 + index * 3) + index / 6) % 1;
      const stretchPhase = smooth((cycle - 0.23) / 0.34);
      const breakPhase = smooth((cycle - 0.58) / 0.26);
      const radius = 1100 - cycle * 815;
      const angle = index * 1.13 + cycle * 1.65;
      root.position.set(
        center.x + Math.cos(angle) * radius,
        center.y + 190 * Math.sin(index * 1.8) * (1 - cycle),
        center.z + Math.sin(angle) * radius,
      );
      root.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        center.clone().sub(root.position).normalize(),
      );
      const base = (0.37 + index * 0.047) * (1 - smooth((cycle - 0.87) / 0.13));
      root.scale.setScalar(base);
      intact.visible = cycle < 0.66;
      intact.scale.set(
        1 / (1 + stretchPhase),
        1 + stretchPhase * 3.3,
        1 / (1 + stretchPhase),
      );
      for (let j = 0; j < fragments.length; j++) {
        const part = fragments[j];
        part.visible = cycle >= 0.6;
        part.position.set(
          Math.sin(j * 2.8 + cycle * 5) * (15 + breakPhase * 36),
          40 + j * 125 + breakPhase * 120,
          Math.cos(j * 2.8 + cycle * 5) * (15 + breakPhase * 36),
        );
        part.scale.set(0.5, 1.4, 0.6);
        part.rotation.set(j * 0.4 + breakPhase, j * 1.3, breakPhase * 0.7);
      }
    }
  }
  update();
  return {
    group,
    update,
    getPresentation: () => ({
      eventPhase: last.phase,
      eventProgress: last.progress,
      eventElapsed: last.elapsed,
      stretch: last.stretch,
      fracture: last.fracture,
      infall: last.infall,
      continuousStreams: 6,
      decorativeTime,
    }),
    dispose() {
      threadsGeometry.dispose();
      threads.material.dispose();
      light.dispose();
      group.clear();
    },
  };
}
