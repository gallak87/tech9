import * as T from 'three';
import { loadUmbraAssets, createAssetInstances } from './assets.js';
import { createUmbraAccretion } from './accretion.js';
import { createUmbraConstruction } from './construction.js';
import { RING_CENTER } from './constants.js';

const RADII = {
  terrace: 106,
  lens: 150,
  vault: 142,
  instrument: 203,
  rib: 73,
  gallery: 154,
  pier: 66,
  wall: 156,
};
const pose = new T.Object3D();

/** Conservative sphere clearance also reserves both real airborne corridors.
 * Route builder's nominal flight uses an inward arc relative to sampled road;
 * the 62m reservation covers that deviation, road width and chase camera. */
export function createUmbraSceneryLayout(track) {
  const route = [];
  for (let s = 0; s < track.length; s += 14)
    route.push(track.sample(s).position.clone());
  const entries = [];
  const viewpoints = [1660, 1740, 1820].map((s) =>
    track
      .sample(s)
      .position.clone()
      .add(new T.Vector3(0, 7, 0)),
  );
  const eventSilhouettes = [
    new T.Vector3(-300, 365, -1050),
    new T.Vector3(-620, 575, -1100),
    new T.Vector3(-890, 520, -1200),
  ];
  const sightlineBlocked = (position, radius) =>
    viewpoints.some((eye) =>
      eventSilhouettes.some((hero) => {
        const direction = hero.clone().sub(eye);
        const t =
          position.clone().sub(eye).dot(direction) / direction.lengthSq();
        return (
          t > 0 &&
          t < 1 &&
          eye.clone().addScaledVector(direction, t).distanceTo(position) <
            radius + 70
        );
      }),
    );
  const distance = (position) =>
    Math.sqrt(
      Math.min(...route.map((point) => point.distanceToSquared(position))),
    );
  function add(type, position, scale, rotation, role, clearance = 38) {
    const radius = RADII[type] * scale;
    pose.position.copy(position);
    pose.rotation.set(...rotation);
    pose.scale.setScalar(scale);
    pose.updateMatrix();
    // Long route-parallel walls use their conservative actual local bounds.
    // A bounding sphere would force their thin front face far outside the view.
    const inverse = pose.matrix.clone().invert();
    const wallBounds = new T.Box3(
      new T.Vector3(-80, -70, -27),
      new T.Vector3(80, 80, 27),
    );
    const margin =
      role === 'route-gallery'
        ? Math.min(
            ...route.map(
              (point) =>
                wallBounds.distanceToPoint(
                  point.clone().applyMatrix4(inverse),
                ) * scale,
            ),
          )
        : distance(position) - radius;
    if (
      ['connector', 'distant', 'near-load-node', 'route-gallery'].includes(
        role,
      ) &&
      sightlineBlocked(position, radius)
    )
      return false;
    if (margin < clearance) return false;
    entries.push({
      type,
      matrix: pose.matrix.clone(),
      position: position.toArray(),
      scale,
      radius,
      routeMargin: margin,
      role,
    });
    return true;
  }
  for (let index = 0; index < 43; index++) {
    const s = (track.length * index) / 43;
    const frame = track.sample(s),
      side = index % 2 ? -1 : 1;
    const type = [
      'wall',
      'rib',
      'gallery',
      'pier',
      'terrace',
      'instrument',
      'vault',
    ][index % 7];
    const scale =
      type === 'instrument'
        ? 0.48
        : type === 'terrace'
          ? 0.82 + (index % 3) * 0.1
          : type === 'gallery'
            ? 0.74
            : 0.6 + (index % 3) * 0.13;
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + side * 0.24;
    // World-upright ruins remain a stable spatial reference through inversion.
    const lateral = new T.Vector3(frame.tangent.z, 0, -frame.tangent.x)
      .normalize()
      .multiplyScalar(side);
    for (const offset of [125, 170, 230, 320, 425]) {
      const position = frame.position.clone().addScaledVector(lateral, offset);
      position.y -=
        type === 'terrace'
          ? 12
          : type === 'gallery'
            ? 28
            : 55 + (index % 4) * 12;
      if (
        add(
          type,
          position,
          scale,
          [0.08 * Math.sin(index), yaw, 0.08 * Math.cos(index)],
          'connector',
        )
      )
        break;
    }
  }
  for (let index = 0; index < 44; index++) {
    const s = (track.length * (index + 0.4)) / 44;
    if (
      track.jumps.some(
        (jump) => s > jump.takeoff - 140 && s < jump.landingEnd + 40,
      )
    )
      continue;
    const frame = track.sample(s),
      side = index % 2 ? -1 : 1;
    const lateral = new T.Vector3(frame.tangent.z, 0, -frame.tangent.x)
      .normalize()
      .multiplyScalar(side);
    for (const offset of [86, 110, 146, 190]) {
      const position = frame.position.clone().addScaledVector(lateral, offset);
      position.y -= 8 + (index % 3) * 8;
      if (
        add(
          'pier',
          position,
          0.6 + (index % 3) * 0.055,
          [
            0,
            Math.atan2(frame.tangent.x, frame.tangent.z) + side * 0.16,
            index % 2 ? 0.05 : -0.04,
          ],
          'near-load-node',
        )
      )
        break;
    }
  }
  // Road-parallel observatory galleries place actual stone mass above eye level
  // in ordinary chase views. Their portals and service shelves face the route.
  for (const [index, s] of [
    185, 385, 610, 910, 2150, 2500, 3050, 4220, 4560, 5000, 5230,
  ].entries()) {
    const frame = track.sample(s),
      side = index % 3 === 1 ? -1 : 1;
    const lateral = new T.Vector3(frame.tangent.z, 0, -frame.tangent.x)
      .normalize()
      .multiplyScalar(side);
    const scale = 0.55 + (index % 3) * 0.065;
    for (const offset of [65, 82, 105, 132, 164, 210, 270]) {
      const position = frame.position.clone().addScaledVector(lateral, offset);
      position.y += 24 + (index % 3) * 9;
      if (
        add(
          'wall',
          position,
          scale,
          [
            0,
            Math.atan2(frame.tangent.x, frame.tangent.z) + Math.PI / 2,
            side * 0.055,
          ],
          'route-gallery',
        )
      )
        break;
    }
  }
  // Secondary away-from-ring districts: architectural silhouettes, never empty
  // reverse vistas or unrelated primitive blocks.
  for (let index = 0; index < 16; index++) {
    const angle = (index / 16) * Math.PI * 2;
    const position = new T.Vector3(
      Math.cos(angle) * (770 + (index % 3) * 120),
      40 + (index % 4) * 66,
      Math.sin(angle) * (700 + (index % 2) * 170),
    );
    add(
      index % 3 ? 'instrument' : 'vault',
      position,
      0.6 + (index % 3) * 0.2,
      [index * 0.025, angle + Math.PI / 2, index % 2 ? 0.09 : -0.13],
      'distant',
    );
  }
  const lensFrame = track.sample(1680);
  const lensPosition = lensFrame.position
    .clone()
    .add(new T.Vector3(100, 100, -470));
  add('lens', lensPosition, 1.42, [0.18, -0.63, -0.38], 'tilted-lens', 65);
  const vaultFrame = track.sample(2520);
  add(
    'vault',
    vaultFrame.position.clone().add(new T.Vector3(-330, 40, -100)),
    1.3,
    [0.14, 0.37, -0.16],
    'inversion-vault',
    50,
  );
  // The broken architectural obstacles sit gravity-side of the actual gaps,
  // establishing what each deliberately curved flight passes around.
  for (const jump of track.jumps ?? []) {
    const frame = track.sample((jump.takeoff + jump.landingStart) / 2);
    const gravitySide = new T.Vector3(...RING_CENTER).sub(frame.position);
    gravitySide.y = 0;
    gravitySide.normalize();
    for (const offset of [138, 180, 240, 320, 420]) {
      const position = frame.position
        .clone()
        .addScaledVector(gravitySide, offset);
      position.y += jump.id === 'knot-leap' ? 40 : -30;
      if (
        add(
          'rib',
          position,
          0.62,
          [0.28, 0.9, -0.48],
          `${jump.id}-flight-fragment`,
          65,
        )
      )
        break;
    }
  }
  return entries;
}

export async function createUmbraEnvironment({ track, settings = {} }) {
  const assets = await loadUmbraAssets();
  const group = new T.Group();
  group.name = 'umbra-environment';
  try {
    const layout = createUmbraSceneryLayout(track);
    const farGroups = [];
    for (const type of [
      'terrace',
      'lens',
      'vault',
      'instrument',
      'rib',
      'gallery',
      'pier',
      'wall',
    ]) {
      for (const distant of [false, true]) {
        const list = layout.filter(
          (entry) =>
            entry.type === type && (entry.role === 'distant') === distant,
        );
        if (!list.length) continue;
        const batch = createAssetInstances(
          assets.templates[type],
          list.map((entry) => entry.matrix),
          `Umbra / ${distant ? 'far' : 'near'} ${type} architecture`,
        );
        group.add(batch);
        if (distant) farGroups.push(batch);
      }
    }
    const construction = createUmbraConstruction(track, assets, layout);
    group.add(construction.group);
    const accretion = createUmbraAccretion(assets);
    group.add(accretion.group);
    // Motivate cooler navigation shelves and warm ring-facing areas without
    // washing every ruin with the same ambient light.
    for (const [s, color, intensity, height] of [
      [100, '#abcce8', 21000, 65],
      [1050, '#92c4ed', 16000, 65],
      [1750, '#ffd2a0', 26000, 95],
      [2450, '#82b4d7', 14000, -50],
      [3390, '#ffb969', 22000, 70],
      [4500, '#abcde5', 20000, 55],
      [5100, '#99bedc', 13000, 45],
      [500, '#deb78b', 13000, 45],
    ]) {
      const frame = track.sample(s);
      const light = new T.PointLight(color, intensity, 310, 2);
      light.position
        .copy(frame.position)
        .addScaledVector(frame.up, height)
        .addScaledVector(frame.right, 38);
      group.add(light);
    }
    let simulationTime = 0,
      currentSettings = settings;
    group.userData.sceneryLayout = layout.map((entry) => ({
      type: entry.type,
      position: entry.position,
      scale: entry.scale,
      radius: entry.radius,
      routeMargin: entry.routeMargin,
      role: entry.role,
    }));
    group.userData.getUmbraPresentation = () => ({
      ...accretion.getPresentation(),
      sceneryInstances: layout.length,
      minimumSceneryClearance: Math.min(
        ...layout.map((entry) => entry.routeMargin),
      ),
      low: currentSettings.quality === 'low',
      reducedMotion: Boolean(currentSettings.reducedMotion),
    });
    return {
      group,
      update(frame) {
        currentSettings = frame.settings ?? settings;
        if (frame.reset || frame.dt > 0)
          simulationTime = Math.max(0, frame.time ?? 0);
        accretion.update(simulationTime, {
          dt: frame.dt ?? 0,
          reducedMotion: Boolean(currentSettings.reducedMotion),
          quality: currentSettings.quality,
          reset: frame.reset,
        });
        // Low retains all large silhouettes. Their material richness and shape
        // are not quality gated; only small distant accretion counts simplify.
        for (const far of farGroups) far.visible = true;
      },
      reset() {
        simulationTime = 0;
        accretion.update(0, {
          reset: true,
          reducedMotion: Boolean(currentSettings.reducedMotion),
        });
      },
      dispose() {
        construction.dispose();
        accretion.dispose();
        group.traverse((node) => {
          if (node.isInstancedMesh || node.isLight) node.dispose();
        });
        assets.dispose();
        group.clear();
      },
    };
  } catch (error) {
    assets.dispose();
    group.clear();
    throw error;
  }
}
