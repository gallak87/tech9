// VOID SENTINEL — game.js
// Vertical-scrolling neon bullet-hell. Auto-fire, 5-tier weapon cycling,
// 3 procedural enemy types, 3-phase boss, permadeath.

// ---------------------------------------------------------------------------
// Canvas + constants
// ---------------------------------------------------------------------------

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

const CANVAS_W = 640;
const CANVAS_H = 960;

// High-DPI support — backing store scales with devicePixelRatio, but all
// game code draws in logical (CANVAS_W × CANVAS_H) coordinates.
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
canvas.width  = CANVAS_W * DPR;
canvas.height = CANVAS_H * DPR;
ctx.scale(DPR, DPR);

const STATE = {
  MENU:      'MENU',
  PLAYING:   'PLAYING',
  BOSS:      'BOSS',
  WIN:       'WIN',
  GAME_OVER: 'GAME_OVER',
};

// Neon palette
const COL = {
  cyan:    '#5ad9ff',
  magenta: '#ff3cf0',
  yellow:  '#ffe93a',
  lime:    '#a6ff3c',
  violet:  '#c16bff',
  red:     '#ff4060',
  white:   '#ffffff',
  orange:  '#ff9a3c',
};

// ---------------------------------------------------------------------------
// Parallax starfield (3 layers)
// ---------------------------------------------------------------------------

const starLayers = [
  { count: 80,  speed: 28,  size: [0.4, 0.9], alpha: [0.3, 0.55], tint: '#3a5a9a' },
  { count: 52,  speed: 72,  size: [0.8, 1.5], alpha: [0.5, 0.8],  tint: '#7aaaff' },
  { count: 30,  speed: 150, size: [1.4, 2.4], alpha: [0.75, 1.0], tint: '#ffffff' },
];
const stars = [];
(function genStars() {
  for (const layer of starLayers) {
    for (let i = 0; i < layer.count; i++) {
      stars.push({
        layer,
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        r: layer.size[0] + Math.random() * (layer.size[1] - layer.size[0]),
        a: layer.alpha[0] + Math.random() * (layer.alpha[1] - layer.alpha[0]),
      });
    }
  }
})();

// ---------------------------------------------------------------------------
// Sprite loading (falls back to vector rendering if sprites missing)
// ---------------------------------------------------------------------------

const imgs = {};
const SPRITE_DEFS = [
  ['ship',    'sprites/ship.png'],
  ['scout',   'sprites/scout.png'],
  ['bomber',  'sprites/bomber.png'],
  ['drone',   'sprites/drone.png'],
  ['boss',    'sprites/boss.png'],
  ['pickup',  'sprites/pickup.png'],
];
function loadSprites() {
  return Promise.all(SPRITE_DEFS.map(([k, src]) => new Promise(res => {
    const img = new Image();
    img.onload  = () => { imgs[k] = img; res(); };
    img.onerror = () => { res(); };
    img.src = src;
  })));
}
function drawSprite(key, cx, cy, w, h) {
  const img = imgs[key];
  if (!img) return false;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------------------
// Player + weapon system
// ---------------------------------------------------------------------------

const PLAYER_SPEED = 400;
const BULLET_SPEED = 720;
const FIRE_INTERVAL = 1 / 9; // 9 shots/sec

const SHIP_W = 72, SHIP_H = 84;

const WEAPON_TIERS = {
  1: { name: 'SINGLE',   color: COL.cyan,    w: 4, h: 12, piercing: false },
  2: { name: 'DUAL',     color: COL.yellow,  w: 4, h: 12, piercing: false },
  3: { name: 'SPREAD',   color: COL.lime,    w: 4, h: 12, piercing: false },
  4: { name: 'PIERCING', color: COL.magenta, w: 5, h: 16, piercing: true  },
  5: { name: 'HYBRID',   color: COL.violet,  w: 5, h: 16, piercing: true  },
};

const player = {
  x: CANVAS_W / 2,
  y: CANVAS_H * 0.78,
  // Hitbox is deliberately smaller than the sprite — bullet-hell convention,
  // plus the thumb obscures the ship on touch devices.
  halfW: 9,
  halfH: 12,
  fireTimer: 0,
  tier: 1,        // current weapon tier (1..5), advances on pickup
  invincible: false,
  invincibleTimer: 0,
  blinkTimer: 0,
  thrust: 0,      // for engine flicker
};

const INVINCIBILITY_DURATION = 1.6;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

const bullets      = []; // player bullets
const enemyBullets = []; // enemy bullets
const enemies      = [];
const pickups      = [];
const particles    = [];

const ENEMY_SPECS = {
  scout:  { halfW: 18, halfH: 16, hp: 1, score: 100,  dropChance: 0.18, color: COL.lime,    w: 44, h: 44 },
  bomber: { halfW: 26, halfH: 22, hp: 4, score: 300,  dropChance: 0.42, color: COL.magenta, w: 72, h: 64 },
  drone:  { halfW: 20, halfH: 20, hp: 2, score: 200,  dropChance: 0.28, color: COL.red,     w: 50, h: 50 },
};

const ENEMY_BULLET_SPEED = 310;

// ---------------------------------------------------------------------------
// Game state + screen shake
// ---------------------------------------------------------------------------

const game = {
  state: STATE.MENU,
  score: 0,
  hiScore: Number(localStorage.getItem('vs_hi') || 0),
  lives: 3,
  wave: 0,            // current wave number (1-indexed while playing)
  waveTimer: 0,
  wavePending: [],    // spawn events waiting to fire
  waveBreakTimer: 3,  // grace between waves
  waveIndicatorTimer: 0,
  bossCycle: 0,       // number of bosses defeated this session
  shake: 0,           // remaining screen shake
  flash: 0,           // white flash overlay alpha
};

// ---------------------------------------------------------------------------
// Seedable RNG (for procedural wave gen, reproducible per wave if needed)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const keys = {};

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  if (game.state === STATE.MENU && (e.code === 'Enter' || e.code === 'Space')) {
    startGame(); e.preventDefault(); return;
  }
  if ((game.state === STATE.WIN || game.state === STATE.GAME_OVER) &&
      (e.code === 'Enter' || e.code === 'Space')) {
    game.state = STATE.MENU; e.preventDefault(); return;
  }

  // Prevent space from scrolling page
  if (e.code === 'Space') e.preventDefault();
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

canvas.addEventListener('click', () => {
  if (game.state === STATE.MENU) startGame();
  else if (game.state === STATE.WIN || game.state === STATE.GAME_OVER) game.state = STATE.MENU;
});

// ---------------------------------------------------------------------------
// Touch — relative drag (DoDonPachi-style): the ship moves by the same delta
// as your finger, starting from wherever each new touch lands. You never
// teleport the ship to your finger, so the thumb can sit off to the side.
// ---------------------------------------------------------------------------

function clientToCanvas(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (cx - rect.left) * (CANVAS_W / rect.width),
    y: (cy - rect.top)  * (CANVAS_H / rect.height),
  };
}

let dragActive  = false;
let dragStartCx = 0, dragStartCy = 0;
let dragStartPx = 0, dragStartPy = 0;

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();

  if (game.state === STATE.MENU) { startGame(); return; }
  if (game.state === STATE.WIN || game.state === STATE.GAME_OVER) {
    game.state = STATE.MENU;
    return;
  }
  if (e.touches.length === 0) return;
  const t = e.touches[0];
  const p = clientToCanvas(t.clientX, t.clientY);
  dragActive  = true;
  dragStartCx = p.x;
  dragStartCy = p.y;
  dragStartPx = player.x;
  dragStartPy = player.y;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!dragActive || e.touches.length === 0) return;
  const t = e.touches[0];
  const p = clientToCanvas(t.clientX, t.clientY);
  player.x = dragStartPx + (p.x - dragStartCx);
  player.y = dragStartPy + (p.y - dragStartCy);
}, { passive: false });

function endTouch(e) {
  e.preventDefault();
  if (e.touches && e.touches.length > 0) return;
  dragActive = false;
}
canvas.addEventListener('touchend',    endTouch, { passive: false });
canvas.addEventListener('touchcancel', endTouch, { passive: false });

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function startGame() {
  game.state = STATE.PLAYING;
  game.score = 0;
  game.lives = 3;
  game.wave  = 0;
  game.waveTimer       = 0;
  game.wavePending     = [];
  game.waveBreakTimer  = 2.5;
  game.waveIndicatorTimer = 0;
  game.bossCycle = 0;
  game.shake = 0;
  game.flash = 0;

  player.x = CANVAS_W / 2;
  player.y = CANVAS_H * 0.78;
  player.tier = 1;
  player.fireTimer = 0;
  player.invincible = false;
  player.invincibleTimer = 0;
  player.blinkTimer = 0;

  bullets.length = 0;
  enemyBullets.length = 0;
  enemies.length = 0;
  pickups.length = 0;
  particles.length = 0;

  boss.active = false;
}

function gameOver() {
  game.state = STATE.GAME_OVER;
  if (game.score > game.hiScore) {
    game.hiScore = game.score;
    localStorage.setItem('vs_hi', String(game.hiScore));
  }
  spawnExplosion(player.x, player.y, COL.cyan, 40, 3);
  game.shake = 22;
  game.flash = 0.6;
}

// ---------------------------------------------------------------------------
// Procedural wave generation
// ---------------------------------------------------------------------------
// A wave is a list of spawn events { delay, type, x, extra? }.
// Formation archetypes: line, V, diagonal, swarm, duel, bomberRun, droneSwarm.

function generateWave(waveNum) {
  const rng = mulberry32(waveNum * 9973 + 17);
  const events = [];
  const difficulty = Math.min(1 + (waveNum - 1) * 0.22, 4.5);

  // How many formations this wave?
  const formationCount = 1 + Math.floor(rng() * 2) + Math.floor((waveNum - 1) / 3);

  let t = 0;
  for (let f = 0; f < formationCount; f++) {
    const pick = rng();
    if (waveNum <= 2) {
      addFormationLine(events, t, rng);
    } else if (pick < 0.22) {
      addFormationLine(events, t, rng);
    } else if (pick < 0.42) {
      addFormationV(events, t, rng);
    } else if (pick < 0.58) {
      addFormationDiagonal(events, t, rng);
    } else if (pick < 0.72 && waveNum >= 3) {
      addFormationBomberRun(events, t, rng);
    } else if (pick < 0.88 && waveNum >= 4) {
      addFormationDroneSwarm(events, t, rng);
    } else {
      addFormationDuel(events, t, rng);
    }
    t += 2.2 + rng() * 1.6 - Math.min(0.6, (difficulty - 1) * 0.15);
  }

  return events;
}

function addFormationLine(events, t0, rng) {
  const count = 3 + Math.floor(rng() * 3);
  const pad   = 60;
  const step  = (CANVAS_W - pad * 2) / (count - 1);
  const dir   = rng() < 0.5 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    events.push({
      delay: t0 + i * 0.25,
      type:  'scout',
      x:     pad + (dir === 1 ? i : count - 1 - i) * step,
    });
  }
}

function addFormationV(events, t0, rng) {
  const cx = CANVAS_W / 2 + (rng() - 0.5) * 110;
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 54;
    events.push({
      delay: t0 + Math.abs(i - 2) * 0.18,
      type:  'scout',
      x:     cx + off,
    });
  }
}

function addFormationDiagonal(events, t0, rng) {
  const dir = rng() < 0.5 ? 1 : -1;
  const startX = dir === 1 ? 70 : CANVAS_W - 70;
  for (let i = 0; i < 4; i++) {
    events.push({
      delay: t0 + i * 0.35,
      type:  'scout',
      x:     startX + dir * i * 110,
    });
  }
}

function addFormationBomberRun(events, t0, rng) {
  const slots = [130, CANVAS_W / 2, CANVAS_W - 130];
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    events.push({
      delay: t0 + i * 1.0,
      type:  'bomber',
      x:     slots[Math.floor(rng() * slots.length)],
    });
  }
  // Scout escort
  events.push({ delay: t0 + 1.5, type: 'scout', x: 70  });
  events.push({ delay: t0 + 1.7, type: 'scout', x: CANVAS_W - 70 });
}

function addFormationDroneSwarm(events, t0, rng) {
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    events.push({
      delay: t0 + i * 0.45,
      type:  'drone',
      x:     60 + rng() * (CANVAS_W - 120),
    });
  }
}

function addFormationDuel(events, t0, rng) {
  events.push({ delay: t0,       type: 'bomber', x: 160 });
  events.push({ delay: t0,       type: 'bomber', x: CANVAS_W - 160 });
  events.push({ delay: t0 + 1.2, type: 'drone',  x: CANVAS_W / 2 });
}

// ---------------------------------------------------------------------------
// Spawners
// ---------------------------------------------------------------------------

function spawnEnemy(type, x) {
  const spec = ENEMY_SPECS[type];
  const e = {
    type, x,
    y: -30,
    halfW: spec.halfW,
    halfH: spec.halfH,
    w: spec.w,
    h: spec.h,
    hp: spec.hp,
    maxHp: spec.hp,
    score: spec.score,
    dropChance: spec.dropChance,
    color: spec.color,
    vx: 0, vy: 0,
    fireTimer: 0,
    invulnTimer: 0.15,
    phase: Math.random() * Math.PI * 2,
    flashTimer: 0,
    // drone state
    travelY: 0,
    tracking: false,
  };
  if (type === 'scout')  e.vy = 180;
  if (type === 'bomber') e.vy = 80;
  if (type === 'drone')  e.vy = 150;
  if (type === 'bomber') e.fireTimer = -(0.6 + Math.random());
  enemies.push(e);
}

function spawnPickup(x, y) {
  pickups.push({
    x, y,
    halfW: 14, halfH: 14,
    vy: 90,
    t: 0,
  });
}

// ---------------------------------------------------------------------------
// Particle / explosion / shake helpers
// ---------------------------------------------------------------------------

function spawnExplosion(x, y, color, count = 14, scale = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (40 + Math.random() * 140) * scale;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.45 + Math.random() * 0.35,
      age: 0,
      color,
      r: (1.4 + Math.random() * 2) * scale,
    });
  }
}

function spawnHitSpark(x, y, color) {
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 60;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.18,
      age: 0,
      color,
      r: 1.2,
    });
  }
}

function addShake(n) { game.shake = Math.max(game.shake, n); }

// ---------------------------------------------------------------------------
// Fire bullets per tier
// ---------------------------------------------------------------------------

function fireBullets() {
  const cfg = WEAPON_TIERS[player.tier];
  const bx = player.x;
  const by = player.y - player.halfH - 2;

  function shoot(x, y, vx, vy, cfgOv = cfg) {
    bullets.push({
      x, y, vx, vy,
      w: cfgOv.w, h: cfgOv.h,
      color: cfgOv.color,
      piercing: cfgOv.piercing,
      hits: new Set(),
    });
  }

  const up = -BULLET_SPEED;
  const ang = (deg) => ({
    vx: BULLET_SPEED * Math.sin(deg * Math.PI / 180),
    vy: -BULLET_SPEED * Math.cos(deg * Math.PI / 180),
  });

  switch (player.tier) {
    case 1:
      shoot(bx, by, 0, up);
      break;
    case 2:
      shoot(bx - 10, by, 0, up);
      shoot(bx + 10, by, 0, up);
      break;
    case 3: {
      shoot(bx, by, 0, up);
      const a = ang(-14); const b = ang(14);
      shoot(bx, by, a.vx, a.vy);
      shoot(bx, by, b.vx, b.vy);
      break;
    }
    case 4: {
      // Piercing — narrow spread, piercing bullets
      shoot(bx, by, 0, up);
      const a = ang(-8); const b = ang(8);
      shoot(bx - 6, by, a.vx, a.vy);
      shoot(bx + 6, by, b.vx, b.vy);
      break;
    }
    case 5: {
      // Hybrid — piercing center + wide spread + missiles
      shoot(bx, by, 0, up);
      const a = ang(-18); const b = ang(18);
      shoot(bx - 8, by, a.vx, a.vy);
      shoot(bx + 8, by, b.vx, b.vy);
      // Side missiles (non-piercing, coloured distinctly)
      const m = { color: COL.magenta, w: 5, h: 14, piercing: false };
      shoot(bx - 22, by, 30,  up, m);
      shoot(bx + 22, by, -30, up, m);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// AABB
// ---------------------------------------------------------------------------

function overlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}

// ---------------------------------------------------------------------------
// BOSS
// ---------------------------------------------------------------------------

const boss = {
  active: false,
  x: 0, y: 0,
  halfW: 100, halfH: 60,
  hp: 0, maxHp: 0,
  phase: 1,      // 1..3
  enterTimer: 0, // counts down during entry animation
  patternTimer: 0,
  patternClock: 0,
  deathTimer: 0,
  flashTimer: 0,
  swayPhase: 0,
};

function spawnBoss() {
  boss.active = true;
  boss.x = CANVAS_W / 2;
  boss.y = -120;
  boss.maxHp = 120 + game.bossCycle * 30;
  boss.hp = boss.maxHp;
  boss.phase = 1;
  boss.enterTimer = 2.2;
  boss.patternTimer = 0;
  boss.patternClock = 0;
  boss.deathTimer = 0;
  boss.flashTimer = 0;
  boss.swayPhase = 0;
  game.state = STATE.BOSS;
  game.waveIndicatorTimer = 2.0;
}

function updateBoss(dt) {
  if (!boss.active) return;

  // Entry
  if (boss.enterTimer > 0) {
    boss.enterTimer -= dt;
    boss.y = lerp(-120, 160, 1 - boss.enterTimer / 2.2);
    return;
  }

  // Sway
  boss.swayPhase += dt;
  boss.x = CANVAS_W / 2 + Math.sin(boss.swayPhase * 0.8) * 200;
  boss.y = 160 + Math.sin(boss.swayPhase * 1.3) * 16;

  // Determine phase from HP
  const hpFrac = boss.hp / boss.maxHp;
  if (hpFrac <= 0.33 && boss.phase < 3) {
    boss.phase = 3;
    boss.patternTimer = 0;
    addShake(10);
    game.flash = 0.35;
    spawnExplosion(boss.x, boss.y, COL.magenta, 24, 1.5);
  } else if (hpFrac <= 0.66 && boss.phase < 2) {
    boss.phase = 2;
    boss.patternTimer = 0;
    addShake(8);
    game.flash = 0.25;
    spawnExplosion(boss.x, boss.y, COL.yellow, 20, 1.3);
  }

  // Death
  if (boss.hp <= 0) {
    boss.deathTimer += dt;
    if (boss.deathTimer < 1.6 && Math.random() < 0.6) {
      spawnExplosion(
        boss.x + (Math.random() - 0.5) * 120,
        boss.y + (Math.random() - 0.5) * 80,
        [COL.orange, COL.yellow, COL.magenta][Math.floor(Math.random() * 3)],
        12, 1.4,
      );
      addShake(4);
    }
    if (boss.deathTimer >= 1.8) {
      // Boss down — big pickup, advance to next wave cycle
      game.score += 5000;
      spawnPickup(boss.x, boss.y);
      spawnPickup(boss.x - 30, boss.y);
      spawnPickup(boss.x + 30, boss.y);
      boss.active = false;
      game.bossCycle += 1;
      if (game.bossCycle >= 3) {
        // v1 "WIN" after 3 boss cycles
        game.state = STATE.WIN;
        if (game.score > game.hiScore) {
          game.hiScore = game.score;
          localStorage.setItem('vs_hi', String(game.hiScore));
        }
      } else {
        game.state = STATE.PLAYING;
        game.wave = game.bossCycle * 5;  // next waves harder
        game.waveBreakTimer = 3;
        game.wavePending = [];
      }
    }
    return;
  }

  // Flash timer
  if (boss.flashTimer > 0) boss.flashTimer -= dt;

  // Pattern selection by phase
  boss.patternTimer += dt;
  boss.patternClock += dt;

  if (boss.phase === 1) bossPatternPhase1(dt);
  else if (boss.phase === 2) bossPatternPhase2(dt);
  else bossPatternPhase3(dt);
}

// Phase 1 — wide radial bursts every 1.4s + targeted stream
function bossPatternPhase1(dt) {
  if (boss.patternTimer >= 1.4) {
    boss.patternTimer = 0;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + boss.patternClock * 0.5;
      enemyBullets.push({
        x: boss.x, y: boss.y + boss.halfH,
        vx: Math.cos(a) * 160,
        vy: Math.sin(a) * 160 + 40,
        w: 6, h: 6,
        color: COL.magenta,
        big: true,
      });
    }
  }
  // Targeted stream every 0.25s
  if (boss.patternTimer % 0.25 < dt) {
    const dx = player.x - boss.x;
    const dy = player.y - (boss.y + boss.halfH);
    const d  = Math.hypot(dx, dy) || 1;
    enemyBullets.push({
      x: boss.x, y: boss.y + boss.halfH,
      vx: (dx / d) * 280,
      vy: (dy / d) * 280,
      w: 5, h: 10,
      color: COL.red,
    });
  }
}

// Phase 2 — spiraling arms
function bossPatternPhase2(dt) {
  if (boss.patternTimer >= 0.08) {
    boss.patternTimer = 0;
    const arms = 4;
    for (let k = 0; k < arms; k++) {
      const a = boss.patternClock * 2.6 + (k / arms) * Math.PI * 2;
      enemyBullets.push({
        x: boss.x, y: boss.y + 10,
        vx: Math.cos(a) * 200,
        vy: Math.sin(a) * 200 + 60,
        w: 5, h: 5,
        color: COL.yellow,
      });
    }
  }
}

// Phase 3 — spiraling arms + radial bursts + aimed shotgun blasts
function bossPatternPhase3(dt) {
  // Continuous spiraling arms
  if (boss.patternTimer % 0.06 < dt) {
    const arms = 5;
    for (let k = 0; k < arms; k++) {
      const a = boss.patternClock * -3.2 + (k / arms) * Math.PI * 2;
      enemyBullets.push({
        x: boss.x, y: boss.y + 10,
        vx: Math.cos(a) * 220,
        vy: Math.sin(a) * 220 + 50,
        w: 5, h: 5,
        color: COL.violet,
      });
    }
  }
  // Shotgun blasts every 1.7s
  if (boss.patternTimer >= 1.7) {
    boss.patternTimer = 0;
    const dx = player.x - boss.x;
    const dy = player.y - (boss.y + boss.halfH);
    const base = Math.atan2(dy, dx);
    for (let i = -2; i <= 2; i++) {
      const a = base + i * 0.14;
      enemyBullets.push({
        x: boss.x, y: boss.y + boss.halfH,
        vx: Math.cos(a) * 320,
        vy: Math.sin(a) * 320,
        w: 6, h: 8,
        color: COL.red,
        big: true,
      });
    }
  }
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

function update(dt) {
  // Star scroll always
  const bgSpeedScale = (game.state === STATE.PLAYING || game.state === STATE.BOSS) ? 1 : 0.3;
  for (const s of stars) {
    s.y += s.layer.speed * dt * bgSpeedScale;
    if (s.y > CANVAS_H) { s.y -= CANVAS_H; s.x = Math.random() * CANVAS_W; }
  }

  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 40);
  if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 2);

  if (game.state !== STATE.PLAYING && game.state !== STATE.BOSS) return;

  updatePlayer(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  updateEnemies(dt);
  updatePickups(dt);
  updateParticles(dt);

  if (game.state === STATE.PLAYING) {
    updateWaveSpawner(dt);
  } else if (game.state === STATE.BOSS) {
    updateBoss(dt);
  }

  if (game.waveIndicatorTimer > 0) game.waveIndicatorTimer -= dt;

  checkCollisions();
}

function updatePlayer(dt) {
  const sp = PLAYER_SPEED * dt;
  if (keys['ArrowLeft']  || keys['KeyA']) player.x -= sp;
  if (keys['ArrowRight'] || keys['KeyD']) player.x += sp;
  if (keys['ArrowUp']    || keys['KeyW']) player.y -= sp;
  if (keys['ArrowDown']  || keys['KeyS']) player.y += sp;

  // Clamp to sprite bounds, not hitbox (hitbox is intentionally smaller)
  const clampX = SHIP_W / 2;
  const clampY = SHIP_H / 2;
  player.x = Math.max(clampX, Math.min(CANVAS_W - clampX, player.x));
  player.y = Math.max(clampY, Math.min(CANVAS_H - clampY, player.y));

  // Auto-fire (always on during PLAYING/BOSS)
  player.fireTimer += dt;
  while (player.fireTimer >= FIRE_INTERVAL) {
    fireBullets();
    player.fireTimer -= FIRE_INTERVAL;
  }

  player.thrust = (player.thrust + dt * 22) % (Math.PI * 2);

  if (player.invincible) {
    player.invincibleTimer -= dt;
    player.blinkTimer += dt;
    if (player.invincibleTimer <= 0) {
      player.invincible = false;
      player.blinkTimer = 0;
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y + b.h < 0 || b.y > CANVAS_H || b.x < -20 || b.x > CANVAS_W + 20) {
      bullets.splice(i, 1);
    }
  }
}

function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y - b.h > CANVAS_H + 40 || b.y < -40 || b.x < -40 || b.x > CANVAS_W + 40) {
      enemyBullets.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.invulnTimer > 0) e.invulnTimer -= dt;
    if (e.flashTimer > 0) e.flashTimer -= dt;

    if (e.type === 'scout')  updateScout(e, dt);
    if (e.type === 'bomber') updateBomber(e, dt);
    if (e.type === 'drone')  updateDrone(e, dt);

    if (e.y - e.halfH > CANVAS_H + 40) enemies.splice(i, 1);
  }
}

function updateScout(e, dt) {
  e.y += 180 * dt;
  const wave = Math.sin((e.y / 40) + e.phase);
  e.x += wave * 110 * dt;
  e.x = Math.max(e.halfW, Math.min(CANVAS_W - e.halfW, e.x));
}

function updateBomber(e, dt) {
  e.y += 80 * dt;
  e.fireTimer += dt;
  if (e.fireTimer >= 2.0) {
    e.fireTimer -= 2.0;
    bomberFire(e);
  }
}

function bomberFire(e) {
  const ox = e.x, oy = e.y + e.h / 2;
  const spd = ENEMY_BULLET_SPEED;
  for (const deg of [-22, -7, 7, 22]) {
    const r = deg * Math.PI / 180;
    enemyBullets.push({
      x: ox, y: oy,
      vx: spd * Math.sin(r),
      vy: spd * Math.cos(r),
      w: 5, h: 9,
      color: COL.magenta,
    });
  }
}

function updateDrone(e, dt) {
  e.travelY += 150 * dt;
  if (!e.tracking && e.travelY > 60) e.tracking = true;

  if (e.tracking) {
    // Accelerate toward player
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d  = Math.hypot(dx, dy) || 1;
    const ax = (dx / d) * 280;
    const ay = (dy / d) * 280;
    e.vx += ax * dt;
    e.vy += ay * dt;
    // Damp
    e.vx *= Math.pow(0.94, dt * 60);
    e.vy *= Math.pow(0.94, dt * 60);
    // Clamp speed
    const sp = Math.hypot(e.vx, e.vy);
    const maxSp = 260;
    if (sp > maxSp) { e.vx = e.vx / sp * maxSp; e.vy = e.vy / sp * maxSp; }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  } else {
    e.y += 150 * dt;
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.y += p.vy * dt;
    p.t += dt;
    if (p.y - p.halfH > CANVAS_H) pickups.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.88, dt * 60);
    p.vy *= Math.pow(0.88, dt * 60);
    if (p.age >= p.life) particles.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Wave spawner
// ---------------------------------------------------------------------------

function updateWaveSpawner(dt) {
  // If we're between waves
  if (game.wavePending.length === 0 && enemies.length === 0) {
    game.waveBreakTimer -= dt;
    if (game.waveBreakTimer <= 0) {
      beginNextWave();
    }
    return;
  }

  game.waveTimer += dt;
  for (const ev of game.wavePending) {
    if (!ev.fired && game.waveTimer >= ev.delay) {
      spawnEnemy(ev.type, ev.x);
      ev.fired = true;
    }
  }
  // Purge fired events
  for (let i = game.wavePending.length - 1; i >= 0; i--) {
    if (game.wavePending[i].fired) game.wavePending.splice(i, 1);
  }
}

function beginNextWave() {
  game.wave += 1;
  // Boss every 5 waves
  if (game.wave > 0 && game.wave % 5 === 0) {
    spawnBoss();
    return;
  }
  game.waveTimer = 0;
  game.wavePending = generateWave(game.wave).map(ev => ({ ...ev, fired: false }));
  game.waveBreakTimer = 3.2;
  game.waveIndicatorTimer = 1.6;
}

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------

function checkCollisions() {
  // Player bullets vs enemies
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let consumed = false;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (e.invulnTimer > 0) continue;
      if (b.piercing && b.hits.has(e)) continue;
      if (overlap(b.x, b.y, b.w / 2, b.h / 2, e.x, e.y, e.halfW, e.halfH)) {
        e.hp -= 1;
        e.flashTimer = 0.08;
        spawnHitSpark(b.x, b.y, b.color);
        if (b.piercing) {
          b.hits.add(e);
        } else {
          bullets.splice(i, 1);
          consumed = true;
        }
        if (e.hp <= 0) {
          game.score += e.score;
          spawnExplosion(e.x, e.y, e.color, 18, 1);
          addShake(3);
          if (Math.random() < e.dropChance) spawnPickup(e.x, e.y);
          enemies.splice(j, 1);
        }
        if (consumed) break;
      }
    }
    if (consumed) continue;

    // Player bullets vs boss
    if (boss.active && boss.enterTimer <= 0 && boss.hp > 0) {
      if (!(b.piercing && b.hits.has('boss')) &&
          overlap(b.x, b.y, b.w / 2, b.h / 2, boss.x, boss.y, boss.halfW, boss.halfH)) {
        boss.hp -= 1;
        boss.flashTimer = 0.05;
        spawnHitSpark(b.x, b.y, b.color);
        if (b.piercing) b.hits.add('boss');
        else bullets.splice(i, 1);
      }
    }
  }

  if (player.invincible) return;

  // Enemy bullets vs player
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    if (overlap(b.x, b.y, b.w / 2, b.h / 2, player.x, player.y, player.halfW, player.halfH)) {
      enemyBullets.splice(i, 1);
      hitPlayer();
      return;
    }
  }

  // Enemies vs player
  for (const e of enemies) {
    if (overlap(e.x, e.y, e.halfW, e.halfH, player.x, player.y, player.halfW, player.halfH)) {
      spawnExplosion(e.x, e.y, e.color, 16, 1);
      // Enemy destroyed on body-slam
      e.hp = 0;
      const idx = enemies.indexOf(e);
      if (idx !== -1) enemies.splice(idx, 1);
      hitPlayer();
      return;
    }
  }

  // Boss body vs player
  if (boss.active && boss.enterTimer <= 0 && boss.hp > 0) {
    if (overlap(boss.x, boss.y, boss.halfW, boss.halfH, player.x, player.y, player.halfW, player.halfH)) {
      hitPlayer();
      return;
    }
  }

  // Pickups vs player
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (overlap(p.x, p.y, p.halfW, p.halfH, player.x, player.y, player.halfW, player.halfH)) {
      // Advance to next weapon tier; at max, award score
      if (player.tier < 5) {
        player.tier += 1;
      } else {
        game.score += 500;
      }
      spawnHitSpark(p.x, p.y, COL.cyan);
      spawnHitSpark(p.x, p.y, COL.magenta);
      pickups.splice(i, 1);
    }
  }
}

function hitPlayer() {
  game.lives -= 1;
  addShake(12);
  game.flash = 0.4;
  spawnExplosion(player.x, player.y, COL.cyan, 24, 1.2);
  player.invincible = true;
  player.invincibleTimer = INVINCIBILITY_DURATION;
  player.blinkTimer = 0;
  // Lose a weapon tier on hit (floors at 1)
  if (player.tier > 1) player.tier -= 1;

  if (game.lives <= 0) gameOver();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  // Shake offset
  const sx = (Math.random() - 0.5) * game.shake;
  const sy = (Math.random() - 0.5) * game.shake;
  ctx.save();
  ctx.translate(sx, sy);

  // Clear
  ctx.fillStyle = '#02010a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawStars();

  if (game.state === STATE.MENU)      drawMenu();
  if (game.state === STATE.GAME_OVER) drawGameOver();
  if (game.state === STATE.WIN)       drawWin();

  if (game.state === STATE.PLAYING || game.state === STATE.BOSS ||
      game.state === STATE.GAME_OVER) {
    drawParticles();
    drawPickups();
    drawBullets();
    drawEnemyBullets();
    drawEnemies();
    if (boss.active) drawBoss();
    if (game.state !== STATE.GAME_OVER || player.invincibleTimer > -0.2) drawPlayer();
    drawHUD();
    if (game.waveIndicatorTimer > 0) drawWaveIndicator();
  }

  // Flash
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${game.flash})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Scanline / vignette
  drawVignette();

  ctx.restore();
}

function drawStars() {
  for (const s of stars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = s.layer.tint;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const g = ctx.createRadialGradient(
    CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.25,
    CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawPlayer() {
  // Blink during invincibility
  if (player.invincible) {
    if (Math.floor(player.blinkTimer * 20) % 2 === 0) return;
  }

  // Engine glow flicker
  const thrust = 6 + Math.sin(player.thrust) * 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gy = player.y + player.halfH + 6;
  const g = ctx.createRadialGradient(player.x, gy, 1, player.x, gy, 28 + thrust);
  g.addColorStop(0, 'rgba(120, 220, 255, 0.95)');
  g.addColorStop(0.5, 'rgba(255, 60, 240, 0.35)');
  g.addColorStop(1, 'rgba(120, 220, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(player.x, gy, 28 + thrust, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!drawSprite('ship', player.x, player.y, SHIP_W, SHIP_H)) {
    // Vector fallback ship
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = COL.cyan;
    ctx.strokeStyle = COL.white;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 26);
    ctx.lineTo(player.x - 20, player.y + 20);
    ctx.lineTo(player.x - 10, player.y + 10);
    ctx.lineTo(player.x + 10, player.y + 10);
    ctx.lineTo(player.x + 20, player.y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // cockpit
    ctx.fillStyle = COL.magenta;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bullets) {
    // Glow
    const rad = Math.max(b.w, b.h) * 1.8;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
    g.addColorStop(0, b.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - rad, b.y - rad, rad * 2, rad * 2);
    // Core
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
  ctx.restore();
}

function drawEnemyBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of enemyBullets) {
    const rad = (b.big ? 14 : 10);
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
    g.addColorStop(0, b.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - rad, b.y - rad, rad * 2, rad * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
  ctx.restore();
}

function drawEnemies() {
  for (const e of enemies) {
    if (!drawSprite(e.type, e.x, e.y, e.w, e.h)) {
      drawVectorEnemy(e);
    }
    if (e.flashTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(e.x - e.halfW, e.y - e.halfH, e.halfW * 2, e.halfH * 2);
      ctx.restore();
    }
  }
}

function drawVectorEnemy(e) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = e.color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  if (e.type === 'scout') {
    ctx.beginPath();
    ctx.moveTo(e.x, e.y + e.halfH);
    ctx.lineTo(e.x - e.halfW, e.y - e.halfH);
    ctx.lineTo(e.x + e.halfW, e.y - e.halfH);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (e.type === 'bomber') {
    ctx.fillRect(e.x - e.halfW, e.y - e.halfH, e.halfW * 2, e.halfH * 2);
    ctx.strokeRect(e.x - e.halfW, e.y - e.halfH, e.halfW * 2, e.halfH * 2);
    ctx.fillStyle = COL.yellow;
    ctx.fillRect(e.x - 4, e.y - 4, 8, 8);
  } else if (e.type === 'drone') {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.halfW, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.white;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBoss() {
  const alpha = boss.hp <= 0 ? Math.max(0, 1 - boss.deathTimer / 1.6) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Outer glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const phaseColor = boss.phase === 1 ? COL.magenta : boss.phase === 2 ? COL.yellow : COL.violet;
  const g = ctx.createRadialGradient(boss.x, boss.y, 10, boss.x, boss.y, 140);
  g.addColorStop(0, phaseColor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55 * alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!drawSprite('boss', boss.x, boss.y, boss.halfW * 2, boss.halfH * 2)) {
    // Vector boss
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#2a0d2e';
    ctx.strokeStyle = phaseColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(boss.x, boss.y, boss.halfW, boss.halfH, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Core
    ctx.fillStyle = phaseColor;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, 14, 0, Math.PI * 2);
    ctx.fill();
    // Spikes
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + boss.swayPhase * 0.5;
      const r = boss.halfW + 6;
      ctx.beginPath();
      ctx.moveTo(boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r);
      ctx.lineTo(boss.x + Math.cos(a) * (r + 8), boss.y + Math.sin(a) * (r + 8));
      ctx.strokeStyle = phaseColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (boss.flashTimer > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(boss.x, boss.y, boss.halfW, boss.halfH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawPickups() {
  for (const p of pickups) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + 0.4 * Math.sin(p.t * 10);
    // glow
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34);
    g.addColorStop(0, `rgba(90, 220, 255, ${0.9 * pulse})`);
    g.addColorStop(0.6, `rgba(255, 60, 240, ${0.4 * pulse})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.fill();

    if (!drawSprite('pickup', p.x, p.y, 36, 36)) {
      // Vector diamond
      ctx.fillStyle = COL.cyan;
      ctx.strokeStyle = COL.white;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x,       p.y - 14);
      ctx.lineTo(p.x + 11,  p.y);
      ctx.lineTo(p.x,       p.y + 14);
      ctx.lineTo(p.x - 11,  p.y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const t = 1 - p.age / p.life;
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * t + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHUD() {
  ctx.save();
  // Score
  ctx.fillStyle = COL.cyan;
  ctx.font = 'bold 18px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${pad(game.score, 7)}`, 12, 22);
  // Hi
  ctx.fillStyle = COL.magenta;
  ctx.textAlign = 'right';
  ctx.fillText(`HI  ${pad(game.hiScore, 7)}`, CANVAS_W - 12, 22);

  // Weapon
  ctx.textAlign = 'left';
  ctx.fillStyle = WEAPON_TIERS[player.tier].color;
  ctx.fillText(`WPN  T${player.tier}  ${WEAPON_TIERS[player.tier].name}`, 12, CANVAS_H - 14);

  // Lives
  ctx.textAlign = 'right';
  ctx.fillStyle = COL.cyan;
  ctx.fillText('LIVES', CANVAS_W - 90, CANVAS_H - 14);
  for (let i = 0; i < game.lives; i++) {
    const x = CANVAS_W - 72 + i * 22;
    const y = CANVAS_H - 22;
    ctx.fillStyle = COL.cyan;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x - 6, y + 5);
    ctx.lineTo(x + 6, y + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Boss HP bar
  if (boss.active && boss.hp > 0) {
    const barX = 40, barY = 40, barW = CANVAS_W - 80, barH = 8;
    ctx.fillStyle = '#110022';
    ctx.fillRect(barX, barY, barW, barH);
    const frac = Math.max(0, boss.hp / boss.maxHp);
    const phaseColor = boss.phase === 1 ? COL.magenta : boss.phase === 2 ? COL.yellow : COL.violet;
    ctx.fillStyle = phaseColor;
    ctx.fillRect(barX, barY, barW * frac, barH);
    // Threshold markers
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(barX + barW * 0.33 - 1, barY - 2, 2, barH + 4);
    ctx.fillRect(barX + barW * 0.66 - 1, barY - 2, 2, barH + 4);
    ctx.strokeStyle = COL.cyan;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.cyan;
    ctx.font = 'bold 11px Courier New';
    ctx.fillText(`SENTINEL ${boss.phase}/3  —  CYCLE ${game.bossCycle + 1}/3`, CANVAS_W / 2, barY - 6);
  }

  ctx.restore();
}

function drawWaveIndicator() {
  const alpha = Math.min(1, game.waveIndicatorTimer / 1.0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COL.cyan;
  ctx.font = 'bold 36px Courier New';
  ctx.textAlign = 'center';
  if (game.state === STATE.BOSS) {
    ctx.fillStyle = COL.magenta;
    ctx.fillText('SENTINEL INCOMING', CANVAS_W / 2, CANVAS_H / 2);
  } else {
    ctx.fillText(`WAVE ${game.wave}`, CANVAS_W / 2, CANVAS_H / 2);
  }
  ctx.restore();
}

function drawMenu() {
  // Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.cyan;
  ctx.font = 'bold 54px Courier New';
  ctx.shadowColor = COL.magenta;
  ctx.shadowBlur = 18;
  ctx.fillText('VOID', CANVAS_W / 2, CANVAS_H * 0.33);
  ctx.fillStyle = COL.magenta;
  ctx.shadowColor = COL.cyan;
  ctx.fillText('SENTINEL', CANVAS_W / 2, CANVAS_H * 0.42);
  ctx.shadowBlur = 0;

  // Controls
  ctx.font = 'bold 17px Courier New';
  ctx.fillStyle = COL.white;
  ctx.fillText('DRAG / ARROWS / WASD   MOVE',          CANVAS_W / 2, CANVAS_H * 0.58);
  ctx.fillText('AUTO-FIRE              ALWAYS ON',     CANVAS_W / 2, CANVAS_H * 0.62);
  ctx.fillText('PICKUPS                LEVEL UP WEAPON', CANVAS_W / 2, CANVAS_H * 0.66);

  // Start prompt
  const blink = Math.floor(performance.now() / 400) % 2 === 0;
  if (blink) {
    ctx.fillStyle = COL.yellow;
    ctx.font = 'bold 20px Courier New';
    ctx.fillText('PRESS ENTER / SPACE', CANVAS_W / 2, CANVAS_H * 0.82);
  }

  // Hi score
  if (game.hiScore > 0) {
    ctx.fillStyle = COL.magenta;
    ctx.font = 'bold 12px Courier New';
    ctx.fillText(`HI SCORE  ${pad(game.hiScore, 7)}`, CANVAS_W / 2, CANVAS_H * 0.92);
  }
  ctx.restore();
}

function drawGameOver() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.red;
  ctx.font = 'bold 36px Courier New';
  ctx.shadowColor = COL.red;
  ctx.shadowBlur = 18;
  ctx.fillText('PERMADEATH', CANVAS_W / 2, CANVAS_H * 0.36);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COL.cyan;
  ctx.font = 'bold 16px Courier New';
  ctx.fillText(`SCORE   ${pad(game.score, 7)}`,   CANVAS_W / 2, CANVAS_H * 0.52);
  ctx.fillStyle = COL.magenta;
  ctx.fillText(`HI      ${pad(game.hiScore, 7)}`, CANVAS_W / 2, CANVAS_H * 0.58);

  const blink = Math.floor(performance.now() / 400) % 2 === 0;
  if (blink) {
    ctx.fillStyle = COL.yellow;
    ctx.fillText('ENTER / SPACE', CANVAS_W / 2, CANVAS_H * 0.78);
  }
  ctx.restore();
}

function drawWin() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.magenta;
  ctx.font = 'bold 32px Courier New';
  ctx.shadowColor = COL.cyan;
  ctx.shadowBlur = 18;
  ctx.fillText('VOID PURGED', CANVAS_W / 2, CANVAS_H * 0.36);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.cyan;
  ctx.font = 'bold 16px Courier New';
  ctx.fillText(`SCORE   ${pad(game.score, 7)}`, CANVAS_W / 2, CANVAS_H * 0.52);
  ctx.fillText(`HI      ${pad(game.hiScore, 7)}`, CANVAS_W / 2, CANVAS_H * 0.58);

  const blink = Math.floor(performance.now() / 400) % 2 === 0;
  if (blink) {
    ctx.fillStyle = COL.yellow;
    ctx.fillText('ENTER / SPACE', CANVAS_W / 2, CANVAS_H * 0.78);
  }
  ctx.restore();
}

function pad(n, w) { return String(n).padStart(w, '0'); }

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let lastTime = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

loadSprites().then(() => {
  requestAnimationFrame(frame);
});
