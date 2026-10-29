export const INTERCEPTOR_RULES_VERSION = 1;
const EPSILON = 1e-8;
const copy = (value) => structuredClone(value);
const DAMAGE = Object.freeze({
  lance: { player: 18, ally: 3 },
  arc: { player: 5, ally: 1 },
});
const actorId = (value) =>
  typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);

// This owner observes real combat impacts and physical route distances. Its
// firing events are requests; the ordinary combat simulation decides hits.
export function createInterceptorEvent({
  targetId = 'goliath',
  allies = ['rook', 'kite', 'manta'],
  health = 240,
  escapeDistance,
} = {}) {
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
    escapeDistance <= 0
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
    targetId,
    allies: allyIds,
    health,
    escapeDistance,
    damage: DAMAGE,
    hitKinds: { arc: true, repulsor: 'lance-only' },
    cadence,
    ionInterval: 7,
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
      nextIonFire: 7,
      result: null,
    };
    keys = new Set();
  }
  reset();
  function finish(reason) {
    state.result = {
      mode: 'interceptor',
      won: reason === 'disabled',
      reason,
      health: state.health,
      maxHealth: health,
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
      if (
        state.result ||
        state.health <= 0 ||
        payload?.target !== targetId ||
        !(
          payload.kind === 'arc' ||
          (payload.kind === 'repulsor' && payload.equipment === 'lance')
        ) ||
        payload.shielded ||
        (payload.source !== 'player' && !allyIds.includes(payload.source)) ||
        (payload.equipment !== undefined &&
          payload.equipment !== null &&
          !['lance', 'arc'].includes(payload.equipment)) ||
        typeof payload.key !== 'string' ||
        !payload.key ||
        payload.key.length > 160
      )
        return [];
      const key = `${payload.source}:${payload.key}`;
      if (keys.has(key)) return [];
      const equipment = payload.equipment === 'lance' ? 'lance' : 'arc',
        player = payload.source === 'player';
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
      state.elapsed += dt;
      state.targetDistance = targetDistance;
      state.playerDistance = playerDistance;
      state.playerValid &&= playerValid;
      if (state.health <= 0) return [finish('disabled')];
      if (targetDistance >= escapeDistance) return [finish('escaped')];
      const events = [];
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
        Math.floor((state.elapsed + EPSILON - state.nextIonFire) / 7) + 1;
      if (ionDue > 0) {
        const count = Math.min(ionDue, 32),
          first = state.nextIonFire + (ionDue - count) * 7;
        for (let shot = 0; shot < count; shot++)
          events.push({
            type: 'interceptor-fire',
            payload: {
              source: targetId,
              kind: 'ion',
              elapsed: first + shot * 7,
            },
          });
        state.nextIonFire += ionDue * 7;
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
        targetId,
        allies: [...allyIds],
        maxHealth: health,
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
        !scheduled(saved.nextIonFire, 7, 7) ||
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
            !['lance', 'arc'].includes(saved.lastHit.equipment) ||
            !finite(saved.lastHit.damage) ||
            saved.lastHit.damage <= 0 ||
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
          saved.nextIonFire < saved.elapsed - EPSILON)
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
        ].map((key) => [key, copy(saved[key])]),
      );
      state.result = null;
      keys = new Set(saved.hitKeys);
      if (saved.result !== null) finish(terminal);
    },
  };
}
