import * as THREE from 'three';
import GEO_MANIFEST from '../geo-manifest.json';
import { initAudio, playSound } from './audio.js';
import { initScenery, updateScenery } from './scenery.js';

// ─── State Machine ────────────────────────────────────────────────────────────
export const STATE = { MENU: 'MENU', PLAYING: 'PLAYING', BOSS: 'BOSS', WIN: 'WIN', GAME_OVER: 'GAME_OVER' };
export let currentState = STATE.MENU;

// ─── Wave system exports ──────────────────────────────────────────────────────
export let currentWave = 0;
export const waveCount = 6;
export let boss = null;
export let bossPhaseTransition = false;

// ─── Run stats (for end screen) ──────────────────────────────────────────────
export let waveReached = 0;
export let timeStarted = 0;
export let timeSurvived = 0;

export function transitionTo(next) {
  console.log(`[state] ${currentState} → ${next}`);
  const prev = currentState;
  currentState = next;

  if (next === STATE.PLAYING) {
    initAudio();
    score = 0;
    lives = 3;
    bombCount = 0;
    weaponTier = 1;
    invincibleTimer = 0;
    flashTimer = 0;
    fireTimer = 0;
    currentWave = 0;
    waveReached = 0;
    timeStarted = performance.now() / 1000;
    timeSurvived = 0;
    _waveState = 'idle';
    _waveTimer = 0;
    _wavePauseTimer = 0;
    _waveFlashTimer = 0;
    _waveFlashRef.text = '';
    _waveFlashRef.timer = 0;
    _waveSpawnQueue = [];
    _worldSpeed = 2.0;
    bossPhaseTransition = false;

    // Clear boss if any
    if (boss) {
      _cleanupBoss();
    }

    // Clear all bullets, enemies, pickups from scene
    for (const b of playerBullets) { _scene && _scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    playerBullets.length = 0;
    for (const b of enemyBullets) { _scene && _scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    enemyBullets.length = 0;
    for (const e of enemies) { _scene && _scene.remove(e.mesh); _disposeMesh(e.mesh); }
    enemies.length = 0;
    for (const p of pickups) { _scene && _scene.remove(p.mesh); _disposeMesh(p.mesh); }
    pickups.length = 0;

    if (player) {
      player.position.set(0, 0.6, 0);
      player.userData.velX = 0;
      player.userData.velY = 0;
      player.visible = true;
    }
  }

  if (next === STATE.BOSS) {
    console.log('[state] boss entered');
    // Spawn random boss
    _spawnBoss(_scene);
  }

  if (next === STATE.WIN || next === STATE.GAME_OVER) {
    timeSurvived = (performance.now() / 1000) - timeStarted;
    waveReached = currentWave;
  }
}

// ─── Exports read by main.js each frame ──────────────────────────────────────
export let score = 0;
export let lives = 3;
export let bombCount = 0;
export let weaponTier = 1;
export let cameraShakeIntensity = 0;
export let invincibleTimer = 0;
export let waveFlashText = '';    // "" or "WAVE X" — main.js reads to show centered flash
export let waveFlashTimer = 0;   // countdown; main.js hides when ≤0
export const _waveFlashRef = { text: '', timer: 0 }; // mutable object for main.js to poll

// ─── Scene objects exposed so main.js can add them to scene ──────────────────
export let player;
export let terrainPlane;
let _terrainPlanes = [];
let _canyonWalls = [];
export let cloudLayers = [];
export let hazeMesh;
export const playerBullets = [];  // { mesh, vel, piercing, hitSet }[]
export const enemyBullets = [];   // { mesh, vel }[]
export const enemies = [];        // EnemyObj[]
export const pickups = [];        // { mesh, type, timer }[]

// Keep a scene ref so we can remove meshes during collisions
let _scene = null;

// ─── Disposal helper ─────────────────────────────────────────────────────────
function _disposeMesh(mesh) {
  mesh.traverse(c => {
    if (c.isMesh) {
      c.geometry.dispose();
      c.material.dispose();
    }
  });
}

// ─── Hit flash helpers ────────────────────────────────────────────────────────
function _applyHitFlash(group) {
  group.traverse(c => {
    if (!c.isMesh) return;
    if (c.material.emissive) {
      c.material.emissive.copy(c.userData.origColor || c.material.color);
      c.material.emissiveIntensity = 1.5;
    }
  });
}
function _restoreColors(group) {
  group.traverse(c => {
    if (!c.isMesh) return;
    if (c.material.emissive) {
      c.material.emissive.copy(c.userData.origColor || c.material.color);
      c.material.emissiveIntensity = c.material.userData.baseEmissive || 0;
    }
  });
}

// ─── Geo-manifest mesh builder ───────────────────────────────────────────────
function buildEntityMesh(entityDef) {
  const group = new THREE.Group();
  const [sx, sy, sz] = entityDef.worldScale || [1, 1, 1];
  group.scale.set(sx, sy, sz);

  for (const part of entityDef.parts) {
    let geo;
    switch (part.geo) {
      case 'BoxGeometry':      geo = new THREE.BoxGeometry(...part.args); break;
      case 'ConeGeometry':     geo = new THREE.ConeGeometry(...part.args); break;
      case 'CylinderGeometry': geo = new THREE.CylinderGeometry(...part.args); break;
      case 'SphereGeometry':   geo = new THREE.SphereGeometry(...part.args); break;
      case 'TorusGeometry':       geo = new THREE.TorusGeometry(...part.args); break;
      case 'OctahedronGeometry':  geo = new THREE.OctahedronGeometry(...part.args); break;
      case 'IcosahedronGeometry': geo = new THREE.IcosahedronGeometry(...part.args); break;
      case 'TetrahedronGeometry': geo = new THREE.TetrahedronGeometry(...part.args); break;
    }
    let mat;
    if (part.material === 'basic') {
      mat = new THREE.MeshBasicMaterial({ color: part.color });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: part.color,
        emissive: new THREE.Color(part.emissive || part.color),
        emissiveIntensity: part.emissiveIntensity || 0,
        roughness: 0.4,
        metalness: 0.1,
      });
      mat.userData.baseEmissive = part.emissiveIntensity || 0;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.origColor = new THREE.Color(part.color);
    if (part.position) mesh.position.set(...part.position);
    if (part.rotation) mesh.rotation.set(...part.rotation);
    group.add(mesh);
  }

  // Rotate so manifest XY plane (top-down sprite) maps to world XZ plane
  // Local Y → world -Z (forward/north), local Z → world +Y (up)
  group.rotation.x = -Math.PI / 2;

  return group;
}

// ─── Input ────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'Enter' || e.code === 'Space') && currentState === STATE.MENU) {
    transitionTo(STATE.PLAYING);
  }
  if (e.code === 'KeyR' && (currentState === STATE.WIN || currentState === STATE.GAME_OVER)) {
    transitionTo(STATE.MENU);
  }
  if ((e.code === 'KeyX' || e.code === 'KeyZ') && (currentState === STATE.PLAYING || currentState === STATE.BOSS)) {
    if (bombCount > 0) { bombCount--; if (_scene) activateBomb(_scene); }
  }
  if (window.__DEV_TOOLS__) {
    if (e.code === 'Digit1') transitionTo(STATE.MENU);
    if (e.code === 'Digit2') transitionTo(STATE.PLAYING);
    if (e.code === 'Digit3') transitionTo(STATE.BOSS);
    if (e.code === 'Digit4') transitionTo(STATE.WIN);
    if (e.code === 'Digit5') transitionTo(STATE.GAME_OVER);
    if (e.code === 'BracketLeft')  { weaponTier = weaponTier > 1 ? weaponTier - 1 : 7; }
    if (e.code === 'BracketRight') { weaponTier = weaponTier < 7 ? weaponTier + 1 : 1; }
    if (e.shiftKey && e.code === 'KeyS') { if (_scene) spawnEnemy(_scene, 'scout'); }
    if (e.shiftKey && e.code === 'KeyB') { if (_scene) spawnEnemy(_scene, 'bomber'); }
    if (e.shiftKey && e.code === 'KeyD') { if (_scene) spawnEnemy(_scene, 'drone'); }
    if (e.shiftKey && e.code === 'KeyE') { if (_scene) spawnEnemy(_scene, 'elite'); }
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

window.addEventListener('click', () => {
  if (currentState === STATE.MENU) transitionTo(STATE.PLAYING);
  else if (currentState === STATE.WIN || currentState === STATE.GAME_OVER) transitionTo(STATE.MENU);
});

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_SPEED    = 8;
const PLAYER_BOUND_X  = 6;
const PLAYER_BOUND_Y_MIN = 0.3;
const PLAYER_BOUND_Y_MAX = 4.5;
const CLOUD_SPEED_1   = 8;
const CLOUD_SPEED_2   = 14;
const BULLET_SPEED    = 14;

// World scroll — managed dynamically
let _worldSpeed = 2.0;
const WORLD_SPEED_BASE = 2.0;
const WORLD_SPEED_STEP = 0.15;
const WORLD_SPEED_CAP  = 4.5;

// Fire intervals per tier
const FIRE_INTERVALS = [0, 0.2, 0.2, 0.18, 0.22, 0.17, 0.16, 0.15];
const TIER_COLORS = [0, 0xFFFFFF, 0x00EEFF, 0x44FF44, 0xFFEE00, 0xFF8800, 0xFF00CC, 0xFF4400];

let shotCounter = 0;

// ─── Build scene objects ──────────────────────────────────────────────────────
export function buildWorld(scene) {
  _scene = scene;

  _terrainPlanes = [];
  for (let ti = 0; ti < 2; ti++) {
    const terrainGeo = new THREE.PlaneGeometry(60, 300, 10, 60);
    const terrainMat = new THREE.MeshBasicMaterial({ color: 0x0a1e0a });
    const plane = new THREE.Mesh(terrainGeo, terrainMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 0, -80 - ti * 300);
    scene.add(plane);

    const gridGeo = new THREE.PlaneGeometry(60, 300, 20, 120);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x2a5a2a, wireframe: true, transparent: true, opacity: 0.3 });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.set(0, 0.01, -80 - ti * 300);
    scene.add(gridMesh);
    plane.userData.grid = gridMesh;

    _terrainPlanes.push(plane);
  }
  terrainPlane = _terrainPlanes[0]; // backwards compat

  // cloudLayers[0] = buildCloudLayer(scene, 0x4466aa, 10, 5, 2, 3, 0.6);
  // cloudLayers[1] = buildCloudLayer(scene, 0xaabbcc, 8, 7, 2.8, 4.5, 1.2);

  _canyonWalls = [];


  // Scrolling city scenery pool
  initScenery(scene);

  // Player ship — built from geo-manifest
  player = buildEntityMesh(GEO_MANIFEST.entities.player);
  player.position.set(0, 0.6, 0);
  player.userData.velX = 0;
  player.userData.velY = 0;

  scene.add(player);
}

// ─── Scenery helpers ──────────────────────────────────────────────────────────
function _sr(min, max) { return min + Math.random() * (max - min); }


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

// ─── Bullet spawning ──────────────────────────────────────────────────────────
function deg2rad(d) { return d * Math.PI / 180; }

function makeBulletMesh(tier) {
  const spec = GEO_MANIFEST.bullets[`T${tier}`] || GEO_MANIFEST.bullets.T1;
  const geo = new THREE.BoxGeometry(...spec.args);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(spec.color),
    emissiveIntensity: spec.emissiveIntensity || 3.0,
    roughness: 0, metalness: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

function spawnPlayerBullet(scene, originX, originY, originZ, angleDeg, piercing, color) {
  const mesh = makeBulletMesh(weaponTier);
  mesh.position.set(originX, originY, originZ);
  scene.add(mesh);
  const rad = deg2rad(angleDeg);
  const vel = new THREE.Vector3(Math.sin(rad) * BULLET_SPEED, 0, -Math.cos(rad) * BULLET_SPEED);
  const b = { mesh, vel, piercing: !!piercing, hitSet: piercing ? new Set() : null };
  mesh.userData.piercing = !!piercing;
  playerBullets.push(b);
  return b;
}

function spawnSeekers(scene, count, angles) {
  for (const angleDeg of angles) {
    const rad = deg2rad(angleDeg);
    const vx = Math.sin(rad) * 12;
    const vz = -Math.cos(rad) * 12;
    const mesh = makeBulletMesh(weaponTier);
    mesh.position.copy(player.position);
    mesh.position.z -= 1.2;
    scene.add(mesh);
    const seeker = {
      mesh,
      vel: new THREE.Vector3(vx, 0, vz),
      isSeeker: true,
      piercing: false,
      hitSet: null,
      acquireTimer: 0.3,
      lifetime: 4.0,
      target: null,
    };
    playerBullets.push(seeker);
  }
}

const _staggerQueue = [];
let fireTimer = 0;

function fireWeapon(scene) {
  shotCounter++;
  const color = TIER_COLORS[weaponTier];
  const ox = player.position.x;
  const oy = player.position.y;
  const oz = player.position.z - 1.2;

  switch (weaponTier) {
    case 1:
      spawnPlayerBullet(scene, ox, oy, oz, 0, false, color);
      break;
    case 2:
      spawnPlayerBullet(scene, ox, oy, oz, -4, false, color);
      spawnPlayerBullet(scene, ox, oy, oz,  4, false, color);
      break;
    case 3:
      spawnPlayerBullet(scene, ox, oy, oz,   0, false, color);
      spawnPlayerBullet(scene, ox, oy, oz, -15, false, color);
      spawnPlayerBullet(scene, ox, oy, oz,  15, false, color);
      break;
    case 4:
      spawnPlayerBullet(scene, ox, oy, oz, 0, true, color);
      break;
    case 5: {
      _staggerQueue.push(
        { delay: 0.00, angleDeg:   0, piercing: false, color, ox, oy, oz },
        { delay: 0.04, angleDeg: -12, piercing: false, color, ox, oy, oz },
        { delay: 0.08, angleDeg:  12, piercing: false, color, ox, oy, oz },
        { delay: 0.12, angleDeg: -24, piercing: false, color, ox, oy, oz },
        { delay: 0.16, angleDeg:  24, piercing: false, color, ox, oy, oz },
      );
      break;
    }
    case 6: {
      spawnPlayerBullet(scene, ox, oy, oz, 0, true, color);
      if (shotCounter % 3 === 0) {
        spawnSeekers(scene, 3, [-45, 0, 45]);
      }
      break;
    }
    case 7: {
      const fanAngles = [-20, -10, 0, 10, 20];
      for (const a of fanAngles) {
        spawnPlayerBullet(scene, ox, oy, oz, a, true, color);
      }
      if (shotCounter % 2 === 0) {
        spawnSeekers(scene, 4, [-45, -22.5, 22.5, 45]);
      }
      break;
    }
  }
  playSound('shoot_t' + weaponTier);
}

// ─── Enemy spawning ───────────────────────────────────────────────────────────
const ENEMY_CONFIGS = {
  scout: {
    color: 0xFF3060, hp: 2, speed: 6, score: 100,
    size: [0.6, 0.2, 0.6],
    dropWeapon: 0.08, dropBomb: 0,
  },
  bomber: {
    color: 0x8B30FF, hp: 6, speed: 2.5, score: 300,
    size: [1.0, 0.3, 1.0],
    dropWeapon: 0.05, dropBomb: 0.40,
  },
  drone: {
    color: 0x00FF99, hp: 4, speed: 4.5, score: 200,
    size: [0.7, 0.2, 0.7],
    dropWeapon: 0.12, dropBomb: 0,
  },
  elite: {
    color: 0xFFD700, hp: 5, speed: 6 * 1.15, score: 200,
    size: [0.6, 0.2, 0.6],
    dropWeapon: 1.0, dropBomb: 0.15,
    isElite: true,
  },
};

// spawnEnemy supports extra options object for formation-specific overrides
export function spawnEnemy(scene, type, opts = {}) {
  const cfg = ENEMY_CONFIGS[type] || ENEMY_CONFIGS.scout;

  // For elite, determine base type from opts.eliteBase
  const eliteBase = opts.eliteBase || 'scout';
  const baseCfg = cfg.isElite ? ENEMY_CONFIGS[eliteBase] : cfg;

  let hp = cfg.isElite ? baseCfg.hp * 2 : cfg.hp;
  let speed = cfg.isElite ? baseCfg.speed * 1.15 : cfg.speed;
  let scoreVal = cfg.isElite ? baseCfg.score * 2 : cfg.score;

  // Build composite mesh from geo-manifest
  const manifestKey = cfg.isElite ? 'elite' : type;
  const entityDef = GEO_MANIFEST.entities[manifestKey] || GEO_MANIFEST.entities.scout;
  const mesh = buildEntityMesh(entityDef);

  // halfSize for collision — based on worldScale
  const ws = entityDef.worldScale || [1, 1, 1];
  const halfSize = Math.max(...ws) * 0.5;

  // Spawn position — opts can override
  const spawnX = opts.spawnX !== undefined ? opts.spawnX : (Math.random() - 0.5) * 10;
  const spawnZ = opts.spawnZ !== undefined ? opts.spawnZ : -20 - Math.random() * 10;

  let movementData = {};
  const effectiveType = cfg.isElite ? (opts.movementType || eliteBase) : type;

  if (effectiveType === 'scout') {
    mesh.position.set(spawnX, 2.5 + Math.random() * 1.5, spawnZ);
    const fixedY = opts.fixedY !== undefined ? opts.fixedY : null;
    movementData = {
      type: effectiveType,
      sinePhase: opts.sinePhase !== undefined ? opts.sinePhase : Math.random() * Math.PI * 2,
      fireTimer: 1.0 + Math.random(),
      fixedY,
      formationOffsetX: opts.formationOffsetX || 0,
      moveWithFormation: opts.moveWithFormation || false,
    };
    if (fixedY !== null) mesh.position.y = fixedY;
  } else if (effectiveType === 'bomber') {
    const fromLeft = opts.fromLeft !== undefined ? opts.fromLeft : Math.random() < 0.5;
    const startX = opts.startX !== undefined ? opts.startX : (fromLeft ? -10 : 10);
    mesh.position.set(startX, 3.5 + Math.random(), spawnZ);
    const holdDuration = opts.holdDuration !== undefined ? opts.holdDuration : 2.0;
    movementData = {
      type: 'bomber',
      fromLeft,
      phase: 'enter',
      holdTimer: 0,
      fireTimer: 1.5 + Math.random(),
      holdDuration,
    };
  } else if (effectiveType === 'drone') {
    const fromLeft = opts.fromLeft !== undefined ? opts.fromLeft : Math.random() < 0.5;
    const sweepY = opts.sweepY !== undefined ? opts.sweepY : (2.5 + Math.random());
    const startX = fromLeft ? -12 : 12;
    mesh.position.set(startX, sweepY, spawnZ);
    movementData = {
      type: 'drone',
      fromLeft,
      sweepY,
      fireTimer: 0,
    };
  }

  mesh.userData.isElite = !!cfg.isElite;
  mesh.userData.elitePhase = 0;

  scene.add(mesh);

  const enemy = {
    mesh,
    type: effectiveType,
    hp,
    maxHp: hp,
    speed,
    score: scoreVal,
    dropWeapon: cfg.dropWeapon,
    dropBomb: cfg.dropBomb,
    isElite: !!cfg.isElite,
    halfSize,
    dead: false,
    hitFlash: 0,
    ...movementData,
  };

  enemies.push(enemy);
  return enemy;
}

// ─── Enemy bullet spawning ────────────────────────────────────────────────────
function spawnEnemyBullet(scene, origin, angleDeg, speed, color = 0xFF4444, scale = 1, yVel = 0) {
  const spec = GEO_MANIFEST.bullets.enemy;
  const geo = new THREE.BoxGeometry(spec.args[0] * scale, spec.args[1] * scale, spec.args[2] * scale);
  const bulletColor = color !== 0xFF4444 ? color : spec.color;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(bulletColor),
    emissiveIntensity: 2.5,
    roughness: 0, metalness: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  scene.add(mesh);
  const rad = deg2rad(angleDeg);
  const vel = new THREE.Vector3(Math.sin(rad) * speed, yVel, Math.cos(rad) * speed);
  enemyBullets.push({ mesh, vel });
}

function getAngleToPlayer(enemyPos) {
  const dx = player.position.x - enemyPos.x;
  const dz = player.position.z - enemyPos.z;
  return Math.atan2(dx, dz) * 180 / Math.PI;
}

// ─── Pickup spawning ──────────────────────────────────────────────────────────
function spawnPickup(scene, position, type) {
  const pickupDef = GEO_MANIFEST.pickups[type];
  const mesh = buildEntityMesh({ worldScale: [1, 1, 1], parts: pickupDef.parts });
  mesh.position.copy(position);
  mesh.position.y = Math.max(0.3, position.y);
  scene.add(mesh);
  pickups.push({ mesh, type, timer: 12.0 });
}

// ─── Enemy death ──────────────────────────────────────────────────────────────
function killEnemy(scene, enemy, awardScore, suppressDrops) {
  if (enemy.dead) return;
  enemy.dead = true;

  if (awardScore) score += enemy.score;

  if (!suppressDrops && enemy.type === 'drone') {
    for (const a of [0, 20, -20]) {
      spawnEnemyBullet(scene, enemy.mesh.position, a, 6.0);
    }
  }

  if (!suppressDrops) {
    const r = Math.random();
    if (r < enemy.dropWeapon) {
      spawnPickup(scene, enemy.mesh.position, 'weapon');
    } else if (r < enemy.dropWeapon + enemy.dropBomb) {
      spawnPickup(scene, enemy.mesh.position, 'bomb');
    }
  }

  scene.remove(enemy.mesh);
  _disposeMesh(enemy.mesh);
}

// ─── Player hit ───────────────────────────────────────────────────────────────
let flashTimer = 0;

function hitPlayer() {
  if (invincibleTimer > 0) return;
  playSound('player_hit');
  lives--;
  weaponTier = 1;
  shotCounter = 0;
  invincibleTimer = 2.0;
  flashTimer = 0;
  triggerShake(0.4);
  if (lives <= 0) {
    lives = 0;
    transitionTo(STATE.GAME_OVER);
  }
}

// ─── Bomb activation ─────────────────────────────────────────────────────────
function activateBomb(scene) {
  playSound('bomb_blast');
  triggerShake(1.2);
  if (currentState === STATE.BOSS && boss) {
    // Boss takes 10% of current HP
    const dmg = Math.floor(boss.hp * 0.1);
    damageBoss(scene, dmg);
  } else {
    for (let i = enemies.length - 1; i >= 0; i--) {
      killEnemy(scene, enemies[i], true, true);
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) enemies.splice(i, 1);
    }
  }
  for (const b of enemyBullets) { scene.remove(b.mesh); b.mesh.geometry.dispose(); }
  enemyBullets.length = 0;
}

// ─── Dev spawn helpers ────────────────────────────────────────────────────────
export function devSpawnEnemy(type) {
  if (_scene) spawnEnemy(_scene, type);
}

export function devCycleTier(dir) {
  weaponTier = ((weaponTier - 1 + dir + 7) % 7) + 1;
}

export function devSetState(stateName) {
  const target = STATE[stateName];
  if (target) transitionTo(target);
}

export function devBuildArtScene(scene) {
  const meshes = [];
  const add = (def, x, y, z, label, extra = {}) => {
    const m = buildEntityMesh(def);
    m.position.set(x, y, z);
    m.userData.artLabel = label;
    Object.assign(m.userData, extra);
    scene.add(m);
    meshes.push(m);
    return m;
  };

  // Player variants — row at z=0, spread in X so P-key camera focus works per ship
  add(GEO_MANIFEST.entities.player,    -6, 0.6, 0, 'V1 (current)', { shipFocusIdx: 0 });
  add(GEO_MANIFEST.entities.player_v2,  0, 0.6, 0, 'V2 (arwing)',  { shipFocusIdx: 1 });
  add(GEO_MANIFEST.entities.player_v3,  6, 0.6, 0, 'V3 (viper)',   { shipFocusIdx: 2 });

  // Enemies — row at z=-10
  add(GEO_MANIFEST.entities.scout,   -7, 1, -10, 'SCOUT');
  add(GEO_MANIFEST.entities.bomber,  -2.5, 1, -10, 'BOMBER');
  add(GEO_MANIFEST.entities.drone,    2.5, 1, -10, 'DRONE');
  add(GEO_MANIFEST.entities.elite,    7, 1.5, -10, 'ELITE');

  // Bosses — row at z=-22
  add(GEO_MANIFEST.entities.sentinel_boss,    -9, 4, -22, 'SENTINEL');
  add(GEO_MANIFEST.entities.interceptor_boss,  0, 4, -22, 'INTERCEPTOR');
  add(GEO_MANIFEST.entities.colossus_boss,     9, 4, -22, 'COLOSSUS');

  // Bullets T1-T7 + enemy bullet — row at z=-32
  const addBullet = (spec, x, z, label) => {
    if (!spec) return;
    const geo = new THREE.BoxGeometry(...(spec.args || [0.12, 0.12, 0.5]));
    const mat = new THREE.MeshBasicMaterial({ color: spec.color || '#ffffff' });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1, z);
    m.userData.artLabel = label;
    scene.add(m);
    meshes.push(m);
  };
  for (let t = 1; t <= 7; t++) {
    addBullet(GEO_MANIFEST.bullets[`T${t}`], -10.5 + (t - 1) * 3, -32, `T${t}`);
  }
  addBullet(GEO_MANIFEST.bullets.enemy, 11, -32, 'EBULLET');

  // Pickups — row at z=-40
  ['weapon', 'bomb'].forEach((k, i) => {
    const spec = GEO_MANIFEST.pickups[k];
    if (spec) {
      const m = buildEntityMesh({ worldScale: [1, 1, 1], parts: spec.parts || [] });
      m.position.set(-3 + i * 6, 1, -40);
      m.userData.artLabel = k.toUpperCase();
      scene.add(m);
      meshes.push(m);
    }
  });

  return meshes;
}

export function devClearArtScene(scene, meshes) {
  for (const m of meshes) {
    scene.remove(m);
    _disposeMesh(m);
  }
  meshes.length = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  WAVE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

// Wave state machine
// idle → spawning → waiting (all spawned, waiting for enemies to clear) → gap → (next wave or boss)
let _waveState = 'idle';    // 'idle' | 'spawning' | 'waiting' | 'gap' | 'boss-pause' | 'boss-transition'
let _waveTimer = 0;         // general timer
let _wavePauseTimer = 0;    // 2s gap between waves
let _waveFlashTimer = 0;
let _waveSpawnQueue = [];   // { delay, type, opts }[]

// Each entry: { delay: total_seconds_from_wave_start, type: 'scout'|etc, opts: {} }
function _buildWaveScript(waveNum) {
  const entries = [];
  const Z = -22; // default spawn Z

  switch (waveNum) {
    case 1: {
      // 4× Scout, single file down center, 1.2s stagger
      for (let i = 0; i < 4; i++) {
        entries.push({ delay: i * 1.2, type: 'scout', opts: { spawnX: 0, spawnZ: Z } });
      }
      break;
    }
    case 2: {
      // 6× Scout, 2 columns of 3 from left+right edges, pairs staggered 0.8s
      for (let i = 0; i < 3; i++) {
        const d = i * 0.8;
        entries.push({ delay: d, type: 'scout', opts: { spawnX: -5.5, spawnZ: Z } });
        entries.push({ delay: d, type: 'scout', opts: { spawnX:  5.5, spawnZ: Z } });
      }
      break;
    }
    case 3: {
      // 3× Scout staggered 0.6s, then 2× Bomber 1.5s after last scout
      for (let i = 0; i < 3; i++) {
        entries.push({ delay: i * 0.6, type: 'scout', opts: { spawnX: (i - 1) * 2, spawnZ: Z } });
      }
      const bomberStart = 2 * 0.6 + 1.5;
      entries.push({ delay: bomberStart, type: 'bomber', opts: { fromLeft: true,  spawnZ: Z } });
      entries.push({ delay: bomberStart, type: 'bomber', opts: { fromLeft: false, spawnZ: Z } });
      break;
    }
    case 4: {
      // 2× Drone simultaneous at start; 4× Scout staggered 0.5s starting at 0.8s
      entries.push({ delay: 0,   type: 'drone', opts: { fromLeft: true,  sweepY: 3.0, spawnZ: Z } });
      entries.push({ delay: 0,   type: 'drone', opts: { fromLeft: false, sweepY: 3.0, spawnZ: Z } });
      for (let i = 0; i < 4; i++) {
        entries.push({ delay: 0.8 + i * 0.5, type: 'scout', opts: { spawnX: (Math.random() - 0.5) * 8, spawnZ: Z } });
      }
      break;
    }
    case 5: {
      // 9× Scout V-formation: point first, 4 per wing, 1.0u lateral apart, simultaneous
      // Point = index 0, wing L: -1,-2,-3,-4; wing R: +1,+2,+3,+4
      // All spawn at same Z, staggered slightly by row for visual V
      entries.push({ delay: 0, type: 'scout', opts: { spawnX: 0,    spawnZ: Z,      fixedY: 3.5, sinePhase: 0 } });
      for (let i = 1; i <= 4; i++) {
        entries.push({ delay: 0, type: 'scout', opts: { spawnX: -i * 1.0, spawnZ: Z - i * 0.5, fixedY: 3.5, sinePhase: i * 0.3 } });
        entries.push({ delay: 0, type: 'scout', opts: { spawnX:  i * 1.0, spawnZ: Z - i * 0.5, fixedY: 3.5, sinePhase: -i * 0.3 } });
      }
      break;
    }
    case 6: {
      // 1× Elite Scout center, scouts flanks 0.6s later, drones 2.0s in
      entries.push({ delay: 0,   type: 'elite', opts: { spawnX: 0,    spawnZ: Z, eliteBase: 'scout', movementType: 'scout' } });
      entries.push({ delay: 0.6, type: 'scout', opts: { spawnX: -3,   spawnZ: Z } });
      entries.push({ delay: 0.6, type: 'scout', opts: { spawnX:  3,   spawnZ: Z } });
      entries.push({ delay: 0.6, type: 'scout', opts: { spawnX: -5,   spawnZ: Z } });
      entries.push({ delay: 0.6, type: 'scout', opts: { spawnX:  5,   spawnZ: Z } });
      entries.push({ delay: 2.0, type: 'drone', opts: { fromLeft: true,  sweepY: 2.8, spawnZ: Z } });
      entries.push({ delay: 2.0, type: 'drone', opts: { fromLeft: false, sweepY: 2.8, spawnZ: Z } });
      break;
    }
    case 7: {
      // 4× Bomber horizontal row simultaneous; 3× Scout staggered 0.7s starting 1.0s in
      const bomberXs = [-4, -1.3, 1.3, 4];
      for (const bx of bomberXs) {
        entries.push({ delay: 0, type: 'bomber', opts: { spawnZ: Z, startX: bx, fromLeft: bx < 0 } });
      }
      for (let i = 0; i < 3; i++) {
        entries.push({ delay: 1.0 + i * 0.7, type: 'scout', opts: { spawnX: (i - 1) * 3, spawnZ: Z } });
      }
      break;
    }
    case 8: {
      // 3 drone pairs at Y=4.0, 3.2, 2.4, staggered 1.0s; bombers at 3.0s
      const droneYs = [4.0, 3.2, 2.4];
      for (let i = 0; i < 3; i++) {
        const fl = i % 2 === 0; // alternate sweep direction per layer
        entries.push({ delay: i * 1.0, type: 'drone', opts: { fromLeft:  fl, sweepY: droneYs[i], spawnZ: Z } });
        entries.push({ delay: i * 1.0, type: 'drone', opts: { fromLeft: !fl, sweepY: droneYs[i], spawnZ: Z } });
      }
      entries.push({ delay: 3.0, type: 'bomber', opts: { fromLeft: true,  spawnZ: Z } });
      entries.push({ delay: 3.0, type: 'bomber', opts: { fromLeft: false, spawnZ: Z } });
      break;
    }
    case 9: {
      // 1× Elite Bomber center; 2× regular bombers 1.0s later; scouts every 0.9s for 4s
      entries.push({ delay: 0,   type: 'elite',  opts: { spawnZ: Z, eliteBase: 'bomber', movementType: 'bomber', fromLeft: false, holdDuration: 3.5 } });
      entries.push({ delay: 1.0, type: 'bomber', opts: { fromLeft: true,  spawnZ: Z } });
      entries.push({ delay: 1.0, type: 'bomber', opts: { fromLeft: false, spawnZ: Z } });
      for (let i = 0; i < 5; i++) {
        entries.push({ delay: i * 0.9, type: 'scout', opts: { spawnX: (Math.random() - 0.5) * 10, spawnZ: Z } });
      }
      break;
    }
    case 10: {
      // 4 scouts in 2 diagonals (X pattern); drones 1.5s; bombers 3.5s
      const diagXs = [-4, -2, 2, 4];
      for (let i = 0; i < 4; i++) {
        entries.push({ delay: 0, type: 'scout', opts: { spawnX: diagXs[i], spawnZ: Z - Math.abs(diagXs[i]) * 0.3 } });
      }
      entries.push({ delay: 1.5, type: 'drone', opts: { fromLeft: true,  sweepY: 3.2, spawnZ: Z } });
      entries.push({ delay: 1.5, type: 'drone', opts: { fromLeft: false, sweepY: 3.2, spawnZ: Z } });
      entries.push({ delay: 1.5, type: 'drone', opts: { fromLeft: true,  sweepY: 2.5, spawnZ: Z } });
      entries.push({ delay: 1.5, type: 'drone', opts: { fromLeft: false, sweepY: 2.5, spawnZ: Z } });
      entries.push({ delay: 3.5, type: 'bomber', opts: { fromLeft: true,  spawnZ: Z } });
      entries.push({ delay: 3.5, type: 'bomber', opts: { fromLeft: false, spawnZ: Z } });
      break;
    }
    case 11: {
      // 2× Elite Drones simultaneous; regular drones 0.5s; scouts staggered 0.6s from 1.0s
      entries.push({ delay: 0,   type: 'elite', opts: { eliteBase: 'drone', movementType: 'drone', fromLeft: true,  sweepY: 3.5, spawnZ: Z } });
      entries.push({ delay: 0,   type: 'elite', opts: { eliteBase: 'drone', movementType: 'drone', fromLeft: false, sweepY: 3.5, spawnZ: Z } });
      entries.push({ delay: 0.5, type: 'drone', opts: { fromLeft: true,  sweepY: 3.0, spawnZ: Z } });
      entries.push({ delay: 0.5, type: 'drone', opts: { fromLeft: false, sweepY: 3.0, spawnZ: Z } });
      entries.push({ delay: 0.5, type: 'drone', opts: { fromLeft: true,  sweepY: 2.5, spawnZ: Z } });
      entries.push({ delay: 0.5, type: 'drone', opts: { fromLeft: false, sweepY: 2.5, spawnZ: Z } });
      for (let i = 0; i < 3; i++) {
        entries.push({ delay: 1.0 + i * 0.6, type: 'scout', opts: { spawnX: (i - 1) * 2, spawnZ: Z } });
      }
      break;
    }
    case 12: {
      // V-scouts simultaneous; bombers 0.5s; drones 1.5s; Elite Scout 2.0s
      entries.push({ delay: 0, type: 'scout', opts: { spawnX: 0,    spawnZ: Z,      fixedY: 3.5 } });
      for (let i = 1; i <= 2; i++) {
        entries.push({ delay: 0, type: 'scout', opts: { spawnX: -i * 1.5, spawnZ: Z - i * 0.5, fixedY: 3.5 } });
        entries.push({ delay: 0, type: 'scout', opts: { spawnX:  i * 1.5, spawnZ: Z - i * 0.5, fixedY: 3.5 } });
      }
      entries.push({ delay: 0.5, type: 'bomber', opts: { fromLeft: true,  spawnZ: Z } });
      entries.push({ delay: 0.5, type: 'bomber', opts: { fromLeft: false, spawnZ: Z } });
      entries.push({ delay: 1.5, type: 'drone',  opts: { fromLeft: true,  sweepY: 3.0, spawnZ: Z } });
      entries.push({ delay: 1.5, type: 'drone',  opts: { fromLeft: false, sweepY: 3.0, spawnZ: Z } });
      entries.push({ delay: 2.0, type: 'elite',  opts: { spawnX: 0, spawnZ: Z, eliteBase: 'scout', movementType: 'scout' } });
      break;
    }
    default:
      break;
  }

  return entries;
}

function _startWave(scene, waveNum) {
  currentWave = waveNum;
  _waveState = 'spawning';
  _waveTimer = 0;

  // Escalate world speed
  _worldSpeed = Math.min(WORLD_SPEED_CAP, WORLD_SPEED_BASE + WORLD_SPEED_STEP * (waveNum - 1));

  // Build spawn queue with absolute delays
  _waveSpawnQueue = _buildWaveScript(waveNum).sort((a, b) => a.delay - b.delay);

  // Show wave flash
  _waveFlashRef.text = `WAVE ${waveNum}`;
  _waveFlashRef.timer = 1.5;

  // Shift grid color by zone (3 waves per zone)
  const WAVE_GRID_COLORS = [0x1a5a2a, 0x1a2a5a, 0x3a1a5a, 0x5a1a1a];
  const zoneColor = WAVE_GRID_COLORS[Math.min(Math.floor((waveNum - 1) / 2), 3)];
  for (const tp of _terrainPlanes) {
    if (tp.userData.grid) tp.userData.grid.material.color.setHex(zoneColor);
  }
}

function _updateWaveSystem(dt, scene) {
  if (_waveFlashRef.timer > 0) _waveFlashRef.timer -= dt;

  if (_waveState === 'idle') {
    // Start wave 1
    _waveTimer += dt;
    if (_waveTimer >= 0.5) {
      _startWave(scene, 1);
    }
    return;
  }

  if (_waveState === 'spawning') {
    _waveTimer += dt;
    // Spawn any pending enemies whose delay has passed
    for (let i = _waveSpawnQueue.length - 1; i >= 0; i--) {
      const entry = _waveSpawnQueue[i];
      if (_waveTimer >= entry.delay) {
        spawnEnemy(scene, entry.type, entry.opts);
        _waveSpawnQueue.splice(i, 1);
      }
    }
    // Once queue is empty, transition to waiting
    if (_waveSpawnQueue.length === 0) {
      _waveState = 'waiting';
    }
    return;
  }

  if (_waveState === 'waiting') {
    // Wait for all enemies to be gone
    if (enemies.length === 0) {
      if (currentWave >= waveCount) {
        // After wave 12: 3s boss pause
        _waveState = 'boss-pause';
        _wavePauseTimer = 3.0;
        _worldSpeed = 0; // stop scroll
      } else {
        // 2s gap before next wave
        _waveState = 'gap';
        _wavePauseTimer = 2.0;
      }
    }
    return;
  }

  if (_waveState === 'gap') {
    _wavePauseTimer -= dt;
    if (_wavePauseTimer <= 0) {
      _startWave(scene, currentWave + 1);
    }
    return;
  }

  if (_waveState === 'boss-pause') {
    _wavePauseTimer -= dt;
    if (_wavePauseTimer <= 0) {
      _waveState = 'boss';
      transitionTo(STATE.BOSS);
    }
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOSS SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

// Telegraph line objects (added/removed from scene)
let _telegraphMesh = null;

function _clearTelegraph(scene) {
  if (_telegraphMesh) {
    scene.remove(_telegraphMesh);
    _telegraphMesh = null;
  }
}

function _spawnBoss(scene) {
  const types = ['sentinel', 'interceptor', 'colossus'];
  const type = types[Math.floor(Math.random() * types.length)];

  let mesh, hp, scoreVal;
  if (type === 'sentinel') {
    mesh = buildEntityMesh(GEO_MANIFEST.entities.sentinel_boss);
    hp = 160;
    scoreVal = 15000;
  } else if (type === 'interceptor') {
    mesh = buildEntityMesh(GEO_MANIFEST.entities.interceptor_boss);
    hp = 120;
    scoreVal = 18000;
  } else {
    mesh = buildEntityMesh(GEO_MANIFEST.entities.colossus_boss);
    hp = 200;
    scoreVal = 25000;
  }

  mesh.position.set(0, 4.0, -18);
  scene.add(mesh);

  boss = {
    mesh,
    type,
    hp,
    maxHp: hp,
    phase: 1,
    score: scoreVal,
    x: 0, y: 4.0, z: -18,
    dead: false,

    // Attack timers — all start with small offset so attacks don't fire immediately
    burstTimer: 1.5,
    sweepTimer: 5.0,
    seekerTimer: 7.0,
    beamTimer: 6.0,
    ringTimer: 4.0,
    strafeTimer: 3.0,
    diveTimer: 9.0,
    columnTimer: 0.9,
    bombTimer: 7.0,
    spiralTimer: 9.0,
    annihTimer: 11.0,

    // Sentinel sweep direction
    _sweepDir: 1,
    _sweepRotation: 0,

    // Interceptor movement
    _dashState: 'pausing', // 'pausing' | 'dashing'
    _dashTimer: 1.2,
    _dashTargetX: 0,
    _dashTargetY: 4.0,
    _strafeDir: 0,
    _diveActive: false,
    _diveReturnTimer: 0,

    // Colossus movement
    _driftDir: 1,

    // Phase transition
    _transitioning: false,
    _transitionTimer: 0,

    // Telegraph state
    _telegraphType: null,
    _telegraphTimer: 0,
    _telegraphPulse: 0,
  };

  // Enter animation: slide from top over 1.5s
  boss._entering = true;
  boss._enterTimer = 1.5;
  boss.mesh.position.set(0, 4.0, -30);
}

function _cleanupBoss() {
  if (boss && boss.mesh && _scene) {
    _scene.remove(boss.mesh);
    _disposeMesh(boss.mesh);
  }
  if (_telegraphMesh && _scene) {
    _clearTelegraph(_scene);
  }
  boss = null;
}

function damageBoss(scene, amount) {
  if (!boss || boss.dead || boss._transitioning) return;
  boss.hp -= amount;
  if (boss.hp < 0) boss.hp = 0;
  boss.hitFlash = 0.08;

  const pct = boss.hp / boss.maxHp;
  const p2threshold = 0.666;
  const p3threshold = 0.333;

  const shouldTransition =
    (boss.phase === 1 && pct <= p2threshold) ||
    (boss.phase === 2 && pct <= p3threshold);

  if (shouldTransition) {
    boss._transitioning = true;
    boss._transitionTimer = 1.2;
    return;
  }

  if (boss.hp <= 0) {
    _killBoss(scene);
  }
}

function _killBoss(scene) {
  if (!boss || boss.dead) return;
  boss.dead = true;
  score += boss.score;
  playSound('boss_death');
  triggerShake(1.5);
  _clearTelegraph(scene);
  scene.remove(boss.mesh);
  _disposeMesh(boss.mesh);

  // WIN after 2s — handled via timer
  boss._deathTimer = 2.0;
}

function _updateBoss(dt, scene) {
  if (!boss) return;

  // Entry animation
  if (boss._entering) {
    boss._enterTimer -= dt;
    const t = 1 - Math.max(0, boss._enterTimer / 1.5);
    boss.mesh.position.z = -30 + t * 12; // slide to z=-18
    if (boss._enterTimer <= 0) {
      boss._entering = false;
      boss.mesh.position.z = -18;
      boss.z = -18;
    }
    return;
  }

  // Hit flash
  if (boss.hitFlash > 0) {
    boss.hitFlash -= dt;
    if (boss.hitFlash > 0) _applyHitFlash(boss.mesh);
    else _restoreColors(boss.mesh);
  }

  // Death countdown
  if (boss.dead) {
    boss._deathTimer -= dt;
    if (boss._deathTimer <= 0) {
      transitionTo(STATE.WIN);
      boss = null;
    }
    return;
  }

  // Phase transition pause
  if (boss._transitioning) {
    boss._transitionTimer -= dt;
    if (boss._transitionTimer <= 0) {
      boss.phase++;
      boss._transitioning = false;
      bossPhaseTransition = true; // main.js reads + resets
      playSound('boss_phase_transition');
      triggerShake(0.8);
      _clearTelegraph(scene);
      // Reset attack timers on transition
      boss.burstTimer = 1.0;
      boss.sweepTimer = 3.0;
      boss.ringTimer = 3.0;

      if (boss.hp <= 0) {
        _killBoss(scene);
      }
    }
    return;
  }

  // Per-type update
  if (boss.type === 'sentinel') {
    _updateSentinel(dt, scene);
  } else if (boss.type === 'interceptor') {
    _updateInterceptor(dt, scene);
  } else {
    _updateColossus(dt, scene);
  }

  // Sync mesh position
  boss.mesh.position.set(boss.x, boss.y, boss.z);
}

// ─── Sentinel ─────────────────────────────────────────────────────────────────
function _updateSentinel(dt, scene) {
  // Track player X at 2.5/sec
  const targetX = Math.max(-5, Math.min(5, player.position.x));
  const dx = targetX - boss.x;
  const moveAmt = Math.min(Math.abs(dx), 2.5 * dt);
  boss.x += Math.sign(dx) * moveAmt;

  // Telegraph tick
  if (boss._telegraphType) {
    boss._telegraphTimer -= dt;
    boss._telegraphPulse += dt * 6;
    if (_telegraphMesh) {
      _telegraphMesh.material.opacity = 0.5 + 0.5 * Math.sin(boss._telegraphPulse);
    }
    if (boss._telegraphTimer <= 0) {
      const tt = boss._telegraphType;
      boss._telegraphType = null;
      _clearTelegraph(scene);
      _sentinelFireBeam(scene);
    }
  }

  // Burst attack
  boss.burstTimer -= dt;
  if (boss.burstTimer <= 0) {
    const count = boss.phase === 1 ? 3 : 5;
    const speed = boss.phase === 1 ? 6 : (boss.phase === 2 ? 7 : 8.5);
    const interval = boss.phase === 1 ? 1.5 : (boss.phase === 2 ? 1.1 : 0.8);
    _sentinelFireBurst(scene, count, speed);
    boss.burstTimer = interval;
  }

  // Sweep attack
  boss.sweepTimer -= dt;
  if (boss.sweepTimer <= 0) {
    const sweepInterval = boss.phase === 1 ? 6 : (boss.phase === 2 ? 4 : 3);
    const count = boss.phase >= 3 ? 12 : 8;
    _sentinelFireSweep(scene, count, boss._sweepDir);
    if (boss.phase >= 2) boss._sweepDir *= -1;
    boss.sweepTimer = sweepInterval;
  }

  // Phase 2+: seekers
  if (boss.phase >= 2) {
    boss.seekerTimer -= dt;
    if (boss.seekerTimer <= 0) {
      _sentinelFireSeekers(scene);
      boss.seekerTimer = 8;
    }
  }

  // Phase 3: beam (with telegraph)
  if (boss.phase >= 3 && !boss._telegraphType) {
    boss.beamTimer -= dt;
    if (boss.beamTimer <= 0) {
      boss.beamTimer = 7;
      // Start telegraph
      boss._telegraphType = 'beam';
      boss._telegraphTimer = 1.5;
      boss._telegraphPulse = 0;
      _showSentinelBeamTelegraph(scene);
    }
  }
}

function _sentinelFireBurst(scene, count, speed) {
  const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
  const baseAngle = getAngleToPlayer(origin);
  const spread = count === 3 ? [-8, 0, 8] : [-16, -8, 0, 8, 16];
  const yAmp = boss.phase >= 3 ? 2.5 : 1.5;
  for (let i = 0; i < count; i++) {
    const yVel = i % 2 === 1 ? yAmp : -yAmp;
    spawnEnemyBullet(scene, origin, baseAngle + spread[i], speed, 0x00BFFF, 1.5, yVel);
  }
}

function _sentinelFireSweep(scene, count, dir) {
  // Horizontal row of bullets across X axis
  const startX = dir > 0 ? -7 : 7;
  const spacing = 14 / (count - 1);
  const yAmp = boss.phase >= 3 ? 2.0 : 1.0;
  for (let i = 0; i < count; i++) {
    const origin = new THREE.Vector3(startX + i * spacing * dir, boss.y, boss.z);
    const yVel = i % 2 === 0 ? yAmp : -yAmp;
    spawnEnemyBullet(scene, origin, 180, 3.5, 0x4488FF, 1.8, yVel); // angle 180 = straight +Z (toward player)
  }
}

function _sentinelFireSeekers(scene) {
  const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
  const baseAngle = getAngleToPlayer(origin);
  for (const offset of [-15, 0, 15]) {
    const rad = deg2rad(baseAngle + offset);
    const vel = new THREE.Vector3(Math.sin(rad) * 8, 0, Math.cos(rad) * 8);
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.7);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFAA00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    scene.add(mesh);
    const seeker = {
      mesh, vel,
      isBossSeeker: true,
      lifetime: 2.5,
      acquireTimer: 0.5,
      target: null,
    };
    enemyBullets.push(seeker);
  }
}

function _showSentinelBeamTelegraph(scene) {
  const points = [
    new THREE.Vector3(boss.x, boss.y, boss.z),
    new THREE.Vector3(boss.x, boss.y, 8), // toward player area
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.9 });
  _telegraphMesh = new THREE.Line(geo, mat);
  scene.add(_telegraphMesh);
}

function _sentinelFireBeam(scene) {
  // Single piercing beam
  const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
  const angle = getAngleToPlayer(origin);
  spawnEnemyBullet(scene, origin, angle, 18, 0xFFFFFF, 2.5);
}

// ─── Interceptor ──────────────────────────────────────────────────────────────
function _updateInterceptor(dt, scene) {
  const dashSpeed = boss.phase >= 3 ? 18 : 12;
  const pauseDur  = boss.phase >= 3 ? 0.6 : 1.2;
  const burstCount = boss.phase === 1 ? 2 : (boss.phase === 2 ? 3 : 4);
  const burstSpeed = boss.phase === 1 ? 7 : (boss.phase === 2 ? 8 : 9.5);

  if (boss._dashState === 'pausing') {
    boss._dashTimer -= dt;
    if (boss._dashTimer <= 0) {
      // Pick new target position
      boss._dashTargetX = (Math.random() - 0.5) * 10;
      boss._dashTargetY = boss.phase >= 2
        ? 3.0 + Math.abs(Math.sin(Date.now() / 3000)) * 1.5
        : 3.8;
      boss._dashState = 'dashing';
      boss._dashTimer = 0.4;
      boss._strafeDir = boss._dashTargetX > boss.x ? 1 : -1;

      // Strafe spray on dash start (phase 2+)
      if (boss.phase >= 2) {
        const sprayCount = boss.phase >= 3 ? 8 : 5;
        _interceptorStrafeSpr(scene, sprayCount);
      }
    } else {
      // Fire burst on stop
      if (boss._justStopped) {
        boss._justStopped = false;
        const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
        const angle = getAngleToPlayer(origin);
        const fanAngles = burstCount === 2 ? [-6, 6] : (burstCount === 3 ? [-10, 0, 10] : [-15, -5, 5, 15]);
        for (const fa of fanAngles) {
          spawnEnemyBullet(scene, origin, angle + fa, burstSpeed, 0xFF6B00, 1.5);
        }
      }
    }
  }

  if (boss._dashState === 'dashing') {
    boss._dashTimer -= dt;
    // Move toward target
    const toDx = boss._dashTargetX - boss.x;
    const toDy = boss._dashTargetY - boss.y;
    const dist = Math.sqrt(toDx * toDx + toDy * toDy);
    const step = dashSpeed * dt;
    if (dist <= step || boss._dashTimer <= 0) {
      boss.x = boss._dashTargetX;
      boss.y = boss._dashTargetY;
      boss._dashState = 'pausing';
      boss._dashTimer = pauseDur;
      boss._justStopped = true;
    } else {
      boss.x += (toDx / dist) * step;
      boss.y += (toDy / dist) * step;
    }
  }

  // Ring attack
  boss.ringTimer -= dt;
  if (boss.ringTimer <= 0) {
    const ringCount = boss.phase === 1 ? 12 : (boss.phase === 2 ? 16 : 20);
    const ringInterval = boss.phase === 1 ? 5 : (boss.phase === 2 ? 4 : 3);
    _interceptorFireRing(scene, ringCount, boss._sweepRotation || 0);
    boss._sweepRotation = (boss._sweepRotation || 0) + 15;
    boss.ringTimer = ringInterval;
  }

  // Phase 3: death dive
  if (boss.phase >= 3 && !boss._diveActive) {
    boss.diveTimer -= dt;
    if (boss.diveTimer <= 0) {
      boss._diveActive = true;
      boss._diveTimer2 = 0;
      boss.diveTimer = 10;
    }
  }

  if (boss._diveActive) {
    boss._diveTimer2 += dt;
    // Rotate nose down (offset from base -PI/2 baked in by buildEntityMesh)
    boss.mesh.rotation.x = -Math.PI / 2 + Math.min(boss._diveTimer2 * 1.5, Math.PI / 3);
    // Move toward player Y
    boss.y -= 16 * dt;
    // Fire aimed shots during dive
    if (boss._diveTimer2 > 0.5 && Math.floor(boss._diveTimer2 * 3) > Math.floor((boss._diveTimer2 - dt) * 3)) {
      const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
      const angle = getAngleToPlayer(origin);
      spawnEnemyBullet(scene, origin, angle, 9.5, 0xFF6B00, 1.5);
    }
    if (boss.y < 0.5 || boss._diveTimer2 > 2.0) {
      boss._diveActive = false;
      boss._diveReturnTimer = 1.5;
      boss.mesh.rotation.x = -Math.PI / 2;
    }
  }

  if (boss._diveReturnTimer > 0) {
    boss._diveReturnTimer -= dt;
    boss.y += (3.8 - boss.y) * dt * 3;
  }
}

function _interceptorFireRing(scene, count, rotOffset) {
  const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i + rotOffset;
    const elevation = Math.sin((i / count) * Math.PI * 2) * 3.0;
    spawnEnemyBullet(scene, origin, angle, 5, 0xFF6B00, 1.5, elevation);
  }
}

function _interceptorStrafeSpr(scene, count) {
  const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
  // Perpendicular to dash direction
  const baseAngle = boss._strafeDir > 0 ? 90 : -90;
  const spread = 30;
  for (let i = 0; i < count; i++) {
    const a = baseAngle - spread / 2 + (spread / (count - 1)) * i;
    const yVel = (Math.random() - 0.5) * 4;
    spawnEnemyBullet(scene, origin, 180 + a, 6.5, 0xFFAA00, 1.2, yVel);
  }
}

// ─── Colossus ─────────────────────────────────────────────────────────────────
function _updateColossus(dt, scene) {
  // Slow lateral drift
  boss.x += boss._driftDir * 1.2 * dt;
  if (boss.x >= 4.5)  { boss.x = 4.5;  boss._driftDir = -1; }
  if (boss.x <= -4.5) { boss.x = -4.5; boss._driftDir =  1; }

  // Column fire
  boss.columnTimer -= dt;
  if (boss.columnTimer <= 0) {
    const cols    = boss.phase === 1 ? 3 : (boss.phase === 2 ? 5 : 7);
    const speed   = boss.phase === 1 ? 5 : (boss.phase === 2 ? 6 : 7.5);
    const interval= boss.phase === 1 ? 0.9 : (boss.phase === 2 ? 0.7 : 0.5);
    _colossusFireColumns(scene, cols, speed);
    boss.columnTimer = interval;
  }

  // Bomb salvo
  boss.bombTimer -= dt;
  if (boss.bombTimer <= 0) {
    const bombCount2 = boss.phase === 1 ? 6 : (boss.phase === 2 ? 8 : 10);
    const bombInterval = boss.phase === 1 ? 8 : (boss.phase === 2 ? 6 : 5);
    _colossusFireBombs(scene, bombCount2);
    boss.bombTimer = bombInterval;
  }

  // Phase 2+: spiral
  if (boss.phase >= 2) {
    boss.spiralTimer -= dt;
    if (boss.spiralTimer <= 0) {
      const spiralCount = boss.phase >= 3 ? 12 : 8;
      const spiralInterval = boss.phase >= 3 ? 7 : 10;
      _colossusFireSpiral(scene, spiralCount);
      boss.spiralTimer = spiralInterval;
    }
  }

  // Phase 3: annihilation beam
  if (boss.phase >= 3) {
    boss.annihTimer -= dt;
    if (boss.annihTimer <= 0) {
      boss.annihTimer = 12;
      _startColossusAnnihTelegraph(scene);
    }
  }

  // Telegraph tick (annihilation beam)
  if (boss._telegraphType === 'annihilation') {
    boss._telegraphTimer -= dt;
    boss._telegraphPulse += dt * 5;
    if (_telegraphMesh) {
      const op = 0.4 + 0.6 * Math.abs(Math.sin(boss._telegraphPulse));
      _telegraphMesh.children.forEach(c => { if (c.material) c.material.opacity = op; });
    }
    if (boss._telegraphTimer <= 0) {
      boss._telegraphType = null;
      _clearTelegraph(scene);
      _colossusFireAnnihBeam(scene);
    }
  }
}

function _colossusFireColumns(scene, cols, speed) {
  const spread = (cols - 1) * 1.5;
  const step = cols > 1 ? spread / (cols - 1) : 0;
  for (let i = 0; i < cols; i++) {
    const ox = boss.x + (-spread / 2) + i * step;
    const origin = new THREE.Vector3(ox, boss.y, boss.z);
    const yVel = (i - cols / 2) * 0.8;
    spawnEnemyBullet(scene, origin, 180, speed, 0xAA00FF, 1.3, yVel); // 180 = straight +Z toward player
  }
}

function _colossusFireBombs(scene, count) {
  const spread = 7;
  const step = count > 1 ? spread / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const ox = boss.x - spread / 2 + i * step;
    const origin = new THREE.Vector3(ox, boss.y, boss.z);
    // Slow-moving bombs: large red orbs drifting +Z
    const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFF2200 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    scene.add(mesh);
    const driftSpeed = boss.phase === 1 ? 2.5 : (boss.phase === 2 ? 3.5 : 4.0);
    const bombYVel = (Math.random() - 0.5) * 2;
    const vel = new THREE.Vector3(0, bombYVel, driftSpeed);
    enemyBullets.push({ mesh, vel, isBomb: true });
  }
}

function _colossusFireSpiral(scene, count) {
  const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
  let spiralAngle = 0;
  for (let i = 0; i < count; i++) {
    const delay = i * 0.25;
    // Use delayed spawn approach via enemyBullets with a delay flag
    const angle = spiralAngle + i * (360 / count);
    // Immediate spawn, staggered via distance
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.55);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFF44FF });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    scene.add(mesh);
    const rad = deg2rad(angle);
    const vel = new THREE.Vector3(Math.sin(rad) * 4.5, 0, Math.cos(rad) * 4.5);
    enemyBullets.push({ mesh, vel, spawnDelay: delay, _spawnDelayLeft: delay });
    mesh.visible = false; // hidden until delay elapses
  }
}

function _startColossusAnnihTelegraph(scene) {
  boss._telegraphType = 'annihilation';
  boss._telegraphTimer = 2.0;
  boss._telegraphPulse = 0;

  // Two crossing lines (crosshair) at boss X
  const group = new THREE.Group();
  const mat1 = new THREE.LineBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0.9 });
  const mat2 = new THREE.LineBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0.9 });

  // Vertical line (boss X, from boss to Y=0 in Z direction)
  const vPoints = [
    new THREE.Vector3(boss.x, boss.y, boss.z),
    new THREE.Vector3(boss.x, boss.y, 8),
  ];
  const vGeo = new THREE.BufferGeometry().setFromPoints(vPoints);
  group.add(new THREE.Line(vGeo, mat1));

  // Horizontal line at boss Z
  const hPoints = [
    new THREE.Vector3(-8, boss.y, boss.z + 2),
    new THREE.Vector3(8, boss.y, boss.z + 2),
  ];
  const hGeo = new THREE.BufferGeometry().setFromPoints(hPoints);
  group.add(new THREE.Line(hGeo, mat2));

  _telegraphMesh = group;
  scene.add(group);
}

function _colossusFireAnnihBeam(scene) {
  // Wide beam at boss X
  const origin = new THREE.Vector3(boss.x, boss.y, boss.z);
  spawnEnemyBullet(scene, origin, 180, 20, 0xFF0000, 4); // huge scale
}

// ─── Boss collision with player bullets ──────────────────────────────────────
function _checkBossCollision(scene) {
  if (!boss || boss.dead || boss._entering || boss._transitioning) return;

  for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
    const b = playerBullets[bi];
    if (b.piercing && b.hitSet && b.hitSet.has(boss)) continue;

    const dist = b.mesh.position.distanceTo(boss.mesh.position);
    if (dist < 3.0) { // boss hitbox radius
      if (b.piercing && b.hitSet) {
        b.hitSet.add(boss);
      } else {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        playerBullets.splice(bi, 1);
      }
      damageBoss(scene, 1);
    }
  }
}

// ─── Per-frame update ─────────────────────────────────────────────────────────
export function update(dt, scene) {
  _scene = scene;

  if (currentState !== STATE.PLAYING && currentState !== STATE.BOSS) return;

  const now = performance.now() / 1000;

  // Reset bossPhaseTransition after main.js has had one frame to read it
  // (main.js is responsible for resetting it via resetBossPhaseTransition)

  // ── Player movement ───────────────────────────────────────────────────────
  const dx =
    ((keys['ArrowRight'] || keys['KeyD']) ? 1 : 0) -
    ((keys['ArrowLeft']  || keys['KeyA']) ? 1 : 0);
  const dy =
    ((keys['ArrowUp']    || keys['KeyW']) ? 1 : 0) -
    ((keys['ArrowDown']  || keys['KeyS']) ? 1 : 0);

  player.position.x += dx * PLAYER_SPEED * dt;
  player.position.y += dy * PLAYER_SPEED * dt;
  player.position.x = Math.max(-PLAYER_BOUND_X, Math.min(PLAYER_BOUND_X, player.position.x));
  player.position.y = Math.max(PLAYER_BOUND_Y_MIN, Math.min(PLAYER_BOUND_Y_MAX, player.position.y));
  player.rotation.z = -dx * 0.35;
  player.rotation.x = (-Math.PI / 2) + dy * 0.12;

  // ── Invincibility / flash ─────────────────────────────────────────────────
  if (invincibleTimer > 0) {
    invincibleTimer = Math.max(0, invincibleTimer - dt);
    flashTimer -= dt;
    if (flashTimer <= 0) {
      player.visible = !player.visible;
      flashTimer = 0.12;
    }
    if (invincibleTimer <= 0) player.visible = true;
  }

  // ── Auto-fire ─────────────────────────────────────────────────────────────
  fireTimer -= dt;
  if (fireTimer <= 0) {
    fireWeapon(scene);
    fireTimer = FIRE_INTERVALS[weaponTier] || 0.2;
  }

  // ── Stagger queue (T5) ────────────────────────────────────────────────────
  for (let i = _staggerQueue.length - 1; i >= 0; i--) {
    const s = _staggerQueue[i];
    s.delay -= dt;
    if (s.delay <= 0) {
      spawnPlayerBullet(scene, s.ox, s.oy, s.oz, s.angleDeg, s.piercing, s.color);
      _staggerQueue.splice(i, 1);
    }
  }

  // ── Player bullets movement + cull ────────────────────────────────────────
  for (let i = playerBullets.length - 1; i >= 0; i--) {
    const b = playerBullets[i];

    if (b.isSeeker) {
      b.acquireTimer -= dt;
      b.lifetime -= dt;
      if (b.lifetime <= 0) {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        playerBullets.splice(i, 1);
        continue;
      }
      if (b.acquireTimer <= 0 && !b.target) {
        let nearestDist = Infinity;
        let nearest = null;
        for (const e of enemies) {
          if (e.dead) continue;
          const d = b.mesh.position.distanceTo(e.mesh.position);
          if (d < nearestDist) { nearestDist = d; nearest = e; }
        }
        // Also target boss
        if (boss && !boss.dead && !boss._entering) {
          const d = b.mesh.position.distanceTo(boss.mesh.position);
          if (d < nearestDist) { nearest = boss; }
        }
        b.target = nearest;
      }
      if (b.target && !(b.target.dead)) {
        const toTarget = new THREE.Vector3().subVectors(b.target.mesh.position, b.mesh.position).normalize();
        const currentDir = b.vel.clone().normalize();
        const turnRate = (180 * Math.PI / 180) * dt;
        const angle = currentDir.angleTo(toTarget);
        const t = Math.min(1, turnRate / (angle + 0.0001));
        b.vel.lerp(toTarget.multiplyScalar(12), t).setLength(12);
      }
      b.mesh.position.addScaledVector(b.vel, dt);
    } else {
      b.mesh.position.addScaledVector(b.vel, dt);
    }

    if (b.mesh.position.z < -80 || b.mesh.position.z > 20 ||
        Math.abs(b.mesh.position.x) > 20) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      playerBullets.splice(i, 1);
    }
  }

  // ── Enemy bullets movement + cull ─────────────────────────────────────────
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];

    // Handle spawn delay (colossus spiral)
    if (b._spawnDelayLeft !== undefined && b._spawnDelayLeft > 0) {
      b._spawnDelayLeft -= dt;
      if (b._spawnDelayLeft <= 0) {
        b.mesh.visible = true;
      }
      continue;
    }

    // Boss seeker behavior
    if (b.isBossSeeker) {
      b.lifetime -= dt;
      if (b.lifetime <= 0) {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        enemyBullets.splice(i, 1);
        continue;
      }
      b.acquireTimer -= dt;
      if (b.acquireTimer <= 0) {
        const toPlayer = new THREE.Vector3().subVectors(player.position, b.mesh.position).normalize();
        b.vel.lerp(toPlayer.multiplyScalar(8), dt * 3).setLength(8);
      }
    }

    b.mesh.position.addScaledVector(b.vel, dt);
    if (b.mesh.position.z > 15 || b.mesh.position.z < -80 || Math.abs(b.mesh.position.x) > 20 ||
        b.mesh.position.y < -2 || b.mesh.position.y > 12) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      enemyBullets.splice(i, 1);
    }
  }

  // ── Enemy update ──────────────────────────────────────────────────────────
  if (currentState === STATE.PLAYING) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); continue; }

      updateEnemy(e, dt, scene, now);

      // Hit flash
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        if (e.hitFlash > 0) _applyHitFlash(e.mesh);
        else _restoreColors(e.mesh);
      }

      if (e.mesh.position.z > 8) {
        scene.remove(e.mesh);
        _disposeMesh(e.mesh);
        enemies.splice(i, 1);
        continue;
      }
    }
  }

  // ── Boss update ───────────────────────────────────────────────────────────
  if (currentState === STATE.BOSS) {
    _updateBoss(dt, scene);
    _checkBossCollision(scene);
  }

  // ── Collision: player bullets vs enemies ──────────────────────────────────
  if (currentState === STATE.PLAYING) {
    for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
      const b = playerBullets[bi];
      let bulletKilled = false;

      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        if (e.dead) continue;
        if (b.piercing && b.hitSet && b.hitSet.has(e)) continue;

        const dist = b.mesh.position.distanceTo(e.mesh.position);
        if (dist < 0.4 + e.halfSize) {
          if (b.piercing && b.hitSet) {
            b.hitSet.add(e);
          } else {
            bulletKilled = true;
          }
          e.hp--;
          e.hitFlash = 0.12;
          if (e.hp <= 0) {
            playSound(e.type === 'bomber' ? 'enemy_death_large' : 'enemy_death_small');
            killEnemy(scene, e, true, false);
            enemies.splice(ei, 1);
          } else {
            playSound('enemy_hit');
          }
          if (bulletKilled) break;
        }
      }

      if (bulletKilled) {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        playerBullets.splice(bi, 1);
      }
    }
  }

  // ── Collision: enemy bullets vs player ────────────────────────────────────
  if (invincibleTimer <= 0) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      if (b._spawnDelayLeft !== undefined && b._spawnDelayLeft > 0) continue;
      const dist = b.mesh.position.distanceTo(player.position);
      if (dist < 0.18 + 0.1) {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        enemyBullets.splice(i, 1);
        hitPlayer();
        break;
      }
    }
  }

  // ── Pickups: movement + collection ───────────────────────────────────────
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.mesh.position.z += 4.0 * dt;  // drift toward player (+z = toward camera)
    p.mesh.rotation.y += dt * 2;
    p.timer -= dt;

    const dist = p.mesh.position.distanceTo(player.position);
    let collected = dist < 1.2;
    let expired = p.timer <= 0 || p.mesh.position.z > 8;

    if (collected) {
      if (p.type === 'weapon') {
        if (weaponTier < 7) {
          weaponTier++;
          playSound('weapon_tier_up');
        } else {
          score += 500;
        }
      } else if (p.type === 'bomb') {
        playSound('pickup_bomb');
        if (bombCount < 4) bombCount++;
      }
    }

    if (collected || expired) {
      scene.remove(p.mesh);
      _disposeMesh(p.mesh);
      pickups.splice(i, 1);
    }
  }

  // ── Wave system (PLAYING state only) ─────────────────────────────────────
  if (currentState === STATE.PLAYING) {
    _updateWaveSystem(dt, scene);
  }

  // ── World scroll ──────────────────────────────────────────────────────────
  if (_worldSpeed > 0) {
    for (const tp of _terrainPlanes) {
      tp.position.z += _worldSpeed * dt;
      if (tp.userData.grid) tp.userData.grid.position.z += _worldSpeed * dt;
      if (tp.position.z > 60) {
        tp.position.z -= 300;
        if (tp.userData.grid) tp.userData.grid.position.z -= 300;
      }
    }

    // scrollClouds(cloudLayers[0], CLOUD_SPEED_1, dt);
    // scrollClouds(cloudLayers[1], CLOUD_SPEED_2, dt);

    // Scroll city scenery
    updateScenery(_scene, dt, _worldSpeed);

  }

  // ── Camera shake decay ────────────────────────────────────────────────────
  if (cameraShakeIntensity > 0) {
    cameraShakeIntensity = Math.max(0, cameraShakeIntensity - dt * 4);
  }
}

// ─── Enemy movement AI ────────────────────────────────────────────────────────
function updateEnemy(e, dt, scene, now) {
  const mesh = e.mesh;

  if (e.type === 'scout') {
    mesh.position.z += e.speed * dt;
    e.sinePhase += 1.2 * dt * Math.PI * 2;
    mesh.position.x += Math.sin(e.sinePhase) * 0.5 * dt * 3;
    mesh.position.x = Math.max(-8, Math.min(8, mesh.position.x));

    if (e.fixedY !== null && e.fixedY !== undefined) {
      mesh.position.y = e.fixedY;
    }

    if (e.isElite) {
      mesh.userData.elitePhase = (mesh.userData.elitePhase || 0) + dt * 3;
      const pulse = (Math.sin(mesh.userData.elitePhase) + 1) * 0.5;
      mesh.traverse(child => {
        if (child.isMesh && child.material.isMeshStandardMaterial) {
          child.material.emissiveIntensity = (child.material.userData.baseEmissive || 0) * (0.5 + pulse * 1.5);
        }
      });
    }

    const fireRate = e.isElite ? (1.8 / 1.3) : 1.8;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && mesh.position.z < player.position.z - 1) {
      e.fireTimer = fireRate;
      const baseAngle = getAngleToPlayer(mesh.position);
      spawnEnemyBullet(scene, mesh.position, baseAngle - 5, 7.0);
      spawnEnemyBullet(scene, mesh.position, baseAngle + 5, 7.0);
    }
  } else if (e.type === 'bomber') {
    if (e.phase === 'enter') {
      mesh.position.z += e.speed * dt;
      const dirX = e.fromLeft ? 1 : -1;
      mesh.position.x += dirX * e.speed * 0.6 * dt;
      if (mesh.position.y > 3.0) mesh.position.y -= e.speed * 0.3 * dt;
      else mesh.position.y = 3.0;

      if (Math.abs(mesh.position.x) < 1.5) {
        e.phase = 'hold';
        e.holdTimer = e.holdDuration !== undefined ? e.holdDuration : 2.0;
      }
    } else if (e.phase === 'hold') {
      e.holdTimer -= dt;
      mesh.position.y = 3.0;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && mesh.position.z < player.position.z - 1) {
        e.fireTimer = 2.5;
        const bulletCount = e.isElite ? 7 : 5;
        const totalArc = 80;
        for (let ai = 0; ai < bulletCount; ai++) {
          const angle = -totalArc / 2 + ai * (totalArc / (bulletCount - 1));
          spawnEnemyBullet(scene, mesh.position, angle, 4.5);
        }
      }
      if (e.holdTimer <= 0) e.phase = 'exit';
    } else if (e.phase === 'exit') {
      const dirX = e.fromLeft ? -1 : 1;
      mesh.position.x += dirX * e.speed * dt;
      mesh.position.z += e.speed * 0.3 * dt;
    }

    if (e.isElite) {
      mesh.userData.elitePhase = (mesh.userData.elitePhase || 0) + dt * 3;
      const pulse = (Math.sin(mesh.userData.elitePhase) + 1) * 0.5;
      mesh.traverse(child => {
        if (child.isMesh && child.material.isMeshStandardMaterial) {
          child.material.emissiveIntensity = (child.material.userData.baseEmissive || 0) * (0.5 + pulse * 1.5);
        }
      });
    }
  } else if (e.type === 'drone') {
    const dirX = e.fromLeft ? 1 : -1;
    mesh.position.x += dirX * e.speed * dt;
    mesh.position.y = e.sweepY;
    mesh.position.z += e.speed * 0.2 * dt;

    if (e.isElite) {
      mesh.userData.elitePhase = (mesh.userData.elitePhase || 0) + dt * 3;
      const pulse = (Math.sin(mesh.userData.elitePhase) + 1) * 0.5;
      mesh.traverse(child => {
        if (child.isMesh && child.material.isMeshStandardMaterial) {
          child.material.emissiveIntensity = (child.material.userData.baseEmissive || 0) * (0.5 + pulse * 1.5);
        }
      });
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scrollClouds(group, speed, dt) {
  for (const child of group.children) {
    child.position.z += speed * dt;
    if (child.position.z > 10) {
      child.position.z -= 120;
      child.position.x = (Math.random() - 0.5) * 24;
    }
  }
}

export function triggerShake(amount = 0.4) {
  cameraShakeIntensity = amount;
}

export function resetBossPhaseTransition() {
  bossPhaseTransition = false;
}
