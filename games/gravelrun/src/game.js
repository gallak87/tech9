// GRAVELRUN — game.js
// Phases 1–3: physics, level geometry, enemies, bullets, score, camera.
// Phase 4: art swap — placeholder rects replaced with sprites.

import { LEVEL } from './level.js';
import { sprites, loadSprites } from './sprites.js';

// ---------------------------------------------------------------------------
// Canvas setup — 480×270 internal resolution, scaled to fill viewport
// ---------------------------------------------------------------------------

const INTERNAL_W = 480;
const INTERNAL_H = 270;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const scaleX = window.innerWidth  / INTERNAL_W;
  const scaleY = window.innerHeight / INTERNAL_H;
  const scale  = Math.min(scaleX, scaleY);
  canvas.width  = INTERNAL_W;
  canvas.height = INTERNAL_H;
  canvas.style.width  = `${INTERNAL_W  * scale}px`;
  canvas.style.height = `${INTERNAL_H * scale}px`;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const STATE = {
  MENU:    'MENU',
  PLAYING: 'PLAYING',
  WIN:     'WIN',
  DEAD:    'DEAD',
};

let currentState = STATE.MENU;

function setState(next) {
  currentState = next;
  if (next === STATE.PLAYING) {
    resetGame();
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const keys = {
  left:   false,
  right:  false,
  jump:   false,  // Z or Space — latched, consumed once per press
  shoot:  false,  // X or Ctrl  — latched, consumed once per press
  space:  false,  // for menu/win/dead screens
};

const _held = {};

window.addEventListener('keydown', (e) => {
  if (_held[e.code]) return;
  _held[e.code] = true;

  switch (e.code) {
    case 'ArrowLeft':    keys.left  = true;  break;
    case 'ArrowRight':   keys.right = true;  break;
    case 'KeyZ':
    case 'Space':        keys.jump  = true; keys.space = true; e.preventDefault(); break;
    case 'KeyX':
    case 'ControlLeft':
    case 'ControlRight': keys.shoot = true; e.preventDefault(); break;
  }
});

window.addEventListener('keyup', (e) => {
  _held[e.code] = false;

  switch (e.code) {
    case 'ArrowLeft':    keys.left  = false; break;
    case 'ArrowRight':   keys.right = false; break;
  }
});

function consumeJump() {
  const was = keys.jump;
  keys.jump = false;
  return was;
}

function consumeShoot() {
  const was = keys.shoot;
  keys.shoot = false;
  return was;
}

function consumeSpace() {
  const was = keys.space;
  keys.space = false;
  return was;
}

// ---------------------------------------------------------------------------
// Physics constants
// ---------------------------------------------------------------------------

const GRAVITY        = 1400;  // px/s²
const JUMP_VY        = -520;  // px/s (negative = up)
const MAX_FALL_SPEED = 800;   // px/s
const MOVE_SPEED     = 220;   // px/s, instant start/stop
const COYOTE_FRAMES  = 6;
const JUMP_BUFFER_FRAMES = 8;

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const PLAYER_W = 20;
const PLAYER_H = 28;

let player = {};

function makePlayer() {
  return {
    x: LEVEL.playerStart.x,
    y: LEVEL.playerStart.y,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    grounded: false,
    coyoteFrames: 0,     // counts down after leaving ground
    jumpBuffer: 0,       // counts down after jump pressed in air
    facing: 1,           // 1 = right, -1 = left
    shootCooldown: 0,    // frames remaining until next shot allowed
    runFrameTimer: 0,    // counts up while moving, drives sprite run cycle
  };
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

const WALKER_W = 24;
const WALKER_H = 24;
const WALKER_SPEED = 80; // px/s

const JUMPER_W = 24;
const JUMPER_H = 24;
const JUMPER_INTERVAL = 120; // frames between hops (~2s at 60fps)
const JUMPER_VY = -320;      // upward launch gives ~120px peak (v²/2g ≈ 320²/2800 ≈ 116px)

let enemies = [];

function makeEnemies() {
  return LEVEL.enemies.map((e, i) => {
    if (e.type === 'walker') {
      // x,y from level is center-bottom → convert to top-left
      return {
        id: i,
        type: 'walker',
        x: e.x - WALKER_W / 2,
        y: e.y - WALKER_H,
        w: WALKER_W,
        h: WALKER_H,
        vx: WALKER_SPEED,   // start moving right
        vy: 0,
        alive: true,
        frameTimer: 0,     // sprite shuffle frame counter
      };
    } else {
      // jumper
      return {
        id: i,
        type: 'jumper',
        x: e.x - JUMPER_W / 2,
        y: e.y - JUMPER_H,
        w: JUMPER_W,
        h: JUMPER_H,
        baseY: e.y - JUMPER_H,  // resting y
        vy: 0,
        grounded: true,
        jumpTimer: Math.floor(JUMPER_INTERVAL * Math.random()), // stagger initial hops
        alive: true,
      };
    }
  });
}

// ---------------------------------------------------------------------------
// Bullets
// ---------------------------------------------------------------------------

const BULLET_W = 8;
const BULLET_H = 4;
const BULLET_SPEED = 600;
const BULLET_MAX_TRAVEL = 800;
const SHOOT_COOLDOWN_FRAMES = 18; // ~0.3s

let bullets = [];

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

let cameraX = 0;  // world x that maps to screen x=0

const CAMERA_LERP = 0.12;  // lower = smoother/slower follow

function updateCamera() {
  // Target: player center horizontally centered on screen
  const targetX = player.x + player.w / 2 - INTERNAL_W / 2;
  cameraX += (targetX - cameraX) * CAMERA_LERP;
  // Clamp to level bounds
  cameraX = Math.max(0, Math.min(cameraX, LEVEL.width - INTERNAL_W));
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

let score = 0;

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function resetGame() {
  player   = makePlayer();
  enemies  = makeEnemies();
  bullets  = [];
  score    = 0;
  cameraX  = 0;
}

// ---------------------------------------------------------------------------
// AABB helpers
// ---------------------------------------------------------------------------

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw &&
         ax + aw > bx &&
         ay < by + bh &&
         ay + ah > by;
}

// ---------------------------------------------------------------------------
// Platform collision resolution
// Moves entity so it doesn't overlap platforms.
// Returns { grounded } — true if entity landed on top of a platform this frame.
// ---------------------------------------------------------------------------

function resolvePlatforms(ent, prevX, prevY) {
  let grounded = false;

  for (const p of LEVEL.platforms) {
    if (!rectsOverlap(ent.x, ent.y, ent.w, ent.h, p.x, p.y, p.w, p.h)) continue;

    // Compute overlap depths
    const overlapLeft   = (ent.x + ent.w) - p.x;
    const overlapRight  = (p.x + p.w)     - ent.x;
    const overlapTop    = (ent.y + ent.h) - p.y;
    const overlapBottom = (p.y + p.h)     - ent.y;

    // Use previous position to determine which axis the entity approached from
    const prevBottom = prevY + ent.h;
    const prevTop    = prevY;
    const prevLeft   = prevX + ent.w;
    const prevRight  = prevX;

    const fromTop    = prevBottom <= p.y;
    const fromBottom = prevTop    >= p.y + p.h;
    const fromLeft   = prevLeft   <= p.x;
    const fromRight  = prevRight  >= p.x + p.w;

    // Resolve the shallowest axis that matches approach direction
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (overlapTop === minOverlap || fromTop) {
      // Land on top
      ent.y = p.y - ent.h;
      if (ent.vy > 0) ent.vy = 0;
      grounded = true;
    } else if (overlapBottom === minOverlap || fromBottom) {
      // Hit ceiling
      ent.y = p.y + p.h;
      if (ent.vy < 0) ent.vy = 0;
    } else if (overlapLeft === minOverlap || fromLeft) {
      // Hit right wall of entity against left wall of platform
      ent.x = p.x - ent.w;
      if (ent.vx > 0) ent.vx = 0;
    } else if (overlapRight === minOverlap || fromRight) {
      // Hit left wall of entity against right wall of platform
      ent.x = p.x + p.w;
      if (ent.vx < 0) ent.vx = 0;
    }
  }

  return grounded;
}

// ---------------------------------------------------------------------------
// Game loop — fixed 60fps timestep
// ---------------------------------------------------------------------------

const TIMESTEP = 1 / 60;
let lastTime = null;
let accumulator = 0;

function loop(timestamp) {
  requestAnimationFrame(loop);

  if (lastTime === null) {
    lastTime = timestamp;
    return;
  }

  const rawDelta = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  accumulator += rawDelta;

  while (accumulator >= TIMESTEP) {
    update(TIMESTEP);
    accumulator -= TIMESTEP;
  }

  render();
}

// ---------------------------------------------------------------------------
// Update — dispatches to state logic
// ---------------------------------------------------------------------------

function update(dt) {
  switch (currentState) {
    case STATE.MENU:    updateMenu(dt);    break;
    case STATE.PLAYING: updatePlaying(dt); break;
    case STATE.WIN:     updateWin(dt);     break;
    case STATE.DEAD:    updateDead(dt);    break;
  }
}

function updateMenu(dt) {
  if (consumeSpace()) setState(STATE.PLAYING);
}

function updateWin(dt) {
  if (consumeSpace()) setState(STATE.MENU);
}

function updateDead(dt) {
  if (consumeSpace()) setState(STATE.MENU);
}

// ---------------------------------------------------------------------------
// updatePlaying — the full physics/game tick
// ---------------------------------------------------------------------------

function updatePlaying(dt) {
  updatePlayer(dt);
  updateEnemies(dt);
  updateBullets(dt);
  checkEnemyCollisions();
  checkExitCollision();
  updateCamera();
}

// ---------------------------------------------------------------------------
// Player update
// ---------------------------------------------------------------------------

function updatePlayer(dt) {
  // --- Horizontal ---
  if (keys.left) {
    player.vx = -MOVE_SPEED;
    player.facing = -1;
    player.runFrameTimer++;
  } else if (keys.right) {
    player.vx = MOVE_SPEED;
    player.facing = 1;
    player.runFrameTimer++;
  } else {
    player.vx = 0;
    // don't reset timer — just let it sit; frame is chosen fresh each render
  }

  // --- Jump input → feed jump buffer ---
  if (consumeJump()) {
    player.jumpBuffer = JUMP_BUFFER_FRAMES;
  }

  // --- Apply jump if conditions met ---
  const canJump = player.grounded || player.coyoteFrames > 0;
  if (player.jumpBuffer > 0 && canJump) {
    player.vy = JUMP_VY;
    player.grounded = false;
    player.coyoteFrames = 0;
    player.jumpBuffer = 0;
  }

  // --- Gravity ---
  player.vy += GRAVITY * dt;
  if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

  // --- Integrate ---
  const prevX = player.x;
  const prevY = player.y;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // --- Platform collision ---
  const wasGrounded = player.grounded;
  player.grounded = resolvePlatforms(player, prevX, prevY);

  // --- Coyote time ---
  if (wasGrounded && !player.grounded) {
    // Just left the ground — start coyote countdown
    player.coyoteFrames = COYOTE_FRAMES;
  } else if (player.grounded) {
    player.coyoteFrames = 0;
    // Execute buffered jump on landing
    if (player.jumpBuffer > 0) {
      player.vy = JUMP_VY;
      player.grounded = false;
      player.jumpBuffer = 0;
    }
  } else {
    if (player.coyoteFrames > 0) player.coyoteFrames--;
  }

  // --- Tick jump buffer countdown ---
  if (player.jumpBuffer > 0) player.jumpBuffer--;

  // --- Clamp to level width ---
  player.x = Math.max(0, Math.min(player.x, LEVEL.width - player.w));

  // --- Fall death ---
  if (player.y >= INTERNAL_H) {
    setState(STATE.DEAD);
    return;
  }

  // --- Shooting ---
  if (player.shootCooldown > 0) player.shootCooldown--;

  if (consumeShoot() && player.shootCooldown === 0) {
    spawnBullet();
    player.shootCooldown = SHOOT_COOLDOWN_FRAMES;
  }
}

// ---------------------------------------------------------------------------
// Bullet spawn + update
// ---------------------------------------------------------------------------

function spawnBullet() {
  const dir = player.facing;
  // Center bullet vertically on player mid-torso
  bullets.push({
    x: dir === 1 ? player.x + player.w : player.x - BULLET_W,
    y: player.y + player.h / 2 - BULLET_H / 2,
    w: BULLET_W,
    h: BULLET_H,
    vx: BULLET_SPEED * dir,
    traveled: 0,
    alive: true,
  });
}

function updateBullets(dt) {
  for (const b of bullets) {
    if (!b.alive) continue;
    const dx = b.vx * dt;
    b.x += dx;
    b.traveled += Math.abs(dx);
    if (b.traveled >= BULLET_MAX_TRAVEL ||
        b.x + b.w < 0 ||
        b.x > LEVEL.width) {
      b.alive = false;
    }
  }
  // Prune dead bullets
  bullets = bullets.filter(b => b.alive);
}

// ---------------------------------------------------------------------------
// Enemy update
// ---------------------------------------------------------------------------

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;

    if (e.type === 'walker') {
      updateWalker(e, dt);
    } else {
      updateJumper(e, dt);
    }
  }
  // Prune dead enemies
  enemies = enemies.filter(e => e.alive);
}

function updateWalker(e, dt) {
  e.frameTimer++;
  const prevX = e.x;
  const prevY = e.y;

  // Gravity
  e.vy += GRAVITY * dt;
  if (e.vy > MAX_FALL_SPEED) e.vy = MAX_FALL_SPEED;

  e.x += e.vx * dt;
  e.y += e.vy * dt;

  const grounded = resolvePlatforms(e, prevX, prevY);
  if (grounded) e.vy = 0;

  // Edge detection: check if one step further would fall off a platform
  // (cast a 1px-wide probe just ahead of the walker, at foot level)
  if (grounded) {
    const probeX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
    const probeY = e.y + e.h + 1;
    let hasFloor = false;
    for (const p of LEVEL.platforms) {
      if (probeX >= p.x && probeX <= p.x + p.w &&
          probeY >= p.y && probeY <= p.y + p.h + 2) {
        hasFloor = true;
        break;
      }
    }
    if (!hasFloor) {
      // Turn around
      e.vx = -e.vx;
      e.x += e.vx * dt * 2; // step back from edge
    }
  }

  // Also reverse on horizontal collision (vx was zeroed by resolvePlatforms)
  if (e.vx === 0) {
    // Determine new direction from displacement: if we didn't move forward, reverse
    e.vx = e.x <= prevX ? WALKER_SPEED : -WALKER_SPEED;
  }

  // Clamp to level width
  if (e.x < 0) { e.x = 0; e.vx = WALKER_SPEED; }
  if (e.x + e.w > LEVEL.width) { e.x = LEVEL.width - e.w; e.vx = -WALKER_SPEED; }
}

function updateJumper(e, dt) {
  if (e.grounded) {
    e.jumpTimer--;
    if (e.jumpTimer <= 0) {
      e.vy = JUMPER_VY;
      e.grounded = false;
      e.jumpTimer = JUMPER_INTERVAL;
    }
  } else {
    const prevX = e.x;
    const prevY = e.y;

    e.vy += GRAVITY * dt;
    if (e.vy > MAX_FALL_SPEED) e.vy = MAX_FALL_SPEED;
    e.y += e.vy * dt;

    // Check if landed back on base platform or any platform
    const landed = resolvePlatforms(e, prevX, prevY);
    if (landed) {
      e.vy = 0;
      e.grounded = true;
      // Snap back to base Y to prevent drift
      e.y = e.baseY;
    }
  }
}

// ---------------------------------------------------------------------------
// Enemy collision checks (stomp vs lethal contact, bullet hits)
// ---------------------------------------------------------------------------

function checkEnemyCollisions() {
  if (currentState !== STATE.PLAYING) return;

  for (const e of enemies) {
    if (!e.alive) continue;

    // Check bullet → enemy
    for (const b of bullets) {
      if (!b.alive) continue;
      if (rectsOverlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) {
        e.alive = false;
        b.alive = false;
        score += 50;
        break;
      }
    }
    if (!e.alive) continue;

    // Check player → enemy
    if (!rectsOverlap(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) continue;

    // Stomp detection: player moving downward AND player's bottom was above enemy's top
    const playerBottom = player.y + player.h;
    const stomped = player.vy > 0 && playerBottom <= e.y + e.h * 0.4;

    if (stomped) {
      e.alive = false;
      player.vy = -380;  // bounce
      score += 100;
    } else {
      // Side/bottom contact → death
      setState(STATE.DEAD);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Exit collision
// ---------------------------------------------------------------------------

function checkExitCollision() {
  const ex = LEVEL.exit;
  if (rectsOverlap(player.x, player.y, player.w, player.h, ex.x, ex.y, ex.w, ex.h)) {
    setState(STATE.WIN);
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  ctx.clearRect(0, 0, INTERNAL_W, INTERNAL_H);

  switch (currentState) {
    case STATE.MENU:    renderMenu();    break;
    case STATE.PLAYING: renderPlaying(); break;
    case STATE.WIN:     renderWin();     break;
    case STATE.DEAD:    renderDead();    break;
  }
}

function fillText(text, x, y, { size = 16, color = '#ffffff', align = 'center' } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// --- MENU -------------------------------------------------------------------

function renderMenu() {
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

  fillText('GRAVELRUN', INTERNAL_W / 2, INTERNAL_H / 2 - 30, { size: 36, color: '#e84040' });
  fillText('PRESS SPACE TO START', INTERNAL_W / 2, INTERNAL_H / 2 + 20, { size: 12, color: '#aaaaaa' });
}

// --- PLAYING ----------------------------------------------------------------

function renderPlaying() {
  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

  // --- World space (translate by camera) ---
  ctx.save();
  ctx.translate(-Math.round(cameraX), 0);

  // Platforms — tiled sprites
  for (const p of LEVEL.platforms) {
    const tileW = p.h >= 32 ? sprites.groundTile.width  : sprites.platformTile.width;
    const tileH = p.h >= 32 ? sprites.groundTile.height : sprites.platformTile.height;
    const tiler = p.h >= 32 ? sprites.groundTile         : sprites.platformTile;
    // Tile across the width, row by row to fill height
    const colCount = Math.ceil(p.w / tileW);
    const rowCount = Math.ceil(p.h / tileH);
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < colCount; col++) {
        tiler.draw(ctx, p.x + col * tileW, p.y + row * tileH);
      }
    }
  }

  // Exit — keep as bright rect
  const ex = LEVEL.exit;
  ctx.fillStyle = '#22cc44';
  ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
  ctx.strokeStyle = '#88ffaa';
  ctx.lineWidth = 2;
  ctx.strokeRect(ex.x + 1, ex.y + 1, ex.w - 2, ex.h - 2);

  // Enemies
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.type === 'walker') {
      // Shuffle between frame 0 and 1 every 20 game frames
      const walkerFrame = Math.floor(e.frameTimer / 20) & 1;
      sprites.walker.draw(ctx, e.x, e.y, walkerFrame);
    } else {
      // Jumper: frame 0 = grounded, frame 1 = airborne
      const jumperFrame = e.grounded ? 0 : 1;
      sprites.jumper.draw(ctx, e.x, e.y, jumperFrame);
    }
  }

  // Bullets — keep as colored rects
  ctx.fillStyle = '#ffee44';
  for (const b of bullets) {
    ctx.fillRect(Math.round(b.x), Math.round(b.y), b.w, b.h);
  }

  // Player — sprite with run/idle frames and facing
  {
    const moving = player.vx !== 0;
    const runFrame = moving ? Math.floor(player.runFrameTimer / 8) % 4 : 'idle';
    const flipX = player.facing === -1;
    // Sprite is 32×32; hbox is 20×28 — offset so sprite is centered on hbox
    const spriteOffX = (player.w - sprites.player.width)  / 2;  // -6 (sprite wider)
    const spriteOffY = (player.h - sprites.player.height) / 2;  // -2 (sprite taller)
    sprites.player.draw(ctx, player.x + spriteOffX, player.y + spriteOffY, flipX, runFrame);
  }

  ctx.restore();
  // --- End world space ---

  // HUD — screen space, not translated
  fillText(`SCORE: ${score}`, 6, 10, { size: 10, color: '#ffffff', align: 'left' });
}

// --- WIN --------------------------------------------------------------------

function renderWin() {
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

  fillText('YOU WIN', INTERNAL_W / 2, INTERNAL_H / 2 - 40, { size: 32, color: '#40e870' });
  fillText(`SCORE: ${score}`, INTERNAL_W / 2, INTERNAL_H / 2, { size: 16, color: '#ffffff' });
  fillText('PRESS SPACE TO PLAY AGAIN', INTERNAL_W / 2, INTERNAL_H / 2 + 40, { size: 12, color: '#aaaaaa' });
}

// --- DEAD -------------------------------------------------------------------

function renderDead() {
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

  fillText('YOU DIED', INTERNAL_W / 2, INTERNAL_H / 2 - 30, { size: 32, color: '#e84040' });
  fillText(`SCORE: ${score}`, INTERNAL_W / 2, INTERNAL_H / 2 + 10, { size: 14, color: '#ffffff' });
  fillText('PRESS SPACE TO TRY AGAIN', INTERNAL_W / 2, INTERNAL_H / 2 + 40, { size: 12, color: '#aaaaaa' });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadSprites().then(() => requestAnimationFrame(loop));
