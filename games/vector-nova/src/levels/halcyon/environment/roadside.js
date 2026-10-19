import * as THREE from 'three';
import { groundFrame } from '../../../environment/placement.js';

// Deliberate near-field architecture at ordinary connectors. Each complete
// building (including coping/plant) passes the same full-route/support envelope.
export function roadsideSites(track, clears) {
  const sites = [];
  for (const [fraction, side, style] of [
    [0.04, 1, 'civic'],
    [0.175, -1, 'loft'],
    [0.28, 1, 'civic'],
    [0.785, 1, 'loft'],
    [0.9, -1, 'loft'],
  ]) {
    const f = groundFrame(track, track.length * fraction),
      yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const w = style === 'civic' ? 38 : 32,
      d = style === 'civic' ? 96 : 78;
    const height = Math.ceil((f.position.y - track.groundY + 26) / 4.2) * 4.2;
    for (const offset of [56, 72, 90, 112]) {
      const p = f.position.clone().addScaledVector(f.right, side * offset);
      if (!clears(p.x, p.z, w + 6, d + 6, track.groundY + height + 8, yaw))
        continue;
      if (
        sites.some(
          (s) =>
            Math.hypot(s.x - p.x, s.z - p.z) < s.radius + Math.hypot(w, d) / 2,
        )
      )
        continue;
      sites.push({
        x: p.x,
        z: p.z,
        yaw,
        w,
        d,
        height,
        style,
        radius: Math.hypot(w + 6, d + 6) / 2,
        fraction,
      });
      break;
    }
  }
  return sites;
}

export function buildRoadsideArchitecture(track, batch, sites) {
  const ground = track.groundY;
  const windowPlane = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
  for (const site of sites) {
    const { x, z, yaw, w, d, height, style } = site;
    const point = (dx, y, dz) =>
      new THREE.Vector3(
        x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
        ground + y,
        z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
      );
    const box = (material, dx, y, dz, width, h, depth, angle = yaw) => {
      const p = point(dx, y, dz);
      batch.primitive('box', material, p.x, p.y, p.z, width, h, depth, angle);
    };
    box('stone', 0, 1, 0, w + 4, 2, d + 4);
    // A recessed core is behind the exposed bearing piers and window reveals.
    box('brick', 0, height / 2, 0, w - 5, height, d - 5);
    for (const side of [-1, 1]) {
      for (let floor = 0; floor < height / 4.2; floor++) {
        const h = floor * 4.2;
        box('brick', side * (w / 2 - 0.65), h + 0.65, 0, 1.3, 1.3, d);
        box('stone', side * (w / 2 + 0.12), h + 1.3, 0, 0.3, 0.18, d + 0.3);
        const bays = Math.floor(d / 6),
          pitch = d / bays;
        for (let b = 0; b < bays; b++) {
          const zz = -d / 2 + (b + 0.5) * pitch;
          const occupied = (floor * 7 + b * 11 + Math.round(x)) % 9;
          const wp = point(side * (w / 2 - 1.1), h + 2.7, zz);
          batch.add(
            windowPlane,
            occupied === 0
              ? 'roomWarm'
              : occupied === 3
                ? 'roomCool'
                : 'roomDark',
            wp.x,
            wp.y,
            wp.z,
            1,
            2.55,
            pitch - 1.35,
            yaw + (side < 0 ? Math.PI : 0),
          );
          box('steel', side * (w / 2 - 0.82), h + 2.7, zz, 0.14, 2.7, 0.12);
          if (floor % 3 === 0)
            box(
              'stone',
              side * (w / 2 + 0.2),
              h + 3.98,
              zz,
              0.7,
              0.18,
              pitch - 0.5,
            );
        }
      }
      for (let j = 0; j <= Math.floor(d / 6); j++) {
        const zz = -d / 2 + (j * d) / Math.floor(d / 6);
        box(
          style === 'civic' ? 'stone' : 'brick',
          side * (w / 2 - 0.45),
          height / 2,
          zz,
          1.8,
          height,
          1.05,
        );
      }
      box('stone', 0, height / 2, side * (d / 2 - 0.7), w, height, 1.4);
      // End walls have a recessed, grouped vertical window bay as an orientation cue.
      box(
        'dark',
        0,
        height * 0.5,
        side * (d / 2 + 0.02),
        w * 0.54,
        height - 8,
        0.08,
      );
      for (let y = 5; y < height - 2; y += 4.2)
        box('stone', 0, y, side * (d / 2 + 0.15), w * 0.56, 0.35, 0.5);
      for (const dx of [-0.27, 0, 0.27])
        box(
          'stone',
          dx * w,
          height * 0.5,
          side * (d / 2 + 0.2),
          0.5,
          height - 8,
          0.55,
        );
    }
    box('roof', 0, height + 0.35, 0, w + 1, 0.7, d + 1);
    for (const side of [-1, 1])
      box('stone', side * (w / 2), height + 1, 0, 0.65, 1.3, d + 1);
    box('roof', 0, height + 3, -d * 0.19, w * 0.6, 5, d * 0.4);
    for (const dx of [-0.2, 0.2])
      box('dark', dx * w, height + 5.7, -d * 0.19, w * 0.2, 0.4, d * 0.32);
    for (const side of [-1, 1]) {
      box(
        'steel',
        side * (w / 2 + 0.4),
        height * 0.5,
        -d * 0.4,
        0.2,
        height,
        0.24,
      );
      box('warm', side * (w / 2 + 0.42), height - 1, 0, 0.08, 0.16, d * 0.7);
    }
  }
  windowPlane.dispose();
}
