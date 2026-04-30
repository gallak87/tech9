import * as THREE from 'three';
import { createPlayer, initInput, updatePlayer, ARENA_HALF, playerYaw } from './game.js';

// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0a0f);
document.body.appendChild(renderer.domElement);

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a0f, 60, 120);

// ─── Lights ───────────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Point light that follows player (set up later in loop)
const playerLight = new THREE.PointLight(0x00ffff, 1.5, 20);
scene.add(playerLight);

// ─── Arena ────────────────────────────────────────────────────────────────────
function buildArena() {
  const H = ARENA_HALF;

  // Floor grid — faint reference
  const gridHelper = new THREE.GridHelper(H * 2, 20, 0x1a1a2e, 0x1a1a2e);
  scene.add(gridHelper);

  // Wireframe bounding box
  const boxGeo = new THREE.BoxGeometry(H * 2, 0.5, H * 2);
  const edges = new THREE.EdgesGeometry(boxGeo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x334466, linewidth: 1 });
  const wireBox = new THREE.LineSegments(edges, lineMat);
  wireBox.position.y = 0.25;
  scene.add(wireBox);

  // Four wall outlines (taller wireframe walls so you see the arena boundary)
  const wallHeight = 4;
  const wallMat = new THREE.LineBasicMaterial({ color: 0x223355 });

  const walls = [
    // north
    new THREE.BoxGeometry(H * 2, wallHeight, 0.1),
    // south
    new THREE.BoxGeometry(H * 2, wallHeight, 0.1),
    // east
    new THREE.BoxGeometry(0.1, wallHeight, H * 2),
    // west
    new THREE.BoxGeometry(0.1, wallHeight, H * 2),
  ];
  const offsets = [
    [0, wallHeight / 2, -H],
    [0, wallHeight / 2, H],
    [H, wallHeight / 2, 0],
    [-H, wallHeight / 2, 0],
  ];
  walls.forEach((g, i) => {
    const e = new THREE.EdgesGeometry(g);
    const ls = new THREE.LineSegments(e, wallMat);
    ls.position.set(...offsets[i]);
    scene.add(ls);
  });
}

buildArena();

// ─── Player ───────────────────────────────────────────────────────────────────
const player = createPlayer(scene);
initInput();

// ─── Camera ───────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

const CAM_ELEVATION = Math.PI / 5.5; // ~33 deg above horizon
const CAM_DISTANCE  = 22;

function applyCameraOrbit() {
  // Camera locks behind player — azimuth tracks playerYaw from game.js
  // playerYaw is a module-level let in game.js; we re-import it each frame via the live binding
  const yaw = playerYaw;
  const x = Math.sin(yaw) * CAM_DISTANCE * Math.cos(CAM_ELEVATION);
  const y = CAM_DISTANCE * Math.sin(CAM_ELEVATION);
  const z = Math.cos(yaw) * CAM_DISTANCE * Math.cos(CAM_ELEVATION);
  camera.position.set(
    player.position.x + x,
    player.position.y + y,
    player.position.z + z,
  );
  camera.lookAt(player.position.x, player.position.y + 0.5, player.position.z);
}

applyCameraOrbit();

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Loop ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1); // cap at 100ms to avoid spiral on tab-switch

  updatePlayer(player, delta);

  // Player light tracks orb
  playerLight.position.copy(player.position).y += 2;

  applyCameraOrbit();

  renderer.render(scene, camera);
}

animate();
