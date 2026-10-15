import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  createWorldspireFinish,
  setMetreUV,
  applySlabFinish,
} from './finish.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';

export function roadIntervals(track) {
  const out = [];
  let start = -70;
  for (const jump of track.jumps) {
    out.push({ start, end: jump.takeoff });
    start = jump.landingStart;
  }
  out.push({ start, end: track.length });
  return out;
}
export function createWorldspireRoad({
  track,
  shape = false,
  collectSolid = null,
  renderer = null,
}) {
  const group = new T.Group();
  group.name = 'Worldspire / ivory magnetic causeway';
  const geometries = new Set(),
    materials = new Set(),
    half = track.width / 2;
  const mat = (name, options) => {
    const M =
      /mineral ceramic|formed coping|cleft obsidian|jade inclusions/.test(
        name,
      ) && !shape
        ? T.MeshPhysicalMaterial
        : T.MeshStandardMaterial;
    const m = new M({ name, ...options });
    materials.add(m);
    return m;
  };
  const ivory = mat('Worldspire / sealed mineral ceramic', {
    color: shape ? '#a4abae' : '#dedfd5',
    roughness: 0.68,
    metalness: 0.035,
  });
  if (!shape && !collectSolid) {
    ivory.clearcoat = 0.52;
    ivory.clearcoatRoughness = 0.21;
    ivory.normalScale.set(0.48, 0.48);
    ivory.clearcoatNormalScale.set(0.18, 0.18);
    applySlabFinish(ivory);
  }
  const bronze = mat('Worldspire / bronze folded carriers', {
    color: '#ac8057',
    roughness: 0.44,
    metalness: 0.61,
  });
  const dark = mat('Worldspire / charcoal ceramic keel', {
    color: '#24222b',
    roughness: 0.62,
    metalness: 0.3,
  });
  const edge = mat('Worldspire / pale formed coping', {
    color: '#b5baac',
    roughness: 0.9,
    metalness: 0.04,
  });
  const amber = mat('Worldspire / recessed amber guidance', {
    color: '#ffd89b',
    emissive: '#ffc67c',
    emissiveIntensity: 0.65,
    roughness: 0.5,
  });
  const teal = mat('Worldspire / cool portal guidance', {
    color: '#9be0d4',
    emissive: '#6ecfc3',
    emissiveIntensity: 0.55,
    roughness: 0.5,
  });
  const mineral = mat('Worldspire / cleft obsidian', {
    color: '#c1b7bc',
    roughness: 0.32,
    metalness: 0.08,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
  });
  const jade = mat('Worldspire / recessed jade inclusions', {
    color: '#82aea0',
    roughness: 0.21,
    metalness: 0.12,
    clearcoat: 0.8,
    clearcoatRoughness: 0.17,
    emissive: '#194b39',
    emissiveIntensity: 0.12,
  });
  const finishMaps =
    !shape && !collectSolid
      ? createWorldspireFinish(renderer, [ivory, edge], [mineral])
      : null;
  if (!shape) {
    edge.clearcoat = 0.2;
    edge.clearcoatRoughness = 0.4;
    edge.normalScale.set(0.4, 0.4);
  }
  const add = (name, geo, m, info) => {
    geometries.add(geo);
    if (!shape && [ivory, edge, mineral].includes(m)) setMetreUV(geo);
    const o = new T.Mesh(geo, m);
    o.name = name;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.drivingSurface = info?.kind === 'deck';
    o.userData.roadSurface = info?.kind === 'deck';
    group.add(o);
    if (info && collectSolid) collectSolid({ name, geometry: geo, ...info });
    return o;
  };
  for (const [i, run] of roadIntervals(track).entries()) {
    const range = { ...run, step: 4, uvScale: 12 },
      route = { start: Math.max(0, run.start), end: run.end };
    add(
      'Deck ' + i,
      sweepGeometry(
        track,
        [
          [-half, 0],
          [half, 0],
        ],
        range,
      ),
      ivory,
      { kind: 'deck', ...route },
    );
    add(
      'Keel ' + i,
      sweepGeometry(
        track,
        [
          [half, 0],
          [half + 1, -2],
          [half - 3, -7],
          [-half + 3, -7],
          [-half - 1, -2],
          [-half, 0],
        ],
        range,
      ),
      dark,
      { kind: 'structure', ...route },
    );
    for (const side of [-1, 1]) {
      add(
        'Coping ' + i + ' ' + side,
        sweepGeometry(
          track,
          boxProfile(side * (half + 0.8), 0.65, 1.6, 1.3),
          range,
        ),
        edge,
        { kind: 'rail', roadBoundary: true, ...route },
      );
      add(
        'Mineral cleft ' + i + ' ' + side,
        sweepGeometry(
          track,
          [
            [side * (half + 1.6), 0.25],
            [side * (half + 2.2), -0.65],
            [side * (half + 4.1), -1.6],
            [side * (half + 4.8), 1.25],
            [side * (half + 5.5), -3.1],
            [side * (half + 1.4), -4.2],
          ],
          range,
        ),
        mineral,
        { kind: 'structure', ...route },
      );
      add(
        'Bronze rim ' + i + ' ' + side,
        sweepGeometry(
          track,
          boxProfile(side * (half + 3.0), -3.4, 1.1, 2.6),
          range,
        ),
        bronze,
      );
      add(
        'Guidance ' + i + ' ' + side,
        sweepGeometry(
          track,
          [
            [side * (half - 0.2), 0.07],
            [side * (half - 0.45), 0.07],
          ],
          range,
        ),
        amber,
      );
    }
    for (const s of [run.start, run.end]) {
      const f = track.sample(s),
        g = new T.PlaneGeometry(track.width, 7);
      const matrix = new T.Matrix4().compose(
        framePoint(f, 0, -3.5),
        f.quaternion,
        new T.Vector3(1, 1, 1),
      );
      g.applyMatrix4(matrix);
      add('Deck end ' + i + ' ' + s, g, dark, { kind: 'structure', ...route });
    }
  }
  // Repeated broad load arms attach every exposed length to the actual spire.
  {
    const box = new T.BoxGeometry(1, 1, 1);
    const formed = new RoundedBoxGeometry(1, 1, 1, 1, 0.08);
    geometries.add(formed);
    const crystal = new T.DodecahedronGeometry(0.64, 0);
    const facets = [];
    for (let i = 0; i < crystal.attributes.normal.count; i++) {
      const n = crystal.attributes.normal;
      const v =
        0.22 +
        0.78 *
          Math.pow(
            Math.max(0, n.getX(i) * 0.7 + n.getY(i) * 0.45 + n.getZ(i) * 0.4),
            2,
          );
      facets.push(v, v, v);
    }
    crystal.setAttribute('color', new T.Float32BufferAttribute(facets, 3));
    jade.vertexColors = true;
    geometries.add(crystal);
    const profile = new T.Shape();
    [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, -0.32],
      [0.16, -0.32],
      [0.16, 0.32],
      [0.5, 0.32],
      [0.5, 0.5],
      [-0.5, 0.5],
      [-0.5, 0.32],
      [-0.16, 0.32],
      [-0.16, -0.32],
      [-0.5, -0.32],
    ].forEach(([x, z], i) => (i ? profile.lineTo(x, z) : profile.moveTo(x, z)));
    profile.closePath();
    const armSection = new T.ExtrudeGeometry(profile, {
      depth: 0.96,
      bevelEnabled: true,
      bevelSize: 0.018,
      bevelThickness: 0.02,
      bevelSegments: 1,
      steps: 1,
    });
    armSection.rotateX(Math.PI / 2);
    armSection.translate(0, 0.48, 0);
    geometries.add(armSection);
    geometries.add(box);
    const transforms = [],
      seats = [];
    for (let s = 45; s < track.length; s += 90) {
      if (
        track.isGap(s) ||
        track.inversions.some((r) => s > r.start - 130 && s < r.end + 130)
      )
        continue;
      const f = track.sample(s),
        p = framePoint(f, 0, -14),
        r = Math.hypot(p.x, p.z);
      if (r < track.spireRadius(p.y) + 55) continue;
      const anchor = p.clone().multiply(new T.Vector3(0.58, 1, 0.58));
      // Steep radial struts stay below falling, banked road sections.
      anchor.y = Math.max(-240, anchor.y - r * 0.65 - 100);
      const arm = beamTransform(anchor, p, 8, 14);
      for (const end of [anchor, p])
        seats.push(
          new T.Matrix4().compose(
            end,
            arm.quaternion,
            new T.Vector3(13, 4, 20),
          ),
        );
      transforms.push(
        new T.Matrix4().compose(arm.position, arm.quaternion, arm.scale),
      );
    }
    const arms = new T.InstancedMesh(armSection, bronze, transforms.length);
    transforms.forEach((m, i) => arms.setMatrixAt(i, m));
    arms.name = 'Worldspire / radial bronze load arms';
    arms.castShadow = true;
    group.add(arms);
    const shoes = new T.InstancedMesh(formed, dark, seats.length);
    seats.forEach((m, i) => shoes.setMatrixAt(i, m));
    shoes.name = 'Worldspire / seated load-arm shoes';
    shoes.castShadow = true;
    shoes.receiveShadow = true;
    group.add(shoes);
    if (collectSolid)
      seats.forEach((matrix, i) =>
        collectSolid({
          name: 'Radial seat ' + i,
          geometry: box,
          matrix,
          kind: 'structure',
        }),
      );
    if (collectSolid)
      transforms.forEach((matrix, i) =>
        collectSolid({
          name: 'Radial load arm ' + i,
          geometry: box,
          matrix,
          kind: 'structure',
        }),
      );
    // Seated bronze bridge clasps cross the recessed mineral cleft. They remain
    // outside the coping and below its crown, so they never decorate the lane.
    const clasps = [],
      inclusions = [];
    for (let s = 10; s < track.length; s += 24) {
      if (track.isGap(s)) continue;
      const f = track.sample(s);
      for (const side of [-1, 1]) {
        clasps.push(
          new T.Matrix4().compose(
            framePoint(f, side * (half + 3.25), -0.34),
            f.quaternion,
            new T.Vector3(4, 0.38, 1.8),
          ),
        );
        if (Math.sin(s * 0.137 + side) > -0.15)
          inclusions.push(
            new T.Matrix4().compose(
              framePoint(f, side * (half + 3.15), -1.35),
              f.quaternion,
              new T.Vector3(1.25, 0.7, 3.5 + (Math.sin(s * 0.14) + 1) * 2),
            ),
          );
      }
    }
    for (const [name, list, material] of [
      ['Worldspire / cleft bridge clasps', clasps, bronze],
      ['Worldspire / sub-surface jade', inclusions, jade],
    ]) {
      const detail = new T.InstancedMesh(
        material === jade ? crystal : formed,
        material,
        list.length,
      );
      list.forEach((m, i) => detail.setMatrixAt(i, m));
      detail.name = name;
      detail.castShadow = true;
      detail.receiveShadow = true;
      group.add(detail);
    }
    const marks = [];
    for (const j of track.jumps) {
      for (const s of [j.takeoff - 22, j.landingStart + 12]) {
        const f = track.sample(s);
        for (const side of [-1, 1]) {
          const p = framePoint(f, side * 28, 5);
          marks.push(
            new T.Matrix4().compose(p, f.quaternion, new T.Vector3(2, 10, 3)),
          );
        }
      }
    }
    const beacons = new T.InstancedMesh(box, teal, marks.length);
    marks.forEach((m, i) => beacons.setMatrixAt(i, m));
    beacons.name = 'Worldspire / launch and landing markers';
    group.add(beacons);
    const finish = track.sample(track.finishDistance);
    const line = new T.Mesh(new T.PlaneGeometry(track.width, 5), bronze);
    geometries.add(line.geometry);
    line.name = 'Worldspire / Root Gate finish';
    line.position.copy(framePoint(finish, 0, 0.08));
    line.quaternion.copy(finish.quaternion);
    line.rotateX(-Math.PI / 2);
    group.add(line);
  }
  return {
    group,
    ready: finishMaps?.ready?.then(() => {
      jade.normalMap = ivory.normalMap;
      jade.normalScale.set(0.42, 0.42);
      jade.needsUpdate = true;
      for (const m of [bronze, dark]) {
        m.normalMap = ivory.normalMap;
        m.normalScale.set(0.22, 0.22);
        m.roughnessMap = ivory.roughnessMap;
        m.needsUpdate = true;
      }
    }),
    setReflection(texture) {
      for (const m of [ivory, edge, bronze, mineral, jade]) {
        m.envMap = texture;
        m.envMapIntensity = 0.75;
        m.needsUpdate = true;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      finishMaps?.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
