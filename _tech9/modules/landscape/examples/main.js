import * as THREE from 'three';
import { createExampleScene } from './scene.js';
const app = await createExampleScene();
const { camera, landscape, renderer } = app;
let region = 0,
  view = 'ground',
  yaw = 0,
  pitch = 0,
  drag = false;
const regions = [
  [0, 0],
  [-700, -800],
  [1150, 600],
  [-1500, 1400],
];
function setView(name = view) {
  view = name;
  const [x, z] = regions[region];
  camera.position.set(
    x,
    landscape.groundHeight(x, z) + { ground: 1.8, low: 85, high: 700 }[view],
    z,
  );
  yaw = 0.3;
  pitch = view === 'high' ? -0.65 : view === 'low' ? -0.18 : 0;
}
setView();
for (const button of document.querySelectorAll('[data-view]'))
  button.onclick = () => {
    setView(button.dataset.view);
    button.blur();
  };
document.querySelector('#travel').onclick = () => {
  region = (region + 1) % regions.length;
  setView();
  document.activeElement.blur();
};
const held = new Set(),
  abort = new AbortController(),
  options = { signal: abort.signal };
addEventListener(
  'keydown',
  (e) => {
    if (e.target.closest('button,input')) return;
    if (
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft'].includes(
        e.code,
      )
    ) {
      e.preventDefault();
      held.add(e.code);
    }
  },
  options,
);
addEventListener('keyup', (e) => held.delete(e.code), options);
addEventListener('blur', () => held.clear(), options);
renderer.domElement.addEventListener(
  'pointerdown',
  (e) => {
    drag = true;
    renderer.domElement.setPointerCapture(e.pointerId);
  },
  options,
);
renderer.domElement.addEventListener(
  'pointerup',
  () => (drag = false),
  options,
);
renderer.domElement.addEventListener(
  'pointermove',
  (e) => {
    if (drag) {
      yaw -= e.movementX * 0.003;
      pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.003, -1.5, 1.5);
    }
  },
  options,
);
let last = performance.now(),
  elapsed = 0;
const status = document.querySelector('#status');
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  const speed = (held.has('ShiftLeft') ? 450 : view === 'ground' ? 6 : 65) * dt;
  const f = Number(held.has('KeyW')) - Number(held.has('KeyS')),
    s = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  camera.position.x += (-Math.sin(yaw) * f + Math.cos(yaw) * s) * speed;
  camera.position.z += (-Math.cos(yaw) * f - Math.sin(yaw) * s) * speed;
  camera.position.y +=
    (Number(held.has('KeyE')) - Number(held.has('KeyQ'))) * speed;
  for (const [axis, min, max] of [
    ['x', 'minX', 'maxX'],
    ['z', 'minZ', 'maxZ'],
  ])
    camera.position[axis] = THREE.MathUtils.clamp(
      camera.position[axis],
      landscape.bounds[min],
      landscape.bounds[max],
    );
  camera.position.y = Math.max(
    camera.position.y,
    landscape.groundHeight(camera.position.x, camera.position.z) + 1.8,
  );
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  app.render(dt, elapsed);
  const s1 = landscape.stats;
  status.value = `${view} · region ${region + 1} · ${s1.nearTrees} near trees · ${s1.detailInstances} detail instances`;
});
if (new URLSearchParams(location.search).has('test'))
  window.__EXAMPLE_TEST__ = {
    app,
    setView,
    relocate(x, z, altitude = 85) {
      camera.position.set(x, landscape.groundHeight(x, z) + altitude, z);
    },
    snapshot: () => ({
      position: camera.position.toArray(),
      stats: landscape.stats,
      memory: { ...renderer.info.memory },
      programs: renderer.info.programs.length,
      weather: app.weather.condition,
    }),
  };
addEventListener(
  'pagehide',
  () => {
    abort.abort();
    app.dispose();
  },
  { once: true },
);
