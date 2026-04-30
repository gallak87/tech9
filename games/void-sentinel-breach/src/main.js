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

// Lighting
const ambientLight = new THREE.AmbientLight(0x223344, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0x8899ff, 2.5);
sunLight.position.set(-10, 20, 10);
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0xff4400, 0.6);
rimLight.position.set(5, -2, -10);
scene.add(rimLight);

// ─── Camera ───────────────────────────────────────────────────────────────────
// Behind-the-jet, low angle. Camera is fixed offset from player; world streams forward.
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 400);

const CAMERA_OFFSET = new THREE.Vector3(0, 3.2, 8.5); // behind and above player

// ─── Post-processing ──────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  /*strength*/ 0.9,
  /*radius*/   0.4,
  /*threshold*/0.2
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

// ─── HUD ──────────────────────────────────────────────────────────────────────
const hud = document.createElement('div');
hud.style.cssText = `
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none; font-family: 'Courier New', monospace; color: #00ffcc;
  text-shadow: 0 0 8px #00ffcc;
`;
document.body.appendChild(hud);

// HUD top-left panel
const hudPanel = document.createElement('div');
hudPanel.style.cssText = `position:absolute; top:18px; left:22px; font-size:15px; line-height:1.7;`;
hud.appendChild(hudPanel);

// Overlay for MENU / WIN / GAME_OVER
const overlay = document.createElement('div');
overlay.style.cssText = `
  position:absolute; top:0; left:0; width:100%; height:100%;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:rgba(0,0,20,0.75); font-family:'Courier New',monospace;
  color:#00ffcc; text-shadow:0 0 12px #00ffcc; gap:18px;
`;
hud.appendChild(overlay);

function renderHUD() {
  const state = Game.currentState;
  const playing = state === Game.STATE.PLAYING || state === Game.STATE.BOSS;

  // Top panel — always shown
  hudPanel.innerHTML = `
    SCORE &nbsp; ${String(Game.score).padStart(7, '0')}<br>
    WEAPON &nbsp; T${Game.weaponTier}<br>
    LIVES &nbsp; ${'♥'.repeat(Game.lives)}<br>
    BOMBS &nbsp; ${Game.bombs}
  `;

  // Overlay content
  if (state === Game.STATE.MENU) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div style="font-size:38px; letter-spacing:4px; color:#00eeff; text-shadow:0 0 20px #00eeff;">
        VOID SENTINEL<br><span style="color:#ff4400;text-shadow:0 0 16px #ff4400;">BREACH</span>
      </div>
      <div style="font-size:15px; line-height:2; text-align:center; color:#aaccff;">
        WASD / ARROWS — MOVE<br>
        SPACE / Z — CYCLE WEAPON TIER<br>
        AUTO-FIRE — ALWAYS ON
      </div>
      <div style="font-size:18px; animation:blink 1.1s step-end infinite; color:#00ffcc;">
        [ PRESS ENTER OR CLICK TO START ]
      </div>
    `;
    if (!document.getElementById('vsb-blink-style')) {
      const style = document.createElement('style');
      style.id = 'vsb-blink-style';
      style.textContent = `@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`;
      document.head.appendChild(style);
    }
  } else if (state === Game.STATE.WIN) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div style="font-size:42px; color:#ffff00; text-shadow:0 0 24px #ffff00;">VICTORY</div>
      <div style="font-size:18px;">SCORE &nbsp; ${Game.score}</div>
      <div style="font-size:15px; color:#aaccff;">[ R OR CLICK TO RETURN TO MENU ]</div>
    `;
  } else if (state === Game.STATE.GAME_OVER) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div style="font-size:42px; color:#ff2200; text-shadow:0 0 24px #ff2200;">GAME OVER</div>
      <div style="font-size:18px;">SCORE &nbsp; ${Game.score}</div>
      <div style="font-size:15px; color:#aaccff;">[ R OR CLICK TO RETURN TO MENU ]</div>
    `;
  } else if (state === Game.STATE.BOSS) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div style="font-size:32px; color:#ff4400; text-shadow:0 0 20px #ff4400;">⚠ BOSS INCOMING ⚠</div>
      <div style="font-size:13px; color:#aaaaaa;">(stub — dev shortcut: 4=WIN 5=GAME_OVER)</div>
    `;
  } else {
    overlay.style.display = 'none';
  }
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

  const dt = Math.min(clock.getDelta(), 0.05); // cap to avoid spiral-of-death

  // Update game logic
  Game.update(dt, scene);

  // Camera: lock behind player with shake
  if (Game.player) {
    const target = Game.player.position.clone().add(CAMERA_OFFSET);
    camera.position.copy(target);

    // Apply shake
    if (Game.cameraShakeIntensity > 0) {
      const s = Game.cameraShakeIntensity;
      _shakeOffset.set(
        (Math.random() - 0.5) * s * 0.6,
        (Math.random() - 0.5) * s * 0.3,
        (Math.random() - 0.5) * s * 0.2
      );
      camera.position.add(_shakeOffset);
    }

    // Always look at a point just ahead of the player (slightly down for low angle)
    const lookAt = Game.player.position.clone();
    lookAt.z -= 6;
    lookAt.y -= 0.5;
    camera.lookAt(lookAt);
  }

  renderHUD();
  composer.render();
}

loop();
