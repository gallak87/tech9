import * as THREE from 'three';

// Arena half-extent — walls sit at ±ARENA_HALF on X and Z
export const ARENA_HALF = 30;

export function createPlayer(scene) {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x88ffff,
    emissive: 0x00cccc,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 1, 0); // sit just above the floor plane
  scene.add(mesh);
  return mesh;
}

// Input state — WASD + arrow keys
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

export function initInput() {
  window.addEventListener('keydown', e => { if (e.key in keys) { keys[e.key] = true; e.preventDefault(); } });
  window.addEventListener('keyup',   e => { if (e.key in keys)   keys[e.key] = false; });
}

const MOVE_SPEED  = 32;   // units/sec
const TURN_SPEED  = 2.4;  // rad/sec
const DRAG        = 7;

// Player facing angle (yaw) — exported so main.js can lock camera behind
export let playerYaw = 0;

const velocity = new THREE.Vector3();

export function updatePlayer(player, delta) {
  const fwd  = keys.w || keys.ArrowUp;
  const back = keys.s || keys.ArrowDown;
  const left = keys.a || keys.ArrowLeft;
  const right= keys.d || keys.ArrowRight;

  // Turn
  if (left)  playerYaw += TURN_SPEED * delta;
  if (right) playerYaw -= TURN_SPEED * delta;

  // Move along facing direction
  let thrust = 0;
  if (fwd)  thrust -= 1;
  if (back) thrust += 1;

  if (thrust !== 0) {
    velocity.x += Math.sin(playerYaw) * thrust * MOVE_SPEED * delta;
    velocity.z += Math.cos(playerYaw) * thrust * MOVE_SPEED * delta;
  }

  // Drag
  velocity.x -= velocity.x * DRAG * delta;
  velocity.z -= velocity.z * DRAG * delta;
  if (Math.abs(velocity.x) < 0.001) velocity.x = 0;
  if (Math.abs(velocity.z) < 0.001) velocity.z = 0;

  player.position.x += velocity.x * delta;
  player.position.z += velocity.z * delta;

  // Wall clamp
  const limit = ARENA_HALF - 1;
  player.position.x = Math.max(-limit, Math.min(limit, player.position.x));
  player.position.z = Math.max(-limit, Math.min(limit, player.position.z));
}
