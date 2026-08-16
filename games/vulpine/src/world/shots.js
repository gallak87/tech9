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

  registerFichinaShots();
  registerOmegaShots();
  registerFoundryShots();
}

/**
 * The Foundry. One camera per bay kind, because the bay kind is the only thing
 * that varies along this level and the whole point of it is what is overhead.
 * The chunk length is 520 m and the pattern is 8 bays, so the z values below are
 * bay centres: open 0, span 2, enclosed 4, bulkhead 7.
 */
function registerFoundryShots() {
  const bay = (i) => 720 - (i + 0.5) * 520;
  registerShot('w4-open', ({ engine }) => onRail(engine.camera, bay(1), { dy: 8, ahead: 620, aimY: 30, fov: 58 }));
  registerShot('w4-span', ({ engine }) => onRail(engine.camera, bay(2), { dy: 4, ahead: 480, aimY: 60, fov: 62 }));
  registerShot('w4-enclosed', ({ engine }) => onRail(engine.camera, bay(4), { dy: 0, ahead: 500, aimY: 20, fov: 62 }));
  registerShot('w4-bulkhead', ({ engine }) => onRail(engine.camera, bay(7) + 360, { dy: 0, ahead: 400, aimY: 30, fov: 58 }));
  // Low over the deck, so the plating and the lit strips are read at grazing
  // incidence — the angle a flat panel either survives or does not.
  registerShot('w4-deck', ({ engine }) => onRail(engine.camera, bay(9), { du: 60, dy: -58, ahead: 560, aimY: 60, fov: 60 }));
  registerShot('w4-wide', ({ engine }) => {
    const z = bay(4);
    park(engine.camera, [centrelineX(z) + 620, centrelineY(z) + 330, z + 700],
      [centrelineX(z - 900), centrelineY(z - 900), z - 900], 46);
  });
}

/**
 * Sector Omega. Framed differently from either canyon on purpose: there is no
 * floor to put a horizon on and no wall to aim along, so what these have to
 * show is depth — bodies at four distances with gaps and stars between them —
 * and the fact that there is rock overhead.
 */
function registerOmegaShots() {
  registerShot('o-corridor', ({ engine }) => onRail(engine.camera, -900, { ahead: 900, fov: 58 }));
  registerShot('o-dense', ({ engine }) => onRail(engine.camera, -3400, { ahead: 700, fov: 62 }));
  // Aimed up: the one frame that proves a heightfield could not have made this.
  registerShot('o-ceiling', ({ engine }) => onRail(engine.camera, -5200, { ahead: 300, aimY: 420, fov: 62 }));
  registerShot('o-drift', ({ engine }) => onRail(engine.camera, -7000, { du: 90, ahead: 800, aimY: -60, fov: 54 }));
  // From outside the flight tube, looking back along it — the belt as a plane.
  registerShot('o-wide', ({ engine }) => {
    const z = -4200;
    park(engine.camera, [centrelineX(z) + 1500, centrelineY(z) + 620, z + 1300],
      [centrelineX(z - 900), centrelineY(z - 900), z - 900], 46);
  });
}

/**
 * Fichina's own review set. The `w-*` cameras above are framed on Corneria's z
 * literals and several park at absolute world Y, so they answer nothing about a
 * world whose dramatic moments are somewhere else and whose rail changes height.
 *
 * One camera per zone, parked at the middle of that zone's *held* stretch rather
 * than at its boundary — the boundaries are blends, and a blend photographs as
 * neither of the two things it joins. Everything is offset off `centrelineY`, so
 * the framing follows the rail through the pass instead of being left underneath
 * it.
 */
function registerFichinaShots() {
  registerShot('f-icefield', ({ engine }) => onRail(engine.camera, -400, { dy: 16, ahead: 900, aimY: -10 }));
  registerShot('f-tighten', ({ engine }) => onRail(engine.camera, -1400, { dy: 10, ahead: 800, aimY: 0 }));
  registerShot('f-trough', ({ engine }) => onRail(engine.camera, -2400, { dy: 4, ahead: 640, aimY: 10 }));
  // The two narrows are parked on the approach, not inside. At u = 0 in a 135 m
  // corridor the walls are 57–90° off axis — behind the shoulders of an 81°
  // horizontal frustum — so a camera in the slot photographs sky, and one aimed
  // up at the rim photographs more sky. What reads as tight is the pinch closing
  // ahead of you, which is also the only view the player ever gets of it.
  registerShot('f-slot', ({ engine }) => onRail(engine.camera, -3350, { dy: 8, ahead: 520, aimY: 25 }));
  registerShot('f-cirque', ({ engine }) => onRail(engine.camera, -4550, { dy: 20, ahead: 780, aimY: -8 }));
  registerShot('f-pass', ({ engine }) => onRail(engine.camera, -6100, { dy: 6, ahead: 460, aimY: 22 }));
  registerShot('f-crevasse', ({ engine }) => onRail(engine.camera, -6700, { dy: 6, ahead: 480, aimY: 30 }));
  registerShot('f-shelf', ({ engine }) => onRail(engine.camera, -8900, { dy: 26, ahead: 860, aimY: -14 }));

  // Outside the corridor: the only angle that shows a corridor changing width,
  // and the only one that shows the rail changing height.
  // High enough to see over the rim of the tallest zone (wallH 640 × the side
  // wobble's 1.14 ceiling), or the near wall hides the corridor these exist to
  // show. Each look target is ~1.5 km down the rail so a whole zone-to-zone
  // transition fits in one frame.
  registerShot('f-aerial-slot', ({ engine }) => {
    const z = -2900;
    park(engine.camera, [centrelineX(z) + 980, centrelineY(z) + 980, z + 900],
      [centrelineX(z - 1500), centrelineY(z - 1500), z - 1500], 44);
  });
  registerShot('f-aerial-pass', ({ engine }) => {
    const z = -5100;
    park(engine.camera, [centrelineX(z) + 1050, centrelineY(z) + 900, z + 820],
      [centrelineX(z - 1600), centrelineY(z - 1600), z - 1600], 46);
  });
}
