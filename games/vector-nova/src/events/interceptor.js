import { interceptorBoss } from './interceptor-bosses.js';

export const INTERCEPTOR_RULES_VERSION = 4;
const EPSILON = 1e-8;
const copy = (value) => structuredClone(value);
const MISSION_PROFILES = Object.freeze({
  easy: Object.freeze({ difficulty: 'easy', maxHealth: 450, blasts: 1 }),
  medium: Object.freeze({ difficulty: 'medium', maxHealth: 700, blasts: 2 }),
  hard: Object.freeze({ difficulty: 'hard', maxHealth: 950, blasts: 2 }),
});
const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export function missionProfile(difficulty = 'medium') {
  if (!Object.hasOwn(MISSION_PROFILES, difficulty))
    throw new Error('Invalid Interceptor difficulty');
  return MISSION_PROFILES[difficulty];
}
const DAMAGE = Object.freeze({
  lance: { player: 18, ally: 3 },
  arc: { player: 5, ally: 1 },
  repulsor: { player: 12, ally: 2 },
});
const damageKind = (payload) => {
  if (payload?.kind === 'repulsor' && payload.equipment === 'lance')
    return 'lance';
  if (
    ['arc', 'repulsor'].includes(payload?.kind) &&
    (payload.equipment == null || payload.equipment === payload.kind)
  )
    return payload.kind;
  return null;
};
const actorId = (value) =>
  typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);

// This owner observes real combat impacts and physical route distances. Its
// firing events are requests; the ordinary combat simulation decides hits.
export function createInterceptorEvent({
  bossId = 'goliath',
  targetId = bossId,
  allies = ['rook', 'kite', 'manta'],
  difficulty = 'medium',
  health = missionProfile(difficulty).maxHealth,
  escapeDistance,
  routeLength = escapeDistance / 2,
} = {}) {
  const boss = interceptorBoss(bossId);
  const COUNTERATTACK = boss.attack;
  const profile = {
    ...missionProfile(difficulty),
    blasts: COUNTERATTACK.blasts[difficulty],
  };
  const FIRE_START = COUNTERATTACK.telegraph + COUNTERATTACK.turn;
  const RETURN_START = FIRE_START + COUNTERATTACK.hold;
  const ATTACK_DURATION = RETURN_START + COUNTERATTACK.turn;
  const ionInterval = boss.countermeasureInterval;
  if (
    !actorId(targetId) ||
    targetId === 'player' ||
    !Array.isArray(allies) ||
    allies.length > 3 ||
    new Set(allies).size !== allies.length ||
    !allies.every((id) => actorId(id) && id !== targetId && id !== 'player') ||
    !Number.isFinite(health) ||
    health <= 0 ||
    health > 10000 ||
    !Number.isFinite(escapeDistance) ||
    escapeDistance <= 0 ||
    !Number.isFinite(routeLength) ||
    routeLength <= 0
  )
    throw new Error('Invalid Interceptor mission');
  const allyIds = [...allies];
  const cadence = allyIds.map((source, index) => ({
    source,
    first: 3 + index * 1.5,
    interval: 5,
  }));
  const rulesId = JSON.stringify({
    version: INTERCEPTOR_RULES_VERSION,
    bossId,
    targetName: boss.name,
    bossKind: boss.kind,
    targetId,
    allies: allyIds,
    health,
    difficulty,
    escapeDistance,
    routeLength,
    damage: DAMAGE,
    hitKinds: { arc: ['arc'], repulsor: ['lance', 'repulsor'] },
    cadence,
    ionInterval,
    counterattack: { ...COUNTERATTACK, blasts: profile.blasts, laps: 2 },
  });
  let state, keys;
  function reset() {
    state = {
      elapsed: 0,
      health,
      playerValid: true,
      playerDamage: 0,
      alliedDamage: 0,
      hits: 0,
      playerHits: 0,
      alliedHits: 0,
      targetDistance: 0,
      playerDistance: 0,
      lastHit: null,
      nextAllyFire: cadence.map((entry) => entry.first),
      nextIonFire: ionInterval,
      counterattacks: [],
      result: null,
    };
    keys = new Set();
  }
  reset();
  function counterattackSnapshot(current = state) {
    const attack = current.counterattacks.at(-1);
    const elapsed = attack ? Math.max(0, current.elapsed - attack.started) : 0;
    let phase = 'idle',
      yaw = 0,
      phaseElapsed = 0;
    if (attack && elapsed < COUNTERATTACK.telegraph - EPSILON) {
      phase = 'telegraph';
      phaseElapsed = elapsed;
    } else if (attack && elapsed < FIRE_START - EPSILON) {
      phase = 'turning-back';
      phaseElapsed = elapsed - COUNTERATTACK.telegraph;
      yaw = COUNTERATTACK.reverse
        ? Math.PI * smooth(phaseElapsed / COUNTERATTACK.turn)
        : 0;
    } else if (attack && elapsed < RETURN_START - EPSILON) {
      phase = 'firing';
      phaseElapsed = elapsed - FIRE_START;
      yaw = COUNTERATTACK.reverse ? Math.PI : 0;
    } else if (attack && elapsed < ATTACK_DURATION - EPSILON) {
      phase = 'turning-forward';
      phaseElapsed = elapsed - RETURN_START;
      yaw = COUNTERATTACK.reverse
        ? Math.PI * (1 - smooth(phaseElapsed / COUNTERATTACK.turn))
        : 0;
    }
    return {
      phase,
      kind: COUNTERATTACK.kind,
      yaw,
      warning: phase !== 'idle',
      lap: attack ? current.counterattacks.length : null,
      shots: attack?.shots ?? 0,
      blasts: profile.blasts,
      elapsed: Math.min(elapsed, ATTACK_DURATION),
      phaseElapsed: Math.max(0, phaseElapsed),
      started: attack?.started ?? null,
    };
  }
  function advanceCounterattack(previousElapsed, previousDistance, events) {
    while (state.counterattacks.length < 2) {
      const previous = state.counterattacks.at(-1);
      const available = previous ? previous.started + ATTACK_DURATION : 0;
      if (available > state.elapsed + EPSILON) break;
      const marker =
        routeLength * (state.counterattacks.length + COUNTERATTACK.marker);
      if (state.targetDistance < marker) break;
      // Locate the physical marker within this tick. Distance may subsequently
      // fall back; consuming the marker once keeps a reverse crossing harmless.
      const fraction =
        previousDistance < marker && state.targetDistance > previousDistance
          ? clamp(
              (marker - previousDistance) /
                (state.targetDistance - previousDistance),
            )
          : 0;
      const started = Math.max(
        available,
        previousElapsed + (state.elapsed - previousElapsed) * fraction,
      );
      state.counterattacks.push({ started, shots: 0 });
    }
    for (const attack of state.counterattacks) {
      while (attack.shots < profile.blasts) {
        const elapsed =
          attack.started +
          FIRE_START +
          attack.shots * COUNTERATTACK.shotInterval;
        if (elapsed > state.elapsed + EPSILON) break;
        events.push({
          type: 'interceptor-fire',
          payload: { source: targetId, kind: COUNTERATTACK.kind, elapsed },
        });
        attack.shots++;
      }
    }
  }
  function finish(reason) {
    state.result = {
      mode: 'interceptor',
      bossId,
      targetId,
      targetName: boss.name,
      bossKind: boss.kind,
      won: reason === 'disabled',
      reason,
      health: state.health,
      maxHealth: health,
      difficulty,
      elapsed: state.elapsed,
      time: state.elapsed,
      playerValid: state.playerValid,
      playerDamage: state.playerDamage,
      alliedDamage: state.alliedDamage,
      hits: state.hits,
      playerHits: state.playerHits,
      alliedHits: state.alliedHits,
      escapeProgress: Math.min(
        1,
        Math.max(0, state.targetDistance / escapeDistance),
      ),
      targetDistance: state.targetDistance,
      escapeDistance,
    };
    return { type: 'interceptor-complete', payload: copy(state.result) };
  }
  return {
    rulesId,
    reset,
    invalidate() {
      if (!state.result) state.playerValid = false;
    },
    hit(payload) {
      const equipment = damageKind(payload);
      if (
        state.result ||
        state.health <= 0 ||
        payload?.target !== targetId ||
        !equipment ||
        payload.shielded ||
        (payload.source !== 'player' && !allyIds.includes(payload.source)) ||
        typeof payload.key !== 'string' ||
        !payload.key ||
        payload.key.length > 160
      )
        return [];
      const key = `${payload.source}:${payload.key}`;
      if (keys.has(key)) return [];
      const player = payload.source === 'player';
      const damage = Math.min(
        state.health,
        DAMAGE[equipment][player ? 'player' : 'ally'],
      );
      keys.add(key);
      state.health -= damage;
      state.hits++;
      if (player) {
        state.playerDamage += damage;
        state.playerHits++;
      } else {
        state.alliedDamage += damage;
        state.alliedHits++;
      }
      state.lastHit = {
        source: payload.source,
        equipment,
        damage,
        elapsed: state.elapsed,
      };
      return [
        {
          type: 'interceptor-hit',
          payload: {
            source: payload.source,
            target: targetId,
            kind: payload.kind,
            equipment,
            damage,
            health: state.health,
            key: payload.key,
            elapsed: state.elapsed,
          },
        },
      ];
    },
    step(dt, { targetDistance, playerDistance, playerValid = true } = {}) {
      if (!Number.isFinite(dt) || dt < 0)
        throw new Error('Invalid Interceptor timestep');
      if (dt === 0 || state.result) return [];
      if (
        !Number.isFinite(targetDistance) ||
        !Number.isFinite(playerDistance) ||
        typeof playerValid !== 'boolean' ||
        !Number.isFinite(state.elapsed + dt)
      )
        throw new Error('Interceptor requires finite physical progress');
      const previousElapsed = state.elapsed;
      const previousDistance = state.targetDistance;
      state.elapsed += dt;
      state.targetDistance = targetDistance;
      state.playerDistance = playerDistance;
      state.playerValid &&= playerValid;
      if (state.health <= 0) return [finish('disabled')];
      if (targetDistance >= escapeDistance) return [finish('escaped')];
      const events = [];
      advanceCounterattack(previousElapsed, previousDistance, events);
      for (const [index, entry] of cadence.entries()) {
        // A stalled render must not produce an unbounded catch-up volley. Live
        // sessions use 120 Hz; excessive missed opportunities remain misses.
        const due =
          Math.floor(
            (state.elapsed + EPSILON - state.nextAllyFire[index]) /
              entry.interval,
          ) + 1;
        if (due > 0) {
          const count = Math.min(due, 32),
            first = state.nextAllyFire[index] + (due - count) * entry.interval;
          for (let shot = 0; shot < count; shot++)
            events.push({
              type: 'interceptor-fire',
              payload: {
                source: entry.source,
                kind: 'lance',
                elapsed: first + shot * entry.interval,
              },
            });
          state.nextAllyFire[index] += due * entry.interval;
        }
      }
      const ionDue =
        ionInterval === null
          ? 0
          : Math.floor(
              (state.elapsed + EPSILON - state.nextIonFire) / ionInterval,
            ) + 1;
      if (ionDue > 0) {
        const count = Math.min(ionDue, 32),
          first = state.nextIonFire + (ionDue - count) * ionInterval;
        for (let shot = 0; shot < count; shot++) {
          const elapsed = first + shot * ionInterval;
          if (
            state.counterattacks.some(
              (attack) =>
                elapsed >= attack.started - EPSILON &&
                elapsed < attack.started + ATTACK_DURATION - EPSILON,
            )
          )
            continue;
          events.push({
            type: 'interceptor-fire',
            payload: {
              source: targetId,
              kind: 'ion',
              elapsed,
            },
          });
        }
        state.nextIonFire += ionDue * ionInterval;
      }
      events.sort(
        (a, b) =>
          a.payload.elapsed - b.payload.elapsed ||
          a.payload.source.localeCompare(b.payload.source),
      );
      return events;
    },
    snapshot() {
      const gap = state.targetDistance - state.playerDistance;
      return {
        version: INTERCEPTOR_RULES_VERSION,
        rulesId,
        ...copy(state),
        bossId,
        targetName: boss.name,
        bossKind: boss.kind,
        targetId,
        allies: [...allyIds],
        maxHealth: health,
        difficulty,
        routeLength,
        counterattack: counterattackSnapshot(),
        escapeDistance,
        escapeProgress: Math.min(
          1,
          Math.max(0, state.targetDistance / escapeDistance),
        ),
        gap: Number.isFinite(gap)
          ? gap
          : Math.sign(state.targetDistance) * Number.MAX_VALUE,
        hitKeys: [...keys],
      };
    },
    restore(saved) {
      const finite = (value) => Number.isFinite(value) && value >= 0;
      const scheduled = (value, first, interval) =>
        finite(value) &&
        value >= first &&
        Math.abs(
          (value - first) / interval - Math.round((value - first) / interval),
        ) < EPSILON;
      if (
        saved?.version !== INTERCEPTOR_RULES_VERSION ||
        saved.rulesId !== rulesId ||
        !finite(saved.elapsed) ||
        !finite(saved.health) ||
        saved.health > health ||
        typeof saved.playerValid !== 'boolean' ||
        !finite(saved.playerDamage) ||
        !finite(saved.alliedDamage) ||
        Math.abs(
          saved.playerDamage + saved.alliedDamage + saved.health - health,
        ) > EPSILON ||
        ![saved.hits, saved.playerHits, saved.alliedHits].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ) ||
        saved.hits !== saved.playerHits + saved.alliedHits ||
        !Number.isFinite(saved.targetDistance) ||
        !Number.isFinite(saved.playerDistance) ||
        !Array.isArray(saved.nextAllyFire) ||
        saved.nextAllyFire.length !== allyIds.length ||
        !saved.nextAllyFire.every((value, index) =>
          scheduled(value, cadence[index].first, 5),
        ) ||
        (ionInterval === null
          ? saved.nextIonFire !== null
          : !scheduled(saved.nextIonFire, ionInterval, ionInterval)) ||
        saved.bossId !== bossId ||
        saved.targetId !== targetId ||
        saved.targetName !== boss.name ||
        saved.bossKind !== boss.kind ||
        saved.difficulty !== difficulty ||
        saved.maxHealth !== health ||
        saved.routeLength !== routeLength ||
        !Array.isArray(saved.counterattacks) ||
        saved.counterattacks.length > 2 ||
        !saved.counterattacks.every((attack, index, attacks) => {
          if (
            !attack ||
            !finite(attack.started) ||
            attack.started > saved.elapsed + EPSILON ||
            !Number.isInteger(attack.shots) ||
            attack.shots < 0 ||
            attack.shots > profile.blasts ||
            (index > 0 &&
              attack.started <
                attacks[index - 1].started + ATTACK_DURATION - EPSILON)
          )
            return false;
          const due = Math.max(
            0,
            Math.min(
              profile.blasts,
              Math.floor(
                (saved.elapsed - attack.started - FIRE_START + EPSILON) /
                  COUNTERATTACK.shotInterval,
              ) + 1,
            ),
          );
          return saved.result === null
            ? attack.shots === due
            : attack.shots <= due;
        }) ||
        !Object.entries(counterattackSnapshot(saved)).every(
          ([key, value]) => saved.counterattack?.[key] === value,
        ) ||
        !Array.isArray(saved.hitKeys) ||
        saved.hitKeys.length !== saved.hits ||
        new Set(saved.hitKeys).size !== saved.hitKeys.length ||
        !saved.hitKeys.every(
          (key) =>
            typeof key === 'string' && key.length > 0 && key.length <= 225,
        )
      )
        throw new Error('Incompatible Interceptor snapshot');
      if (
        (saved.hits === 0) !== (saved.lastHit === null) ||
        (saved.lastHit !== null &&
          (!saved.lastHit ||
            !['player', ...allyIds].includes(saved.lastHit.source) ||
            !Object.hasOwn(DAMAGE, saved.lastHit.equipment) ||
            !finite(saved.lastHit.damage) ||
            saved.lastHit.damage <= 0 ||
            saved.lastHit.damage >
              DAMAGE[saved.lastHit.equipment][
                saved.lastHit.source === 'player' ? 'player' : 'ally'
              ] ||
            !finite(saved.lastHit.elapsed) ||
            saved.lastHit.elapsed > saved.elapsed + EPSILON))
      )
        throw new Error('Invalid Interceptor hit state');
      const terminal =
        saved.health === 0
          ? 'disabled'
          : saved.targetDistance >= escapeDistance
            ? 'escaped'
            : null;
      if (
        saved.result === null &&
        ((saved.health > 0 && terminal === 'escaped') ||
          saved.nextAllyFire.some((value) => value < saved.elapsed - EPSILON) ||
          (ionInterval !== null && saved.nextIonFire < saved.elapsed - EPSILON))
      )
        throw new Error('Invalid Interceptor schedule');
      if (saved.result !== null && saved.result?.reason !== terminal)
        throw new Error('Invalid Interceptor result');
      state = Object.fromEntries(
        [
          'elapsed',
          'health',
          'playerValid',
          'playerDamage',
          'alliedDamage',
          'hits',
          'playerHits',
          'alliedHits',
          'targetDistance',
          'playerDistance',
          'lastHit',
          'nextAllyFire',
          'nextIonFire',
          'counterattacks',
        ].map((key) => [key, copy(saved[key])]),
      );
      state.result = null;
      keys = new Set(saved.hitKeys);
      if (saved.result !== null) finish(terminal);
    },
  };
}
