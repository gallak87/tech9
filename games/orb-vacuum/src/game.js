import * as THREE from 'three';

// ─── Arena ────────────────────────────────────────────────────────────────────
export const ARENA_HALF = 30;

// ─── Player State ─────────────────────────────────────────────────────────────
const PLAYER_RADIUS_START = 0.6;
const PLAYER_RADIUS_MIN   = 0.4;
const PLAYER_RADIUS_MAX   = 12.0;

export let playerYaw    = 0;
export let playerRadius = PLAYER_RADIUS_START;
let score        = 0;
let invincible   = false;
let invincTimer  = 0;
let sessionMaxRadius = PLAYER_RADIUS_START;

// Absorb pulse animation state
const absorbAnim = { active: false, t: 0 };
// Hit flash animation state
const hitAnim    = { active: false, t: 0 };

// ─── NPC Orb Pool ─────────────────────────────────────────────────────────────
// Each entry: { mesh, radius, vx, vz, dying, dyingT }
const orbs = [];

// ─── Difficulty State ─────────────────────────────────────────────────────────
let diffTick        = 0;
let diffTimer       = 0;
let spawnRate       = 2.0;        // orbs/sec
let spawnMaxRadius  = 4.0;        // threats always present from the start
let spawnSpeedMin   = 0.8;
let spawnSpeedMax   = 1.4;
let spawnTimer      = 0;
let gameTime        = 0;

// ─── Color Tiers ──────────────────────────────────────────────────────────────
const TIERS = [
  // tiny: < 40% of player — bright neon green, very inviting
  { base: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 2.5 },
  // small: 40–80% — green, clearly safe
  { base: 0x44ff00, emissive: 0x44ff00, emissiveIntensity: 2.0 },
  // near: 80–99% — yellow, caution
  { base: 0xffee00, emissive: 0xffee00, emissiveIntensity: 1.6 },
  // threat: 101–150% — red-orange, clearly dangerous
  { base: 0xff3300, emissive: 0xff1100, emissiveIntensity: 1.4 },
  // danger: > 150% — deep red, very dangerous
  { base: 0xdd0000, emissive: 0x990000, emissiveIntensity: 1.2 },
];

function tierForOrb(orbRadius) {
  const ratio = orbRadius / playerRadius;
  if (ratio < 0.40) return 0; // tiny
  if (ratio < 0.80) return 1; // small
  if (ratio < 1.00) return 2; // near
  if (ratio <= 1.50) return 3; // threat
  return 4;                     // danger
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
let scoreEl, sizeBarFill, hitFlashEl;

function buildHUD() {
  // Google Fonts — Orbitron
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap';
  document.head.appendChild(link);

  // Score
  scoreEl = document.createElement('div');
  scoreEl.id = 'score';
  Object.assign(scoreEl.style, {
    position:   'fixed',
    top:        '28px',
    left:       '50%',
    transform:  'translateX(-50%)',
    fontFamily: "'Orbitron', monospace",
    fontSize:   '64px',
    fontWeight: '700',
    color:      '#ffffff',
    textShadow: '0 0 8px #00e5ff, 0 0 20px #00e5ff, 0 0 48px #0077aa',
    letterSpacing: '0.08em',
    userSelect: 'none',
    pointerEvents: 'none',
    zIndex: '20',
  });
  scoreEl.textContent = '0';
  document.body.appendChild(scoreEl);

  // Size bar container
  const sizeBarContainer = document.createElement('div');
  sizeBarContainer.id = 'size-bar-container';
  Object.assign(sizeBarContainer.style, {
    position:   'fixed',
    top:        '108px',
    left:       '50%',
    transform:  'translateX(-50%)',
    width:      '200px',
    height:     '3px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '2px',
    zIndex: '20',
  });
  document.body.appendChild(sizeBarContainer);

  sizeBarFill = document.createElement('div');
  sizeBarFill.id = 'size-bar-fill';
  Object.assign(sizeBarFill.style, {
    height:       '100%',
    background:   '#00e5ff',
    boxShadow:    '0 0 6px #00e5ff',
    borderRadius: '2px',
    transition:   'width 0.2s ease',
    width:        '100%',
  });
  sizeBarContainer.appendChild(sizeBarFill);

  // Hit flash overlay
  hitFlashEl = document.createElement('div');
  hitFlashEl.id = 'hit-flash';
  Object.assign(hitFlashEl.style, {
    position:      'fixed',
    inset:         '0',
    background:    'rgba(255, 30, 0, 0.28)',
    pointerEvents: 'none',
    opacity:       '0',
    zIndex:        '10',
  });
  document.body.appendChild(hitFlashEl);
}

function updateHUD() {
  scoreEl.textContent = score;

  if (playerRadius > sessionMaxRadius) sessionMaxRadius = playerRadius;
  const pct = sessionMaxRadius > 0 ? (playerRadius / sessionMaxRadius) * 100 : 100;
  sizeBarFill.style.width = pct.toFixed(1) + '%';
}

// ─── Player Creation ──────────────────────────────────────────────────────────
export function createPlayer(scene) {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color:            0x00e5ff,
    emissive:         0x00b8d4,
    emissiveIntensity: 1.8,
    roughness:        0.15,
    metalness:        0.05,
    transparent:      true,
    opacity:          1.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, playerRadius, 0);
  mesh.scale.setScalar(playerRadius);
  scene.add(mesh);

  buildHUD();

  return mesh;
}

// ─── Input ────────────────────────────────────────────────────────────────────
const keys = {
  w: false, a: false, s: false, d: false,
  ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
};

export function initInput() {
  window.addEventListener('keydown', e => { if (e.key in keys) { keys[e.key] = true; e.preventDefault(); } });
  window.addEventListener('keyup',   e => { if (e.key in keys) keys[e.key] = false; });
}

const MOVE_SPEED = 60;
const TURN_SPEED = 3.2;
const DRAG       = 6;

const velocity = new THREE.Vector3();

// ─── Orb Helpers ──────────────────────────────────────────────────────────────
function makeOrbMesh(radius, scene) {
  const geo = new THREE.SphereGeometry(1, 20, 20);
  const mat = new THREE.MeshStandardMaterial({
    color:            0x00ff44,
    emissive:         0x00ff44,
    emissiveIntensity: 2.0,
    roughness:        0.2,
    metalness:        0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(radius);
  return mesh;
}

function randomOrbRadius(isFood) {
  if (isFood) {
    // Food: clearly smaller than player — 20% to 80% of current player radius
    return playerRadius * (0.2 + Math.random() * 0.6);
  } else {
    // Threat: clearly bigger — 140% to 350% of current player radius, capped at spawnMaxRadius
    const minR = playerRadius * 1.4;
    const maxR = Math.min(playerRadius * 3.5, spawnMaxRadius);
    if (maxR <= minR) return minR * 1.1; // safety fallback
    return minR + Math.random() * (maxR - minR);
  }
}

function spawnOrbAtWall(scene) {
  const angle = Math.random() * Math.PI * 2;
  const H = ARENA_HALF - 0.5;
  const x = Math.cos(angle) * H;
  const z = Math.sin(angle) * H;

  // 65% food, 35% threats
  const isFood = Math.random() < 0.65;
  const r = randomOrbRadius(isFood);

  const mesh = makeOrbMesh(r, scene);
  mesh.position.set(x, r, z);
  scene.add(mesh);

  const inwardAngle = Math.atan2(-x, -z);
  const spread = (Math.random() - 0.5) * (Math.PI / 180 * 50);
  const driftAngle = inwardAngle + spread;
  const speed = spawnSpeedMin + Math.random() * (spawnSpeedMax - spawnSpeedMin);

  orbs.push({ mesh, radius: r, vx: Math.sin(driftAngle) * speed, vz: Math.cos(driftAngle) * speed, dying: false, dyingT: 0 });
}

export function initOrbs(scene) {
  const H = ARENA_HALF - 4;
  // 20 food + 8 threats spread around the arena, all away from player start
  for (let i = 0; i < 28; i++) {
    const isFood = i < 20;
    let x, z;
    do {
      x = (Math.random() * 2 - 1) * H;
      z = (Math.random() * 2 - 1) * H;
    } while (Math.sqrt(x * x + z * z) < (isFood ? 5 : 8));

    const r = randomOrbRadius(isFood);
    const mesh = makeOrbMesh(r, scene);
    mesh.position.set(x, r, z);
    scene.add(mesh);

    const driftAngle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 0.6;
    orbs.push({ mesh, radius: r, vx: Math.sin(driftAngle) * speed, vz: Math.cos(driftAngle) * speed, dying: false, dyingT: 0 });
  }
}

function updateOrbColors() {
  for (const orb of orbs) {
    if (orb.dying) continue;
    const t = tierForOrb(orb.radius);
    orb.mesh.material.color.setHex(TIERS[t].base);
    orb.mesh.material.emissive.setHex(TIERS[t].emissive);
    orb.mesh.material.emissiveIntensity = TIERS[t].emissiveIntensity;
  }
}

// ─── Animations ───────────────────────────────────────────────────────────────
function triggerAbsorb(player) {
  absorbAnim.active = true;
  absorbAnim.t = 0;
}

function triggerHit(player) {
  hitAnim.active = true;
  hitAnim.t = 0;
}

function updateAbsorbAnim(player, delta) {
  if (!absorbAnim.active) return;
  absorbAnim.t += delta * 1000; // ms
  const BASE = playerRadius;

  if (absorbAnim.t <= 80) {
    // 0–80ms: scale 1.0→1.12
    const p = absorbAnim.t / 80;
    const scale = BASE * (1.0 + 0.12 * p);
    player.scale.setScalar(scale);
    player.material.emissiveIntensity = 1.8 + (3.5 - 1.8) * p;
  } else if (absorbAnim.t <= 260) {
    // 80–260ms: scale 1.12→1.0
    const p = (absorbAnim.t - 80) / 180;
    const scale = BASE * (1.12 - 0.12 * p);
    player.scale.setScalar(scale);
    player.material.emissiveIntensity = 3.5 - (3.5 - 1.8) * p;
  } else {
    player.scale.setScalar(BASE);
    player.material.emissiveIntensity = 1.8;
    absorbAnim.active = false;
  }
}

function updateHitAnim(player, delta) {
  if (!hitAnim.active) return;
  hitAnim.t += delta * 1000; // ms

  if (hitAnim.t <= 60) {
    // 0–60ms: flash in
    const p = hitAnim.t / 60;
    hitFlashEl.style.opacity = p.toFixed(3);
    // emissive color: cyan → red
    player.material.emissive.lerpColors(
      new THREE.Color(0x00b8d4),
      new THREE.Color(0xff1a1a),
      p,
    );
  } else if (hitAnim.t <= 380) {
    // 60–380ms: fade out
    const p = (hitAnim.t - 60) / 320;
    hitFlashEl.style.opacity = (1 - p).toFixed(3);
    // emissive back to cyan
    player.material.emissive.lerpColors(
      new THREE.Color(0xff1a1a),
      new THREE.Color(0x00b8d4),
      p,
    );
  } else {
    hitFlashEl.style.opacity = '0';
    player.material.emissive.setHex(0x00b8d4);
    hitAnim.active = false;
  }
}

function updateInvincFlicker(player, dt) {
  if (!invincible) {
    player.material.opacity = 1.0;
    return;
  }
  // ~8Hz flicker using gameTime
  player.material.opacity = Math.sin(gameTime * Math.PI * 16) > 0 ? 1.0 : 0.3;
}

// ─── Main Update ──────────────────────────────────────────────────────────────
export function updatePlayer(player, delta) {
  gameTime += delta;

  const fwd   = keys.w || keys.ArrowUp;
  const back  = keys.s || keys.ArrowDown;
  const left  = keys.a || keys.ArrowLeft;
  const right = keys.d || keys.ArrowRight;

  // Turn
  if (left)  playerYaw += TURN_SPEED * delta;
  if (right) playerYaw -= TURN_SPEED * delta;

  // Move
  let thrust = 0;
  if (fwd)  thrust -= 1;
  if (back) thrust += 1;

  if (thrust !== 0) {
    velocity.x += Math.sin(playerYaw) * thrust * MOVE_SPEED * delta;
    velocity.z += Math.cos(playerYaw) * thrust * MOVE_SPEED * delta;
  }

  velocity.x -= velocity.x * DRAG * delta;
  velocity.z -= velocity.z * DRAG * delta;
  if (Math.abs(velocity.x) < 0.001) velocity.x = 0;
  if (Math.abs(velocity.z) < 0.001) velocity.z = 0;

  player.position.x += velocity.x * delta;
  player.position.z += velocity.z * delta;

  // Wall clamp
  const limit = ARENA_HALF - playerRadius;
  player.position.x = Math.max(-limit, Math.min(limit, player.position.x));
  player.position.z = Math.max(-limit, Math.min(limit, player.position.z));
  player.position.y = playerRadius; // float above floor at radius height
}

export function updateGame(player, scene, delta) {
  // gameTime already incremented in updatePlayer

  // ── Invincibility timer ──
  if (invincible) {
    invincTimer -= delta;
    if (invincTimer <= 0) {
      invincible = false;
      player.material.opacity = 1.0;
    }
  }

  // ── NPC Orb update ──

  for (let i = orbs.length - 1; i >= 0; i--) {
    const orb = orbs[i];

    if (orb.dying) {
      orb.dyingT += delta * 1000;
      const p = Math.min(orb.dyingT / 120, 1); // 120ms ease-in
      const scale = orb.radius * (1 - p * p); // ease-in: slow then fast collapse
      orb.mesh.scale.setScalar(Math.max(scale, 0));
      if (orb.dyingT >= 120) {
        scene.remove(orb.mesh);
        orb.mesh.geometry.dispose();
        orb.mesh.material.dispose();
        orbs.splice(i, 1);
      }
      continue;
    }

    // Drift
    orb.mesh.position.x += orb.vx * delta;
    orb.mesh.position.z += orb.vz * delta;

    // Despawn at wall
    const ox = orb.mesh.position.x;
    const oz = orb.mesh.position.z;
    if (Math.abs(ox) >= ARENA_HALF || Math.abs(oz) >= ARENA_HALF) {
      scene.remove(orb.mesh);
      orb.mesh.geometry.dispose();
      orb.mesh.material.dispose();
      orbs.splice(i, 1);
      continue;
    }

    // ── Collision with player ──
    const dx = player.position.x - orb.mesh.position.x;
    const dz = player.position.z - orb.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const touchDist = playerRadius + orb.radius;

    if (dist < touchDist) {
      if (playerRadius >= orb.radius * 1.1) {
        // Absorb
        playerRadius = Math.min(PLAYER_RADIUS_MAX, playerRadius + orb.radius * 0.25);
        score++;
        orb.dying = true;
        triggerAbsorb(player);
      } else if (orb.radius >= playerRadius * 1.1 && !invincible) {
        // Shrink
        playerRadius = Math.max(PLAYER_RADIUS_MIN, playerRadius - orb.radius * 0.35);
        invincible = true;
        invincTimer = 1.2;
        triggerHit(player);
      }
    }
  }

  // ── Difficulty escalation ──
  if (diffTick < 10) {
    diffTimer += delta;
    if (diffTimer >= 30) {
      diffTimer -= 30;
      diffTick++;
      spawnRate     = Math.min(5.5, spawnRate + 0.4);
      spawnMaxRadius = Math.min(9.0, spawnMaxRadius + 0.5);
      spawnSpeedMin  = Math.min(2.3, spawnSpeedMin + 0.15);
      spawnSpeedMax  = Math.min(2.9, spawnSpeedMax + 0.15);
    }
  }

  // ── Spawn new orbs ──
  const liveCount = orbs.filter(o => !o.dying).length;
  if (liveCount < 80) {
    spawnTimer += delta;
    const interval = 1 / spawnRate;
    while (spawnTimer >= interval) {
      spawnTimer -= interval;
      const live = orbs.filter(o => !o.dying).length;
      if (live < 80) {
        spawnOrbAtWall(scene);
      }
    }
  } else if (liveCount >= 80) {
    // Pause spawn, keep timer from accumulating
    spawnTimer = 0;
  }

  // ── Update player mesh scale ──
  if (!absorbAnim.active) {
    player.scale.setScalar(playerRadius);
  }
  player.position.y = playerRadius;

  // ── Animations ──
  updateAbsorbAnim(player, delta);
  updateHitAnim(player, delta);
  updateInvincFlicker(player, delta);

  // ── Update orb colors ──
  updateOrbColors();

  // ── HUD ──
  updateHUD();
}
