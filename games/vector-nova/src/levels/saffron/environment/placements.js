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
  for (let s = 60; s < track.length; s += 190) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
      if (
        side < 0 &&
        s > track.landmarks.vistaStart - 180 &&
        s < track.landmarks.vistaEnd + 160
      )
        continue;
      const scale = 0.55 + random() * 0.8;
      const position = frame.position
        .clone()
        .addScaledVector(
          frame.right,
          side * (190 + scale * 95 + random() * 130),
        );
      if (!survey.clears(position, scale * 185)) continue;
      position.y = survey.heightAt(position.x, position.z) - 14;
      const rotation = new T.Quaternion().setFromAxisAngle(
        UP,
        -0.65 + (random() - 0.5) * 0.55,
      );
      placements[random() > 0.5 ? 'dune' : 'dune_1'].push(
        matrixAt(
          position,
          new T.Vector3(scale, scale * (0.8 + random() * 0.6), scale),
          rotation,
        ),
      );
    }
  }
  for (let s = 10; s < track.length; s += 175) {
    const frame = horizontalFrame(track, s);
    for (const side of [-1, 1]) {
      const scale = 0.6 + random() * 0.75;
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (220 + random() * 175));
      if (!survey.clears(position, scale * 92)) continue;
      const inVista =
        s > track.landmarks.vistaStart - 130 &&
        s < track.landmarks.vistaEnd + 100;
      if (inVista && side < 0) continue;
      position.y = survey.heightAt(position.x, position.z) - 10;
      placements[random() > 0.46 ? 'outcrop' : 'outcrop_1'].push(
        matrixAt(
          position,
          new T.Vector3(
            scale * (1 + random() * 0.5),
            scale * (0.6 + random() * 0.8),
            scale,
          ),
          new T.Quaternion().setFromAxisAngle(UP, random() * 6.28),
        ),
      );
    }
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
  for (const [index, [s, lateral]] of sandfallAnchors(track).entries()) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, lateral);
    position.y = survey.heightAt(position.x, position.z) - 4;
    placements.dune.push(
      matrixAt(
        position,
        new T.Vector3(0.18 + index * 0.012, 0.14 + index * 0.015, 0.18),
        frame.quaternion,
      ),
    );
    const spread = position
      .clone()
      .addScaledVector(frame.right, index % 2 ? -18 : 20)
      .addScaledVector(frame.forward, 12);
    spread.y = survey.heightAt(spread.x, spread.z) - 3;
    placements.dune_1.push(
      matrixAt(spread, new T.Vector3(0.15, 0.1, 0.18), frame.quaternion),
    );
  }
  return placements;
}
