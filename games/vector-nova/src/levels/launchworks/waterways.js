import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zephyrAqueductBay } from '../zephyr/environment/geometry/aqueduct-bay.js';
import { finishZephyrMaterial } from '../zephyr/environment/materials.js';

const UP = new T.Vector3(0, 1, 0);
const SPAN = 78;
const STEP = 4;

// The original Blender bay is the construction unit. Skywell supplies only
// authored canal alignments, containment and their relationship to the falls.
export function createSkywellWaterways({ track, stoneTexture, place, water }) {
  const group = new T.Group();
  group.name = 'Skywell / connected stepped water streets';
  const geometries = new Set();
  const materials = {
    stone: new T.MeshStandardMaterial({
      name: 'Skywell canal limestone',
      color: '#99988a',
      roughness: 0.86,
    }),
    trim: new T.MeshStandardMaterial({
      name: 'Skywell canal dressed limestone',
      color: '#c4bba5',
      roughness: 0.76,
    }),
    bronze: new T.MeshStandardMaterial({
      name: 'Skywell canal weathered bronze',
      color: '#856744',
      roughness: 0.61,
      metalness: 0.68,
    }),
  };
  for (const material of Object.values(materials))
    finishZephyrMaterial(material, { stoneTexture });
  const box = new T.BoxGeometry();
  geometries.add(box);
  const bays = Object.fromEntries(
    Object.entries(zephyrAqueductBay).map(([role, attributes]) => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        'position',
        new T.Float32BufferAttribute(attributes.position, 3),
      );
      geometry.setAttribute(
        'normal',
        new T.Float32BufferAttribute(attributes.normal, 3),
      );
      geometry.setAttribute(
        'uv',
        new T.Float32BufferAttribute(
          new Float32Array((attributes.position.length / 3) * 2),
          2,
        ),
      );
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.add(geometry);
      return [role, geometry];
    }),
  );
  function flowingGeometry(width, length, drop = 0) {
    // A flow surface has no box side faces. Faces whose normal is parallel to
    // the authored across-flow vector produce a zero tangent in the established
    // falling-water shader, which contaminates the High bloom buffer on Metal.
    const top = new T.PlaneGeometry(width, length).rotateX(-Math.PI / 2);
    const parts = [top];
    if (drop)
      parts.push(
        new T.PlaneGeometry(width, drop).translate(0, -drop / 2, length / 2),
      );
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const scratch = new T.MeshBasicMaterial({
      name: 'Skywell water surface scratch',
    });
    const mesh = new T.Mesh(geometry, scratch);
    // Flat canal and four-metre lips use the existing water surface/clock.
    // Its flow coordinates follow the channel instead of assuming a tall fall.
    water.finishMesh(mesh, false);
    scratch.dispose();
    const p = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      uv.setXY(
        i,
        p.getX(i) + width / 2,
        p.getZ(i) + length / 2 + Math.max(0, -p.getY(i)),
      );
      mesh.geometry.attributes.sheetHeight.setX(i, length + drop + 8);
      mesh.geometry.attributes.strandEnd.setX(i, (length + drop) * 2);
    }
    mesh.material.userData.skywellWater = true;
    mesh.userData.skywellWater = true;
    geometries.add(mesh.geometry);
    return { geometry: mesh.geometry, material: mesh.material };
  }
  const canalFlow = flowingGeometry(17, SPAN, STEP);
  const receivingFlow = flowingGeometry(100, 72);
  const road = [];
  for (let s = 0; s <= track.finishDistance; s += 24)
    road.push(track.sample(s).position);
  const frame = (position, scale = [1, 1, 1]) =>
    new T.Matrix4().compose(
      position,
      new T.Quaternion(),
      new T.Vector3(...scale),
    );
  function instances(parent, label, geometry, material, transforms) {
    const mesh = new T.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.name = label;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (material.userData.skywellWater) mesh.userData.skywellWater = true;
    parent.add(mesh);
    return mesh;
  }
  const names = [
    'Crown headwater',
    'Bell water stair',
    'Veil high cistern',
    'Counterbank water street',
    'Last Light spillway',
  ];
  const counts = [5, 6, 4, 7, 5];
  const sides = [-1, 1, -1, 1, 1];
  const heights = [75, 55, 90, 70, 100];
  const yaws = [-0.12, 0.15, -0.1, 0.2, -0.1];
  const runs = track.jumps.map((jump, index) => ({
    name: names[index],
    distance: jump.takeoff + 330,
    count: counts[index],
    side: sides[index],
    lateral: 390 + (index % 2) * 45,
    height: heights[index],
    turn: yaws[index],
    waterfall: true,
  }));
  for (let i = 0; i < track.jumps.length - 1; i++) {
    const current = track.jumps[i],
      next = track.jumps[i + 1];
    runs.push({
      name: [
        'Cloister garden canal',
        'Bell orchard viaduct',
        'Veil terrace conduit',
        'Sunward garden waterway',
      ][i],
      distance: (current.recovery + next.takeoff) / 2,
      count: 4,
      side: i % 2 ? 1 : -1,
      lateral: 365,
      height: -35,
      turn: i % 2 ? 0.12 : -0.12,
      waterfall: false,
    });
  }
  for (const run of runs) {
    const { name, distance, count, side, lateral, height, turn } = run;
    const f = track.sample(distance);
    const right = new T.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    const yaw = Math.atan2(f.tangent.x, f.tangent.z) + turn;
    const rotation = new T.Quaternion().setFromAxisAngle(UP, yaw);
    const origin = f.position
      .clone()
      .addScaledVector(right, side * lateral)
      .addScaledVector(UP, height);
    const district = new T.Group();
    district.name = `Skywell / ${name}`;
    district.userData.skywellDistrict = name;
    district.userData.skywellCanal = { bays: count, waterfall: run.waterfall };
    district.position.copy(origin);
    district.quaternion.copy(rotation);
    group.add(district);
    const length = count * SPAN;
    const masonry = [],
      stone = [],
      bronze = [],
      flow = [];
    for (let i = 0; i < count; i++) {
      const z = -length / 2 + (i + 0.5) * SPAN;
      const y = -i * STEP;
      masonry.push(frame(new T.Vector3(0, y, z)));
      flow.push(frame(new T.Vector3(0, y + 0.5, z)));
      stone.push(frame(new T.Vector3(0, y, z), [22, 7, SPAN + 0.5]));
      stone.push(frame(new T.Vector3(0, y - 119, z), [25, 8, SPAN + 0.5]));
      for (const side of [-1, 1]) {
        stone.push(
          frame(new T.Vector3(side * 11, y + 7, z), [3, 9, SPAN + 0.5]),
        );
        bronze.push(
          frame(new T.Vector3(side * 12, y + 12, z), [1.2, 1.2, SPAN + 1]),
        );
      }
      stone.push(frame(new T.Vector3(0, y - 60, z - SPAN / 2), [16, 114, 18]));
      stone.push(frame(new T.Vector3(0, y - 116, z - SPAN / 2), [29, 12, 31]));
    }
    const lastY = -(count - 1) * STEP;
    stone.push(frame(new T.Vector3(0, lastY - 60, length / 2), [16, 114, 18]));
    // The source's existing 148 m piers, the aqueduct's bottom caisson and
    // island terrace meet through this substantial common abutment.
    if (run.waterfall)
      stone.push(
        frame(new T.Vector3(0, lastY - 134, length / 2 + 2), [52, 28, 55]),
      );
    const poolCenter = new T.Vector3(
      0,
      lastY + (run.waterfall ? -351.5 : 0.5),
      length / 2 + 35,
    );
    stone.push(frame(poolCenter.clone().addScaledVector(UP, -4), [113, 8, 86]));
    for (const side of [-1, 1]) {
      stone.push(
        frame(
          poolCenter.clone().add(new T.Vector3(side * 54, 3, 0)),
          [5, 10, 86],
        ),
      );
      if (side === 1 || run.waterfall)
        stone.push(
          frame(
            poolCenter.clone().add(new T.Vector3(0, 3, side * 40)),
            [113, 10, 5],
          ),
        );
      else
        for (const bank of [-1, 1])
          stone.push(
            frame(
              poolCenter.clone().add(new T.Vector3(bank * 34, 3, -40)),
              [45, 10, 5],
            ),
          );
    }
    instances(
      district,
      `${name} / open masonry arches`,
      bays.stone,
      materials.stone,
      masonry,
    );
    instances(
      district,
      `${name} / seated dressed voussoirs`,
      bays.trim,
      materials.trim,
      masonry,
    );
    instances(
      district,
      `${name} / contained canal and receiver`,
      box,
      materials.stone,
      stone,
    );
    instances(
      district,
      `${name} / bronze water parapets`,
      box,
      materials.bronze,
      bronze,
    );
    instances(
      district,
      `${name} / stepped silver flow`,
      canalFlow.geometry,
      canalFlow.material,
      flow,
    );
    instances(
      district,
      `${name} / receiving water`,
      receivingFlow.geometry,
      receivingFlow.material,
      [frame(poolCenter)],
    );
    const point = (local) =>
      local.clone().applyQuaternion(rotation).add(origin);
    const sourcePosition = point(
      new T.Vector3(0, lastY + 0.5, length / 2 + 12),
    );
    const placed = [
      place('island-terrace', distance, {
        position: point(new T.Vector3(0, -123, -length / 2)),
        scale: [1.15, 1, 1.2],
        yaw: turn,
      }),
      place('island-terrace', distance, {
        position: point(poolCenter).addScaledVector(UP, -8),
        scale: [1.2, 0.95, 1.25],
        yaw: turn,
      }),
    ];
    if (run.waterfall)
      placed.push(
        place('island-terrace', distance, {
          position: sourcePosition.clone().addScaledVector(UP, -148),
          scale: [1.15, 1.1, 1.2],
          yaw: turn,
        }),
        place('aqueduct-source', distance, {
          position: sourcePosition,
          yaw: turn,
        }),
        place('waterfall', distance, {
          position: sourcePosition.clone().addScaledVector(UP, 0.2),
          yaw: turn,
        }),
      );
    for (const object of placed) {
      object.userData.skywellDistrict = name;
      object.name = `Skywell / ${name} / ${object.name}`;
    }
    // A run, its source and its complete lower receiver move together. Check
    // the whole course so a long waterfall cannot cover a lower flight lane.
    const parts = [district, ...placed];
    const initial = parts.map((part) => part.position.clone());
    let clear = false;
    for (let step = 0; step < 16 && !clear; step++) {
      for (const direction of [side, -side]) {
        const offset = direction * (lateral + step * 100);
        parts.forEach((part, i) => {
          part.position
            .copy(initial[i])
            .addScaledVector(right, offset - side * lateral);
          part.updateWorldMatrix(true, true);
        });
        const bounds = new T.Box3();
        parts.forEach((part) => bounds.union(new T.Box3().setFromObject(part)));
        bounds.expandByScalar(130);
        if (road.some((p) => bounds.containsPoint(p))) continue;
        district.userData.skywellCanal.lateral = offset;
        clear = true;
        break;
      }
    }
    if (!clear)
      throw new Error(`Skywell waterway has no clear off-course site: ${name}`);
  }
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
      group.clear();
    },
  };
}
