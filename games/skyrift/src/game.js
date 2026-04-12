// SKYRIFT — game.js
// Phase 0: Engine skeleton. No classes, plain global scope, plain script tag.
// Phase 2: Weapon system, hit detection, scoring, HUD, pickups, placeholder enemies.
// Phase 3: Real enemy AI (Scout drift, Bomber fire, Interceptor tracking), wave spawner, enemy bullets.

// ---------------------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const CANVAS_W = 480;
const CANVAS_H = 640;

canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
// Valid states and their transition rules:
//   MENU       → PLAYING  (Enter key or canvas click)
//   PLAYING    → BOSS     (all waves cleared — TODO Phase 3)
//   PLAYING    → GAME_OVER (player runs out of lives)
//   BOSS       → WIN      (boss defeated — TODO Phase 4)
//   BOSS       → GAME_OVER (player runs out of lives during boss)
//   WIN        → MENU     (Enter key or canvas click)
//   GAME_OVER  → MENU     (Enter key or canvas click)
//
// DEV shortcuts (remove before ship):
//   W → skip to WIN
//   G → skip to GAME_OVER

const STATE = {
  MENU:      'MENU',
  PLAYING:   'PLAYING',
  BOSS:      'BOSS',
  WIN:       'WIN',
  GAME_OVER: 'GAME_OVER',
};

// ---------------------------------------------------------------------------
// Star field — generated once, drawn every frame (no scroll in Phase 0)
// ---------------------------------------------------------------------------

const STAR_COUNT = 80;
const stars = [];

(function generateStars() {
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x:    Math.random() * CANVAS_W,
      y:    Math.random() * CANVAS_H,
      // Vary brightness: pure white to light blue
      r:    Math.random() * 0.8 + 0.4,           // radius 0.4–1.2
      alpha: Math.random() * 0.6 + 0.4,          // opacity 0.4–1.0
      blueish: Math.random() < 0.35,             // ~35% slightly blue-tinted
    });
  }
})();

// ---------------------------------------------------------------------------
// Sprites — loaded async before loop starts
// ---------------------------------------------------------------------------

const imgs = {};

function loadSprites() {
  const defs = [
    ['player',      'sprites/player.png'],
    ['scout',       'sprites/scout.png'],
    ['bomber',      'sprites/bomber.png'],
    ['interceptor', 'sprites/interceptor.png'],
    ['pickup',      'sprites/pickup.png'],
  ];
  return Promise.all(defs.map(([key, src]) => new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { imgs[key] = img; resolve(); };
    img.onerror = () => { console.warn(`sprite missing: ${src}`); resolve(); };
    img.src = src;
  })));
}

function drawSprite(key, cx, cy, w, h) {
  const img = imgs[key];
  if (!img) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}

// ---------------------------------------------------------------------------
// Scrolling stripe background
// ---------------------------------------------------------------------------
// Stripes scroll downward at SCROLL_SPEED px/sec to sell vertical movement.
// Two-tone: alternating deep navy (#0a0a2e) and slightly lighter navy (#0d1157).

const SCROLL_SPEED = 80;        // px/sec — gamedesign spec
const STRIPE_H     = 80;        // height of each stripe
let   scrollY      = 0;         // accumulated scroll offset (0–STRIPE_H, wraps)

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const PLAYER_SPEED = 280;       // px/sec — from gamedesign spec

// Hitbox from gamedesign spec: 28 × 32 px centered on sprite
const player = {
  x:         CANVAS_W / 2,
  y:         CANVAS_H * 0.75,   // bottom third
  halfW:     14,                // hitbox half-width  (28px total)
  halfH:     16,                // hitbox half-height (32px total)
  autoFire:  false,
  weaponLevel: 1,               // 1–5
  fireTimer: 0,                 // time accumulator for auto-fire
  invincible: false,            // true while briefly invulnerable after hit
  invincibleTimer: 0,           // countdown in seconds
  blinkTimer: 0,                // drives blink rendering during invincibility
};

// ---------------------------------------------------------------------------
// Weapon system constants — from gamedesign-output.md and art-output.md
// ---------------------------------------------------------------------------

const BULLET_SPEED    = 520;    // px/sec upward (gamedesign spec)
const AUTO_FIRE_RATE  = 8;      // bullets/sec (gamedesign spec)
const FIRE_INTERVAL   = 1 / AUTO_FIRE_RATE;  // seconds between shots

const INVINCIBILITY_DURATION = 1.5;  // seconds after being hit

// Bullet visual configs per weapon level (art-output.md)
const WEAPON_CONFIG = {
  1: { color: '#ffffff', w: 2, h: 6  },   // Standard White — single
  2: { color: '#ffe000', w: 2, h: 6  },   // Volt Yellow — twin
  3: { color: '#0099ff', w: 3, h: 7  },   // Sky Blue — 3-way spread
  4: { color: '#aaff00', w: 4, h: 10 },   // Lime Pulse — spread + missiles
  5: { color: '#cc44ff', w: 3, h: 8  },   // Piercing Violet — full spread + piercing
};

// Bullets array: { x, y, vx, vy, w, h, color, piercing }
const bullets = [];

// ---------------------------------------------------------------------------
// Enemies — Phase 3: real AI, wave spawner
// ---------------------------------------------------------------------------

// Hitboxes from gamedesign spec (half-extents). Sprite sizes from art-output.md.
const ENEMY_SPECS = {
  scout:       { halfW: 11, halfH:  9, hp: 1, score: 100,  dropChance: 0.30,  color: '#39ff14', w: 28, h: 28 },
  bomber:      { halfW: 15, halfH: 14, hp: 3, score: 250,  dropChance: 0.55,  color: '#6b21a8', w: 48, h: 40 },
  interceptor: { halfW: 13, halfH: 13, hp: 5, score: 500,  dropChance: 0.45,  color: '#dc1a1a', w: 32, h: 44 },
};

// enemies array — each object: { type, x, y, halfW, halfH, w, h, hp, maxHp, score, dropChance, color,
//   vx, vy, fireTimer, invulnTimer, phaseOffset,
//   // interceptor-only:
//   travelY, tracking, aligned }
const enemies = [];

// ---------------------------------------------------------------------------
// Enemy bullets — Phase 3
// ---------------------------------------------------------------------------
// Each: { x, y, vx, vy, w, h }  — rendered as red/orange rects
const ENEMY_BULLET_SPEED = 220;   // px/sec downward — gamedesign spec

const enemyBullets = [];

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------

// Pickup hitbox from gamedesign spec: 18 × 18 px centered
const PICKUP_SPEED = 80;   // px/sec downward

// pickups array: { x, y, halfW, halfH }
const pickups = [];

// ---------------------------------------------------------------------------
// Game state object
// ---------------------------------------------------------------------------

const game = {
  state:  STATE.MENU,
  score:  0,
  lives:  3,
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const keys = {};   // keys[code] = true while held

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  // ---- State transitions via keydown ----

  if (game.state === STATE.MENU && e.code === 'Enter') {
    startGame();
    return;
  }

  if (game.state === STATE.WIN && e.code === 'Enter') {
    game.state = STATE.MENU;
    return;
  }

  if (game.state === STATE.GAME_OVER && e.code === 'Enter') {
    game.state = STATE.MENU;
    return;
  }

  // Auto-fire toggle (only while playing or boss)
  if ((game.state === STATE.PLAYING || game.state === STATE.BOSS) &&
      (e.code === 'KeyZ' || e.code === 'Space')) {
    player.autoFire = !player.autoFire;
    console.log('auto-fire:', player.autoFire ? 'on' : 'off');
    e.preventDefault();   // prevent space from scrolling the page
    return;
  }

  // DEV SHORTCUTS — remove before ship
  if (game.state === STATE.PLAYING || game.state === STATE.BOSS) {
    if (e.code === 'KeyW') {
      console.log('[DEV] skipping to WIN');
      game.state = STATE.WIN;
      return;
    }
    if (e.code === 'KeyG') {
      console.log('[DEV] skipping to GAME_OVER');
      game.state = STATE.GAME_OVER;
      return;
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// Click / tap to start or restart
canvas.addEventListener('click', () => {
  if (game.state === STATE.MENU) {
    startGame();
  } else if (game.state === STATE.WIN || game.state === STATE.GAME_OVER) {
    game.state = STATE.MENU;
  }
});

// ---------------------------------------------------------------------------
// Game lifecycle helpers
// ---------------------------------------------------------------------------

function startGame() {
  game.state = STATE.PLAYING;
  game.score = 0;
  game.lives = 3;

  player.x           = CANVAS_W / 2;
  player.y           = CANVAS_H * 0.75;
  player.autoFire    = false;
  player.weaponLevel = 1;
  player.fireTimer   = 0;
  player.invincible  = false;
  player.invincibleTimer = 0;
  player.blinkTimer  = 0;

  scrollY = 0;

  bullets.length      = 0;
  pickups.length      = 0;
  enemies.length      = 0;
  enemyBullets.length = 0;

  resetWaveSpawner();
}

function spawnEnemy(type, x) {
  const spec = ENEMY_SPECS[type];
  const e = {
    type,
    x,
    y:           -30,          // just above visible canvas
    halfW:       spec.halfW,
    halfH:       spec.halfH,
    w:           spec.w,
    h:           spec.h,
    hp:          spec.hp,
    maxHp:       spec.hp,
    score:       spec.score,
    dropChance:  spec.dropChance,
    color:       spec.color,
    vx:          0,
    vy:          0,
    fireTimer:   0,
    invulnTimer: 0.2,          // 0.2s spawn invincibility
    phaseOffset: Math.random() * Math.PI * 2,
    // interceptor state
    travelY:     0,            // px traveled so far
    tracking:    false,        // entered lateral-track phase
    aligned:     false,        // locked onto player x
  };

  // Set initial vertical speed per type
  if (type === 'scout')       e.vy = 180;
  if (type === 'bomber')      e.vy = 90;
  if (type === 'interceptor') e.vy = 140;

  // Bomber: randomize initial fire delay 0.8–1.8s
  if (type === 'bomber') {
    e.fireTimer = -(0.8 + Math.random() * 1.0);   // negative = waiting for first shot
  }

  enemies.push(e);
}

// ---------------------------------------------------------------------------
// Wave spawner — Phase 3
// ---------------------------------------------------------------------------
// 13-wave script from gamedesign-output.md.
// Each wave: array of spawn events { delay (seconds from wave start), type, x }

const WAVE_SCRIPT = [
  // Wave 1 (index 0)
  [
    { delay: 0.0, type: 'scout', x:  80 },
    { delay: 0.5, type: 'scout', x: 240 },
    { delay: 1.0, type: 'scout', x: 400 },
  ],
  // Wave 2
  [
    { delay: 0.0, type: 'scout', x:  60 },
    { delay: 0.4, type: 'scout', x: 160 },
    { delay: 0.8, type: 'scout', x: 320 },
    { delay: 1.2, type: 'scout', x: 420 },
  ],
  // Wave 3 — simultaneous V-shape
  [
    { delay: 0.0, type: 'scout', x: 120 },
    { delay: 0.0, type: 'scout', x: 240 },
    { delay: 0.0, type: 'scout', x: 360 },
  ],
  // Wave 4
  [
    { delay: 0.0, type: 'bomber', x: 240 },
    { delay: 2.0, type: 'scout',  x:  80 },
    { delay: 2.6, type: 'scout',  x: 160 },
    { delay: 3.2, type: 'scout',  x: 320 },
    { delay: 3.8, type: 'scout',  x: 400 },
  ],
  // Wave 5
  [
    { delay: 0.0, type: 'bomber', x: 140 },
    { delay: 1.0, type: 'scout',  x:  60 },
    { delay: 1.0, type: 'scout',  x: 420 },
    { delay: 2.0, type: 'bomber', x: 340 },
  ],
  // Wave 6
  [
    { delay: 0.0, type: 'scout', x:  48 },
    { delay: 0.3, type: 'scout', x: 132 },
    { delay: 0.6, type: 'scout', x: 240 },
    { delay: 0.9, type: 'scout', x: 348 },
    { delay: 1.2, type: 'scout', x: 432 },
  ],
  // Wave 7
  [
    { delay: 0.0, type: 'interceptor', x: 240 },
    { delay: 1.5, type: 'scout',       x: 100 },
    { delay: 1.5, type: 'scout',       x: 380 },
  ],
  // Wave 8
  [
    { delay: 0.0, type: 'bomber',      x: 160 },
    { delay: 1.5, type: 'bomber',      x: 320 },
    { delay: 3.0, type: 'interceptor', x: 240 },
  ],
  // Wave 9
  [
    { delay: 0.0, type: 'scout',       x:  80 },
    { delay: 0.3, type: 'scout',       x: 240 },
    { delay: 0.6, type: 'scout',       x: 400 },
    { delay: 2.0, type: 'interceptor', x: 140 },
    { delay: 3.0, type: 'interceptor', x: 340 },
  ],
  // Wave 10
  [
    { delay: 0.0, type: 'bomber',      x: 120 },
    { delay: 0.0, type: 'interceptor', x: 360 },
    { delay: 2.0, type: 'scout',       x:  60 },
    { delay: 2.5, type: 'scout',       x: 240 },
    { delay: 3.0, type: 'scout',       x: 420 },
  ],
  // Wave 11
  [
    { delay: 0.0, type: 'interceptor', x: 120 },
    { delay: 1.2, type: 'interceptor', x: 240 },
    { delay: 2.4, type: 'interceptor', x: 360 },
  ],
  // Wave 12
  [
    { delay: 0.0, type: 'bomber',      x: 100 },
    { delay: 1.0, type: 'bomber',      x: 240 },
    { delay: 2.0, type: 'bomber',      x: 380 },
    { delay: 4.0, type: 'interceptor', x:  60 },
    { delay: 4.0, type: 'interceptor', x: 420 },
  ],
  // Wave 13 — final pre-boss wave
  [
    { delay: 0.0, type: 'scout',       x:  80 },
    { delay: 0.3, type: 'scout',       x: 180 },
    { delay: 0.6, type: 'scout',       x: 300 },
    { delay: 0.9, type: 'scout',       x: 400 },
    { delay: 1.0, type: 'bomber',      x: 140 },
    { delay: 2.5, type: 'bomber',      x: 340 },
    { delay: 4.0, type: 'interceptor', x: 100 },
    { delay: 4.0, type: 'interceptor', x: 380 },
  ],
];

// Wave state (added to game object in resetWaveSpawner)
function resetWaveSpawner() {
  game.waveIndex    = -1;       // -1 = pre-game pause, 0–12 = current wave (0-based)
  game.waveTimer    = 0;        // seconds elapsed in current wave
  game.wavePending  = [];       // spawn events not yet fired
  game.waveCleared  = false;    // true when all 13 waves done and screen is clear
  game.wavePause    = 5;        // initial 5s breathing room before wave 1 (spec: Wave 1 at t=5s)
  game.waveStarted  = false;

  // Wave indicator
  game.waveIndicatorTimer = 0;  // countdown for "WAVE N" text display (1.5s)
}

function beginWave(index) {
  game.waveIndex   = index;
  game.waveTimer   = 0;
  game.wavePending = WAVE_SCRIPT[index].map(ev => ({ ...ev, fired: false }));
  game.waveStarted = true;
  game.waveIndicatorTimer = 1.5;
  console.log(`[SKYRIFT] Wave ${index + 1} begin`);
}

// ---------------------------------------------------------------------------
// Bullet factory — spawns bullets per weapon level
// ---------------------------------------------------------------------------

function fireBullets() {
  const lvl = player.weaponLevel;
  const cfg = WEAPON_CONFIG[lvl];
  const bx  = player.x;
  const by  = player.y - player.halfH;   // fire from ship nose

  // Helper: push a normal bullet with optional velocity offset
  function pushBullet(x, vx, piercing = false) {
    bullets.push({
      x, y: by,
      vx, vy: -BULLET_SPEED,
      w: cfg.w, h: cfg.h,
      color: cfg.color,
      piercing,
    });
  }

  // Helper: angle-based velocity (for spread/missiles)
  function vxFromDeg(deg) {
    return BULLET_SPEED * Math.sin(deg * Math.PI / 180);
  }
  function vyFromDeg(deg) {
    return -BULLET_SPEED * Math.cos(deg * Math.PI / 180);
  }

  if (lvl === 1) {
    // Single shot, center
    pushBullet(bx, 0);

  } else if (lvl === 2) {
    // Twin shot — two parallel bullets
    pushBullet(bx - 6, 0);
    pushBullet(bx + 6, 0);

  } else if (lvl === 3) {
    // 3-way spread: center + 15° left/right
    pushBullet(bx, 0);
    bullets.push({ x: bx, y: by, vx: vxFromDeg(-15), vy: vyFromDeg(-15), w: cfg.w, h: cfg.h, color: cfg.color, piercing: false });
    bullets.push({ x: bx, y: by, vx: vxFromDeg( 15), vy: vyFromDeg( 15), w: cfg.w, h: cfg.h, color: cfg.color, piercing: false });

  } else if (lvl === 4) {
    // 3-way spread + 2 homing missiles (Phase 2: missiles fire at slight angle)
    // TODO Phase 3: real homing — track nearest enemy
    pushBullet(bx, 0);
    bullets.push({ x: bx, y: by, vx: vxFromDeg(-15), vy: vyFromDeg(-15), w: cfg.w, h: cfg.h, color: cfg.color, piercing: false });
    bullets.push({ x: bx, y: by, vx: vxFromDeg( 15), vy: vyFromDeg( 15), w: cfg.w, h: cfg.h, color: cfg.color, piercing: false });
    // Missiles: wider offset, slight inward angle to look like they're tracking
    const missileColor = '#aaff00';
    bullets.push({ x: bx - 16, y: by, vx:  30, vy: -BULLET_SPEED, w: 4, h: 10, color: missileColor, piercing: false, missile: true });
    bullets.push({ x: bx + 16, y: by, vx: -30, vy: -BULLET_SPEED, w: 4, h: 10, color: missileColor, piercing: false, missile: true });

  } else if (lvl === 5) {
    // 3-way spread + 2 homing missiles + center piercing shot
    // TODO Phase 3: real homing on missiles
    pushBullet(bx, 0, true);  // center piercing
    bullets.push({ x: bx, y: by, vx: vxFromDeg(-15), vy: vyFromDeg(-15), w: cfg.w, h: cfg.h, color: cfg.color, piercing: true });
    bullets.push({ x: bx, y: by, vx: vxFromDeg( 15), vy: vyFromDeg( 15), w: cfg.w, h: cfg.h, color: cfg.color, piercing: true });
    const missileColor = '#aaff00';
    bullets.push({ x: bx - 16, y: by, vx:  30, vy: -BULLET_SPEED, w: 4, h: 10, color: missileColor, piercing: false, missile: true });
    bullets.push({ x: bx + 16, y: by, vx: -30, vy: -BULLET_SPEED, w: 4, h: 10, color: missileColor, piercing: false, missile: true });
  }
}

// ---------------------------------------------------------------------------
// AABB helper
// ---------------------------------------------------------------------------

function aabbOverlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  return Math.abs(ax - bx) < ahw + bhw &&
         Math.abs(ay - by) < ahh + bhh;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

function update(dt) {
  if (game.state === STATE.PLAYING || game.state === STATE.BOSS) {
    updateBackground(dt);
    updatePlayer(dt);
    updateBullets(dt);
    updateEnemyBullets(dt);
    updatePickups(dt);
    updateEnemies(dt);
    updateWaveSpawner(dt);
    checkCollisions();

    // Wave indicator countdown
    if (game.waveIndicatorTimer > 0) {
      game.waveIndicatorTimer -= dt;
    }
  }
}

function updateBackground(dt) {
  scrollY += SCROLL_SPEED * dt;
  // No wrap — let scrollY grow continuously. drawBackground uses modulo so it
  // can derive both the visual offset AND the color phase without a seam.
}

function updatePlayer(dt) {
  const speed = PLAYER_SPEED * dt;

  if (keys['ArrowLeft'])  player.x -= speed;
  if (keys['ArrowRight']) player.x += speed;
  if (keys['ArrowUp'])    player.y -= speed;
  if (keys['ArrowDown'])  player.y += speed;

  // Clamp to canvas bounds
  player.x = Math.max(player.halfW,  Math.min(CANVAS_W - player.halfW,  player.x));
  player.y = Math.max(player.halfH,  Math.min(CANVAS_H - player.halfH,  player.y));

  // Auto-fire: accumulate timer, spawn bullets at fixed rate
  if (player.autoFire) {
    player.fireTimer += dt;
    while (player.fireTimer >= FIRE_INTERVAL) {
      fireBullets();
      player.fireTimer -= FIRE_INTERVAL;
    }
  } else {
    player.fireTimer = 0;
  }

  // Invincibility countdown + blink
  if (player.invincible) {
    player.invincibleTimer -= dt;
    player.blinkTimer     += dt;
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
    // Remove bullets that exit the canvas
    if (b.y + b.h < 0 || b.y > CANVAS_H || b.x + b.w < 0 || b.x > CANVAS_W) {
      bullets.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.y += PICKUP_SPEED * dt;
    // Remove if off bottom of canvas
    if (p.y - p.halfH > CANVAS_H) {
      pickups.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Enemy AI — Phase 3
// ---------------------------------------------------------------------------

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    // Invulnerability countdown
    if (e.invulnTimer > 0) e.invulnTimer -= dt;

    if (e.type === 'scout') {
      updateScout(e, dt);
    } else if (e.type === 'bomber') {
      updateBomber(e, dt);
    } else if (e.type === 'interceptor') {
      updateInterceptor(e, dt);
    }

    // Remove if scrolled off bottom
    if (e.y - e.halfH > CANVAS_H + 20) {
      enemies.splice(i, 1);
    }
  }
}

// Scout: straight down + sine-wave horizontal drift
// Speed 180 px/sec, amplitude ±35px, frequency 1.2 Hz
function updateScout(e, dt) {
  e.y += 180 * dt;
  // Sine drift — phaseOffset randomises starting phase so scouts in same wave differ
  const t = e.y / 180;   // use travel time as time base
  e.x += Math.sin(t * 1.2 * Math.PI * 2 + e.phaseOffset) * 35 * 1.2 * Math.PI * 2 * dt;
  // Clamp x so scouts don't drift off canvas
  e.x = Math.max(e.halfW, Math.min(CANVAS_W - e.halfW, e.x));
}

// Bomber: straight down, slow. Fires 3-bullet burst on timer.
// Speed 90 px/sec. Fire every 2.2s after randomized initial delay.
function updateBomber(e, dt) {
  e.y += 90 * dt;
  e.fireTimer += dt;

  // fireTimer starts negative (the randomized delay 0.8–1.8s), then counts up from 0
  if (e.fireTimer >= 2.2) {
    e.fireTimer -= 2.2;
    bomberFire(e);
  }
}

function bomberFire(e) {
  // Origin: bottom-center of sprite
  const ox = e.x;
  const oy = e.y + e.h / 2;
  const spd = ENEMY_BULLET_SPEED;

  // 3 bullets: center straight down, ±18° spread
  const angles = [-18, 0, 18];
  for (const deg of angles) {
    const rad = deg * Math.PI / 180;
    enemyBullets.push({
      x:  ox,
      y:  oy,
      vx: spd * Math.sin(rad),
      vy: spd * Math.cos(rad),   // positive = downward
      w:  5,
      h:  10,
    });
  }
}

// Interceptor: enters at 140 px/sec, after 80px of travel tracks player x,
// once aligned (±15px) dives at 200 px/sec.
// Speed 160 px/sec lateral during tracking phase.
function updateInterceptor(e, dt) {
  if (!e.aligned) {
    if (!e.tracking) {
      // Initial descent phase — first 80px straight down
      const move = 140 * dt;
      e.y        += move;
      e.travelY  += move;
      if (e.travelY >= 80) {
        e.tracking = true;
      }
    } else {
      // Tracking phase — slide toward player x at 160 px/sec, still descending at 140
      e.y += 140 * dt;
      const dx = player.x - e.x;
      if (Math.abs(dx) <= 15) {
        e.aligned = true;
      } else {
        const step = 160 * dt;
        e.x += dx > 0 ? Math.min(step, dx) : Math.max(-step, dx);
      }
    }
  } else {
    // Aligned — dive straight down at 200 px/sec
    e.y += 200 * dt;
  }
}

// ---------------------------------------------------------------------------
// Enemy bullets — Phase 3
// ---------------------------------------------------------------------------

function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y - b.h / 2 > CANVAS_H || b.y + b.h / 2 < 0 || b.x + b.w / 2 < 0 || b.x - b.w / 2 > CANVAS_W) {
      enemyBullets.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Wave spawner — Phase 3
// ---------------------------------------------------------------------------

function updateWaveSpawner(dt) {
  // Only runs while in PLAYING state — not during BOSS
  if (game.state !== STATE.PLAYING) return;
  if (game.waveCleared) return;

  // Inter-wave pause (also covers initial 5s pre-game pause when waveIndex === -1)
  if (game.wavePause > 0) {
    game.wavePause -= dt;
    if (game.wavePause <= 0) {
      const nextIndex = game.waveIndex + 1;   // -1 + 1 = 0 on first call
      if (nextIndex >= WAVE_SCRIPT.length) {
        // All waves done — trigger boss
        game.waveCleared = true;
        // TODO Phase 4: start boss entry sequence
        console.log('[SKYRIFT] All waves cleared — transitioning to BOSS');
        game.state = STATE.BOSS;
      } else {
        beginWave(nextIndex);
      }
    }
    return;
  }

  // Advance wave timer and fire pending spawns
  game.waveTimer += dt;

  const pending = game.wavePending;
  for (let i = 0; i < pending.length; i++) {
    const ev = pending[i];
    if (!ev.fired && game.waveTimer >= ev.delay) {
      spawnEnemy(ev.type, ev.x);
      ev.fired = true;
    }
  }

  // Check if current wave is complete (all spawns fired AND all enemies dead)
  const allFired = pending.every(ev => ev.fired);
  if (allFired && enemies.length === 0) {
    // Wave cleared — start inter-wave pause then next wave
    // Final wave uses 2s pause before boss (per spec), others use 4s
    const isLastWave = (game.waveIndex === WAVE_SCRIPT.length - 1);
    game.wavePause = isLastWave ? 2 : 4;
    game.waveStarted = false;
    console.log(`[SKYRIFT] Wave ${game.waveIndex + 1} cleared`);
  }
}

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

function checkCollisions() {
  // --- Player bullet ↔ Enemy ---
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e = enemies[ei];
    if (e.invulnTimer > 0) continue;   // spawn invincibility

    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (aabbOverlap(b.x, b.y, b.w / 2, b.h / 2, e.x, e.y, e.halfW, e.halfH)) {
        e.hp -= 1;
        if (!b.piercing) {
          bullets.splice(bi, 1);
        }
        if (e.hp <= 0) {
          // Enemy destroyed
          game.score += e.score;
          // Pickup drop roll
          if (Math.random() < e.dropChance) {
            pickups.push({ x: e.x, y: e.y, halfW: 9, halfH: 9 });  // 18×18 hitbox
          }
          enemies.splice(ei, 1);
          break;  // this enemy is gone — stop checking bullets against it
        }
      }
    }
  }

  // --- Enemy body ↔ Player ---
  if (!player.invincible) {
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      if (aabbOverlap(player.x, player.y, player.halfW, player.halfH, e.x, e.y, e.halfW, e.halfH)) {
        playerHit();
        break;  // one hit per frame max
      }
    }
  }

  // --- Enemy bullet ↔ Player ---
  if (!player.invincible) {
    for (let bi = enemyBullets.length - 1; bi >= 0; bi--) {
      const b = enemyBullets[bi];
      // Enemy bullet hitbox: 5×10 per spec (halfW=2.5, halfH=5)
      if (aabbOverlap(player.x, player.y, player.halfW, player.halfH, b.x, b.y, 2.5, 5)) {
        enemyBullets.splice(bi, 1);
        playerHit();
        break;  // one hit per frame max
      }
    }
  }

  // --- Pickup ↔ Player ---
  for (let pi = pickups.length - 1; pi >= 0; pi--) {
    const p = pickups[pi];
    if (aabbOverlap(player.x, player.y, player.halfW, player.halfH, p.x, p.y, p.halfW, p.halfH)) {
      player.weaponLevel = Math.min(5, player.weaponLevel + 1);
      pickups.splice(pi, 1);
    }
  }
}

// Called when a collision hits the player (enemy body or enemy bullet)
function playerHit() {
  game.lives -= 1;
  player.weaponLevel     = Math.max(1, player.weaponLevel - 1);
  player.invincible      = true;
  player.invincibleTimer = INVINCIBILITY_DURATION;
  player.blinkTimer      = 0;

  if (game.lives <= 0) {
    game.state = STATE.GAME_OVER;
  }
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

function draw() {
  drawBackground();
  drawStars();

  if (game.state === STATE.MENU) {
    drawMenu();
  } else if (game.state === STATE.PLAYING || game.state === STATE.BOSS) {
    drawEnemies();
    drawPickups();
    drawBullets();
    drawEnemyBullets();
    drawPlayer();
    // TODO Phase 4: drawBoss()
    drawHUD();
    drawWaveIndicator();
  } else if (game.state === STATE.WIN) {
    drawPlayer();   // show player still on screen
    drawOverlay('YOU WIN', `Score: ${String(game.score).padStart(6, '0')}`);
  } else if (game.state === STATE.GAME_OVER) {
    drawOverlay('GAME OVER', `Score: ${String(game.score).padStart(6, '0')}`);
  }
}

// ---- Background ----

function drawBackground() {
  // scrollY grows continuously. Derive offset and color phase from it so there's
  // never a seam — the color alternation stays consistent across wraps.
  const colors = ['#0a0a2e', '#0d1157'];
  const offset      = scrollY % STRIPE_H;                   // visual sub-stripe offset
  const colorPhase  = Math.floor(scrollY / STRIPE_H) % 2;  // which color is "first"
  const totalStripes = Math.ceil(CANVAS_H / STRIPE_H) + 2;

  for (let i = 0; i < totalStripes; i++) {
    ctx.fillStyle = colors[(i + colorPhase) % 2];
    const y = -STRIPE_H + (i * STRIPE_H) + offset;
    ctx.fillRect(0, y, CANVAS_W, STRIPE_H);
  }
}

function drawStars() {
  for (const s of stars) {
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle   = s.blueish ? '#aaccff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- Player ----

function drawPlayer() {
  // Blink during invincibility: hide on alternating ~100ms intervals
  if (player.invincible && Math.floor(player.blinkTimer / 0.1) % 2 === 1) {
    return;
  }

  const { x, y, halfW, halfH } = player;

  if (!drawSprite('player', x, y, halfW * 2, halfH * 2)) {
    // fallback: triangle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x,          y - halfH);
    ctx.lineTo(x - halfW,  y + halfH);
    ctx.lineTo(x + halfW,  y + halfH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(x - 4, y + halfH, 8, 5);
  }
}

// ---- Bullets ----

function drawBullets() {
  for (const b of bullets) {
    // Level 5 piercing gets a subtle glow outline
    if (b.color === '#cc44ff') {
      ctx.fillStyle = 'rgba(204,68,255,0.3)';
      ctx.fillRect(b.x - b.w / 2 - 1, b.y - b.h / 2 - 1, b.w + 2, b.h + 2);
    }
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
}

// ---- Enemies (Phase 2 placeholder rects — Phase 3 replaces with sprites) ----

function drawEnemies() {
  for (const e of enemies) {
    if (!drawSprite(e.type, e.x, e.y, e.w, e.h)) {
      // fallback: colored rect
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
    }

    // HP bar above enemy (only if damaged)
    if (e.hp < e.maxHp) {
      const barW = e.w;
      const barH = 3;
      const barX = e.x - e.w / 2;
      const barY = e.y - e.h / 2 - 6;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
    }
  }
}

// ---- Enemy Bullets ----

function drawEnemyBullets() {
  for (const b of enemyBullets) {
    // Orange-red gradient look: outer glow then core
    ctx.fillStyle = 'rgba(255, 80, 0, 0.35)';
    ctx.fillRect(b.x - b.w / 2 - 1, b.y - b.h / 2 - 1, b.w + 2, b.h + 2);
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
}

// ---- Wave Indicator ----

function drawWaveIndicator() {
  if (!game.waveIndicatorTimer || game.waveIndicatorTimer <= 0) return;

  // 1.5s total: fade in 0–0.3s, hold 0.3–1.2s, fade out 1.2–1.5s
  const t = game.waveIndicatorTimer;   // counts down from 1.5 → 0
  const elapsed = 1.5 - t;
  let alpha;
  if (elapsed < 0.3) {
    alpha = elapsed / 0.3;
  } else if (t > 0.3) {
    alpha = 1.0;
  } else {
    alpha = t / 0.3;
  }

  ctx.save();
  ctx.globalAlpha  = alpha;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = 'bold 36px monospace';
  ctx.fillStyle    = '#ffffff';
  ctx.shadowColor  = '#0099ff';
  ctx.shadowBlur   = 12;
  ctx.fillText(`WAVE ${game.waveIndex + 1}`, CANVAS_W / 2, CANVAS_H * 0.22);
  ctx.restore();
}

// ---- Pickups ----

function drawPickups() {
  for (const p of pickups) {
    const t = Date.now() / 1000;
    const glow = 0.5 + 0.5 * Math.sin(t * 6);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * 2);   // slow spin

    if (imgs['pickup']) {
      ctx.globalAlpha = 0.85 + glow * 0.15;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imgs['pickup'], -p.halfW, -p.halfH, p.halfW * 2, p.halfH * 2);
      ctx.globalAlpha = 1;
    } else {
      // fallback: gold rect
      ctx.globalAlpha = 0.4 + glow * 0.3;
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(-p.halfW - 2, -p.halfH - 2, (p.halfW + 2) * 2, (p.halfH + 2) * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd700';
      const s = p.halfW * 0.9;
      ctx.fillRect(-s / 2, -s / 2, s, s);
    }

    ctx.restore();
  }
}

// ---- HUD ----

function drawHUD() {
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = '16px monospace';

  // Shadow for legibility over background
  ctx.shadowColor = '#000000';
  ctx.shadowBlur  = 4;

  // Top-left: score
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE: ${String(game.score).padStart(6, '0')}`, 8, 8);

  // Top-right: weapon level + lives (hearts)
  ctx.textAlign = 'right';
  const fullHeart   = '♥';
  const emptyHeart  = '♡';
  let heartsStr = '';
  for (let i = 0; i < 3; i++) {
    heartsStr += i < game.lives ? fullHeart : emptyHeart;
  }
  ctx.fillStyle = '#ff6666';
  ctx.fillText(heartsStr, CANVAS_W - 8, 8);

  ctx.fillStyle = '#aaff00';
  ctx.fillText(`WPN: ${player.weaponLevel}`, CANVAS_W - 8, 28);

  // Boss health bar placeholder (BOSS state only)
  if (game.state === STATE.BOSS) {
    // TODO Phase 4: replace with real boss HP bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, 14);
    ctx.fillStyle = '#ff0077';
    ctx.fillRect(0, 0, CANVAS_W * 0.7, 14);  // placeholder at 70%
  }

  ctx.restore();
}

// ---- Menu screen ----

function drawMenu() {
  // Title
  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 56px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SKYRIFT', CANVAS_W / 2, CANVAS_H * 0.32);

  // Tagline / subtitle
  ctx.fillStyle = '#6688bb';
  ctx.font      = '16px monospace';
  ctx.fillText('vertical scrolling shooter', CANVAS_W / 2, CANVAS_H * 0.32 + 44);

  // Controls
  ctx.fillStyle = '#aabbcc';
  ctx.font      = '15px monospace';
  ctx.fillText('Arrows  — move', CANVAS_W / 2, CANVAS_H * 0.56);
  ctx.fillText('Z / Space — auto-fire toggle', CANVAS_W / 2, CANVAS_H * 0.56 + 26);

  // Start prompt — blink using time
  const blink = Math.floor(Date.now() / 600) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.font      = '18px monospace';
    ctx.fillText('PRESS ENTER OR CLICK TO START', CANVAS_W / 2, CANVAS_H * 0.75);
  }
}

// ---- Overlay (WIN / GAME OVER) ----

function drawOverlay(title, subtitle) {
  // Dim the background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 48px monospace';
  ctx.fillText(title, CANVAS_W / 2, CANVAS_H * 0.38);

  ctx.fillStyle = '#aabbcc';
  ctx.font      = '22px monospace';
  ctx.fillText(subtitle, CANVAS_W / 2, CANVAS_H * 0.38 + 64);

  const blink = Math.floor(Date.now() / 600) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.font      = '15px monospace';
    ctx.fillText('PRESS ENTER OR CLICK TO CONTINUE', CANVAS_W / 2, CANVAS_H * 0.72);
  }
}

// ---------------------------------------------------------------------------
// Game loop — fixed 60fps timestep via requestAnimationFrame accumulator
// ---------------------------------------------------------------------------

const TARGET_DT   = 1 / 60;          // 16.67ms per tick
const MAX_CATCHUP = 5;               // max ticks per frame (prevents spiral of death)

let lastTime      = null;
let accumulator   = 0;
let fpsFrameCount = 0;
let fpsTimer      = 0;

function loop(timestamp) {
  requestAnimationFrame(loop);

  if (lastTime === null) {
    lastTime = timestamp;
    return;
  }

  const elapsed = (timestamp - lastTime) / 1000;   // seconds
  lastTime = timestamp;

  // FPS logging — every 5 seconds
  fpsFrameCount++;
  fpsTimer += elapsed;
  if (fpsTimer >= 5) {
    const fps = (fpsFrameCount / fpsTimer).toFixed(1);
    console.log(`[SKYRIFT] fps: ${fps}`);
    fpsFrameCount = 0;
    fpsTimer      = 0;
  }

  // Fixed-step accumulator
  accumulator += elapsed;
  let ticks = 0;
  while (accumulator >= TARGET_DT && ticks < MAX_CATCHUP) {
    update(TARGET_DT);
    accumulator -= TARGET_DT;
    ticks++;
  }

  draw();
}

loadSprites().then(() => requestAnimationFrame(loop));
