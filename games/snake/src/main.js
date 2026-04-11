const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 600;
canvas.height = 648;

// --- Constants ---
const COLS = 25;
const ROWS = 25;
const CELL = 24;
const HEADER = 48;
const TICK_MS = 150;

const C = {
  bg:         '#0d0d0d',
  grid:       '#1a1a1a',
  snakeBody:  '#3ddc84',
  snakeHead:  '#ffffff',
  food:       '#ff4757',
  deadOverlay:'#ff000033',
  scoreText:  '#e0e0e0',
  deadText:   '#ffffff',
  deadSnake:  '#555555',
};

const FONT = '"SF Mono", "Fira Code", "Consolas", monospace';

// --- Audio ---
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playEat() {
  const ac = getAudioCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sine';
  const t = ac.currentTime;
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.linearRampToValueAtTime(600, t + 0.09);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.09);
  osc.start(t);
  osc.stop(t + 0.09);
}

function playDeath() {
  const ac = getAudioCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sine';
  const t = ac.currentTime;
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.linearRampToValueAtTime(80, t + 0.2);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.2);
  osc.start(t);
  osc.stop(t + 0.2);
}

// --- State ---
let snake, dir, nextDir, food, score, state;
let tickTimer = null;
let rafHandle = null;

// Death sequence state
let deathPhase = 0;     // 0=fresh, 1=overlaying, 2=done
let overlayAlpha = 0;
let showOverlay = false;
let showDeadText = false;
let deathTimers = [];

// Food flash state
let foodFlashFrame = 0;
let foodFlashTimer = null;

// Head eat-flash state
let headFlashing = false;
let headFlashTimer = null;
let headFlashColor = C.snakeHead;

// --- Init ---
function init() {
  // Cancel any running timers and animation loop
  if (rafHandle) cancelAnimationFrame(rafHandle);
  if (tickTimer) clearInterval(tickTimer);
  deathTimers.forEach(t => clearTimeout(t));
  deathTimers = [];
  if (foodFlashTimer) clearTimeout(foodFlashTimer);
  foodFlashTimer = null;
  if (headFlashTimer) clearTimeout(headFlashTimer);
  headFlashTimer = null;

  // Snake starts at center (12,12), length 3, moving right
  snake = [
    { x: 12, y: 12 },
    { x: 11, y: 12 },
    { x: 10, y: 12 },
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  state = 'playing';
  deathPhase = 0;
  showOverlay = false;
  showDeadText = false;
  overlayAlpha = 0;
  headFlashing = false;
  headFlashColor = C.snakeHead;
  foodFlashFrame = 3; // skip flash artifact on init

  food = spawnFood();
  startFoodFlash();

  tickTimer = setInterval(tick, TICK_MS);
  rafHandle = requestAnimationFrame(render);
}

// --- Food ---
function spawnFood() {
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const free = [];
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null; // grid full
  return free[Math.floor(Math.random() * free.length)];
}

function startFoodFlash() {
  foodFlashFrame = 0;
  scheduleFoodFlash();
}

function scheduleFoodFlash() {
  if (foodFlashFrame >= 3) {
    foodFlashFrame = 0;
    return;
  }
  foodFlashTimer = setTimeout(() => {
    foodFlashFrame++;
    scheduleFoodFlash();
  }, 50 / 3);
}

function foodColor() {
  // 3-frame flash: white(0) → red(1) → white(2) → done(3+)
  if (foodFlashFrame === 0) return '#ffffff';
  if (foodFlashFrame === 2) return '#ffffff';
  return C.food;
}

// --- Head eat flash ---
function startHeadFlash() {
  headFlashing = true;
  headFlashColor = C.snakeBody;
  if (headFlashTimer) clearTimeout(headFlashTimer);
  headFlashTimer = setTimeout(() => {
    headFlashColor = C.snakeHead;
    headFlashTimer = setTimeout(() => {
      headFlashColor = C.snakeBody; // briefly green
      headFlashTimer = setTimeout(() => {
        headFlashColor = C.snakeHead;
        headFlashing = false;
      }, 33);
    }, 34);
  }, 33);
}

// --- Input ---
const OPPOSITE = { ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' };
const KEY_TO_DIR = {
  ArrowUp:    { x:  0, y: -1 },
  ArrowDown:  { x:  0, y:  1 },
  ArrowLeft:  { x: -1, y:  0 },
  ArrowRight: { x:  1, y:  0 },
  w:          { x:  0, y: -1 },
  s:          { x:  0, y:  1 },
  a:          { x: -1, y:  0 },
  d:          { x:  1, y:  0 },
};
const NORM_KEY = { w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight' };

window.addEventListener('keydown', e => {
  if (state === 'dead' || state === 'win') {
    if (e.code === 'Space') init();
    return;
  }
  const mapped = KEY_TO_DIR[e.key];
  if (!mapped) return;
  const canonical = NORM_KEY[e.key] || e.key;
  const curCanonical = dirToKey(dir);
  if (OPPOSITE[canonical] === curCanonical) return; // block 180
  nextDir = mapped;
  // Prevent page scroll
  if (e.key.startsWith('Arrow')) e.preventDefault();
});

function dirToKey(d) {
  if (d.x === 1)  return 'ArrowRight';
  if (d.x === -1) return 'ArrowLeft';
  if (d.y === 1)  return 'ArrowDown';
  return 'ArrowUp';
}

// --- Tick ---
function tick() {
  if (state !== 'playing') return;

  dir = nextDir;

  const head = snake[0];
  const newHead = { x: head.x + dir.x, y: head.y + dir.y };

  // Wall collision
  if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
    die();
    return;
  }

  // Self collision (against current body, excluding tail that will move)
  for (let i = 0; i < snake.length - 1; i++) {
    if (snake[i].x === newHead.x && snake[i].y === newHead.y) {
      die();
      return;
    }
  }

  // Eat check
  const ate = food && newHead.x === food.x && newHead.y === food.y;

  // Move: prepend new head
  snake.unshift(newHead);

  if (ate) {
    score++;
    // Don't pop tail — snake grows
    const newFood = spawnFood();
    if (newFood === null) {
      food = null;
      // Win condition
      state = 'win';
      clearInterval(tickTimer);
      if (foodFlashTimer) { clearTimeout(foodFlashTimer); foodFlashTimer = null; }
      if (headFlashTimer) { clearTimeout(headFlashTimer); headFlashTimer = null; }
      headFlashing = false;
      return;
    }
    food = newFood;
    startFoodFlash();
    startHeadFlash();
    playEat();
  } else {
    snake.pop();
  }
}

// --- Death ---
function die() {
  playDeath();
  state = 'dead';
  clearInterval(tickTimer);
  tickTimer = null;

  // Phase 1: snake turns gray immediately
  // (handled in render by checking state === 'dead')

  // +16ms: red overlay appears
  deathTimers.push(setTimeout(() => {
    showOverlay = true;
    overlayAlpha = 0.2;
    // Pulse: 20%→40%→20%→40%→20% over ~100ms
    let pulseCount = 0;
    function pulse() {
      pulseCount++;
      if (pulseCount > 4) {
        overlayAlpha = 0.2;
        return;
      }
      overlayAlpha = (pulseCount % 2 === 1) ? 0.4 : 0.2;
      deathTimers.push(setTimeout(pulse, 25));
    }
    deathTimers.push(setTimeout(pulse, 25));
  }, 16));

  // ~200ms in: show text
  deathTimers.push(setTimeout(() => {
    showDeadText = true;
  }, 200));
}

// --- Render ---
function render() {
  rafHandle = requestAnimationFrame(render);

  // Clear
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawHeader();
  drawGrid();
  drawFood();
  drawSnake();

  if (state === 'dead') {
    if (showOverlay) drawDeathOverlay();
    if (showDeadText) drawDeathText();
  }

  if (state === 'win') {
    drawWin();
  }
}

function drawHeader() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, HEADER);

  ctx.fillStyle = C.scoreText;
  ctx.font = `500 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '0px';
  ctx.fillText(`SCORE  ${score}`, canvas.width / 2, HEADER / 2);
}

function drawGrid() {
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  // Vertical lines
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, HEADER);
    ctx.lineTo(x * CELL, HEADER + ROWS * CELL);
    ctx.stroke();
  }
  // Horizontal lines
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, HEADER + y * CELL);
    ctx.lineTo(COLS * CELL, HEADER + y * CELL);
    ctx.stroke();
  }
}

function drawFood() {
  if (!food) return;
  const cx = food.x * CELL + CELL / 2;
  const cy = HEADER + food.y * CELL + CELL / 2;
  ctx.fillStyle = foodFlashFrame < 3 ? foodColor() : C.food;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnake() {
  const isDead = state === 'dead';
  const bodyColor = isDead ? C.deadSnake : C.snakeBody;
  const headColor = isDead ? C.deadSnake : (headFlashing ? headFlashColor : C.snakeHead);

  for (let i = snake.length - 1; i >= 0; i--) {
    const seg = snake[i];
    const px = seg.x * CELL + 2;
    const py = HEADER + seg.y * CELL + 2;
    ctx.fillStyle = (i === 0) ? headColor : bodyColor;
    ctx.fillRect(px, py, CELL - 4, CELL - 4);
  }
}

function drawDeathOverlay() {
  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawDeathText() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // GAME OVER
  ctx.save();
  ctx.fillStyle = C.deadText;
  ctx.font = `bold 28px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '4px';
  ctx.fillText('GAME OVER', cx, cy - 36);

  // SCORE
  ctx.font = `20px ${FONT}`;
  ctx.letterSpacing = '0px';
  ctx.fillText(`SCORE: ${score}`, cx, cy);

  // PRESS SPACE
  ctx.fillStyle = '#999999';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('PRESS SPACE TO RESTART', cx, cy + 36);
  ctx.restore();
}

function drawWin() {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.save();
  ctx.fillStyle = C.snakeBody;
  ctx.font = `bold 28px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '4px';
  ctx.fillText('YOU WIN', cx, cy - 36);

  ctx.fillStyle = C.deadText;
  ctx.font = `20px ${FONT}`;
  ctx.letterSpacing = '0px';
  ctx.fillText(`SCORE: ${score}`, cx, cy);

  ctx.fillStyle = '#999999';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('PRESS SPACE TO RESTART', cx, cy + 36);
  ctx.restore();
}

// --- Start ---
init();
