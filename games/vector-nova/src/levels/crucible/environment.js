import * as T from 'three';
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { beamTransform, seededRandom } from '../../track/geometry.js';

// The new district borrows the manufactured Worldkit parts. Its exchangers,
// hall composition, joined foundations and route-relative placement are local.
export function createCrucibleEnvironment({ track, road }) {
  const group = new T.Group();
  group.name = 'Crucible / heat exchanger and dispatch district';
  const kit = createIndustrialKit({ finish: road?.finish });
  const materials = new Set(),
    geometries = new Set(),
    batches = new Map(),
    borrowed = new Set();
  const survey = Array.from(
    { length: Math.ceil(track.length / 14) },
    (_, i) => track.sample(i * 14).position,
  );
  const random = seededRandom(4817);
  const mat = (settings) => {
    const m = new T.MeshStandardMaterial(settings);
    materials.add(m);
    return m;
  };
  const copper = mat({
    name: 'Crucible / heat-cycled copper radiator fins',
    color: '#b78055',
    roughness: 0.5,
    metalness: 0.7,
  });
  const concrete = mat({
    name: 'Crucible / mineral bearing seats',
    color: '#8c928a',
    roughness: 0.92,
    metalness: 0.03,
  });
  const red = mat({
    color: '#c73729',
    emissive: '#b9291c',
    emissiveIntensity: 0.8,
    roughness: 0.4,
  });
  const warm = mat({
    color: '#e8bb72',
    emissive: '#c88536',
    emissiveIntensity: 0.9,
    roughness: 0.6,
  });
  const floor = mat({
    name: 'Crucible / weathered dispatch apron',
    color: '#646d70',
    roughness: 0.85,
    metalness: 0.12,
  });
  floor.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 apronPoint;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvec4 apronWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\napronWorld=instanceMatrix*apronWorld;\n#endif\napronPoint=(modelMatrix*apronWorld).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 apronPoint;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      vec2 cell=mod(apronPoint.xz,vec2(34.,46.));vec2 edge=min(cell,vec2(34.,46.)-cell);
      float joint=1.-smoothstep(.08,.35,min(edge.x,edge.y));
      float grime=.92+.06*sin(apronPoint.x*.018+sin(apronPoint.z*.024))+.035*sin(apronPoint.z*.16);
      diffuseColor.rgb*=grime-joint*.2;`,
      );
  };
  floor.customProgramCacheKey = () => 'crucible-dispatch-apron-v1';
  const box = new T.BoxGeometry(1, 1, 1),
    cylinder = new T.CylinderGeometry(1, 1, 1, 40),
    ring = new T.TorusGeometry(1, 0.035, 6, 48);
  geometries.add(box);
  geometries.add(cylinder);
  geometries.add(ring);
  const matrix = new T.Matrix4(),
    quaternion = new T.Quaternion(),
    up = new T.Vector3(0, 1, 0);
  function put(
    geometry,
    material,
    position,
    scale,
    rotation = new T.Quaternion(),
    name = 'Foundry structure',
  ) {
    const key = geometry.uuid + '/' + material.uuid;
    if (!batches.has(key))
      batches.set(key, { geometry, material, matrices: [], name });
    matrix.compose(position, rotation, scale);
    batches.get(key).matrices.push(matrix.clone());
  }
  const block = (m, size, p, q, name) =>
    put(box, m, new T.Vector3(...p), new T.Vector3(...size), q, name);
  const beam = (a, b, width, depth, material) => {
    const t = beamTransform(a, b, width, depth);
    put(
      box,
      material,
      t.position,
      t.scale,
      t.quaternion,
      'Connected load path',
    );
  };
  function upright(distance) {
    const f = track.sample(distance),
      forward = f.tangent.clone().setY(0).normalize(),
      right = up.clone().cross(forward);
    return {
      ...f,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, forward),
      ),
      right,
      up,
    };
  }
  function clearCylinder(p, radius, height) {
    return !survey.some(
      (point) =>
        point.y > p.y - 20 &&
        point.y < p.y + height + 30 &&
        Math.hypot(point.x - p.x, point.z - p.z) < radius + 42,
    );
  }
  function clearBox(position, size, rotation) {
    const inverse = new T.Matrix4()
      .compose(position, rotation, new T.Vector3(1, 1, 1))
      .invert();
    return !survey.some((point) => {
      const p = point.clone().applyMatrix4(inverse);
      return (
        Math.abs(p.x) < size[0] / 2 + 38 &&
        Math.abs(p.y) < size[1] / 2 + 18 &&
        Math.abs(p.z) < size[2] / 2 + 30
      );
    });
  }
  const assemblies = [];
  function assembly(name, p, q, scale = 1) {
    const instance = kit.createAssembly(name);
    instance.position.copy(p);
    instance.quaternion.copy(q);
    instance.scale.setScalar(scale);
    group.add(instance);
    assemblies.push(instance);
  }
  // Broad site slab grounds the elevated factory. Outer stepped foothills are
  // solid connected mass, rather than freestanding towers in empty sky.
  block(
    floor,
    [5000, 18, 5000],
    [180, -66, -80],
    undefined,
    'Continuous foundry site foundation',
  );
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2,
      radius = 2200 + random() * 1200,
      height = 180 + random() * 420;
    const p = new T.Vector3(
      Math.sin(angle) * radius,
      -90 + height / 2,
      Math.cos(angle) * radius,
    );
    put(
      cylinder,
      concrete,
      p,
      new T.Vector3(380 + random() * 420, height, 400 + random() * 480),
      quaternion,
      'Distant quarry buttress',
    );
  }
  // Every running span has seated piers and a crosshead. Banked road loads
  // land in an upright crosshead instead of rotating a pier off its footing.
  for (let distance = 20; distance < track.length; distance += 72) {
    const f = track.sample(distance),
      baseY = -54;
    const left = f.position
      .clone()
      .addScaledVector(f.right, -17)
      .addScaledVector(f.up, -5);
    const right = f.position
      .clone()
      .addScaledVector(f.right, 17)
      .addScaledVector(f.up, -5);
    const mid = left.clone().add(right).multiplyScalar(0.5);
    beam(left, right, 5, 9, kit.materials.steel);
    for (const side of [-1, 1]) {
      const head = mid
        .clone()
        .addScaledVector(
          new T.Vector3(f.tangent.z, 0, -f.tangent.x).normalize(),
          side * 13,
        );
      const foot = new T.Vector3(head.x, baseY, head.z),
        center = foot.clone().add(head).multiplyScalar(0.5);
      if (
        survey.some(
          (point) =>
            point.distanceTo(head) > 55 &&
            Math.hypot(point.x - head.x, point.z - head.z) < 18 &&
            point.y < head.y + 10,
        )
      )
        continue;
      block(
        concrete,
        [13, head.y - baseY, 17],
        center.toArray(),
        undefined,
        'Seated primary pier',
      );
      block(
        concrete,
        [24, 9, 27],
        [foot.x, baseY + 2, foot.z],
        undefined,
        'Pier foundation shoe',
      );
      beam(
        head.clone().add(new T.Vector3(side * 10, 0, 0)),
        head.clone().add(new T.Vector3(0, -24, 0)),
        3,
        5,
        kit.materials.dark,
      );
    }
  }
  function exchanger(distance, side, index) {
    const f = upright(distance),
      radius = 100 + index * 10,
      height = f.position.y + 258 + index * 30;
    let p;
    for (const offset of [180, 230, 290, 360]) {
      const trial = f.position.clone().addScaledVector(f.right, side * offset);
      trial.y = -48;
      if (clearCylinder(trial, radius + 12, height)) {
        p = trial;
        break;
      }
    }
    if (!p) return;
    const stem = p.clone().add(new T.Vector3(0, height / 2, 0));
    put(
      cylinder,
      kit.materials.dark,
      stem,
      new T.Vector3(radius * 0.9, height, radius * 0.9),
      quaternion,
      'Exchanger graphite pressure vessel',
    );
    block(
      concrete,
      [radius * 2.3, 22, radius * 2.3],
      [p.x, p.y - 4, p.z],
      undefined,
      'Exchanger foundation raft',
    );
    for (let tier = 0; tier < 4; tier++) {
      const y = p.y + 30 + (tier * (height - 35)) / 4;
      put(
        cylinder,
        kit.materials.shell,
        new T.Vector3(p.x, y, p.z),
        new T.Vector3(radius, 18, radius),
        quaternion,
        'Removable enamel vessel belt',
      );
      const tq = new T.Quaternion().setFromAxisAngle(
        new T.Vector3(1, 0, 0),
        Math.PI / 2,
      );
      put(
        ring,
        kit.materials.steel,
        new T.Vector3(p.x, y + 14, p.z),
        new T.Vector3(radius + 5, radius + 5, radius + 5),
        tq,
        'Circular service carrier',
      );
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2,
        dx = Math.cos(a),
        dz = Math.sin(a),
        q = new T.Quaternion().setFromAxisAngle(up, -a);
      block(
        copper,
        [4.5, height - 56, 6],
        [p.x + dx * (radius + 1), p.y + height / 2, p.z + dz * (radius + 1)],
        q,
        'Exposed heat-exchanger fin',
      );
      if (i % 6 === 0) {
        const from = new T.Vector3(
            p.x + dx * (radius * 0.8),
            p.y + height * 0.23,
            p.z + dz * (radius * 0.8),
          ),
          to = new T.Vector3(
            p.x + dx * (radius * 1.1),
            p.y + 15,
            p.z + dz * (radius * 1.1),
          );
        beam(from, to, 8, 10, kit.materials.cast);
      }
    }
    for (const dx of [-1, 1])
      put(
        cylinder,
        kit.materials.steel,
        new T.Vector3(p.x + dx * (radius + 11), p.y + height * 0.48, p.z),
        new T.Vector3(5, height * 0.9, 5),
        quaternion,
        'Exchanger connected riser',
      );
    const top = p.y + height;
    put(
      cylinder,
      kit.materials.shell,
      new T.Vector3(p.x, top, p.z),
      new T.Vector3(radius * 0.92, 15, radius * 0.92),
      quaternion,
      'Vessel bolted upper crown',
    );
    block(
      warm,
      [radius * 0.7, 1.2, 2],
      [p.x, top + 8, p.z - radius * 0.5],
      undefined,
      'Crown maintenance practical',
    );
  }
  for (const [i, f] of [0.11, 0.3, 0.57, 0.8].entries())
    exchanger(track.length * f, i % 2 ? 1 : -1, i);
  // Real reusable portal frames span the course with more than 100 m of open
  // headroom. Unequal opaque service wings attach outside the racing envelope.
  for (const [i, fraction] of [0.045, 0.22, 0.46, 0.68, 0.9].entries()) {
    const f = upright(track.length * fraction),
      scale = i === 2 ? 1.55 : 1.15;
    assembly(
      i % 2 ? 'gantry' : 'factoryBay',
      f.position.clone().add(new T.Vector3(0, -20, 0)),
      f.quaternion,
      scale,
    );
    for (const side of [-1, 1]) {
      const width = 65 + ((i + side + 2) % 3) * 15,
        height = f.position.y + 170 + ((i * 37 + side * 23) % 70),
        depth = 120 + (i % 3) * 50;
      const center = f.position
        .clone()
        .addScaledVector(f.right, side * (130 + width / 2));
      center.y = -45 + height / 2;
      if (!clearBox(center, [width, height, depth], f.quaternion)) continue;
      block(
        kit.materials.dark,
        [width, height, depth],
        center.toArray(),
        f.quaternion,
        'Dispatch hall connected service core',
      );
      const crown = center.clone().add(new T.Vector3(0, height / 2 + 5, 0));
      block(
        kit.materials.shell,
        [width + 14, 10, depth + 16],
        crown.toArray(),
        f.quaternion,
        'Dispatch hall enamel roof cassette',
      );
      for (const y of [-0.2, 0.2]) {
        const band = center
          .clone()
          .addScaledVector(f.right, -side * (width / 2 + 0.5))
          .add(new T.Vector3(0, height * y, 0));
        block(
          kit.materials.steel,
          [2, 8, depth - 12],
          band.toArray(),
          f.quaternion,
          'Recessed longitudinal service gallery',
        );
      }
      for (const z of [-1, 1]) {
        const rib = center
          .clone()
          .addScaledVector(f.right, -side * (width / 2 + 1))
          .addScaledVector(f.tangent, z * (depth / 2 - 5));
        block(
          kit.materials.shell,
          [7, height, 11],
          rib.toArray(),
          f.quaternion,
          'Bolted vertical hall cladding rib',
        );
      }
      for (let level = 70; level < height - 25; level += 70) {
        const fascia = center
          .clone()
          .addScaledVector(f.right, -side * (width / 2 + 2));
        fascia.y = -45 + level;
        block(
          kit.materials.shell,
          [5, 6, depth - 10],
          fascia.toArray(),
          f.quaternion,
          'Seated service-floor fascia',
        );
        const practical = fascia
          .clone()
          .addScaledVector(f.right, -side * 3)
          .add(new T.Vector3(0, -5, 0));
        block(
          warm,
          [0.9, 2.4, depth * 0.3],
          practical.toArray(),
          f.quaternion,
          'Inset occupied service gallery',
        );
      }
      const connectA = f.position
        .clone()
        .addScaledVector(f.right, side * 72)
        .add(new T.Vector3(0, 90, 0));
      const connectB = crown.clone().add(new T.Vector3(0, -10, 0));
      beam(connectA, connectB, 10, 18, kit.materials.steel);
    }
    for (const side of [-1, 1]) {
      const p = f.position.clone().addScaledVector(f.right, side * 28);
      block(
        kit.materials.dark,
        [3, 12, 4],
        [p.x, p.y + 5, p.z],
        f.quaternion,
        'Cut beacon structure',
      );
      block(
        red,
        [1.2, 7, 0.8],
        [p.x, p.y + 7, p.z - 2.2],
        f.quaternion,
        'Cut beacon red glass',
      );
    }
  }
  // Peripheral machinery sits on its own concrete seats, never suspended.
  for (let i = 0; i < 8; i++) {
    const f = upright((track.length * (i + 0.35)) / 8),
      side = i % 2 ? 1 : -1;
    const p = f.position
      .clone()
      .addScaledVector(f.right, side * (140 + (i % 3) * 30));
    p.y = -35;
    if (!clearCylinder(p, 70, 180)) continue;
    assembly(
      i % 2 ? 'coolingBank' : 'serviceTower',
      p,
      f.quaternion,
      i % 2 ? 1.4 : 1.25,
    );
    block(
      concrete,
      [100, 16, 150],
      [p.x, -47, p.z],
      f.quaternion,
      'Auxiliary machine bearing seat',
    );
  }
  for (const { geometry, material, matrices, name } of batches.values()) {
    const mesh = new T.InstancedMesh(geometry, material, matrices.length);
    mesh.name = name;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    group,
    setReflection(texture) {
      borrowed.add(texture);
      for (const material of [...Object.values(kit.materials), ...materials]) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      kit.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.clear();
      batches.clear();
      assemblies.length = 0;
      borrowed.clear();
    },
  };
}
