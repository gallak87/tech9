import * as THREE from 'three';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
  seededRandom,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { createLandformSurvey } from '../environment/terrain.js';
import { sampleSaffronDeposits, saffronSandSection } from './sand.js';

const SIDES = [-1, 1];

// Raceway geometry follows the same sampled frames in production and review.
// Only the two structural breaks remove deck; the dune skip is a chosen line.
export function createSaffronRoad(
  { track, settings = {} },
  { shape = false } = {},
) {
  const group = new THREE.Group();
  const survey = createLandformSurvey(track);
  group.name = shape ? 'Saffron route review' : 'Saffron fused-glass raceway';
  const geometries = new Set(),
    materials = new Set();
  const ownGeometry = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const material = (parameters) => {
    const m = new THREE.MeshStandardMaterial(parameters);
    materials.add(m);
    return m;
  };
  const smoke = material({
    color: shape ? 0x8d8c85 : 0x68543a,
    roughness: shape ? 0.75 : 0.22,
    metalness: shape ? 0.04 : 0.36,
  });
  const amber = material({
    color: shape ? 0xb9b6a5 : 0xcea64e,
    roughness: shape ? 0.8 : 0.19,
    metalness: 0.25,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: shape ? 0xb5b3a4 : 0xc9983d,
    roughness: 0.15,
    metalness: 0.12,
    transmission: !shape && settings.quality !== 'low' ? 0.12 : 0,
    thickness: 3.4,
    ior: 1.44,
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
  });
  materials.add(glass);
  const honey = material({
    color: shape ? 0xc1bbad : 0xac7835,
    roughness: 0.43,
    metalness: 0.18,
  });
  const bone = material({
    color: shape ? 0xe3e0d4 : 0xe6d5a5,
    roughness: 0.36,
    metalness: 0.08,
  });
  const seam = material({ color: 0x302a29, roughness: 0.66, metalness: 0.35 });
  const lamp = material({
    color: 0xffe6a2,
    emissive: 0xfbc75b,
    emissiveIntensity: shape ? 0.1 : 0.45,
    roughness: 0.4,
  });
  const sand = material({
    color: shape ? 0xa5a18d : 0xcda45a,
    roughness: 0.97,
    metalness: 0,
  });
  const add = (name, geometry, mat) => {
    const mesh = new THREE.Mesh(ownGeometry(geometry), mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const runs = [];
  let start = 0;
  for (const jump of track.jumps.filter((j) => !j.optional)) {
    runs.push([start, jump.takeoff]);
    start = jump.landingStart;
  }
  runs.push([start, track.length]);
  const profile = (points, start, end, mat, name) =>
    add(
      name,
      sweepGeometry(
        track,
        points.length === 2 &&
          points[0][1] === points[1][1] &&
          points[0][0] > points[1][0]
          ? [...points].reverse()
          : points,
        { start, end, step: 3.2 },
      ),
      mat,
    );
  for (const [start, end] of runs) {
    const top = profile(
      [
        [-16, 0],
        [16, 0],
      ],
      start,
      end,
      smoke,
      'Smoked gold travel ribbon',
    );
    top.userData.drivingSurface = true;
    top.userData.interval = [start, end];
    profile(
      [
        [16, 0],
        [17.5, -0.75],
        [17.1, -3.2],
        [13.2, -3.6],
        [-13.2, -3.6],
        [-17.1, -3.2],
        [-17.5, -0.75],
        [-16, 0],
      ],
      start,
      end,
      glass,
      'Thick fused amber underside',
    );
    for (const side of SIDES) {
      profile(
        [
          [side * 12.8, 0.018],
          [side * 16, 0.018],
        ],
        start,
        end,
        glass,
        'Translucent lens shoulder',
      );
      profile(
        boxProfile(side * 16.48, 0.18, 0.68, 0.75),
        start,
        end,
        honey,
        'Continuous grounded baffle toe',
      );
      profile(
        [
          [side * 15.48, 0.035],
          [side * 15.78, 0.035],
        ],
        start,
        end,
        bone,
        'Pale inside shoulder',
      );
      profile(
        [
          [side * 12.72, 0.037],
          [side * 12.85, 0.037],
        ],
        start,
        end,
        seam,
        'Dark curb seam',
      );
      profile(
        boxProfile(side * 8.8, -2.7, 0.48, 0.8),
        start,
        end,
        honey,
        'Restrained glass structural web',
      );
    }
  }
  for (const section of track.sections.filter((s) =>
    ['sandfall', 'return'].includes(s.id),
  ))
    profile(
      [
        [-12.5, 0.045],
        [12.5, 0.045],
      ],
      section.start,
      section.end,
      honey,
      'Honey-opaque reinforced turn panels',
    );
  const box = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const instanced = (name, geometry, mat, entries) => {
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    mesh.name = name;
    mesh.receiveShadow = true;
    const transform = new THREE.Object3D();
    entries.forEach((entry, i) => {
      if (entry.matrix) transform.matrix.copy(entry.matrix);
      else {
        const frame = track.sample(entry.s);
        transform.position.copy(framePoint(frame, entry.x ?? 0, entry.y ?? 0));
        transform.quaternion.copy(frame.quaternion);
        if (entry.rotation) transform.rotateY(entry.rotation);
        transform.scale.fromArray(entry.scale ?? [1, 1, 1]);
        transform.updateMatrix();
      }
      mesh.setMatrixAt(i, transform.matrix);
    });
    group.add(mesh);
    return mesh;
  };
  // Two separated aero vanes are swept along each short baffle, with tapered
  // ends and open shadow slots. Continuous toes keep the boundaries grounded.
  const vaneGeometry = () => {
    const shape = new THREE.Shape();
    shape.moveTo(-6.3, 0);
    shape.lineTo(-4.6, 0.85);
    shape.lineTo(4.9, 0.65);
    shape.lineTo(6.3, 0.12);
    shape.lineTo(4.7, -0.15);
    shape.lineTo(-4.8, -0.2);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.75,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-0.375, 0, 0);
    return ownGeometry(geometry);
  };
  const vanes = [],
    clamps = [],
    panelRims = [],
    laminae = [],
    arrowFittings = [],
    warning = [],
    footBeams = [],
    feet = [];
  const random = seededRandom(7007);
  for (let s = 5; s < track.length; s += 16) {
    if (
      track.isGap(s) ||
      track.jumps.some(
        (j) =>
          !j.optional &&
          (Math.abs(s - j.takeoff) < 8 || Math.abs(s - j.landingStart) < 8),
      )
    )
      continue;
    for (const side of SIDES) {
      for (const y of [0.96, 2.1])
        vanes.push({ s, x: side * 17.65, y, scale: [1, 1, 1] });
      clamps.push({
        s: s - 3.8,
        x: side * 17.2,
        y: 0.94,
        scale: [0.48, 1.5, 0.9],
      });
      if (Math.round(s / 16) % 3 === 0)
        arrowFittings.push({
          s,
          x: side * 15.05,
          y: 0.12,
          scale: [0.38, 0.18, 3.8],
        });
    }
    // Broad, gently offset lens sections, with narrow dark joins and sparse
    // inclusions sunk visibly under the transparent shoulder material.
    panelRims.push({ s, x: 0, y: -0.025, scale: [25.6, 0.055, 0.18] });
    if (!shape)
      for (const side of SIDES) {
        laminae.push({
          s: s + random() * 4,
          x: side * (13.4 + random() * 1.7),
          y: -0.55,
          scale: [0.4 + random() * 0.9, 0.09, 2 + random() * 5],
          rotation: (random() - 0.5) * 0.25,
        });
      }
  }
  for (let s = 40; s < track.length; s += 80) {
    if (track.isGap(s)) continue;
    const f = track.sample(s);
    const foot = f.position.clone();
    foot.y -= 22;
    for (const side of SIDES) {
      const from = framePoint(f, side * 12, -3.5),
        to = foot.clone().addScaledVector(f.right, side * 4.8);
      to.y = survey.heightAt(to.x, to.z) + 1.2;
      const beam = beamTransform(from, to, 2.1, 3.1),
        o = new THREE.Object3D();
      o.position.copy(beam.position);
      o.quaternion.copy(beam.quaternion);
      o.scale.copy(beam.scale);
      o.updateMatrix();
      footBeams.push({ matrix: o.matrix.clone() });
      const shoe = new THREE.Object3D();
      shoe.position.copy(to);
      shoe.position.y -= 1;
      shoe.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
      shoe.scale.set(8, 2.6, 9);
      shoe.updateMatrix();
      feet.push({ matrix: shoe.matrix.clone() });
    }
  }
  for (const j of track.jumps) {
    for (const s of [
      j.takeoff - 35,
      j.takeoff - 18,
      j.takeoff - 3,
      j.landingStart + 4,
    ]) {
      for (const side of SIDES)
        warning.push({ s, x: side * 17.8, y: 2.3, scale: [0.75, 4.6, 0.75] });
    }
    const begin = j.optional ? 5 : -14.5,
      end = 14.5;
    for (let x = begin; x < end; x += 3)
      warning.push({ s: j.takeoff - 3, x, y: 0.09, scale: [1.6, 0.12, 1.5] });
  }
  instanced('Split tapered baffle vanes', vaneGeometry(), bone, vanes);
  instanced('Baffle ceramic anchors', box, honey, clamps);
  instanced('Glass lens section seams', box, seam, panelRims);
  instanced('Subsurface mineral laminae', box, amber, laminae);
  instanced('Pale physical direction fittings', box, bone, arrowFittings);
  instanced('Jump lip and receiving beacons', box, lamp, warning);
  instanced('Forked gold ceramic support legs', box, honey, footBeams);
  instanced('Broad fossil shelf shoes', box, bone, feet);
  const sands = [];
  for (const zone of sampleSaffronDeposits(track, 0)) {
    const rows = 30,
      cols = 10,
      positions = new Float32Array((rows + 1) * (cols + 1) * 3),
      indices = [];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j,
          b = a + cols + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setIndex(indices);
    const mesh = add(`Migrating sand / ${zone.id}`, geometry, sand);
    mesh.frustumCulled = false;
    sands.push({ mesh, rows, cols });
  }
  let lastTime = null,
    disposed = false;
  function update({ time = 0 } = {}) {
    if (disposed || time === lastTime) return;
    lastTime = time;
    const zones = sampleSaffronDeposits(track, time);
    sands.forEach(({ mesh, rows, cols }, index) => {
      const attribute = mesh.geometry.getAttribute('position');
      for (let i = 0; i <= rows; i++) {
        const section = saffronSandSection(zones[index], i / rows),
          frame = track.sample(section.distance);
        for (let j = 0; j <= cols; j++) {
          const v = (j / cols) * 2 - 1;
          const point = framePoint(
            frame,
            section.lateral + v * section.halfWidth,
            0.055 + section.depth * Math.max(0, 1 - v * v) ** 0.75,
          );
          attribute.setXYZ(i * (cols + 1) + j, point.x, point.y, point.z);
        }
      }
      attribute.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    });
  }
  update();
  group.userData.openSpans = track.jumps
    .filter((j) => !j.optional)
    .map((j) => ({ id: j.id, start: j.takeoff, end: j.landingStart }));
  group.userData.surfaceCoverage = track.surfaceCoverage;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    geometries.clear();
    materials.clear();
  };
  group.userData.dispose = dispose;
  return {
    group,
    update,
    reset: () => {
      lastTime = null;
      update({ time: 0 });
    },
    dispose,
  };
}
