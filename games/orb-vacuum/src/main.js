import * as THREE from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import {
  createPlayer,
  initInput,
  initOrbs,
  updatePlayer,
  updateGame,
  ARENA_HALF,
  playerYaw,        // ESM live binding — re-read each frame via getter below
} from './game.js';

// ESM live bindings: `playerYaw` here is a live view of game.js's export.
// Access it via the namespace object so reads always get the current value.
import * as GameModule from './game.js';

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x020408);
document.body.appendChild(renderer.domElement);

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020408, 0.018);

// ─── Lights ───────────────────────────────────────────────────────────────────
// Art spec: AmbientLight only — no directional, no point lights
const ambient = new THREE.AmbientLight(0xffffff, 0.08);
scene.add(ambient);

// ─── Arena ────────────────────────────────────────────────────────────────────
function buildArena() {
  const H = ARENA_HALF;

  // Floor grid
  const gridHelper = new THREE.GridHelper(H * 2, Math.round(H * 2 / 5), 0x1a1a2e, 0x0d0d1a);
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  // Wireframe walls — barely-visible cage
  const wallMat = new THREE.LineBasicMaterial({ color: 0x0d2b4f, transparent: true, opacity: 0.35 });
  const wallHeight = 8;

  const wallDefs = [
    { pos: [0, wallHeight / 2, -H], rotY: 0 },
    { pos: [0, wallHeight / 2,  H], rotY: Math.PI },
    { pos: [ H, wallHeight / 2, 0], rotY: -Math.PI / 2 },
    { pos: [-H, wallHeight / 2, 0], rotY:  Math.PI / 2 },
  ];

  for (const def of wallDefs) {
    const geo  = new THREE.PlaneGeometry(H * 2, wallHeight);
    const edges = new THREE.EdgesGeometry(geo);
    const ls   = new THREE.LineSegments(edges, wallMat);
    ls.position.set(...def.pos);
    ls.rotation.y = def.rotY;
    scene.add(ls);
  }
}

buildArena();

// ─── Player + Orbs ────────────────────────────────────────────────────────────
const player = createPlayer(scene);
initInput();
initOrbs(scene);

// ─── Camera ───────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

const CAM_ELEVATION = Math.PI / 5.5; // ~33° above horizon

function updateCamera() {
  const yaw = GameModule.playerYaw;
  // Camera distance scales with player size: close when tiny, pulls back as you grow
  const CAM_DISTANCE = Math.max(10, GameModule.playerRadius * 8 + 6);
  const cosEl = Math.cos(CAM_ELEVATION);
  const x = Math.sin(yaw) * CAM_DISTANCE * cosEl;
  const y = CAM_DISTANCE * Math.sin(CAM_ELEVATION);
  const z = Math.cos(yaw) * CAM_DISTANCE * cosEl;
  camera.position.set(
    player.position.x + x,
    player.position.y + y,
    player.position.z + z,
  );
  camera.lookAt(player.position.x, player.position.y + 0.5, player.position.z);
}

updateCamera();

// ─── Post-processing ──────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.2,   // strength
  0.6,   // radius
  0.4,   // threshold — only bright emissives bloom, floor stays clean
);
composer.addPass(bloomPass);

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Loop ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);

  updatePlayer(player, delta);
  updateGame(player, scene, delta);
  updateCamera();

  composer.render();
}

animate();
