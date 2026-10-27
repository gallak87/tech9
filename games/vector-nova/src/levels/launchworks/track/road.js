import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry } from '../../../track/geometry.js';
import { disposeGroup } from '../../../pickups/geometry.js';
import { createOrbitalMaterials } from '../../orbital/environment/materials.js';

export function createLaunchworksRoad({ track }) {
  const group = new T.Group();
  group.name = 'Launchworks / five transfer aprons';
  const kit = createOrbitalMaterials(),
    borrowed = new Set();
  const surface = kit.titanium;
  surface.color.set('#586a72');
  surface.roughness = 0.58;
  const shoulder = kit.ceramic;
  const dark = kit.dark;
  const red = new T.MeshStandardMaterial({
    color: '#d54d28',
    emissive: '#802311',
    emissiveIntensity: 0.45,
    roughness: 0.5,
  });
  const mint = new T.MeshStandardMaterial({
    color: '#8ee0cf',
    emissive: '#2f796d',
    emissiveIntensity: 0.7,
    roughness: 0.5,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const zones = [];
  function sweep(name, start, end, profile, material) {
    const mesh = new T.Mesh(
      sweepGeometry(track, profile, { start, end, step: 3 }),
      material,
    );
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const runs = [];
  let start = 0;
  for (const jump of track.jumps) {
    runs.push([start, jump.takeoff]);
    start = jump.landingStart;
  }
  runs.push([start, track.length]);
  for (const [a, b] of runs) {
    const deck = sweep(
      'Structural running deck',
      a,
      b,
      [
        [-19, 0],
        [19, 0],
      ],
      surface,
    );
    deck.userData.drivingSurface = true;
    deck.userData.roadSurface = true;
    sweep(
      'Load-bearing box keel',
      a,
      b,
      [
        [-19, -0.08],
        [-17, -4],
        [17, -4],
        [19, -0.08],
      ],
      dark,
    );
    for (const side of [-1, 1]) {
      sweep(
        'Ceramic containment shoulder',
        a,
        b,
        [
          [side * 17.8, 0.025],
          [side * 19, 0.025],
        ],
        shoulder,
      );
      sweep(
        'Low outboard rail',
        a,
        b,
        [
          [side * 19, 0],
          [side * 19, 0.8],
          [side * 19.5, 0.8],
        ],
        shoulder,
      );
    }
    for (let joint = a + 24; joint < b - 2; joint += 24)
      sweep(
        'Flush expansion joint',
        joint,
        joint + 0.12,
        [
          [-17.7, 0.025],
          [17.7, 0.025],
        ],
        dark,
      );
  }
  for (const [i, jump] of track.jumps.entries()) {
    for (let mark = 0; mark < 7; mark++) {
      const s = jump.takeoff - 85 + mark * 11;
      sweep(
        'Launch timing inlay',
        s,
        s + 1.4,
        [
          [-15, 0.035],
          [15, 0.035],
        ],
        red,
      );
    }
    const zone = sweep(
      'Catch slope / mint runway',
      jump.target - 130,
      jump.target + 130,
      [
        [jump.targetLateral - 5.5, 0.04],
        [jump.targetLateral + 5.5, 0.04],
      ],
      mint.clone(),
    );
    zones.push({ id: jump.id, zone });
    sweep(
      'Perfect catch center',
      jump.target - 2,
      jump.target + 2,
      [
        [jump.targetLateral - 5.5, 0.06],
        [jump.targetLateral + 5.5, 0.06],
      ],
      shoulder,
    );
    for (const side of [-1, 1]) {
      const frame = track.sample(jump.landingStart + 20);
      const tower = new T.Mesh(new T.BoxGeometry(3, 45, 7), dark);
      tower.position
        .copy(frame.position)
        .addScaledVector(frame.right, side * 25)
        .addScaledVector(frame.up, 15);
      tower.quaternion.copy(frame.quaternion);
      group.add(tower);
      const signal = new T.Mesh(new T.BoxGeometry(3.1, 20, 1), red);
      signal.position.copy(tower.position).addScaledVector(frame.tangent, -3.6);
      signal.quaternion.copy(frame.quaternion);
      group.add(signal);
      tower.name = `Receiver ${i + 1} / outboard approach mast`;
    }
  }
  // Floor details share two batches; their visual density must not become
  // hundreds of extra draw calls during a high-speed landing.
  for (const name of ['Flush expansion joint', 'Launch timing inlay']) {
    const parts = group.children.filter((mesh) => mesh.name === name);
    if (!parts.length) continue;
    const mesh = new T.Mesh(
      mergeGeometries(parts.map((part) => part.geometry)),
      parts[0].material,
    );
    mesh.name = name;
    group.add(mesh);
    for (const part of parts) {
      part.removeFromParent();
      part.geometry.dispose();
    }
  }
  mint.dispose();
  return {
    group,
    setReflection(texture) {
      borrowed.add(texture);
      for (const material of [surface, shoulder, dark]) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    update(frame) {
      const fs = frame.motion?.freestyle ?? frame.motion?.motion?.freestyle;
      if (!fs) return;
      for (const { id, zone } of zones) {
        const leg = fs.legs.find((l) => l.id === id);
        zone.material.emissiveIntensity =
          0.7 +
          (leg?.clean && !frame.settings.reducedMotion
            ? Math.exp(-Math.max(0, fs.clock - leg.at) * 6) * 1.3
            : 0);
      }
    },
    dispose() {
      const textures = new Set();
      for (const material of Object.values(kit))
        for (const value of Object.values(material))
          if (value?.isTexture && !borrowed.has(value)) textures.add(value);
      disposeGroup(group);
      for (const material of Object.values(kit)) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
