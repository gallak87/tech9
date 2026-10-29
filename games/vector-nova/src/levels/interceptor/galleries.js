import * as T from 'three';
import { buildColossusHalls } from '../colossus/environment/halls.js';
import { createProcessBuilder } from './construction.js';
import { emitServiceWalk } from './service-details.js';

export function createDispatchGalleries({ track, terrain, kit, palette }) {
  const b = createProcessBuilder(
    kit,
    'Dispatch / connected open production galleries',
  );
  const intervals = [
    ['screw', 0.12, 0.22],
    ['press', 0.23, 0.3],
    ['crossfeed', 0.43, 0.54],
    ['cooling', 0.55, 0.65],
    ['return', 0.79, 0.87],
    ['headstock', 0.89, 0.98],
  ];
  const site = {
    ...track,
    sections: intervals.map(([id, start, end]) => ({
      id,
      start: start * track.length,
      end: end * track.length,
    })),
  };
  const up = new T.Vector3(0, 1, 0),
    one = new T.Vector3(1, 1, 1);
  const route = Array.from(
    { length: Math.ceil(track.length / 8) },
    (_, index) => track.sample(index * 8).position,
  );
  const inactive = intervals.filter(
    ([id]) => id === 'screw' || id === 'cooling',
  );
  const inactiveAt = (distance) =>
    inactive.some(
      ([, start, end]) =>
        distance >= start * track.length && distance <= end * track.length,
    );
  const uprightMatrix = (distance) => {
    const frame = track.sample(distance),
      forward = frame.tangent.clone().setY(0).normalize(),
      right = up.clone().cross(forward);
    // Fewer unequal districts leave broad process vistas between them. Lower
    // occupied service floors replace the anonymous hundred-metre empty legs.
    let drop =
      distance > track.length * 0.43 && distance < track.length * 0.54
        ? 70
        : distance > track.length * 0.79 && distance < track.length * 0.87
          ? 45
          : distance > track.length * 0.89
            ? 25
            : 0;
    const matrix = new T.Matrix4()
      .makeBasis(right, up, forward)
      .setPosition(frame.position.clone().add(new T.Vector3(0, -drop, 0)));
    matrix.dispatchStation = distance;
    return matrix;
  };
  const bodyClear = (size, position, matrix) => {
    if (inactiveAt(matrix.dispatchStation)) return false;
    const transform = matrix
      .clone()
      .multiply(new T.Matrix4().makeTranslation(...position))
      .invert();
    return !route.some((point) => {
      const local = point.clone().applyMatrix4(transform);
      return (
        Math.abs(local.x) < size[0] / 2 + 42 &&
        Math.abs(local.y) < size[1] / 2 + 24 &&
        Math.abs(local.z) < size[2] / 2 + 42
      );
    });
  };
  const framedOpening = (width, height, depth, border) => {
    const outline = new T.Shape(
      [
        [-width / 2 + 2, -height / 2],
        [width / 2 - 2, -height / 2],
        [width / 2, -height / 2 + 2],
        [width / 2, height / 2 - 2],
        [width / 2 - 2, height / 2],
        [-width / 2 + 2, height / 2],
        [-width / 2, height / 2 - 2],
        [-width / 2, -height / 2 + 2],
      ].map((p) => new T.Vector2(...p)),
    );
    const w = width / 2 - border,
      h = height / 2 - border;
    outline.holes.push(
      new T.Path(
        [
          [-w, -h],
          [-w, h],
          [w, h],
          [w, -h],
        ].map((p) => new T.Vector2(...p)),
      ),
    );
    const geometry = new T.ExtrudeGeometry(outline, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.7,
      bevelThickness: 0.7,
      bevelSegments: 2,
      steps: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  };
  let builtParts = 0;
  buildColossusHalls({
    track: site,
    kit,
    uprightMatrix,
    bodyClear,
    cladding: palette.cladding,
    warmCladding: palette.warmCladding,
    coolCladding: palette.coolCladding,
    putBox(material, size, position, matrix, name) {
      const location = new T.Vector3(...position).applyMatrix4(matrix);
      const rotation = new T.Quaternion();
      matrix.decompose(new T.Vector3(), rotation, one);
      const localBox = (finish, dimensions, shift, bevel = 0.6) =>
        b.box(
          finish,
          dimensions,
          new T.Vector3(...position)
            .add(new T.Vector3(...shift))
            .applyMatrix4(matrix)
            .toArray(),
          rotation,
          bevel,
        );
      if (name.endsWith('service end cheek')) {
        const side = Math.sign(position[2]) || 1;
        b.add(
          framedOpening(size[0], size[1], size[2], 9),
          material,
          location.toArray(),
          rotation,
        );
        b.add(
          framedOpening(size[0] - 10, size[1] - 10, 4, 3),
          kit.materials.dark,
          location
            .clone()
            .add(new T.Vector3(0, 0, side).applyQuaternion(rotation))
            .toArray(),
          rotation,
        );
        localBox(
          kit.materials.dark,
          [size[0] - 20, size[1] - 20, 1.5],
          [0, 0, -side * 14],
        );
        // Occupied rooms are grouped in service-floor bands inside a much
        // larger process frame, rather than one hundred-metre glass screen.
        for (const level of [-0.3, 0, 0.3]) {
          const y = size[1] * level;
          localBox(
            kit.materials.steel,
            [size[0] - 17, 2.4, 13],
            [0, y - 6.2, -side * 2],
          );
          for (const room of [-1, 0, 1]) {
            localBox(
              palette.glazing,
              [(size[0] - 30) / 3, 9.5, 1.5],
              [(room * (size[0] - 23)) / 3, y, -side * 6],
            );
            localBox(
              palette.warm,
              [(size[0] - 37) / 3, 0.7, 1],
              [(room * (size[0] - 23)) / 3, y - 3.7, -side * 4.7],
              0.15,
            );
          }
        }
        localBox(kit.materials.steel, [2.2, size[1] - 18, 4], [0, 0, side]);
      } else {
        b.box(material, size, location.toArray(), rotation, 1);
        if (name.endsWith('recessed service rear')) {
          const side = Math.sign(position[0]);
          for (const z of [-1, 0, 1]) {
            const depth = size[2] / 3 - 11;
            localBox(
              kit.materials.dark,
              [2, size[1] - 17, depth],
              [side * (size[0] / 2 + 1), 0, (z * size[2]) / 3],
            );
            localBox(
              material,
              [2.5, size[1] - 25, depth - 8],
              [side * (size[0] / 2 + 4), 0, (z * size[2]) / 3],
            );
          }
          // Three coherent occupied levels share the hall's existing load
          // frame. Worker-height rails/fixtures establish the immense scale.
          for (const level of [8, 42, 76]) {
            const y = position[1] - size[1] / 2 + level;
            if (y > position[1] + size[1] / 2 - 10) continue;
            const local = createProcessBuilder(kit, 'local service walk');
            emitServiceWalk(local, {
              x: position[0] - side * 86,
              y,
              z: position[2],
              length: size[2] - 16,
              side,
              steel: kit.materials.steel,
              dark: kit.materials.dark,
              warm: palette.warm,
            });
            const walk = local.finish();
            walk.group.traverse((object) => {
              if (object.isMesh)
                b.add(
                  object.geometry.clone().applyMatrix4(matrix),
                  object.material,
                );
            });
            walk.dispose();
          }
        }
      }
      builtParts++;
    },
    foundation(top, width, depth) {
      const ground = terrain.heightAt(top.x, top.z),
        height = Math.max(14, top.y - ground);
      const center = top.clone().add(new T.Vector3(0, -height / 2, 0));
      b.box(
        kit.materials.cast,
        [width, height, depth],
        center.toArray(),
        undefined,
        2,
      );
      b.box(
        palette.foundation,
        [width + 20, 13, depth + 22],
        [top.x, top.y - height + 2, top.z],
        undefined,
        2,
      );
      b.box(
        kit.materials.steel,
        [width + 8, 8, depth + 8],
        [top.x, top.y + 2, top.z],
        undefined,
        1,
      );
    },
  });
  const result = b.finish();
  result.group.userData.screenedProductionParts = builtParts;
  return result;
}
