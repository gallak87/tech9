import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  groundFrame,
  createRouteClearance,
} from '../../../environment/placement.js';
import { finishZephyrMaterial } from './materials.js';

// Bronze wall brackets make the warm aisle pools belong to visible fixtures.
export function createZephyrPracticals(track) {
  const group = new T.Group();
  group.name = 'Zephyr / sheltered bronze aisle lanterns';
  const bronze = new T.MeshStandardMaterial({
    name: 'Zephyr lantern bronze',
    color: '#624b32',
    metalness: 0.68,
    roughness: 0.42,
  });
  finishZephyrMaterial(bronze);
  const lens = new T.MeshStandardMaterial({
    name: 'Zephyr amber lantern glass',
    color: '#ffbc72',
    emissive: '#ff923f',
    emissiveIntensity: 1.25,
    roughness: 0.45,
  });
  const metalParts = [],
    lensParts = [],
    unit = new T.BoxGeometry();
  const clearance = createRouteClearance(track, {
    sidePadding: 16,
    localVertical: [-25, 35],
  });
  const rose = track.landmarks.roseWindow.s,
    chapel = track.landmarks.chapelLanding.s;
  const stops = [rose + 64, rose + 153, chapel + 60, chapel + 125];
  for (const s of stops)
    for (const side of [-1, 1]) {
      const f = groundFrame(track, s),
        yaw = Math.atan2(f.tangent.x, f.tangent.z);
      const p = f.position
        .clone()
        .addScaledVector(f.right, side * 49)
        .addScaledVector(f.up, 26);
      if (!clearance.clears(p.x, p.z, 10, 8, p.y + 5, yaw, p.y - 5)) continue;
      const box = (x, y, z, w, h, d, parts = metalParts) => {
        const at = p
          .clone()
          .addScaledVector(f.right, x)
          .addScaledVector(f.up, y)
          .addScaledVector(f.tangent, z);
        parts.push(
          unit
            .clone()
            .applyMatrix4(
              new T.Matrix4().compose(
                at,
                new T.Quaternion().setFromAxisAngle(f.up, yaw),
                new T.Vector3(w, h, d),
              ),
            ),
        );
      };
      for (const x of [-1.5, 1.5])
        for (const z of [-1.5, 1.5]) box(x, 0, z, 0.24, 5, 0.24);
      for (const y of [-2.7, 2.7]) box(0, y, 0, 3.9, 0.6, 3.9);
      box(side * 4.5, 3, 0, 9, 0.6, 0.7);
      box(side * 9, 3, 0, 1.5, 5, 3);
      box(0, 0, 0, 2.7, 4.5, 2.7, lensParts);
      const light = new T.PointLight('#ffc180', 1250, 72, 1.7);
      light.position.copy(p);
      group.add(light);
    }
  unit.dispose();
  for (const [parts, material] of [
    [metalParts, bronze],
    [lensParts, lens],
  ]) {
    if (!parts.length) {
      material.dispose();
      continue;
    }
    const geometry = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
