import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Named camera setups for the review harness. Each shot is a deterministic
// framing of the live scene, so a critic can diff the same angle across builds
// and nothing shifts underneath them between runs.
// ─────────────────────────────────────────────────────────────────────────────

const _v = new THREE.Vector3();

function orbit(cam, target, { dist, yaw, pitch, fov = 34, up = 0 }) {
  const y = THREE.MathUtils.degToRad(yaw);
  const p = THREE.MathUtils.degToRad(pitch);
  _v.set(
    Math.sin(y) * Math.cos(p),
    Math.sin(p),
    Math.cos(y) * Math.cos(p),
  ).multiplyScalar(dist);
  cam.position.copy(target).add(_v);
  cam.position.y += up;
  cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.lookAt(target);
}

export const SHOTS = {
  /** Straight gameplay framing — what the player actually sees. */
  chase({ engine, flight }) {
    flight.updateCamera(1 / 60, engine.camera);
  },

  /** Hero three-quarter front of the Arwing. The money shot for the model. */
  'ship-hero'({ engine, ship }) {
    orbit(engine.camera, ship.position, { dist: 13.5, yaw: 208, pitch: 11, fov: 32, up: 0.6 });
  },

  'ship-front'({ engine, ship }) {
    orbit(engine.camera, ship.position, { dist: 12, yaw: 180, pitch: 4, fov: 32 });
  },

  'ship-rear'({ engine, ship }) {
    orbit(engine.camera, ship.position, { dist: 11.5, yaw: 14, pitch: 9, fov: 34 });
  },

  'ship-top'({ engine, ship }) {
    orbit(engine.camera, ship.position, { dist: 14, yaw: 195, pitch: 58, fov: 32 });
  },

  /** Tight on the canopy and nose — checks panel/normal-map detail. */
  'ship-detail'({ engine, ship }) {
    const t = ship.position.clone().add(new THREE.Vector3(0, 0.35, -1.4));
    orbit(engine.camera, t, { dist: 4.6, yaw: 222, pitch: 15, fov: 30 });
  },

  /** Engines lit, from low behind. Bloom / plume check. */
  'ship-engines'({ engine, ship }) {
    const t = ship.position.clone().add(new THREE.Vector3(0, -0.1, 2.2));
    orbit(engine.camera, t, { dist: 6.4, yaw: 26, pitch: -6, fov: 34 });
  },

  /** Wide valley vista from high and behind — landscape and atmosphere. */
  valley({ engine, flight }) {
    const cam = engine.camera;
    cam.position.set(flight.pos.x + 120, flight.pos.y + 105, flight.pos.z + 210);
    cam.fov = 46;
    cam.updateProjectionMatrix();
    cam.lookAt(flight.pos.x - 30, flight.pos.y - 20, flight.pos.z - 420);
  },

  /** Low over the water looking down the channel — reflections and specular. */
  water({ engine, flight }) {
    const cam = engine.camera;
    cam.position.set(flight.pos.x + 18, 5.5, flight.pos.z + 40);
    cam.fov = 52;
    cam.updateProjectionMatrix();
    cam.lookAt(flight.pos.x - 10, 12, flight.pos.z - 520);
  },

  /** Straight into the sun — god rays, flare, tone-mapping stress test. */
  sun({ engine, flight, env }) {
    const cam = engine.camera;
    cam.position.set(flight.pos.x, flight.pos.y + 6, flight.pos.z + 22);
    cam.fov = 55;
    cam.updateProjectionMatrix();
    const look = env.sunDir.clone().multiplyScalar(600).add(cam.position);
    cam.lookAt(look);
  },

  /** Silhouette against the sky from below — reads the wing planform. */
  underside({ engine, ship }) {
    orbit(engine.camera, ship.position, { dist: 11, yaw: 200, pitch: -34, fov: 34 });
  },
};

/**
 * Subsystems register their own review shots from their own file, so adding a
 * camera angle never means editing this one.
 *   registerShot('fx-explosion', (ctx) => { ... })
 */
export function registerShot(name, fn) {
  if (SHOTS[name]) console.warn('[shots] overwriting', name);
  SHOTS[name] = fn;
}

export function applyShot(name, ctx) {
  const fn = SHOTS[name];
  if (!fn) { console.warn('[shots] unknown shot', name); return false; }
  fn(ctx);
  return true;
}
