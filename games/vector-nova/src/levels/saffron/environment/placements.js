import * as T from 'three';
import {
  horizontalFrame,
  matrixAt,
  randomSequence,
  sectionRange,
  UP,
} from './geometry.js';

export function skullPlacement(track) {
  const start = track.sample(track.landmarks.skullStart).position.clone();
  const end = track.sample(track.landmarks.skullEnd).position.clone();
  const forward = end.clone().sub(start).normalize();
  const right = UP.clone().cross(forward).normalize();
  const up = forward.clone().cross(right).normalize();
  const quaternion = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, up, forward),
  );
  const scale = new T.Vector3(1.1, 1, start.distanceTo(end) / 300);
  return {
    position: start,
    quaternion,
    scale,
    matrix: matrixAt(start, scale, quaternion),
  };
}

export function sandfallAnchors(track) {
  return [
    [track.landmarks.sandfall - 40, -70, 58],
    [track.landmarks.sandfall + 80, -70, 66],
    [track.landmarks.skullStart + 60, 85, 58],
    [track.landmarks.skullEnd - 80, -85, 62],
  ];
}

export function buildFossilPlacements(track, survey) {
  const random = randomSequence(0x5aff32);
  const placements = {
    skull: [skullPlacement(track).matrix],
    scapula: [],
    rib: [],
    rib_1: [],
    rib_2: [],
    outcrop: [],
    outcrop_1: [],
    vertebra: [],
    vertebra_1: [],
    vertebra_2: [],
    dune: [],
    dune_1: [],
    sandfall: [],
  };
  const [ribStart, ribEnd] = sectionRange(track, /ribshadow/i, [0.1, 0.22]);
  for (let i = 0; i < 5; i++) {
    const s = T.MathUtils.lerp(ribStart + 20, ribEnd - 20, i / 4);
    const frame = horizontalFrame(track, s);
    const scale = new T.Vector3(
      0.72 + i * 0.061,
      0.7 + (i % 3) * 0.12,
      0.8 + (i % 2) * 0.57,
    );
    const rotation = frame.quaternion
      .clone()
      .multiply(new T.Quaternion().setFromAxisAngle(UP, (i - 2) * 0.026));
    placements[['rib', 'rib_1', 'rib_2'][i % 3]].push(
      matrixAt(
        frame.position.clone().addScaledVector(UP, -17),
        scale,
        rotation,
      ),
    );
  }
  for (const jump of track.jumps.filter((entry) => !entry.optional)) {
    for (const s of [
      jump.takeoff - 27,
      jump.landingStart + 40,
      jump.landingEnd - 26,
    ]) {
      const frame = track.sample(s);
      const position = frame.position.clone().addScaledVector(frame.up, -8.5);
      const scale = new T.Vector3(
        1 + random() * 0.15,
        0.86 + random() * 0.17,
        0.76 + random() * 0.16,
      );
      const variant = ['vertebra', 'vertebra_1', 'vertebra_2'][
        Math.floor(s) % 3
      ];
      placements[variant].push(matrixAt(position, scale, frame.quaternion));
    }
  }
  // Half-buried lateral vertebrae carry the fossil into the panorama, with
  // irregular spacing and fracture angles instead of a road-sized tube tunnel.
  for (
    let s = track.landmarks.vistaStart - 70;
    s < track.landmarks.vistaEnd - 60;
    s += 130 + random() * 50
  ) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (175 + random() * 90));
      if (side < 0 && s > track.landmarks.vistaStart + 230) continue;
      if (!survey.clears(position, 98)) continue;
      position.y = survey.heightAt(position.x, position.z) - 35;
      const rotation = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromEuler(
            new T.Euler(0.02, (random() - 0.5) * 0.13, side * 0.12),
          ),
        );
      placements.vertebra.push(
        matrixAt(
          position,
          new T.Vector3(1.05, 1.1 + random() * 0.24, 0.9),
          rotation,
        ),
      );
      if (side < 0)
        placements.rib.push(
          matrixAt(position, new T.Vector3(1.6, 1.8, 1.9), rotation),
        );
    }
  }
  const [returnStart] = sectionRange(track, /return/i, [0.88, 1]);
  for (let i = 0; i < 4; i++) {
    const frame = horizontalFrame(track, returnStart + 45 + i * 65);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, (i % 2 ? -1 : 1) * 120);
    if (!survey.clears(position, 76)) continue;
    position.y = survey.heightAt(position.x, position.z) - 72;
    placements.rib.push(
      matrixAt(position, new T.Vector3(0.73, 0.86, 1.3), frame.quaternion),
    );
  }
  // Unequal fossil beds make the ordinary crests part of the excavation.
  // Their roots share a surveyed burial plane; the Vista's open grazer side
  // remains clear, and large outboard blades never become an extra road arch.
  const beds = [
    [120, -1, 1.55, 1.9, 'rib_1'],
    [340, 1, 1.45, 1.65, 'rib_2'],
    [track.landmarks.sandfall - 100, 1, 1.7, 1.9, 'rib_1'],
    [track.landmarks.skullStart - 340, 1, 1.8, 2.05, 'rib_2'],
    [track.landmarks.skullEnd + 220, -1, 1.4, 1.65, 'rib_1'],
    [returnStart - 250, 1, 1.7, 1.3, 'rib_2', 0.38],
    [returnStart + 90, 1, 1.75, 1.45, 'rib_1', -0.42],
    [returnStart + 245, -1, 1.7, 1.15, 'rib_2', 0.32],
  ];
  for (const [s, side, width, height, family, lean = 0.03] of beds) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, side * (width * 110 + 115));
    if (!survey.clears(position, width * 115)) continue;
    const rotation = frame.quaternion
      .clone()
      .multiply(
        new T.Quaternion().setFromEuler(
          new T.Euler(lean, side * 0.18, side * 0.08),
        ),
      );
    const roots = [
      [-91, -37, 8],
      [98, -39, 15],
    ].map(([x, y, z]) =>
      new T.Vector3(x * width, y * height, z * 2.25).applyQuaternion(rotation),
    );
    position.y =
      Math.min(
        ...roots.map(
          (root) =>
            survey.heightAt(position.x + root.x, position.z + root.z) - root.y,
        ),
      ) - 20;
    placements[family].push(
      matrixAt(position, new T.Vector3(width, height, 2.25), rotation),
    );
    const centrum = position
      .clone()
      .addScaledVector(frame.forward, -70)
      .addScaledVector(frame.right, side * 40);
    centrum.y = survey.heightAt(centrum.x, centrum.z) - 34;
    if (survey.clears(centrum, 125))
      placements.vertebra_2.push(
        matrixAt(centrum, new T.Vector3(1.25, 0.8, 1.9), rotation),
      );
  }
  // Continuous terrain and seated bedrock replace floating dune tiles and
  // repeated isolated pancake outcrops. Effects own terrain-matched receiving fans.
  for (const [s, side, scale, yaw] of [
    [220, 1, 0.95, 0.42],
    [track.landmarks.vistaStart + 345, 1, 1.15, -0.24],
    [returnStart - 340, -1, 1.05, 0.7],
  ]) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, side * (scale * 125 + 125));
    if (!survey.clears(position, scale * 145)) continue;
    position.y = survey.heightAt(position.x, position.z) - 14;
    const rotation = frame.quaternion
      .clone()
      .multiply(
        new T.Quaternion().setFromEuler(new T.Euler(0.08, yaw, side * 0.12)),
      );
    placements.scapula.push(
      matrixAt(
        position,
        new T.Vector3(scale, scale * 0.95, scale * 1.2),
        rotation,
      ),
    );
  }
  for (const [s, lateral, height] of sandfallAnchors(track)) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, lateral)
      .addScaledVector(UP, height);
    const drop = position.y - survey.heightAt(position.x, position.z) + 4;
    placements.sandfall.push(
      matrixAt(
        position,
        new T.Vector3(0.8, Math.max(0.8, drop / 80), 0.8),
        frame.quaternion,
      ),
    );
  }
  return placements;
}
