import * as THREE from 'three';
import { groundFrame } from '../../../environment/placement.js';
import {
  facadeGeometry,
  roofGeometry,
  ellipticalTowerGeometry,
} from './geometry.js';

export function skylineSites(track, clears) {
  const sites = [];
  for (const [fraction, side, height, style] of [
    [0.425, 1, 650, 'lens'],
    [0.61, -1, 585, 'crown'],
  ]) {
    const f = groundFrame(track, track.length * fraction),
      yaw = Math.atan2(f.tangent.x, f.tangent.z);
    for (const offset of [110, 145, 180, 220]) {
      const p = f.position.clone().addScaledVector(f.right, side * offset);
      if (!clears(p.x, p.z, 94, 106, track.groundY + height + 20, yaw))
        continue;
      sites.push({ x: p.x, z: p.z, yaw, height, style, radius: 78 });
      break;
    }
  }
  return sites;
}
export function buildSkyline(track, batch, sites) {
  for (const site of sites) {
    const { x, z, yaw, height, style } = site,
      base = track.groundY;
    const box = (mat, dx, y, dz, w, h, d) =>
      batch.primitive(
        'box',
        mat,
        x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
        base + y,
        z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
        w,
        h,
        d,
        yaw,
      );
    const shell = (w, d, h, y, taper = 1) => {
      const g = facadeGeometry(w, d, h, taper, 0.16);
      batch.add(g, 'ribbonGlass', x, base + y, z, 1, 1, 1, yaw);
      g.dispose();
      const roof = roofGeometry(w * taper, d * taper, 0.16);
      batch.add(roof, 'roof', x, base + y + h, z, 1, 1, 1, yaw);
      roof.dispose();
    };
    shell(88, 100, 38, 0);
    box('stone', 0, 39, 0, 90, 2, 102);
    if (style === 'lens') {
      const { walls, roof } = ellipticalTowerGeometry(78, 90, height - 48, 0.7);
      batch.add(walls, 'silverGlass', x, base + 40, z, 1, 1, 1, yaw);
      batch.add(roof, 'roof', x, base + 40, z, 1, 1, 1, yaw);
      walls.dispose();
      roof.dispose();
      for (const sign of [-1, 1])
        box('stone', sign * 24, height * 0.45, 0, 2.8, height * 0.8, 8);
    } else {
      const lower = height * 0.58,
        upper = height - 40 - lower;
      shell(74, 86, lower, 40, 0.86);
      shell(52, 62, upper, 40 + lower, 0.86);
      for (const side of [-1, 1])
        for (const dx of [-24, 0, 24]) {
          const a = new THREE.Vector3(
            x + dx * Math.cos(yaw) + side * 43 * Math.sin(yaw),
            base + 40,
            z - dx * Math.sin(yaw) + side * 43 * Math.cos(yaw),
          );
          const b = new THREE.Vector3(
            x + dx * 0.86 * Math.cos(yaw) + side * 43 * 0.86 * Math.sin(yaw),
            base + 40 + lower,
            z - dx * 0.86 * Math.sin(yaw) + side * 43 * 0.86 * Math.cos(yaw),
          );
          const g = new THREE.BoxGeometry(1.6, a.distanceTo(b), 1.4);
          g.applyQuaternion(
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              b.clone().sub(a).normalize(),
            ),
          );
          const mid = a.clone().add(b).multiplyScalar(0.5);
          batch.add(g, 'stone', mid.x, mid.y, mid.z);
          g.dispose();
        }
      box('dark', 0, lower + 42, 0, 65, 4, 76);
      box('warm', 0, lower + 44.2, -38.1, 52, 0.18, 0.12);
      box('dark', 0, height + 3, 0, 40, 6, 50);
      for (const dx of [-16, 16]) box('steel', dx, height + 8, 0, 2, 16, 44);
    }
    box('steel', 0, height + 12, 0, 1.2, 20, 1.2);
    box('red', 0, height + 22, 0, 1.5, 0.5, 1.5);
  }
}
