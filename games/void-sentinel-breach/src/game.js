import * as THREE from 'three';

// ─── State Machine ────────────────────────────────────────────────────────────
export const STATE = { MENU: 'MENU', PLAYING: 'PLAYING', BOSS: 'BOSS', WIN: 'WIN', GAME_OVER: 'GAME_OVER' };
export let currentState = STATE.MENU;

export function transitionTo(next) {
  console.log(`[state] ${currentState} → ${next}`);
  currentState = next;
  if (next === STATE.BOSS) console.log('[state] boss entered');
  if (next === STATE.PLAYING) {
    score = 0;
    lives = 3;
    bombs = 3;
    weaponTier = 1;
    bullets.length = 0;
    player.position.set(0, 0.6, 0);
    player.userData.velX = 0;
    player.userData.velY = 0;
  }
}

// ─── Exports read by main.js each frame ──────────────────────────────────────
export let score = 0;
export let lives = 3;
export let bombs = 3;
export let weaponTier = 1;
export let cameraShakeIntensity = 0; // main.js reads + decays this

// ─── Scene objects exposed so main.js can add them to scene ──────────────────
export let player;           // Mesh
export let terrainPlane;     // Mesh
export let cloudLayers = []; // [Mesh, Mesh]
export let hazeMesh;         // Mesh
export const bullets = [];   // { mesh, vel }[]

// ─── Input ────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;

  // State transitions via keyboard
  if ((e.code === 'Enter' || e.code === 'Space') && currentState === STATE.MENU) {
    transitionTo(STATE.PLAYING);
  }
  if (e.code === 'KeyR' && (currentState === STATE.WIN || currentState === STATE.GAME_OVER)) {
    transitionTo(STATE.MENU);
  }
  // Dev shortcuts for testing all transitions
  if (window.__DEV_TOOLS__) {
    if (e.code === 'Digit1') transitionTo(STATE.MENU);
    if (e.code === 'Digit2') transitionTo(STATE.PLAYING);
    if (e.code === 'Digit3') transitionTo(STATE.BOSS);
    if (e.code === 'Digit4') transitionTo(STATE.WIN);
    if (e.code === 'Digit5') transitionTo(STATE.GAME_OVER);
  }

  // Weapon tier cycle
  if ((e.code === 'Space' || e.code === 'KeyZ') && currentState === STATE.PLAYING) {
    weaponTier = weaponTier < 7 ? weaponTier + 1 : 1;
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// Click to start / restart
window.addEventListener('click', () => {
  if (currentState === STATE.MENU) transitionTo(STATE.PLAYING);
  else if (currentState === STATE.WIN || currentState === STATE.GAME_OVER) transitionTo(STATE.MENU);
});

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_SPEED   = 8;
const PLAYER_BOUND_X = 6;
const PLAYER_BOUND_Y_MIN = 0.3;
const PLAYER_BOUND_Y_MAX = 4.5;
const BULLET_SPEED   = 30;
const FIRE_INTERVAL  = 0.12; // seconds between auto-fire shots
const WORLD_SPEED    = 20;   // terrain scroll speed (units/sec)
const CLOUD_SPEED_1  = 8;
const CLOUD_SPEED_2  = 14;

// ─── Build scene objects ──────────────────────────────────────────────────────
export function buildWorld(scene) {
  // Terrain — large flat plane, tileable color
  const terrainGeo = new THREE.PlaneGeometry(60, 300, 10, 60);
  const terrainMat = new THREE.MeshLambertMaterial({ color: 0x1a3a1a, wireframe: false });
  terrainPlane = new THREE.Mesh(terrainGeo, terrainMat);
  terrainPlane.rotation.x = -Math.PI / 2;
  terrainPlane.position.set(0, 0, -80);
  scene.add(terrainPlane);

  // Add grid lines on terrain for speed sense
  const gridGeo = new THREE.PlaneGeometry(60, 300, 20, 120);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x2a5a2a, wireframe: true, transparent: true, opacity: 0.3 });
  const gridMesh = new THREE.Mesh(gridGeo, gridMat);
  gridMesh.rotation.x = -Math.PI / 2;
  gridMesh.position.set(0, 0.01, -80);
  scene.add(gridMesh);
  terrainPlane.userData.grid = gridMesh;

  // Cloud layer 1 — low, fast, blue-grey boxes
  const cl1 = buildCloudLayer(scene, 0x4466aa, 10, 5, 2, 3, 0.6);
  cloudLayers[0] = cl1;

  // Cloud layer 2 — high, slow, white-ish puffs
  const cl2 = buildCloudLayer(scene, 0xaabbcc, 8, 7, 2.8, 4.5, 1.2);
  cloudLayers[1] = cl2;

  // Atmosphere haze — semi-transparent plane near horizon
  const hazeGeo = new THREE.PlaneGeometry(200, 30);
  const hazeMat = new THREE.MeshBasicMaterial({
    color: 0x001133,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  hazeMesh = new THREE.Mesh(hazeGeo, hazeMat);
  hazeMesh.position.set(0, 2.5, -55);
  scene.add(hazeMesh);

  // Player ship — cyan box placeholder
  const shipGeo = new THREE.BoxGeometry(1.2, 0.3, 2);
  const shipMat = new THREE.MeshLambertMaterial({ color: 0x00ffee, emissive: 0x003322 });
  player = new THREE.Mesh(shipGeo, shipMat);
  player.position.set(0, 0.6, 0);
  player.userData.velX = 0;
  player.userData.velY = 0;

  // Wing fins
  const finGeo = new THREE.BoxGeometry(2.4, 0.1, 0.8);
  const finMat = new THREE.MeshLambertMaterial({ color: 0x0099cc, emissive: 0x001122 });
  const fins = new THREE.Mesh(finGeo, finMat);
  fins.position.set(0, 0, 0.2);
  player.add(fins);

  // Engine glow — orange cone pointing back (emissive, picked up by bloom)
  const engineGeo = new THREE.ConeGeometry(0.22, 0.7, 8);
  const engineMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, 1.1);
  player.add(engine);

  scene.add(player);
}

function buildCloudLayer(scene, color, count, spread, yBase, yRange, scale) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(3 * scale, 0.8 * scale, 2 * scale);
  const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.55 });
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(
      (Math.random() - 0.5) * spread * 2,
      yBase + Math.random() * yRange,
      -20 - Math.random() * 80
    );
    group.add(m);
  }
  scene.add(group);
  return group;
}

// ─── Auto-fire timer ──────────────────────────────────────────────────────────
let fireTimer = 0;

function spawnBullet(scene) {
  // T1: single shot from nose
  const geo = new THREE.BoxGeometry(0.12, 0.12, 0.6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // yellow — bloom candidate
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(player.position);
  mesh.position.z -= 1.2; // fire forward (−Z = world forward in our layout)
  scene.add(mesh);
  bullets.push({ mesh, vel: new THREE.Vector3(0, 0, -BULLET_SPEED) });
}

// ─── Per-frame update ─────────────────────────────────────────────────────────
export function update(dt, scene) {
  if (currentState !== STATE.PLAYING) return;

  // Player movement
  const dx =
    ((keys['ArrowRight'] || keys['KeyD']) ? 1 : 0) -
    ((keys['ArrowLeft']  || keys['KeyA']) ? 1 : 0);
  const dy =
    ((keys['ArrowUp']    || keys['KeyW']) ? 1 : 0) -
    ((keys['ArrowDown']  || keys['KeyS']) ? 1 : 0);

  player.position.x += dx * PLAYER_SPEED * dt;
  player.position.y += dy * PLAYER_SPEED * dt;

  // Clamp to screen bounds
  player.position.x = Math.max(-PLAYER_BOUND_X, Math.min(PLAYER_BOUND_X, player.position.x));
  player.position.y = Math.max(PLAYER_BOUND_Y_MIN, Math.min(PLAYER_BOUND_Y_MAX, player.position.y));

  // Bank slightly on horizontal input
  player.rotation.z = -dx * 0.35;
  player.rotation.x =  dy * 0.12;

  // Auto-fire
  fireTimer -= dt;
  if (fireTimer <= 0) {
    spawnBullet(scene);
    fireTimer = FIRE_INTERVAL;
  }

  // Bullet movement + cull
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.addScaledVector(b.vel, dt);
    if (b.mesh.position.z < -80) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      bullets.splice(i, 1);
    }
  }

  // World scroll — move terrain + grid back, wrap when they drift too far forward
  terrainPlane.position.z += WORLD_SPEED * dt;
  if (terrainPlane.userData.grid) {
    terrainPlane.userData.grid.position.z += WORLD_SPEED * dt;
  }
  // Wrap terrain so it never runs out
  if (terrainPlane.position.z > 60) {
    terrainPlane.position.z -= 300;
    if (terrainPlane.userData.grid) terrainPlane.userData.grid.position.z -= 300;
  }

  // Cloud layer scroll
  scrollClouds(cloudLayers[0], CLOUD_SPEED_1, dt);
  scrollClouds(cloudLayers[1], CLOUD_SPEED_2, dt);

  // Score ticks up while playing
  score += Math.floor(dt * 100);

  // Decay camera shake
  if (cameraShakeIntensity > 0) {
    cameraShakeIntensity = Math.max(0, cameraShakeIntensity - dt * 4);
  }
}

function scrollClouds(group, speed, dt) {
  for (const child of group.children) {
    child.position.z += speed * dt;
    if (child.position.z > 10) {
      child.position.z -= 120;
      child.position.x = (Math.random() - 0.5) * 24;
    }
  }
}

// Trigger shake externally (e.g. main.js on hit)
export function triggerShake(amount = 0.4) {
  cameraShakeIntensity = amount;
}
