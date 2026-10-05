import * as T from 'three';
import { beam, horizontalFrame } from './geometry.js';

export function createSurveyStation(track, survey, materials, resources) {
  const group = new T.Group();
  group.name = 'Saffron / bone-suspended Ochre Anchorage survey station';
  const frame = horizontalFrame(track, 85);
  group.position.copy(frame.position).addScaledVector(frame.right, -91);
  group.quaternion.copy(frame.quaternion);
  const floorY =
    survey.heightAt(group.position.x, group.position.z) - group.position.y;
  function box(name, dimensions, position, material) {
    const mesh = new T.Mesh(
      resources.geometry(new T.BoxGeometry(...dimensions)),
      material,
    );
    mesh.name = `Saffron / station ${name}`;
    mesh.position.set(...position);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  box('suspended survey platform', [42, 2.3, 43], [0, 8, 0], materials.ceramic);
  box('lower structural hull', [34, 3, 32], [0, 5.8, 0], materials.dark);
  box('field laboratory', [24, 7, 22], [1, 12.5, 3], materials.ceramic);
  box('smoked panoramic window', [24.3, 3.4, 14], [1, 13, 3], materials.window);
  box('laboratory roof', [29, 1.2, 27], [1, 16.5, 3], materials.ceramic);
  box('arrival apron', [15, 1.1, 16], [26, 7.6, -7], materials.dark);
  for (const x of [-18, 18]) {
    const points = [
      new T.Vector3(x * 1.3, floorY, 13),
      new T.Vector3(x * 1.28, 12, 8),
      new T.Vector3(x, 33, 0),
      new T.Vector3(x * 0.45, 38, -8),
    ];
    const bone = new T.Mesh(
      resources.geometry(
        new T.TubeGeometry(new T.CatmullRomCurve3(points), 16, 3.8, 7, false),
      ),
      materials.bone,
    );
    bone.name = 'Saffron / excavated station suspension fossil';
    bone.castShadow = true;
    group.add(bone);
    for (const z of [-15, 15]) {
      beam(
        group,
        resources,
        'Saffron / taut station suspension cables',
        new T.Vector3(x, 31, -1),
        new T.Vector3(x, 9, z),
        0.23,
        materials.dark,
      );
    }
    box('warm instrument lamp', [0.9, 2, 0.9], [x, 10, -18], materials.signal);
  }
  beam(
    group,
    resources,
    'Saffron / observatory antenna mast',
    new T.Vector3(-12, 16, 10),
    new T.Vector3(-12, 33, 10),
    0.45,
    materials.dark,
  );
  const dish = new T.Mesh(
    resources.geometry(
      new T.SphereGeometry(4.5, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.36),
    ),
    materials.ceramic,
  );
  dish.name = 'Saffron / survey dish';
  dish.position.set(-12, 32, 10);
  dish.rotation.z = -0.6;
  group.add(dish);
  for (const z of [-10, -5, 0, 5, 10]) {
    box('reinforced slotted floor', [3, 0.5, 2], [14, 9.6, z], materials.dark);
  }
  for (const x of [-16, -7, 3])
    box('equipment crate', [4, 3, 4], [x, 10.8, -15], materials.dark);
  const sail = new T.Mesh(
    resources.geometry(new T.PlaneGeometry(24, 16, 3, 2)),
    materials.cloth,
  );
  const positions = sail.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++)
    positions.setZ(i, Math.cos(positions.getX(i) / 12) * 2.3);
  sail.geometry.computeVertexNormals();
  sail.name = 'Saffron / anchored ochre sun canopy';
  sail.position.set(0, 24, -16);
  sail.rotation.x = -1.1;
  group.add(sail);
  return group;
}
