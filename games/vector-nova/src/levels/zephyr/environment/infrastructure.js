import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import { beamTransform } from '../../../track/geometry.js';
import { finishZephyrMaterial } from './materials.js';

// Outer cloister causeways connect the skyline to a built, inhabited archipelago.
// Every bay is tested against all banked decks, not just its nearest route point.
export function createZephyrInfrastructure(track, stoneTexture) {
  const group = new T.Group();
  group.name = 'Zephyr / connected outer cloister aqueducts';
  const clearance = createRouteClearance(track, {
    sidePadding: 22,
    localVertical: [-28, 48],
  });
  const stone = new T.MeshStandardMaterial({
    name: 'Zephyr aqueduct limestone',
    color: '#93938b',
    roughness: 0.86,
  });
  const bronze = new T.MeshStandardMaterial({
    name: 'Zephyr aqueduct bronze',
    color: '#8c7050',
    roughness: 0.46,
    metalness: 0.73,
  });
  finishZephyrMaterial(stone, { stoneTexture });
  finishZephyrMaterial(bronze);
  const trim = new T.MeshStandardMaterial({
    name: 'Zephyr dressed gallery arrises',
    color: '#c3b9a2',
    roughness: 0.72,
  });
  finishZephyrMaterial(trim, { stoneTexture });
  const stoneParts = [],
    bronzeParts = [],
    trimParts = [],
    unit = new T.BoxGeometry();
  const box = (p, scale, yaw, parts = stoneParts) => {
    const radius = Math.min(0.32, Math.min(scale.x, scale.y, scale.z) * 0.12);
    const g = new RoundedBoxGeometry(scale.x, scale.y, scale.z, 2, radius);
    g.applyMatrix4(
      new T.Matrix4().compose(
        p,
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
        new T.Vector3(1, 1, 1),
      ),
    );
    parts.push(g);
  };
  for (const [aa, bb] of [
    [
      [-710, 126, 1100],
      [350, 186, 1080],
    ],
    [
      [-580, 55, -570],
      [470, -40, -590],
    ],
    [
      [750, 90, 540],
      [560, -35, -550],
    ],
  ]) {
    const a = new T.Vector3(...aa),
      b = new T.Vector3(...bb),
      delta = b.clone().sub(a),
      length = delta.length();
    const direction = delta.clone().setY(0).normalize(),
      right = new T.Vector3(direction.z, 0, -direction.x);
    const count = Math.ceil(length / 78),
      step = length / count,
      yaw = Math.atan2(direction.x, direction.z);
    for (let i = 0; i < count; i++) {
      const c = a.clone().lerp(b, (i + 0.5) / count),
        top = c.y;
      if (!clearance.clears(c.x, c.z, 26, step + 8, top + 15, yaw, top - 123))
        continue;
      box(c.clone(), new T.Vector3(22, 7, step + 1), yaw);
      for (const side of [-1, 1]) {
        box(
          c
            .clone()
            .addScaledVector(right, side * 11)
            .add(new T.Vector3(0, 7, 0)),
          new T.Vector3(3, 9, step + 1),
          yaw,
        );
        box(
          c
            .clone()
            .addScaledVector(right, side * 12)
            .add(new T.Vector3(0, 12, 0)),
          new T.Vector3(1.1, 1.3, step + 2),
          yaw,
          bronzeParts,
        );
      }
      const start = c.clone().addScaledVector(direction, -step / 2);
      box(
        start.clone().add(new T.Vector3(0, -61, 0)),
        new T.Vector3(16, 116, 19),
        yaw,
      );
      box(
        start.clone().add(new T.Vector3(0, -116, 0)),
        new T.Vector3(28, 12, 31),
        yaw,
      );
      // Continuous lower caisson ties every pier to the island abutments.
      box(
        c.clone().add(new T.Vector3(0, -116, 0)),
        new T.Vector3(24, 10, step + 2),
        yaw,
      );
      for (const level of [-9, -64]) {
        const pts = [];
        for (let k = 0; k <= 24; k++) {
          const t = k / 24,
            p = start.clone().addScaledVector(direction, step * t);
          p.y = top + level - 37 + 34 * Math.sin(Math.PI * t);
          pts.push(p);
        }
        const arch = new T.TubeGeometry(
          new T.CatmullRomCurve3(pts),
          24,
          3.5,
          7,
          false,
        );
        stoneParts.push(arch);
        for (const side of [-1, 1])
          trimParts.push(
            new T.TubeGeometry(
              new T.CatmullRomCurve3(
                pts.map((p) => p.clone().addScaledVector(right, side * 3.4)),
              ),
              24,
              0.8,
              6,
              false,
            ),
          );
      }
      const brace = beamTransform(
        start.clone().add(new T.Vector3(0, -35, 0)),
        c.clone().add(new T.Vector3(0, -5, 0)),
        1.1,
        1.1,
      );
      bronzeParts.push(
        unit
          .clone()
          .applyMatrix4(
            new T.Matrix4().compose(
              brace.position,
              brace.quaternion,
              brace.scale,
            ),
          ),
      );
    }
  }
  // The descending return passes a real deep loggia, with separate side aisles,
  // three pointed ribs and a high clerestory. All solid parts are independently
  // checked against the full three-dimensional route, including upper decks.
  const f = groundFrame(track, 4140),
    yaw = Math.atan2(f.tangent.x, f.tangent.z);
  const point = (x, y, z) =>
    f.position
      .clone()
      .addScaledVector(f.right, x)
      .addScaledVector(f.up, y)
      .addScaledVector(f.tangent, z);
  const safeBox = (x, y, z, w, h, d, parts = stoneParts) => {
    const p = point(x, y, z);
    if (clearance.clears(p.x, p.z, w, d, p.y + h / 2, yaw, p.y - h / 2))
      box(p, new T.Vector3(w, h, d), yaw, parts);
  };
  const supportedSides = new Set();
  for (const side of [-1, 1]) {
    const c = point(side * 115, 25, 0);
    if (!clearance.clears(c.x, c.z, 62, 245, c.y + 135, yaw, c.y - 90))
      continue;
    supportedSides.add(side);
    safeBox(side * 113, -48, 0, 42, 24, 235);
    safeBox(side * 128, -20, 0, 12, 38, 230);
    for (const y of [-30, 38, 107]) safeBox(side * 112, y, 0, 40, 7, 235);
    for (const z of [-108, -54, 0, 54, 108]) {
      safeBox(side * 95, 31, z, 13, 146, 16);
      for (const y of [-38, 36, 102])
        safeBox(side * 95, y, z, 17, 4, 20, trimParts);
      for (const x of [-5.5, 5.5])
        for (const dz of [-7.5, 7.5])
          safeBox(side * 95 + x, 31, z + dz, 1.5, 138, 1.5, trimParts);
      safeBox(side * 128, 50, z, 12, 108, 14);
      safeBox(side * 93, 108, z, 20, 9, 23);
      safeBox(side * 124, 18, z, 26, 116, 22);
      safeBox(side * 138, -30, z, 28, 38, 33);
      safeBox(side * 98, 118, z, 4, 15, 6, bronzeParts);
      for (const baseY of [2, 70]) {
        const pts = [];
        for (let k = 0; k <= 20; k++) {
          const u = k / 20;
          pts.push(
            point(side * (95 + 33 * u), baseY + 24 * Math.sin(Math.PI * u), z),
          );
        }
        stoneParts.push(
          new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 2.4, 8, false),
        );
      }
    }
  }
  for (const z of supportedSides.size === 2 ? [-108, 0, 108] : []) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40,
        x = (u - 0.5) * 190,
        y = 55 + 85 * Math.pow(1 - Math.abs(u * 2 - 1), 0.72);
      pts.push(point(x, y, z));
    }
    const g = new T.TubeGeometry(
      new T.CatmullRomCurve3(pts),
      48,
      4.2,
      9,
      false,
    );
    g.computeBoundingBox();
    const b = g.boundingBox,
      c = b.getCenter(new T.Vector3()),
      size = b.getSize(new T.Vector3());
    if (clearance.clears(c.x, c.z, size.x, size.z, b.max.y, 0, b.min.y))
      stoneParts.push(g);
    else g.dispose();
    safeBox(0, 144, z, 195, 10, 15);
    for (const side of [-1, 1])
      safeBox(side * 60, 155, z, 3, 15, 5, bronzeParts);
  }
  // Three occupied lantern galleries give the climbing needle a readable scale.
  // Their floor plates seat into the core; the outer arcade stays inside the
  // spiral radius and is tested against all elevated and banked route spans.
  const core = new T.Vector3(...track.landmarks.cloudspire.position);
  for (const level of [155, 245, 335]) {
    const ringPoint = (a, r, y) =>
      new T.Vector3(core.x + Math.cos(a) * r, y, core.z + Math.sin(a) * r);
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12,
        p = ringPoint(a, 28, level);
      if (
        !clearance.clears(
          p.x,
          p.z,
          26,
          12,
          level + 4,
          Math.PI / 2 - a,
          level - 4,
        )
      )
        continue;
      box(p, new T.Vector3(26, 7, 12), Math.PI / 2 - a);
      if (i % 2) continue;
      const base = ringPoint(a, 37, level + 18);
      if (!clearance.clears(base.x, base.z, 6, 6, level + 44, 0, level))
        continue;
      box(base, new T.Vector3(5, 36, 5), 0);
      for (const y of [level + 2, level + 33])
        box(
          new T.Vector3(base.x, y, base.z),
          new T.Vector3(7, 2, 7),
          0,
          trimParts,
        );
      for (const dx of [-2.2, 2.2])
        for (const dz of [-2.2, 2.2])
          box(
            base.clone().add(new T.Vector3(dx, 0, dz)),
            new T.Vector3(0.85, 31, 0.85),
            0,
            trimParts,
          );
      box(ringPoint(a, 37, level + 38), new T.Vector3(9, 4, 9), 0);
      const next = a + Math.PI / 6,
        pts = [];
      const neighbor = ringPoint(next, 37, level + 18);
      if (!clearance.clears(neighbor.x, neighbor.z, 6, 6, level + 44, 0, level))
        continue;
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        pts.push(
          ringPoint(
            a + (next - a) * t,
            37,
            level + 29 + 15 * Math.sin(Math.PI * t),
          ),
        );
      }
      const arch = new T.TubeGeometry(
        new T.CatmullRomCurve3(pts),
        20,
        1.8,
        7,
        false,
      );
      arch.computeBoundingBox();
      const b = arch.boundingBox,
        c = b.getCenter(new T.Vector3()),
        size = b.getSize(new T.Vector3());
      if (clearance.clears(c.x, c.z, size.x, size.z, b.max.y, 0, b.min.y))
        stoneParts.push(arch);
      else arch.dispose();
      const brace = beamTransform(
        ringPoint(a, 10, level - 24),
        ringPoint(a, 37, level - 1),
        2.4,
        2.4,
      );
      bronzeParts.push(
        unit
          .clone()
          .applyMatrix4(
            new T.Matrix4().compose(
              brace.position,
              brace.quaternion,
              brace.scale,
            ),
          ),
      );
    }
  }
  unit.dispose();
  for (const [parts, material] of [
    [stoneParts, stone],
    [bronzeParts, bronze],
    [trimParts, trim],
  ]) {
    const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const g = mergeGeometries(flat);
    new Set([...parts, ...flat]).forEach((p) => p.dispose());
    const m = new T.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
