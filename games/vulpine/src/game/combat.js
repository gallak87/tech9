import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Combat / AI / mission seam.  OWNER: combat agent.
// Yours: src/game/combat.js, src/game/ai.js, src/game/mission.js,
//        src/ships/enemies.js, src/ships/boss.js
//
// Reads ctx.flight for the player state, calls ctx.fx for anything visual, and
// pushes HUD state onto ctx.state so the UI agent can read it without coupling.
// ─────────────────────────────────────────────────────────────────────────────

export function installCombat(ctx) {
  const group = new THREE.Group();
  group.name = 'combat';
  ctx.scene.add(group);

  // Shared, UI-readable game state. The HUD renders this; nothing else writes it.
  ctx.state = {
    shield: 100, shieldMax: 100,
    lives: 3, score: 0,
    bombs: 3,
    lockOn: 0,              // 0..1 charge
    lockTarget: null,       // THREE.Object3D or null
    wingmen: [
      { id: 'falco', name: 'FALCO', health: 100, alive: true },
      { id: 'peppy', name: 'PEPPY', health: 100, alive: true },
      { id: 'slippy', name: 'SLIPPY', health: 100, alive: true },
    ],
    enemies: [],            // live enemy objects, for HUD radar
    message: null,          // { who, text, until }
    bossHealth: null,
    checkpoint: 0,
  };

  return {
    group,
    update(dt) { void dt; },
    dispose() { ctx.scene.remove(group); },
  };
}
