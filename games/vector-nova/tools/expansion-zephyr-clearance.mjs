import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVehicleState } from '../src/physics/index.js';
import { createZephyrRuntime } from '../src/levels/zephyr/runtime.js';
import createLevel from '../src/levels/zephyr/index.js';
import { createZephyrEnvironment } from '../src/levels/zephyr/environment/index.js';
// Read the actual GLBs on CPU. No browser, renderer or substitute scene is used.
GLTFLoader.prototype.loadAsync = async function (url) {
  const b = await readFile(`public${url}`);
  return this.parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    '',
  );
};
const track = createLevel().createTrack(),
  scene = new T.Scene();
scene.environmentIntensity = 0.75;
scene.add(new T.HemisphereLight());
const env = await createZephyrEnvironment({ track, view: { scene } });
env.group.updateMatrixWorld(true);
const cellSize = 50,
  cells = new Map(),
  triangles = [];
const key = (x, y, z) => `${x},${y},${z}`;
const triangle = new T.Triangle(),
  box = new T.Box3();
env.group.traverse((mesh) => {
  if (
    !mesh.isMesh ||
    /water|foam|cloud shelves/i.test(mesh.name) ||
    mesh.material.transparent
  )
    return;
  const p = mesh.geometry.attributes.position,
    index = mesh.geometry.index;
  for (let n = 0; n < (index?.count ?? p.count); n += 3) {
    const points = [0, 1, 2].map((i) =>
      new T.Vector3()
        .fromBufferAttribute(p, index ? index.getX(n + i) : n + i)
        .applyMatrix4(mesh.matrixWorld),
    );
    box.setFromPoints(points);
    const lo = box.min.clone().divideScalar(cellSize).floor(),
      hi = box.max.clone().divideScalar(cellSize).floor();
    const id = triangles.length;
    triangles.push({
      points,
      name:
        mesh.parent?.parent?.name + '/' + mesh.parent?.name + '/' + mesh.name,
    });
    for (let x = lo.x; x <= hi.x; x++)
      for (let y = lo.y; y <= hi.y; y++)
        for (let z = lo.z; z <= hi.z; z++) {
          const k = key(x, y, z);
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(id);
        }
  }
});
const corridor = new T.Box3(
  new T.Vector3(-17, -0.2, -4),
  new T.Vector3(17, 12, 4),
);
const findings = [];
function checkPose(f, envelope, detail) {
  const inverse = f.quaternion.clone().invert(),
    radius = 24;
  const lo = f.position
      .clone()
      .addScalar(-radius)
      .divideScalar(cellSize)
      .floor(),
    hi = f.position.clone().addScalar(radius).divideScalar(cellSize).floor();
  const ids = new Set();
  for (let x = lo.x; x <= hi.x; x++)
    for (let y = lo.y; y <= hi.y; y++)
      for (let z = lo.z; z <= hi.z; z++)
        for (const i of cells.get(key(x, y, z)) ?? []) ids.add(i);
  const hits = new Set();
  for (const i of ids) {
    const entry = triangles[i];
    triangle.set(
      ...entry.points.map((p) =>
        p.clone().sub(f.position).applyQuaternion(inverse),
      ),
    );
    if (envelope.intersectsTriangle(triangle)) hits.add(entry.name);
  }
  if (hits.size) findings.push({ ...detail, hits: [...hits] });
}
for (let s = 0; s < track.length; s += 4)
  if (!track.isGap(s)) checkPose(track.sample(s), corridor, { s });
const hull = new T.Box3(
  new T.Vector3(-2.5, -1, -3.8),
  new T.Vector3(2.5, 1, 3.8),
);
let flightSamples = 0;
for (const jump of track.jumps)
  for (const speed of [78.4, 112, 157])
    for (const lateral of [-6, 0, 6]) {
      const runtime = createZephyrRuntime({ track });
      const state = {
        ...createVehicleState(),
        distance: jump.takeoff - 0.3,
        speed,
        lateral,
      };
      for (let i = 0; i < 600; i++) {
        const events = runtime.advance(
          state,
          { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false },
          1 / 120,
        );
        if (runtime.snapshot().mode === 'flight' && i % 4 === 0) {
          checkPose(runtime.pose(1), hull, {
            jump: jump.id,
            speed,
            lateral,
            tick: i,
          });
          flightSamples++;
        }
        if (events.some((e) => e.type === 'jump-transfer')) break;
      }
      runtime.dispose();
    }
env.dispose();
await mkdir('.experiments/expansion/zephyr', { recursive: true });
const result = {
  triangles: triangles.length,
  samples: Math.ceil(track.length / 4),
  box: { x: [-17, 17], y: [-0.2, 12], z: [-4, 4] },
  flightSamples,
  findings,
};
await writeFile(
  '.experiments/expansion/zephyr/scenery-clearance.json',
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      triangles: triangles.length,
      flightSamples,
      findings: findings.length,
      examples: findings.slice(0, 16),
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
