import * as THREE from 'three';
import { groundFrame, precinctLayout } from './placement.js';

// One authored piece of the city: the Meridian drainage gardens and pumping hall.
// The high viaduct owns the planted ground beneath its columns; the neighbouring
// blocks face a continuous canal promenade rather than isolated square pads.
export function createMeridianPrecinct(track, batch) {
  const ground = track.groundY;
  const layout = precinctLayout(track);
  const { from, to } = layout;
  const count = Math.ceil((to - from) / 15);
  const frames = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= count; i += 1) {
    const f = groundFrame(track, from + ((to - from) * i) / count);
    frames.push(f);
  }
  function point(frame, offset, height) {
    return new THREE.Vector3(
      frame.position.x + frame.right.x * offset,
      ground + height,
      frame.position.z + frame.right.z * offset,
    );
  }
  function contains(x, z, margin = 0) {
    if (Math.hypot(x - hallCentre.x, z - hallCentre.z) < 78 + margin)
      return true;
    for (const f of frames) {
      const cx = f.position.x + f.right.x * 19;
      const cz = f.position.z + f.right.z * 19;
      if (Math.hypot(x - cx, z - cz) < 79 + margin) return true;
    }
    return false;
  }
  function ribbon(name, profile) {
    const vertices = [],
      uv = [],
      indices = [];
    for (let edge = 0; edge < profile.length - 1; edge += 1) {
      const n = vertices.length / 3;
      for (let i = 0; i <= count; i += 1) {
        for (const [offset, height] of [profile[edge], profile[edge + 1]]) {
          const p = point(frames[i], offset, height);
          vertices.push(p.x, p.y, p.z);
          if (name === 'bankStone') uv.push((i * 15) / 12, height / 4);
          else uv.push(offset / 14, (i * 15) / 24);
        }
        if (i < count) {
          const j = n + i * 2;
          indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    batch.add(geometry, name, 0, 0, 0);
    geometry.dispose();
  }
  function box(surface, p, width, height, depth, yaw = 0, tint = '#ffffff') {
    batch.primitive(
      'box',
      surface,
      p.x,
      p.y,
      p.z,
      width,
      height,
      depth,
      yaw,
      false,
      tint,
    );
  }
  function beam(surface, a, b, width, depth = width) {
    const geometry = new THREE.BoxGeometry(width, a.distanceTo(b), depth);
    const axisY = b.clone().sub(a).normalize();
    const axisX = new THREE.Vector3().crossVectors(up, axisY).normalize();
    if (axisX.lengthSq() < 0.01) axisX.set(1, 0, 0);
    const axisZ = new THREE.Vector3().crossVectors(axisX, axisY).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(axisX, axisY, axisZ),
    );
    geometry.applyQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    batch.add(geometry, surface, mid.x, mid.y, mid.z);
    geometry.dispose();
  }
  function tree(frame, offset, size, phase) {
    const root = point(frame, offset, 1.6);
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    batch.primitive(
      'cylinder',
      'dark',
      root.x,
      root.y + size * 0.43,
      root.z,
      0.5,
      size * 0.86,
      0.5,
      0,
      true,
    );
    for (const [dx, dy, dz, factor] of [
      [0, 0.94, 0, 0.9],
      [1.4, 0.79, 0.9, 0.66],
      [-1.1, 0.75, -0.6, 0.72],
    ]) {
      batch.primitive(
        'shrub',
        'vegetation',
        root.x + dx,
        root.y + size * dy,
        root.z + dz,
        size * factor,
        size * factor * 0.85,
        size * factor,
        yaw + phase,
        true,
        phase > 2 ? '#afb594' : '#b2c7ad',
      );
    }
  }

  ribbon('landscape', [
    [-61, 0.2],
    [-46, 2.9],
    [-34, 1.2],
    [-26, 0.65],
    [-15, 1.1],
    [2, 2.3],
    [17, 1.8],
    [21.5, 3.1],
  ]);
  ribbon('path', [
    [-33, 1.3],
    [-25, 1.3],
  ]);
  ribbon('bankStone', [
    [21.5, 3.15],
    [23, 3.15],
    [23, 0.65],
  ]);
  ribbon('water', [
    [23, 0.72],
    [49, 0.72],
  ]);
  ribbon('bankStone', [
    [49, 0.65],
    [49, 2.5],
    [50.4, 2.5],
  ]);
  ribbon('path', [
    [50.4, 2.5],
    [63, 2.5],
  ]);
  ribbon('landscape', [
    [63, 2.45],
    [72, 5.7],
    [87, 4.4],
    [101, 0.2],
  ]);
  // Three real stepped quays at the pumping hall and bridge landings.
  for (let i = 0; i < count; i += 4) {
    const f = frames[i],
      yaw = Math.atan2(f.tangent.x, f.tangent.z);
    if (i % 8 === 0) {
      tree(f, 75 + Math.sin(i * 1.4) * 6, 8.5 + (i % 3), i * 0.51);
      tree(f, -44 + Math.cos(i) * 5, 7.5, i * 0.29);
    }
    const p = point(f, 61.3, 3.1);
    box('stone', p, 0.85, 1.2, 7.4, yaw, '#b7b7a4');
    if (i % 12 === 0) {
      const lamp = point(f, 57, 5.1);
      box('dark', lamp, 0.22, 5.2, 0.22);
      box('warm', point(f, 57, 7.7), 1.2, 0.14, 1.2);
    }
  }
  for (const distance of layout.bridgeDistances) {
    const f = groundFrame(track, distance);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    // A shallow arched footbridge crosses the drainage channel with two true abutments.
    for (const offset of [18, 56])
      box('stone', point(f, offset, 2.3), 4.8, 4.6, 8, yaw);
    for (let i = 0; i < 16; i += 1) {
      const a = 17 + (40 * i) / 16,
        b = 17 + (40 * (i + 1)) / 16;
      const ha = 4 + Math.sin((i / 16) * Math.PI) * 3.1;
      const hb = 4 + Math.sin(((i + 1) / 16) * Math.PI) * 3.1;
      beam('steel', point(f, a, ha), point(f, b, hb), 0.5, 5.2);
      for (const side of [-1, 1]) {
        const pa = point(f, a, ha + 1.2).addScaledVector(f.tangent, side * 2.4);
        const pb = point(f, b, hb + 1.2).addScaledVector(f.tangent, side * 2.4);
        beam('dark', pa, pb, 0.1);
        if (i % 4 === 0)
          beam(
            'steel',
            pa.clone().add(new THREE.Vector3(0, -1.4, 0)),
            pa,
            0.12,
          );
      }
    }
    for (let stair = 0; stair < 6; stair += 1)
      box(
        'stone',
        point(f, 58 + stair * 1.25, 3.8 - stair * 0.21),
        1.35,
        0.3,
        7,
        yaw,
      );
  }
  // The civic hall is low enough to frame the racing deck and gives this site a
  // recognizable roofscape: three copper barrel vaults over a glazed public gallery.
  const hallFrame = groundFrame(track, layout.hallDistance);
  const hallCentre = point(hallFrame, layout.hallOffset, 0);
  const hallYaw = Math.atan2(hallFrame.tangent.x, hallFrame.tangent.z);
  function hallPoint(x, y, z) {
    return hallCentre
      .clone()
      .addScaledVector(hallFrame.right, x)
      .addScaledVector(hallFrame.tangent, z)
      .add(new THREE.Vector3(0, y, 0));
  }
  box('stone', hallPoint(0, 1.8, 0), 66, 3.6, 136, hallYaw);
  box('industrial', hallPoint(0, 10.5, 0), 60, 17.4, 128, hallYaw);
  box('dark', hallPoint(-30.6, 11.4, 0), 0.5, 15, 118, hallYaw);
  for (let bay = -5; bay <= 5; bay += 1) {
    box('stone', hallPoint(-31.3, 11.5, bay * 11.4), 1.2, 16, 1, hallYaw);
    box('warm', hallPoint(-31.7, 17.8, bay * 11.4), 0.1, 0.25, 8.2, hallYaw);
  }
  for (const roofCentre of [-20, 0, 20]) {
    const vertices = [],
      uv = [],
      indices = [];
    for (let arc = 0; arc <= 16; arc += 1) {
      const theta = (arc / 16) * Math.PI;
      for (const z of [-67, 67]) {
        const p = hallPoint(
          roofCentre + Math.cos(theta) * 10.3,
          20 + Math.sin(theta) * 9,
          z,
        );
        vertices.push(p.x, p.y, p.z);
        uv.push(arc / 4, z / 15);
      }
      if (arc < 16) {
        const n = arc * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
    const roof = new THREE.BufferGeometry();
    roof.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    roof.setIndex(indices);
    roof.computeVertexNormals();
    batch.add(roof, 'copper', 0, 0, 0);
    roof.dispose();
    for (let rib = -4; rib <= 4; rib += 1) {
      for (let segment = 0; segment < 12; segment += 1) {
        const a = (segment / 12) * Math.PI,
          b = ((segment + 1) / 12) * Math.PI;
        beam(
          'steel',
          hallPoint(
            roofCentre + Math.cos(a) * 10.45,
            20 + Math.sin(a) * 9.15,
            rib * 16,
          ),
          hallPoint(
            roofCentre + Math.cos(b) * 10.45,
            20 + Math.sin(b) * 9.15,
            rib * 16,
          ),
          0.2,
        );
      }
    }
  }
  return {
    contains,
    layout,
    identity: 'Meridian water gardens and civic pumping hall',
  };
}
