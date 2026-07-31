import * as THREE from 'three';
import { registerShot } from '../game/shots.js';
import { centrelineX, centrelineY } from './profile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Review angles for the level. These do not follow the ship — they park the
// camera at a fixed point on the map so the same piece of the corridor can be
// diffed across builds. `--t` still matters (water animates, the ship flies),
// but the framing does not drift.
// ─────────────────────────────────────────────────────────────────────────────

const _look = new THREE.Vector3();

function park(cam, at, look, fov = 42) {
  cam.position.set(at[0], at[1], at[2]);
  cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.lookAt(_look.set(look[0], look[1], look[2]));
}

/** Camera on the rail at `z`, offset in rail space, aimed down the corridor. */
function onRail(cam, z, { du = 0, dy = 0, ahead = 500, aimY = 0, fov = 52 } = {}) {
  const x = centrelineX(z) + du;
  const y = centrelineY(z) + dy;
  const zt = z - ahead;
  park(cam, [x, y, z], [centrelineX(zt) + du * 0.35, centrelineY(zt) + aimY, zt], fov);
}

export function registerWorldShots() {
  // ── the corridor, from the pilot's eyeline, at each act of the level
  registerShot('w-bay', ({ engine }) => onRail(engine.camera, -520, { dy: 12, ahead: 700, aimY: -6 }));
  registerShot('w-gorge', ({ engine }) => onRail(engine.camera, -2150, { dy: 6, ahead: 620, aimY: 4 }));
  registerShot('w-narrows', ({ engine }) => onRail(engine.camera, -2870, { dy: 0, ahead: 520, aimY: 22 }));
  registerShot('w-city', ({ engine }) => onRail(engine.camera, -4600, { dy: 18, ahead: 640, aimY: -4 }));
  registerShot('w-city2', ({ engine }) => onRail(engine.camera, -5450, { du: -55, dy: 30, ahead: 560, aimY: -10 }));
  registerShot('w-dam', ({ engine }) => onRail(engine.camera, -6060, { dy: 10, ahead: 560, aimY: 40 }));
  registerShot('w-delta', ({ engine }) => onRail(engine.camera, -8000, { dy: 34, ahead: 760, aimY: -18 }));

  // ── wide establishing shots, from outside the canyon
  registerShot('w-aerial', ({ engine }) => {
    const z = -2600;
    park(engine.camera, [centrelineX(z) + 640, 640, z + 620], [centrelineX(z - 900), 60, z - 900], 40);
  });
  registerShot('w-aerial-city', ({ engine }) => {
    const z = -5000;
    park(engine.camera, [centrelineX(z) + 720, 470, z + 760], [centrelineX(z - 800), 40, z - 800], 42);
  });

  // ── the waterline: beaches, surf, shallow colour
  registerShot('w-shore', ({ engine }) => {
    const z = -1750;
    park(engine.camera, [centrelineX(z) + 130, 26, z + 60], [centrelineX(z - 260) + 250, 8, z - 260], 46);
  });

  // ── surface quality: close enough that the rock has to hold up on its own
  registerShot('w-rock', ({ engine }) => {
    const z = -2450;
    park(engine.camera, [centrelineX(z) + 140, 34, z], [centrelineX(z - 40) + 420, 150, z - 40], 44);
  });
  registerShot('w-wall', ({ engine }) => {
    const z = -3150;
    park(engine.camera, [centrelineX(z) - 40, 70, z + 40], [centrelineX(z - 300) + 260, 210, z - 300], 46);
  });

  // ── landmark close-ups
  registerShot('w-arch', ({ engine }) => onRail(engine.camera, -1720, { dy: -10, ahead: 300, aimY: 60, fov: 58 }));
  registerShot('w-bridge', ({ engine }) => onRail(engine.camera, -4950, { dy: -12, ahead: 340, aimY: 55, fov: 58 }));
  registerShot('w-damface', ({ engine }) => onRail(engine.camera, -6280, { dy: -4, ahead: 300, aimY: 55, fov: 58 }));
  registerShot('w-towers', ({ engine }) => {
    const z = -5600;
    park(engine.camera, [centrelineX(z) + 180, 90, z + 210], [centrelineX(z) + 430, 190, z - 120], 44);
  });
}
