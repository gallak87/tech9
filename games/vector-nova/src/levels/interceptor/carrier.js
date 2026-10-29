import * as T from 'three';
import { sweepGeometry } from '../../track/geometry.js';
import { createProcessBuilder } from './construction.js';

export function createDispatchCarrier({ track, terrain, kit, palette }) {
  const b = createProcessBuilder(
    kit,
    'Dispatch / continuous load carrier and grouped bearing piers',
  );
  const { dark, cast, steel, shell } = kit.materials;
  for (const side of [-1, 1]) {
    const x = side * 16;
    const geometry = sweepGeometry(
      track,
      [
        [x - 6, -4.6],
        [x - 9, -10],
        [x - 7, -30],
        [x + 7, -30],
        [x + 9, -10],
        [x + 6, -4.6],
        [x - 6, -4.6],
      ],
      { step: 7 },
    );
    geometry.deleteAttribute('roadCoord');
    b.add(geometry, dark);
    const flange = sweepGeometry(
      track,
      [
        [x - 9, -9],
        [x - 9, -13],
        [x + 9, -13],
        [x + 9, -9],
      ],
      { step: 7 },
    );
    flange.deleteAttribute('roadCoord');
    b.add(flange, steel);
  }
  // Bridge loads land on a paired, battered bearing group every 132 metres.
  // No new running surface/contact is introduced above the existing road.
  const worldUp = new T.Vector3(0, 1, 0);
  for (
    let distance = 25, index = 0;
    distance < track.length;
    distance += 132, index++
  ) {
    const f = track.sample(distance),
      right = new T.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    const head = f.position.clone().addScaledVector(f.up, -31);
    const rotation = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(
        right,
        worldUp,
        f.tangent.clone().setY(0).normalize(),
      ),
    );
    b.box(cast, [77, 15, 37], head.toArray(), rotation, 2);
    b.box(
      steel,
      [84, 5, 41],
      head
        .clone()
        .add(new T.Vector3(0, 9, 0))
        .toArray(),
      rotation,
      1,
    );
    for (const side of [-1, 1]) {
      const top = head.clone().addScaledVector(right, side * 26);
      const ground = terrain.heightAt(top.x, top.z);
      const foot = top.clone().setY(Math.min(top.y - 16, ground));
      const height = top.y - foot.y;
      const center = top.clone().add(foot).multiplyScalar(0.5);
      b.add(
        new T.CylinderGeometry(12, 19, height, 8),
        palette.foundation,
        center.toArray(),
        rotation,
      );
      b.box(
        cast,
        [33, 12, 39],
        top
          .clone()
          .add(new T.Vector3(0, -4, 0))
          .toArray(),
        rotation,
        1.5,
      );
      b.box(
        palette.foundation,
        [48, 13, 56],
        foot
          .clone()
          .add(new T.Vector3(0, 3, 0))
          .toArray(),
        rotation,
        2,
      );
      b.beam(
        steel,
        top
          .clone()
          .addScaledVector(right, -side * 12)
          .toArray(),
        top
          .clone()
          .add(new T.Vector3(0, -30, 0))
          .addScaledVector(right, side * 7)
          .toArray(),
        8,
        11,
      );
    }
    if (index % 3 === 1) {
      const fascia = head
        .clone()
        .addScaledVector(right, 44)
        .add(new T.Vector3(0, -5, 0));
      b.box(shell, [9, 17, 37], fascia.toArray(), rotation, 1);
    }
  }
  return b.finish();
}
