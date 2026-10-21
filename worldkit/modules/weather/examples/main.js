import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWeather } from '../src/Weather.js';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9faeba');
scene.fog = new THREE.FogExp2('#9faeba', 0.015);
const camera = new THREE.PerspectiveCamera(
  50,
  innerWidth / innerHeight,
  0.1,
  100,
);
camera.position.set(10, 8, 14);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();
scene.add(new THREE.HemisphereLight('#e1efff', '#485243', 2));
const sun = new THREE.DirectionalLight('#fff3df', 3);
sun.position.set(8, 12, 4);
scene.add(sun);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: '#746d56',
  roughness: 0.96,
});
const roofMaterial = new THREE.MeshStandardMaterial({
  color: '#485c58',
  roughness: 0.85,
});
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30, 80, 80),
  groundMaterial,
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 8), roofMaterial);
roof.position.set(-4, 4, 0);
scene.add(roof);
const weather = createWeather({
  targets: [
    { material: groundMaterial, ground: true },
    { material: roofMaterial },
  ],
  surfaceBounds: { minX: -15, maxX: 15, minZ: -15, maxZ: 15 },
  sampleSurface: (x, z) => {
    const covered = x > -7.5 && x < -0.5 && Math.abs(z) < 4;
    return {
      position: [x, 0, z],
      normal: [0, 1, 0],
      exposure: covered ? 0 : 1,
      coverHeight: covered ? 4.15 : 0,
      puddle: 1,
    };
  },
  features: { audio: false },
});
weather.init({ scene, camera });
weather.setPreset('rain');
for (const button of document.querySelectorAll('button'))
  button.addEventListener('click', () => weather.setPreset(button.id));
let last = performance.now();
renderer.setAnimationLoop((now) => {
  weather.update((now - last) / 1000);
  last = now;
  const c = weather.condition;
  sun.intensity = 3 * (1 - c.cloud * 0.85);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
addEventListener(
  'pagehide',
  () => {
    renderer.setAnimationLoop(null);
    weather.dispose();
    controls.dispose();
    ground.geometry.dispose();
    roof.geometry.dispose();
    groundMaterial.dispose();
    roofMaterial.dispose();
    renderer.dispose();
  },
  { once: true },
);
