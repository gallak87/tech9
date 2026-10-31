import * as T from 'three';
import scarpKit from '../../../../assets/levels/saffron/scarps-meshes.json' with { type: 'json' };
import { horizontalFrame, instanced, matrixAt } from './geometry.js';

import { buildFossilPlacements } from './placements.js';

const UP = new T.Vector3(0, 1, 0);
const corridor = new T.Box3(
  new T.Vector3(-27, -10, -8),
  new T.Vector3(27, 32, 8),
);

// Fixed compositional groups connect the colossal remains to buried shoulders.
// The grazer side of Vista and the skull's internal descent remain open.
export function buildDesertScarpPlacements(track, survey) {
  const families = [[], [], []];
  const frames = survey.samples.map(({ s }) => {
    const f = track.sample(s);
    const matrix = matrixAt(f.position, new T.Vector3(1, 1, 1), f.quaternion);
    return {
      box: corridor.clone().applyMatrix4(matrix),
      inverse: matrix.clone().invert(),
    };
  });
  function seat(family, position, scale, rotation, ceiling = Infinity) {
    const source = scarpKit.families[family];
    let floor = Infinity;
    for (let i = 0; i < source.positions.length; i += 3) {
      if (source.positions[i + 1] > -0.19) continue;
      const foot = new T.Vector3(...source.positions.slice(i, i + 3))
        .multiply(scale)
        .applyQuaternion(rotation);
      floor = Math.min(
        floor,
        survey.heightAt(position.x + foot.x, position.z + foot.z) - foot.y,
      );
    }
    position.y = floor - 8;
    const matrix = matrixAt(position, scale, rotation);
    const points = [];
    for (let i = 0; i < source.positions.length; i += 3)
      points.push(
        new T.Vector3(...source.positions.slice(i, i + 3)).applyMatrix4(matrix),
      );
    const bounds = new T.Box3().setFromPoints(points);
    const drop = Math.max(0, bounds.max.y - ceiling);
    if (drop) {
      position.y -= drop;
      matrix.setPosition(position);
      for (const point of points) point.y -= drop;
      bounds.translate(new T.Vector3(0, -drop, 0));
    }
    const nearby = frames.filter((frame) => frame.box.intersectsBox(bounds));
    const triangle = new T.Triangle();
    for (const frame of nearby) {
      const local = points.map((point) =>
        point.clone().applyMatrix4(frame.inverse),
      );
      for (let i = 0; i < source.indices.length; i += 3) {
        triangle.set(
          ...source.indices.slice(i, i + 3).map((index) => local[index]),
        );
        if (corridor.intersectsTriangle(triangle)) return null;
      }
    }
    families[family].push(matrix);
    return matrix;
  }
  const specs = [
    [145, -1, 195, 82, 116, 125, -0.12],
    [310, 1, 240, 94, 88, 145, 0.22],
    [620, -1, 220, 80, 100, 130, 0.2],
    [970, 1, 230, 108, 135, 160, -0.16],
    [1190, 1, 205, 85, 112, 138, 0.08],
    [1810, 1, 275, 105, 97, 180, -0.14],
    [2210, 1, 245, 90, 130, 145, 0.32],
    [2840, -1, 230, 95, 95, 155, -0.18],
    [3120, 1, 230, 90, 103, 120, 0.12],
    [3460, -1, 250, 110, 83, 165, -0.26],
    [4010, 1, 235, 100, 114, 150, 0.12],
    [4360, -1, 220, 85, 103, 130, -0.22],
    [4595, 1, 250, 112, 125, 160, 0.1],
    [4910, 1, 220, 78, 80, 125, -0.18],
  ];
  for (const [
    index,
    [s, side, lateral, width, height, depth, yaw],
  ] of specs.entries()) {
    const frame = horizontalFrame(track, s);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, side * lateral);
    const rotation = frame.quaternion
      .clone()
      .multiply(
        new T.Quaternion().setFromAxisAngle(UP, yaw + (side < 0 ? Math.PI : 0)),
      );
    seat(index % 3, position, new T.Vector3(width, height, depth), rotation);
    const toe = position
      .clone()
      .addScaledVector(frame.forward, depth * 0.45)
      .addScaledVector(frame.right, -side * width * 0.33);
    seat(
      (index + 1) % 3,
      toe,
      new T.Vector3(width * 0.9, height * 0.32, depth * 0.8),
      rotation,
    );
  }
  // Low erosional shoulders connect the closest living-scale cortical roots
  // to the surveyed ground. These six cuffs remain below the pore bands.
  const fossils = buildFossilPlacements(track, survey);
  const cuffs = [];
  const rib = fossils.rib_1[0];
  const reach = track.sections.find((section) => section.id === 'ribshadow');
  if (rib)
    cuffs.push({
      matrix: rib,
      station: T.MathUtils.lerp(reach.start + 20, reach.end - 20, 0.25),
      rib: true,
    });
  const jump = track.jumps.find((entry) => !entry.optional);
  const station = jump.takeoff - 27;
  const f = track.sample(station);
  const target = f.position.clone().addScaledVector(f.up, -8.5);
  for (const family of ['vertebra', 'vertebra_1', 'vertebra_2']) {
    const matrix = fossils[family].find(
      (matrix) =>
        new T.Vector3().setFromMatrixPosition(matrix).distanceTo(target) < 0.1,
    );
    if (matrix) cuffs.push({ matrix, station, rib: false });
  }
  for (const cuff of cuffs) {
    const position = new T.Vector3(),
      scale = new T.Vector3(),
      rotation = new T.Quaternion();
    cuff.matrix.decompose(position, rotation, scale);
    const frame = horizontalFrame(track, cuff.station);
    for (const side of cuff.rib ? [1] : [-1, 1]) {
      const foot = new T.Vector3(
        cuff.rib ? side * 94 : side * 51,
        cuff.rib ? -37 : -8,
        cuff.rib ? 12 : -22,
      ).applyMatrix4(cuff.matrix);
      foot.addScaledVector(frame.right, side * 3);
      const facing = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            UP,
            side < 0 ? Math.PI + 0.12 : -0.12,
          ),
        );
      const ceiling = position.y + scale.y * (cuff.rib ? 17 : 16);
      seat(
        cuff.rib ? 1 : 0,
        foot,
        new T.Vector3(22, cuff.rib ? 18 : 44, cuff.rib ? 34 : 32),
        facing,
        ceiling,
      );
      const apron = foot
        .clone()
        .addScaledVector(frame.forward, cuff.rib ? 16 : 18)
        .addScaledVector(frame.right, side * 10);
      seat(
        cuff.rib ? 2 : 1,
        apron,
        new T.Vector3(
          cuff.rib ? 27 : 31,
          cuff.rib ? 10 : 30,
          cuff.rib ? 35 : 36,
        ),
        facing,
        ceiling - 5,
      );
    }
  }
  return families;
}

export function createDesertScarps(track, survey, materials, resources) {
  const group = new T.Group();
  group.name =
    'Saffron / buried fractured escarpments and connected fossil shoulders';
  for (const [family, transforms] of buildDesertScarpPlacements(
    track,
    survey,
  ).entries()) {
    const source = scarpKit.families[family];
    const geometry = resources.geometry(new T.BufferGeometry());
    for (const [attribute, values] of [
      ['position', source.positions],
      ['normal', source.normals],
      ['color', source.colors],
    ])
      geometry.setAttribute(attribute, new T.Float32BufferAttribute(values, 3));
    geometry.setIndex(source.indices);
    const mesh = instanced(
      group,
      `Saffron / authored fractured escarpment ${family}`,
      geometry,
      materials.bedrock,
      transforms,
    );
    if (mesh) mesh.castShadow = true;
  }
  return group;
}
