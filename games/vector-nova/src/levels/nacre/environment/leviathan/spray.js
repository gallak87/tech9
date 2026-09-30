import * as T from 'three';
import { NACRE_LEVIATHAN } from './path.js';

export const LEVIATHAN_SPRAY_COUNT = 960;

/** Fixed world-space births keep water behind the moving animal. No live allocations. */
export function createLeviathanSpray(path) {
  const count = LEVIATHAN_SPRAY_COUNT;
  const positions = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const births = new Float32Array(count);
  const sizes = new Float32Array(count);
  const lives = new Float32Array(count);
  const kinds = new Float32Array(count);
  const strengths = new Float32Array(count);
  const drains = [80, 112, 145, 177, 209, 237];
  const contactTime = NACRE_LEVIATHAN.length / NACRE_LEVIATHAN.speed;
  let seed = 371;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    // Interleaving keeps both contact plumes and body shedding on Low.
    if (i % 5 < 2) {
      const contact = path.contacts[Math.floor(i / 5) % 2];
      const angle = random() * Math.PI * 2;
      const spread = 4 + random() * (i % 5 === 0 ? 6 : 13);
      positions.set(
        [
          contact.position.x + Math.cos(angle) * spread,
          contact.position.y,
          contact.position.z + Math.sin(angle) * spread,
        ],
        i * 3,
      );
      const push = 5 + random() * 14;
      velocity.set(
        [Math.cos(angle) * push, 34 + random() * 32, Math.sin(angle) * push],
        i * 3,
      );
      births[i] =
        contact.age + random() * contactTime * (i % 5 === 0 ? 0.72 : 1);
      sizes[i] = 1.8 + random() * 2.1;
      strengths[i] = i % 5 === 0 ? 0.85 : 0.5;
      lives[i] = 3.4;
    } else {
      const grouped = i % 5 !== 4;
      const drain = Math.floor(i / 5) % drains.length;
      const station = grouped
        ? drains[drain] + (random() - 0.5) * 3
        : 16 + random() * (NACRE_LEVIATHAN.length - 50);
      const delay = station / NACRE_LEVIATHAN.speed;
      const birth = T.MathUtils.lerp(
        path.contacts[0].age + delay + 0.3,
        path.contacts[1].age + delay - 0.3,
        grouped
          ? 0.24 + Math.floor(random() * 3) * 0.27 + (random() - 0.5) * 0.045
          : random(),
      );
      const frame = path.sample(path.headArc(birth) - station);
      const angle = grouped
        ? (drain % 2 ? -0.68 : 0.68) + (random() - 0.5) * 0.08
        : (random() - 0.5) * 1.7;
      const radius = 1 + 8 * (1 - (station / NACRE_LEVIATHAN.length) ** 1.5);
      const position = frame.position
        .clone()
        .addScaledVector(frame.up, -radius * Math.cos(angle))
        .addScaledVector(frame.side, radius * Math.sin(angle));
      const drift = frame.back
        .clone()
        .multiplyScalar(grouped ? -15 : -8 - random() * 12)
        .addScaledVector(frame.side, (random() - 0.5) * (grouped ? 1.3 : 7));
      drift.y = -2 - random() * 5;
      positions.set(position.toArray(), i * 3);
      velocity.set(drift.toArray(), i * 3);
      births[i] = birth;
      sizes[i] = grouped ? 1.1 + random() * 1.2 : 0.45 + random() * 0.6;
      strengths[i] = grouped ? 0.88 : 0.32;
      lives[i] = 3.6;
      kinds[i] = 1;
    }
  }
  return { positions, velocity, births, sizes, lives, kinds, strengths };
}

/** Static authoring export of the same particle trajectories used by the shader. */
export function sampleLeviathanSpray(pool, age) {
  const particles = [];
  for (let i = 0; i < pool.births.length; i++) {
    const t = age - pool.births[i],
      life = pool.lives[i];
    if (t < 0 || t > life) continue;
    const offset = i * 3;
    const p = [0, 1, 2].map(
      (axis) =>
        pool.positions[offset + axis] +
        pool.velocity[offset + axis] * t -
        (axis === 1 ? 15 * t * t : 0),
    );
    if (p[1] < 0.02) continue;
    const alpha =
      T.MathUtils.smoothstep(t, 0, 0.13) *
      (1 - T.MathUtils.smoothstep(t, life * 0.64, life)) *
      pool.strengths[i] *
      (1 - 0.55 * T.MathUtils.smoothstep(t, 0.3, 2.1) * pool.kinds[i]);
    if (alpha < 0.02) continue;
    particles.push({
      position: p,
      radius: pool.sizes[i] * 0.65,
      alpha,
      kind: pool.kinds[i] ? 'shedding' : 'contact',
    });
  }
  return particles;
}
