import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import * as Game from './game.js';

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000814);
scene.fog = new THREE.FogExp2(0x000814, 0.018);

const ambientLight = new THREE.AmbientLight(0x223344, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0x8899ff, 2.5);
sunLight.position.set(-10, 20, 10);
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0xff4400, 0.6);
rimLight.position.set(5, -2, -10);
scene.add(rimLight);

// ─── Camera ───────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 400);

// ─── Post-processing ──────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.9, 0.4, 0.2
);
composer.addPass(bloomPass);

// ─── Build world ──────────────────────────────────────────────────────────────
Game.buildWorld(scene);

// ─── Stars ────────────────────────────────────────────────────────────────────
{
  const starGeo = new THREE.BufferGeometry();
  const count = 800;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 200;
    pos[i * 3 + 1] = 5 + Math.random() * 60;
    pos[i * 3 + 2] = -10 - Math.random() * 200;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true });
  scene.add(new THREE.Points(starGeo, starMat));
}

// ─── Google Font ─────────────────────────────────────────────────────────────
{
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap';
  document.head.appendChild(link);
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
const hud = document.createElement('div');
hud.style.cssText = `
  position:fixed; top:0; left:0; width:100%; height:100%;
  pointer-events:none; user-select:none;
`;
document.body.appendChild(hud);

// Styles
{
  const style = document.createElement('style');
  style.id = 'vsb-styles';
  style.textContent = `
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes blinkfast { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes waveFlashAnim {
      0%   { opacity:0; transform:translateX(-50%) scale(0.7); }
      15%  { opacity:1; transform:translateX(-50%) scale(1.05); }
      80%  { opacity:1; transform:translateX(-50%) scale(1); }
      100% { opacity:0; transform:translateX(-50%) scale(1); }
    }
    body { margin:0; overflow:hidden; background:#000814; }
    #vsb-score {
      position:absolute; top:18px; left:50%; transform:translateX(-50%);
      font-family:'Share Tech Mono',monospace; font-size:22px; color:#ffffff;
      text-shadow: 0 0 10px #00EEFF, 0 0 20px #00EEFF;
      letter-spacing:3px;
    }
    #vsb-lives {
      position:absolute; top:16px; left:22px;
      font-family:'Share Tech Mono',monospace; font-size:20px;
      letter-spacing:4px;
    }
    #vsb-wave-indicator {
      position:absolute; top:16px; right:22px;
      font-family:'Share Tech Mono',monospace; font-size:12px; color:#336655;
      letter-spacing:2px;
    }
    #vsb-weapon {
      position:absolute; bottom:22px; left:22px;
      font-family:'Share Tech Mono',monospace; font-size:12px; color:#7a9ab0;
      letter-spacing:1px; display:flex; flex-direction:column; gap:4px;
    }
    #vsb-weapon .pips { display:flex; gap:6px; }
    .pip {
      width:12px; height:12px; border-radius:50%;
      background:#2A3A5A; display:inline-block;
    }
    .pip.active {
      background:#FFD700;
      box-shadow: 0 0 8px #FFD700, 0 0 14px #FFD700;
    }
    #vsb-bombs {
      position:absolute; bottom:22px; right:22px;
      font-family:'Share Tech Mono',monospace; font-size:12px; color:#7a9ab0;
      letter-spacing:1px; display:flex; flex-direction:column; align-items:flex-end; gap:4px;
    }
    #vsb-bombs .bomb-icons { display:flex; gap:6px; }
    .bomb-icon {
      width:14px; height:14px; border-radius:50%; border:2px solid #4a4a6a;
      background:#15152a; display:inline-block;
    }
    .bomb-icon.active {
      background:#C070FF; border-color:#C070FF;
      box-shadow: 0 0 8px #C070FF;
    }
    #vsb-boss-bar {
      position:absolute; top:56px; left:50%; transform:translateX(-50%);
      width:360px; display:none; flex-direction:column; align-items:center; gap:6px;
    }
    #vsb-boss-bar .boss-name-label {
      font-family:'Share Tech Mono',monospace; font-size:11px; color:#FF4400;
      text-shadow: 0 0 8px #FF4400; letter-spacing:3px;
    }
    #vsb-boss-bar .bar-wrapper {
      width:100%; position:relative;
    }
    #vsb-boss-bar .bar-bg {
      width:100%; height:12px; background:#2a1010; border-radius:4px;
      overflow:visible; position:relative;
    }
    #vsb-boss-bar .bar-fill {
      height:100%; width:100%; background:#FF3060;
      box-shadow: 0 0 10px #FF3060;
      transition: width 0.08s, background 0.3s, box-shadow 0.3s;
      border-radius:4px;
    }
    .phase-marker {
      position:absolute; top:-4px; width:2px; height:20px;
      background:#ffffff; opacity:0.5; pointer-events:none;
    }
    #vsb-wave-flash {
      position:absolute; top:28%; left:50%;
      transform:translateX(-50%);
      font-family:'Share Tech Mono',monospace; font-size:38px; color:#00ffee;
      text-shadow: 0 0 20px #00ffee, 0 0 40px #00ffcc;
      letter-spacing:8px; pointer-events:none; display:none;
      white-space:nowrap;
    }
    #vsb-overlay {
      position:absolute; top:0; left:0; width:100%; height:100%;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      background:rgba(0,0,20,0.78); gap:20px;
    }
    #vsb-dev-panel {
      position:absolute; top:12px; right:12px;
      background:rgba(0,0,0,0.82); border:1px solid #334;
      font-family:'Share Tech Mono',monospace; font-size:12px; color:#aaccff;
      padding:0; min-width:200px; z-index:100; pointer-events:all; user-select:none;
    }
    #vsb-dev-header {
      background:#1a1a2e; padding:6px 10px; cursor:pointer; color:#00EEFF;
      font-size:11px; letter-spacing:1px; display:flex; justify-content:space-between;
    }
    #vsb-dev-body { padding:8px 10px; display:flex; flex-direction:column; gap:8px; }
    #vsb-dev-body button {
      font-family:'Share Tech Mono',monospace; font-size:11px;
      background:#1a2a3a; color:#00EEFF; border:1px solid #334;
      padding:3px 8px; cursor:pointer; margin:1px;
    }
    #vsb-dev-body button:hover { background:#223344; }
    #vsb-dev-stats { color:#7a9ab0; font-size:11px; line-height:1.6; }
  `;
  document.head.appendChild(style);
}

// Score — top center
const scoreEl = document.createElement('div');
scoreEl.id = 'vsb-score';
hud.appendChild(scoreEl);

// Lives — top left
const livesEl = document.createElement('div');
livesEl.id = 'vsb-lives';
hud.appendChild(livesEl);

// Wave indicator — top right (replaces dev state shortcuts)
const waveIndicatorEl = document.createElement('div');
waveIndicatorEl.id = 'vsb-wave-indicator';
hud.appendChild(waveIndicatorEl);

// Wave flash — centered dramatic text
const waveFlashEl = document.createElement('div');
waveFlashEl.id = 'vsb-wave-flash';
hud.appendChild(waveFlashEl);

// Weapon tier pips — bottom left
const weaponEl = document.createElement('div');
weaponEl.id = 'vsb-weapon';
weaponEl.innerHTML = `<div style="color:#7a9ab0;letter-spacing:2px">WEAPON</div><div class="pips" id="vsb-pips"></div>`;
hud.appendChild(weaponEl);

// Bombs — bottom right
const bombsEl = document.createElement('div');
bombsEl.id = 'vsb-bombs';
bombsEl.innerHTML = `<div style="color:#7a9ab0;letter-spacing:2px">BOMBS</div><div class="bomb-icons" id="vsb-bomb-icons"></div>`;
hud.appendChild(bombsEl);

// Boss health bar (hidden until BOSS state)
const bossBar = document.createElement('div');
bossBar.id = 'vsb-boss-bar';
bossBar.innerHTML = `
  <div class="boss-name-label" id="vsb-boss-name">BOSS</div>
  <div class="bar-wrapper">
    <div class="bar-bg">
      <div class="bar-fill" id="vsb-boss-fill"></div>
    </div>
    <div class="phase-marker" style="left:33.3%"></div>
    <div class="phase-marker" style="left:66.6%"></div>
  </div>
`;
hud.appendChild(bossBar);

// Overlay for MENU / WIN / GAME_OVER
const overlay = document.createElement('div');
overlay.id = 'vsb-overlay';
overlay.style.display = 'none';
hud.appendChild(overlay);

// ─── Dev Tool Panel ──────────────────────────────────────────────────────────
const devPanel = document.createElement('div');
devPanel.id = 'vsb-dev-panel';
devPanel.innerHTML = `
  <div id="vsb-dev-header">
    <span>DEV TOOLS</span><span id="vsb-dev-toggle">▼</span>
  </div>
  <div id="vsb-dev-body">
    <div>
      <span style="color:#7a9ab0">TIER</span>
      <button id="vsb-tier-down">[ −</button>
      <button id="vsb-tier-up">] +</button>
    </div>
    <div>
      <span style="color:#7a9ab0">SPAWN</span>
      <button id="vsb-spawn-s">Scout (⇧S)</button>
      <button id="vsb-spawn-b">Bomber (⇧B)</button>
      <button id="vsb-spawn-d">Drone (⇧D)</button>
      <button id="vsb-spawn-e">Elite (⇧E)</button>
    </div>
    <div id="vsb-dev-stats" class="vsb-dev-stats"></div>
  </div>
`;
devPanel.style.display = 'none';
document.body.appendChild(devPanel);

let devPanelOpen = true;
document.getElementById('vsb-dev-header').addEventListener('click', () => {
  devPanelOpen = !devPanelOpen;
  document.getElementById('vsb-dev-body').style.display = devPanelOpen ? 'flex' : 'none';
  document.getElementById('vsb-dev-toggle').textContent = devPanelOpen ? '▼' : '▶';
});
document.getElementById('vsb-tier-down').addEventListener('click', () => Game.devCycleTier(-1));
document.getElementById('vsb-tier-up').addEventListener('click',   () => Game.devCycleTier(1));
document.getElementById('vsb-spawn-s').addEventListener('click', () => Game.devSpawnEnemy('scout'));
document.getElementById('vsb-spawn-b').addEventListener('click', () => Game.devSpawnEnemy('bomber'));
document.getElementById('vsb-spawn-d').addEventListener('click', () => Game.devSpawnEnemy('drone'));
document.getElementById('vsb-spawn-e').addEventListener('click', () => Game.devSpawnEnemy('elite'));

// ─── HUD / visual state ───────────────────────────────────────────────────────
const MAX_LIVES = 3;
const MAX_BOMBS = 4;

const BOSS_PHASE_COLORS = ['', '#FF3060', '#FF6B00', '#FF00FF'];

// Scene tint during boss phases
const BOSS_BG_COLORS = ['', 0x000814, 0x100408, 0x1a0020];

let _bloomTarget = 0.9;
let _lastWaveFlashText = '';

function _formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderHUD(dt) {
  const state = Game.currentState;

  // Score
  scoreEl.textContent = String(Game.score).padStart(8, '0');

  // Lives hearts
  let heartsHTML = '';
  for (let i = 0; i < MAX_LIVES; i++) {
    const active = i < Game.lives;
    heartsHTML += `<span style="color:${active ? '#FF3060' : '#2A1020'};text-shadow:${active ? '0 0 8px #FF3060' : 'none'}">&#9829;</span>`;
  }
  livesEl.innerHTML = heartsHTML;

  // Weapon tier pips
  const pipsEl = document.getElementById('vsb-pips');
  if (pipsEl) {
    let pipsHTML = '';
    for (let t = 1; t <= 7; t++) {
      pipsHTML += `<span class="pip${t <= Game.weaponTier ? ' active' : ''}"></span>`;
    }
    pipsEl.innerHTML = pipsHTML;
  }

  // Bombs
  const bombIconsEl = document.getElementById('vsb-bomb-icons');
  if (bombIconsEl) {
    let bombHTML = '';
    for (let b = 0; b < MAX_BOMBS; b++) {
      bombHTML += `<span class="bomb-icon${b < Game.bombCount ? ' active' : ''}"></span>`;
    }
    bombIconsEl.innerHTML = bombHTML;
  }

  // Wave indicator (top right)
  if (state === Game.STATE.PLAYING && Game.currentWave > 0) {
    waveIndicatorEl.textContent = `WAVE ${Game.currentWave} / ${Game.waveCount}`;
    waveIndicatorEl.style.display = 'block';
  } else if (state === Game.STATE.BOSS) {
    waveIndicatorEl.textContent = 'BOSS';
    waveIndicatorEl.style.color = '#FF4400';
    waveIndicatorEl.style.display = 'block';
  } else {
    waveIndicatorEl.style.color = '#336655';
    waveIndicatorEl.style.display = 'none';
  }

  // Wave flash
  const flashRef = Game._waveFlashRef;
  if (flashRef.text && flashRef.timer > 0 && flashRef.text !== _lastWaveFlashText) {
    _lastWaveFlashText = flashRef.text;
    waveFlashEl.textContent = flashRef.text;
    waveFlashEl.style.display = 'block';
    // Re-trigger animation by removing/adding
    waveFlashEl.style.animation = 'none';
    // Force reflow
    void waveFlashEl.offsetWidth;
    waveFlashEl.style.animation = 'waveFlashAnim 1.5s ease-out forwards';
  }
  if (flashRef.timer <= 0) {
    _lastWaveFlashText = '';
  }

  // Boss bar
  const isBoss = state === Game.STATE.BOSS;
  if (isBoss && Game.boss && !Game.boss.dead) {
    bossBar.style.display = 'flex';

    const pct = Game.boss.hp / Game.boss.maxHp;
    const fillEl = document.getElementById('vsb-boss-fill');
    const nameEl = document.getElementById('vsb-boss-name');

    if (fillEl) {
      fillEl.style.width = `${Math.max(0, pct * 100).toFixed(1)}%`;
      const pc = BOSS_PHASE_COLORS[Game.boss.phase] || '#FF3060';
      fillEl.style.background = pc;
      fillEl.style.boxShadow = `0 0 10px ${pc}`;
    }

    if (nameEl) {
      nameEl.textContent = Game.boss.type.toUpperCase();
      const pc = BOSS_PHASE_COLORS[Game.boss.phase] || '#FF4400';
      nameEl.style.color = pc;
      nameEl.style.textShadow = `0 0 8px ${pc}`;
    }
  } else {
    bossBar.style.display = 'none';
  }

  // Boss phase transition — bloom spike + scene color shift
  if (Game.bossPhaseTransition) {
    Game.resetBossPhaseTransition();
    _bloomTarget = 2.8;
    if (Game.boss) {
      const bg = BOSS_BG_COLORS[Game.boss.phase] || 0x000814;
      scene.background = new THREE.Color(bg);
      scene.fog.color = new THREE.Color(bg);
    }
  }

  // Bloom lerp
  let baseBloom = 0.9;
  if (isBoss && Game.boss) {
    baseBloom = Game.boss.phase === 1 ? 1.1 : (Game.boss.phase === 2 ? 1.4 : 1.8);
  }
  if (_bloomTarget > baseBloom) {
    _bloomTarget = Math.max(baseBloom, _bloomTarget - dt * 3.5);
  } else {
    _bloomTarget = baseBloom;
  }
  bloomPass.strength = _bloomTarget;

  // Reset scene color when back to PLAYING / MENU
  if (state === Game.STATE.PLAYING || state === Game.STATE.MENU) {
    scene.background = new THREE.Color(0x000814);
    scene.fog.color = new THREE.Color(0x000814);
  }

  // Overlay
  if (state === Game.STATE.MENU) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div style="font-family:'Share Tech Mono',monospace;font-size:40px;letter-spacing:4px;color:#00eeff;text-shadow:0 0 24px #00eeff;text-align:center;line-height:1.2">
        VOID SENTINEL<br><span style="color:#ff4400;text-shadow:0 0 20px #ff4400;">BREACH</span>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:13px;line-height:2.4;text-align:center;color:#aaccff;">
        WASD / ARROWS &mdash; MOVE<br>
        AUTO-FIRE &mdash; ALWAYS ON<br>
        12 WAVES + FINAL BOSS
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:17px;animation:blink 1.1s step-end infinite;color:#00ffcc;">
        [ PRESS ENTER OR CLICK TO START ]
      </div>
    `;
  } else if (state === Game.STATE.WIN) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div style="font-family:'Share Tech Mono',monospace;font-size:48px;color:#ffff00;text-shadow:0 0 32px #ffff00,0 0 60px #ffffaa;letter-spacing:4px;">VICTORY</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:13px;color:#666;letter-spacing:2px;">BREACH ELIMINATED</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:24px;color:#fff;letter-spacing:3px;">SCORE &nbsp;${String(Game.score).padStart(8,'0')}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:14px;color:#aaccff;line-height:2.2;text-align:center;">
        WAVE REACHED &nbsp; ${Game.waveReached}&nbsp;/&nbsp;${Game.waveCount}<br>
        TIME SURVIVED &nbsp; ${_formatTime(Game.timeSurvived)}
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:14px;color:#00ffcc;animation:blink 1.1s step-end infinite;">[ R OR CLICK TO RETURN ]</div>
    `;
  } else if (state === Game.STATE.GAME_OVER) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div style="font-family:'Share Tech Mono',monospace;font-size:48px;color:#ff2200;text-shadow:0 0 32px #ff2200,0 0 60px #ff4400;letter-spacing:2px;">GAME OVER</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:24px;color:#fff;letter-spacing:3px;">SCORE &nbsp;${String(Game.score).padStart(8,'0')}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:14px;color:#aaccff;line-height:2.2;text-align:center;">
        WAVE REACHED &nbsp; ${Game.waveReached}&nbsp;/&nbsp;${Game.waveCount}<br>
        TIME SURVIVED &nbsp; ${_formatTime(Game.timeSurvived)}
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:14px;color:#ff6644;animation:blink 1.1s step-end infinite;">[ R OR CLICK TO RETURN ]</div>
    `;
  } else {
    overlay.style.display = 'none';
  }

  // Dev panel
  devPanel.style.display = window.__DEV_TOOLS__ ? 'block' : 'none';
  if (window.__DEV_TOOLS__) {
    const statsEl = document.getElementById('vsb-dev-stats');
    if (statsEl) {
      const bossInfo = Game.boss
        ? `${Game.boss.type} P${Game.boss.phase} ${Game.boss.hp}/${Game.boss.maxHp}hp`
        : 'none';
      statsEl.innerHTML =
        `tier: T${Game.weaponTier}  lives: ${Game.lives}  bombs: ${Game.bombCount}<br>` +
        `wave: ${Game.currentWave}/${Game.waveCount}  enemies: ${Game.enemies.length}<br>` +
        `pBullets: ${Game.playerBullets.length}  eBullets: ${Game.enemyBullets.length}<br>` +
        `boss: ${bossInfo}`;
    }
  }
}

// ─── Art Mode ────────────────────────────────────────────────────────────────
let artMode = false;
let artMeshes = [];
let artLabelContainer = null;

function buildArtLabels(meshes) {
  if (artLabelContainer) artLabelContainer.remove();
  artLabelContainer = document.createElement('div');
  artLabelContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;';
  document.body.appendChild(artLabelContainer);

  for (const m of meshes) {
    if (!m.userData.artLabel) continue;
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; font-family:'Share Tech Mono',monospace;
      font-size:11px; color:#00ffcc; text-shadow:0 0 6px #00ffcc;
      letter-spacing:1px; white-space:nowrap; pointer-events:none;
    `;
    el.textContent = m.userData.artLabel;
    el.dataset.meshId = m.uuid;
    artLabelContainer.appendChild(el);
  }
}

function updateArtLabels() {
  if (!artLabelContainer) return;
  const labels = artLabelContainer.querySelectorAll('div');
  let meshIdx = 0;
  for (const mesh of artMeshes) {
    if (!mesh.userData.artLabel) continue;
    const el = labels[meshIdx++];
    if (!el) continue;
    const pos = mesh.position.clone().project(camera);
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
    el.style.left = `${x - 20}px`;
    el.style.top = `${y + 12}px`;
    el.style.display = pos.z < 1 ? 'block' : 'none';
  }
}

function toggleArtMode() {
  artMode = !artMode;
  if (artMode) {
    artMeshes = Game.devBuildArtScene(scene);
    buildArtLabels(artMeshes);
    camera.position.set(0, 18, 10);
    camera.lookAt(0, 0, -20);
    if (artBanner) artBanner.style.display = 'block';
  } else {
    Game.devClearArtScene(scene, artMeshes);
    artMeshes = [];
    if (artLabelContainer) { artLabelContainer.remove(); artLabelContainer = null; }
    if (artBanner) artBanner.style.display = 'none';
  }
}

// Art mode banner
const artBanner = document.createElement('div');
artBanner.style.cssText = `
  position:fixed; bottom:60px; left:50%; transform:translateX(-50%);
  font-family:'Share Tech Mono',monospace; font-size:12px; color:#ff9900;
  text-shadow:0 0 8px #ff9900; letter-spacing:2px; pointer-events:none;
  display:none;
`;
artBanner.textContent = '[ ART MODE — M TO EXIT ]';
document.body.appendChild(artBanner);

// M key
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && window.__DEV_TOOLS__) {
    toggleArtMode();
    e.preventDefault();
  }
});

// ─── Camera modes (dev) ───────────────────────────────────────────────────────
const CAM_MODES = [
  { name: 'CHASE',  offset: new THREE.Vector3(0, 3.2, 8.5),  lookDZ: -6, lookDY: -0.5 },
  { name: '1ST-P',  offset: new THREE.Vector3(0, 0.4, -1.2), lookDZ: -8, lookDY:  0.0 },
  { name: 'HIGH',   offset: new THREE.Vector3(0, 9.0, 12.0), lookDZ: -4, lookDY: -1.5 },
];
let camModeIdx = 0;

if (window.__DEV_TOOLS__) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !artMode) {
      camModeIdx = (camModeIdx + 1) % CAM_MODES.length;
      const name = CAM_MODES[camModeIdx].name;
      // Flash name on screen briefly
      const flash = document.createElement('div');
      flash.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
        font-family:'Share Tech Mono',monospace;font-size:13px;color:#ffcc00;
        text-shadow:0 0 8px #ffcc00;letter-spacing:2px;pointer-events:none;z-index:999;`;
      flash.textContent = `CAM: ${name}`;
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 1200);
      e.preventDefault();
    }
  });
}

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Game loop ────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const _shakeOffset = new THREE.Vector3();

function loop() {
  requestAnimationFrame(loop);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (artMode) {
    updateArtLabels();
    renderHUD(dt);
    composer.render();
    return;
  }

  Game.update(dt, scene);

  // Camera: follow player with shake
  if (Game.player) {
    const cam = CAM_MODES[camModeIdx];
    camera.position.copy(Game.player.position).add(cam.offset);

    if (Game.cameraShakeIntensity > 0) {
      const s = Game.cameraShakeIntensity;
      _shakeOffset.set(
        (Math.random() - 0.5) * s * 0.6,
        (Math.random() - 0.5) * s * 0.3,
        (Math.random() - 0.5) * s * 0.2
      );
      camera.position.add(_shakeOffset);
    }

    const lookAt = Game.player.position.clone();
    lookAt.z += cam.lookDZ;
    lookAt.y += cam.lookDY;
    camera.lookAt(lookAt);
  }

  renderHUD(dt);
  composer.render();
}

loop();
