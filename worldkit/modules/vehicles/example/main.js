import * as THREE from 'three';
import {
  createVehicle,
  createVehicleLighting,
  VehicleInput,
} from '../src/index.js';
import { FollowCamera } from '../../follow-camera/src/FollowCamera.js';
import { resolveCameraBoom } from '../../follow-camera/src/CameraBoom.js';

// This scene owns terrain, obstacles, camera, input and the frame loop.
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9bac5');
scene.fog = new THREE.Fog('#a9bac5', 65, 150);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#e9f3ff', '#68604a', 2.1));
const sun = new THREE.DirectionalLight('#fff0d3', 3);
sun.position.set(-15, 35, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -55,
  right: 55,
  top: 55,
  bottom: -55,
  far: 110,
});
sun.shadow.bias = -0.0002;
scene.add(sun);
const lighting = createVehicleLighting(renderer);
const obstacles = [
  { x: 0, z: -14, radius: 1.3 },
  { x: -12, z: -22, radius: 2 },
  { x: 13, z: 7, radius: 1.8 },
];
const world = {
  height: (x, z) => x * 0.04 + Math.sin(z * 0.12) * 0.35,
  surface: () => ({ kind: 'gravel', grip: 0.85, roughness: 0.15 }),
  bounds: { minX: -70, maxX: 70, minZ: -70, maxZ: 70 },
  queryObstacles: (area) =>
    obstacles.filter(
      (o) =>
        o.x + o.radius >= area.minX &&
        o.x - o.radius <= area.maxX &&
        o.z + o.radius >= area.minZ &&
        o.z - o.radius <= area.maxZ,
    ),
};
const groundGeometry = new THREE.PlaneGeometry(140, 140, 140, 140);
groundGeometry.rotateX(-Math.PI / 2);
const points = groundGeometry.attributes.position;
for (let i = 0; i < points.count; i++)
  points.setY(i, world.height(points.getX(i), points.getZ(i)));
groundGeometry.computeVertexNormals();
const ground = new THREE.Mesh(
  groundGeometry,
  new THREE.MeshStandardMaterial({ color: '#929376', roughness: 0.98 }),
);
ground.receiveShadow = true;
scene.add(ground);
const scenery = [ground];
for (const o of obstacles) {
  const solid = new THREE.Mesh(
    new THREE.CylinderGeometry(o.radius, o.radius, 2.8, 24),
    new THREE.MeshStandardMaterial({ color: '#8c6751', roughness: 0.8 }),
  );
  solid.position.set(o.x, world.height(o.x, o.z) + 1.4, o.z);
  solid.castShadow = solid.receiveShadow = true;
  scene.add(solid);
  scenery.push(solid);
}
const selector = document.querySelector('#vehicle');
const resume = document.querySelector('#resume');
const status = document.querySelector('#status');
let vehicle,
  view,
  paused = true;
function pause() {
  paused = true;
}
function selectVehicle() {
  input.setEnabled(false);
  pause();
  view?.dispose();
  vehicle?.dispose();
  vehicle = createVehicle({
    type: selector.value,
    world,
    spawn: { x: 0, z: 8, heading: 0 },
    lighting,
  });
  scene.add(vehicle.group);
  view = new FollowCamera(camera, {
    getTarget: () => vehicle.snapshot(),
    groundHeight: world.height,
    follow: { distance: 8, height: 4.2, side: 3, lookAhead: 1.5 },
    mounted: { getPose: () => vehicle.mountedPose(), near: 0.04, fov: 70 },
    resolvePosition: (position, target) =>
      resolveCameraBoom(
        { x: target.x, y: target.y + 1.65, z: target.z },
        position,
        { groundHeight: world.height, colliders: obstacles },
      ),
  });
}
const input = new VehicleInput({
  onPause: pause,
  onAction(action) {
    if (action === 'camera') {
      const mounted = view.mode !== 'mounted';
      vehicle.setDriverView(mounted);
      view.setMode(mounted ? 'mounted' : 'follow');
    } else if (action === 'recover' || action === 'restart') {
      if (action === 'recover') vehicle.recover();
      else vehicle.reset();
      view.resetMotion();
    }
  },
});
function drive() {
  resume.blur();
  input.setEnabled(true);
  paused = false;
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
selector.addEventListener('change', selectVehicle);
resume.addEventListener('click', drive);
window.addEventListener('resize', resize);
selectVehicle();
resize();
let previous = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  // sample() can pause on menu focus, so check paused after sampling.
  const controls = input.sample();
  if (!paused) vehicle.update(dt, controls);
  view.update(dt);
  status.textContent = `${paused ? 'Paused' : 'Driving'} · ${Math.round(Math.abs(vehicle.snapshot().speed) * 3.6)} km/h · ${view.mode}`;
  renderer.render(scene, camera);
});
let disposed = false;
function dispose() {
  if (disposed) return;
  disposed = true;
  renderer.setAnimationLoop(null);
  input.dispose();
  view.dispose();
  vehicle.dispose();
  lighting.dispose();
  for (const mesh of scenery) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh.removeFromParent();
  }
  sun.shadow.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  selector.removeEventListener('change', selectVehicle);
  resume.removeEventListener('click', drive);
  window.removeEventListener('resize', resize);
  window.removeEventListener('pagehide', dispose);
}
window.addEventListener('pagehide', dispose);
if (new URLSearchParams(location.search).get('test') === '1') {
  window.__vehiclesExample = {
    snapshot: () => ({ ...vehicle.snapshot(), paused, mode: view.mode }),
    memory: () => ({
      ...renderer.info.memory,
      programs: renderer.info.programs.length,
    }),
    mountedPose: () => vehicle.mountedPose(),
    renderer: () => {
      const gl = renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    },
    dispose,
  };
}
