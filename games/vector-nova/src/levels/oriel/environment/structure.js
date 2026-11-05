import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import {
  finishHabitatMaterial,
  shellPoint,
  TAU,
  hubGateDistances,
  civicExcluded,
} from './habitat.js';

export function createHabitatStructure(own, track) {
  const group = new T.Group();
  group.name = 'Oriel / axial sun and habitat foundations';
  const limestone = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / carved warm civic limestone',
        color: '#cfc6a9',
        roughness: 0.75,
        metalness: 0.06,
      }),
    ),
  );
  const bronze = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / seated bronze structural frames',
        color: '#79684b',
        roughness: 0.4,
        metalness: 0.65,
      }),
    ),
  );
  const dark = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / recessed sunline mechanics',
        color: '#293c3b',
        roughness: 0.53,
        metalness: 0.65,
      }),
    ),
  );
  const shutter = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / deep teal formed endcap shutters',
        color: '#3d5b60',
        roughness: 0.56,
        metalness: 0.38,
      }),
    ),
  );
  const light = own(
    new T.MeshBasicMaterial({
      name: 'Oriel / warm artificial sun',
      color: new T.Color(3.2, 2.6, 1.7),
      toneMapped: true,
    }),
  );
  const buckets = new Map();
  const add = (geometry, material, name) => {
    if (!buckets.has(material)) buckets.set(material, { geometries: [], name });
    buckets.get(material).geometries.push(geometry);
  };
  const beam = (a, b, width, depth, material) => {
    const direction = b.clone().sub(a),
      length = direction.length();
    const g = new T.BoxGeometry(width, depth, length);
    g.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        direction.normalize(),
      ),
    );
    g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    add(g, material, 'Oriel / connected habitat members');
  };
  // The long light source is physically present in the middle of the cylinder.
  const sun = new T.CylinderGeometry(5.5, 5.5, 4600, 12, 1, true);
  sun.rotateX(Math.PI / 2);
  sun.translate(0, 1000, 0);
  add(sun, light, 'Oriel / axial sunline');
  for (const x of [-10, 10]) {
    const rail = new T.CylinderGeometry(1.9, 1.9, 4720, 8, 1);
    rail.rotateX(Math.PI / 2);
    rail.translate(x, 1003, 0);
    add(rail, bronze, 'Oriel / solar distribution spine');
  }
  for (let z = -2250; z <= 2250; z += 150) {
    const collar = new T.TorusGeometry(10, 1.7, 6, 12);
    collar.translate(0, 1000, z);
    add(collar, dark, 'Oriel / attached sunline collars');
    beam(
      new T.Vector3(-13, 1007, z),
      new T.Vector3(13, 1007, z),
      2.4,
      3,
      bronze,
    );
  }
  for (const z of [-2330, -1170, 0, 1170, 2330]) {
    const ring = new T.TorusGeometry(992, 5, 6, 128);
    ring.translate(0, 1000, z);
    add(ring, limestone, 'Oriel / circumferential foundation belts');
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      beam(shellPoint(a, z - 16, 2), shellPoint(a, z + 16, 2), 8, 5, bronze);
    }
  }
  for (const z of [-2390, 2390]) {
    // Deep nested shutters reduce the empty white disc to one solar aperture.
    for (let i = 0; i < 12; i++) {
      const phase = (i / 12) * Math.PI * 2;
      for (const [inner, outer, depth] of [
        [470, 670, 12],
        [682, 840, 42],
        [852, 1008, 75],
      ]) {
        const panel = new T.RingGeometry(
          inner,
          outer,
          8,
          1,
          phase + 0.014,
          TAU / 12 - 0.028,
        );
        if (z > 0) panel.rotateY(Math.PI);
        panel.translate(0, 1000, z + (z > 0 ? -depth : depth));
        add(panel, shutter, 'Oriel / nested civic solar shutters');
      }
    }
    for (const [radius, depth] of [
      [470, 12],
      [680, 42],
      [850, 75],
    ]) {
      const rim = new T.TorusGeometry(radius, 7, 6, 96);
      rim.translate(0, 1000, z + (z > 0 ? -depth : depth));
      add(rim, bronze, 'Oriel / formed endcap return lips');
    }
    for (const radius of [260, 680, 985]) {
      const ring = new T.TorusGeometry(radius, radius === 985 ? 22 : 10, 8, 96);
      ring.translate(0, 1000, z);
      add(ring, limestone, 'Oriel / endcap open civic rose');
    }
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * TAU;
      beam(shellPoint(a, z, 18), shellPoint(a, z, 725), 18, 24, limestone);
      beam(shellPoint(a, z, 725), shellPoint(a, z, 985), 8, 10, bronze);
    }
    const iris = new T.CylinderGeometry(75, 75, 25, 24);
    iris.rotateX(Math.PI / 2);
    iris.translate(0, 1000, z);
    add(iris, dark, 'Oriel / solar iris housing');
    const lens = new T.CircleGeometry(58, 32);
    if (z < 0) lens.rotateY(Math.PI);
    lens.translate(0, 1000, z + (z < 0 ? 15 : -15));
    add(lens, light, 'Oriel / endcap solar iris');
  }
  // Every ordinary viaduct bay lands on the visible inner landscape. The long
  // sunline bow has fewer, much larger piers so its inhabited void remains open.
  for (let s = 42; s < track.length; s += 110) {
    if (civicExcluded(track, s, 100)) continue;
    if (track.jumps.some((j) => s > j.takeoff - 45 && s < j.landingStart + 80))
      continue;
    const frame = track.sample(s),
      radial = Math.hypot(frame.position.x, frame.position.y - 1000);
    if (radial < 890 && Math.floor(s / 110) % 4 !== 0) continue;
    for (const side of [-1, 1]) {
      const top = frame.position
        .clone()
        .addScaledVector(frame.right, side * 12)
        .addScaledVector(frame.up, -5);
      const angle = Math.atan2(top.x, 1000 - top.y);
      const foot = shellPoint(angle, top.z, 4);
      const big = radial < 890;
      beam(foot, top, big ? 12 : 4.2, big ? 30 : 8, limestone);
      beam(
        top.clone().addScaledVector(frame.right, -side * 10),
        top.clone().addScaledVector(frame.right, side * 6),
        2.6,
        4,
        bronze,
      );
    }
  }
  for (const s of hubGateDistances(track)) {
    const frame = track.sample(s);
    beam(
      frame.position
        .clone()
        .addScaledVector(frame.right, -59)
        .addScaledVector(frame.up, -10),
      frame.position
        .clone()
        .addScaledVector(frame.right, 59)
        .addScaledVector(frame.up, -10),
      8,
      14,
      bronze,
    );
    for (const side of [-1, 1]) {
      const top = frame.position
        .clone()
        .addScaledVector(frame.right, side * 48)
        .addScaledVector(frame.up, -14);
      const angle = Math.atan2(top.x, 1000 - top.y);
      beam(shellPoint(angle, top.z, 3), top, 13, 24, limestone);
    }
  }
  const coil = track.landmarks.corkscrew;
  if (coil) {
    const range = {
      start: coil.start - 75,
      end: coil.end + 75,
      step: 4,
      uvScale: 1,
    };
    for (const side of [-1, 1]) {
      const spine = sweepGeometry(
        track,
        boxProfile(side * 31, -21, 5.5, 8),
        range,
      );
      spine.deleteAttribute('roadCoord');
      add(spine, bronze, 'Oriel / Garden Coil outboard load spines');
    }
    for (let s = range.start + 12; s < range.end; s += 52) {
      const f = track.sample(s);
      for (const side of [-1, 1])
        beam(
          framePoint(f, side * 20, -3.5),
          framePoint(f, side * 31, -21),
          2.2,
          3.2,
          bronze,
        );
      beam(framePoint(f, -32, -25), framePoint(f, 32, -25), 3.2, 5, dark);
    }
    // The rolled load spines land at fixed end abutments on the real shell.
    for (const s of [range.start + 8, range.end - 8]) {
      const f = track.sample(s);
      for (const side of [-1, 1]) {
        const top = framePoint(f, side * 31, -25),
          a = Math.atan2(top.x, 1000 - top.y);
        beam(shellPoint(a, top.z, 3), top, 11, 22, limestone);
      }
    }
  }
  for (const [material, bucket] of buckets) {
    const geometry = own(mergeGeometries(bucket.geometries, false));
    bucket.geometries.forEach((g) => g.dispose());
    const mesh = new T.Mesh(geometry, material);
    mesh.name = bucket.name;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, materials: [limestone, bronze, dark, shutter] };
}
