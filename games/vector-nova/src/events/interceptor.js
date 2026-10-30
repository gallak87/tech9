import { interceptorBoss } from './interceptor-bosses.js';

export const INTERCEPTOR_RULES_VERSION = 9;
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
  const pressure = COUNTERATTACK.pressure;
  const resonance = COUNTERATTACK.resonance;
  const opening = pressure ?? resonance;
  const markers = COUNTERATTACK.markers ?? [COUNTERATTACK.marker];
  const profile = {
    ...missionProfile(difficulty),
    blasts: COUNTERATTACK.blasts[difficulty],
  };
  const FIRE_START = COUNTERATTACK.telegraph + COUNTERATTACK.turn;
  const SHOT_START = FIRE_START + (COUNTERATTACK.fireDelay ?? 0);
  const RETURN_START = FIRE_START + COUNTERATTACK.hold;
  const FACING_DURATION = RETURN_START + COUNTERATTACK.turn;
  const ATTACK_DURATION = FACING_DURATION + (opening?.breach ?? 0);
  const LOCK_TIME = pressure
    ? Math.min(COUNTERATTACK.telegraph, FIRE_START - pressure.lockLead)
    : (resonance?.lockTime ?? null);
  const ATTACK_COUNT = markers.length * 2;
  const attackLocation = (index) => ({
    lap: Math.floor(index / markers.length) + 1,
    beat: (index % markers.length) + 1,
  });
  const laneBound = 19;
  const boundedLane = (value) =>
    Math.max(-laneBound, Math.min(laneBound, value));
  const trackedLane = (value) =>
    resonance ? Math.max(-20, Math.min(20, value)) : boundedLane(value);
  const lanes = (attack, index) => {
    const first = attack.trackingLane;
    if (resonance) {
      const step = attack.countered ? resonance.deflection : resonance.laneStep;
      // Never clamp a successful outward fork back onto an edge pilot.
      return Array.from(
        { length: profile.blasts },
        (_, shot) => first + (shot % 2 === 0 ? -step : step),
      );
    }
    const direction =
      Math.abs(first) > 1 ? -Math.sign(first) : index % 2 === 0 ? 1 : -1;
    return Array.from({ length: profile.blasts }, (_, shot) =>
      boundedLane(first + shot * direction * pressure.laneStep),
    );
  };
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
      playerLateral: 0,
      targetLateral: 0,
      playerBoost: false,
      playerBoosting: false,
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
    } else if (attack && elapsed < FACING_DURATION - EPSILON) {
      phase = 'turning-forward';
      phaseElapsed = elapsed - RETURN_START;
      yaw = COUNTERATTACK.reverse
        ? Math.PI * (1 - smooth(phaseElapsed / COUNTERATTACK.turn))
        : 0;
    } else if (attack && opening && elapsed < ATTACK_DURATION - EPSILON) {
      phase = resonance
        ? attack.countered
          ? 'overload'
          : 'recovered'
        : attack.incomingHits.length
          ? 'recovered'
          : 'breach';
      phaseElapsed = elapsed - FACING_DURATION;
    }
    const exposed = phase === 'breach' || phase === 'overload';
    const pulse = resonance && attack?.boostPulses.at(-1);
    return {
      phase,
      kind: COUNTERATTACK.kind,
      yaw,
      warning: !['idle', 'breach', 'overload', 'recovered'].includes(phase),
      lap: attack
        ? Math.floor((current.counterattacks.length - 1) / markers.length) + 1
        : null,
      beat: attack
        ? ((current.counterattacks.length - 1) % markers.length) + 1
        : null,
      shots: attack?.shots ?? 0,
      blasts: profile.blasts,
      elapsed: Math.min(elapsed, ATTACK_DURATION),
      phaseElapsed: Math.max(0, phaseElapsed),
      started: attack?.started ?? null,
      ...(opening
        ? {
            ...(resonance
              ? {
                  resonance: true,
                  countered: !!attack?.countered,
                  counterProgress: attack?.countered
                    ? 1
                    : attack?.boostActive
                      ? clamp(
                          (pulse.acceptedUntil - pulse.started) /
                            resonance.boostHold,
                        )
                      : 0,
                  canCounter:
                    !!attack &&
                    !attack.countered &&
                    elapsed >= LOCK_TIME - EPSILON &&
                    elapsed < resonance.counterClose - EPSILON,
                  boostHeld: current.playerBoost,
                  counterAt: attack?.counterAt ?? null,
                }
              : {}),
            attackIndex: attack ? current.counterattacks.length - 1 : null,
            tracking: !!attack && !attack.locked && phase === 'telegraph',
            locked: !!attack?.locked,
            aimLane: attack?.locked
              ? attack.aimLanes[Math.min(attack.shots, profile.blasts - 1)]
              : (attack?.trackingLane ?? null),
            aimLanes: attack?.locked ? [...attack.aimLanes] : [],
            aimDistance: attack?.aimDistance ?? null,
            nextShot: attack
              ? Math.min(attack.shots, profile.blasts - 1)
              : null,
            fireIn:
              attack && attack.shots < profile.blasts
                ? Math.max(
                    0,
                    SHOT_START +
                      attack.shots * COUNTERATTACK.shotInterval -
                      elapsed,
                  )
                : null,
            charge: attack ? clamp(elapsed / COUNTERATTACK.telegraph) : 0,
            exposed,
            recovered: phase === 'recovered',
            ...(pressure
              ? {
                  pressureHits: attack?.incomingHits.length ?? 0,
                  recoveryAt: attack?.incomingHits[0]?.elapsed ?? null,
                }
              : {}),
            breachProgress: exposed ? clamp(phaseElapsed / opening.breach) : 0,
            core: {
              open: exposed,
              remaining: exposed ? opening.breach - phaseElapsed : 0,
              halfWidth: opening.coreHalfWidth,
              rearMin: opening.coreRearMin,
              rearMax: opening.coreRearMax,
              low: opening.coreLow,
              high: opening.coreHigh,
            },
          }
        : {}),
    };
  }
  function advanceCounterattack(
    previousElapsed,
    previousDistance,
    previousLateral,
    previousBoost,
    events,
  ) {
    while (state.counterattacks.length < ATTACK_COUNT) {
      const previous = state.counterattacks.at(-1);
      const available = previous ? previous.started + ATTACK_DURATION : 0;
      if (available > state.elapsed + EPSILON) break;
      const index = state.counterattacks.length;
      const marker =
        routeLength *
        (Math.floor(index / markers.length) + markers[index % markers.length]);
      if (state.targetDistance < marker) break;
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
      state.counterattacks.push({
        started,
        shots: 0,
        ...(opening
          ? {
              trackingLane: trackedLane(previousLateral),
              locked: false,
              aimLanes: [],
              aimDistance: null,
              cues: 0,
              ...(pressure
                ? { incomingHits: [] }
                : {
                    boostPulses: [],
                    boostActive: false,
                    countered: false,
                    counterAt: null,
                  }),
            }
          : {}),
      });
    }
    for (const [attackIndex, attack] of state.counterattacks.entries()) {
      if (opening) {
        const lockAt = attack.started + LOCK_TIME;
        if (!attack.locked) {
          const fraction =
            state.elapsed > previousElapsed
              ? clamp(
                  (Math.min(lockAt, state.elapsed) - previousElapsed) /
                    (state.elapsed - previousElapsed),
                )
              : 1;
          attack.trackingLane = trackedLane(
            previousLateral +
              (state.playerLateral - previousLateral) * fraction,
          );
          if (state.elapsed >= lockAt - EPSILON) {
            attack.locked = true;
            attack.aimLanes = lanes(attack, attackIndex);
            attack.aimDistance = Math.max(
              30,
              Math.min(240, state.targetDistance - state.playerDistance),
            );
          }
        }
        if (resonance && !attack.countered) {
          const closeAt = attack.started + resonance.counterClose;
          const validEdge =
            state.playerBoost &&
            !previousBoost &&
            state.playerBoosting &&
            previousElapsed >= lockAt - EPSILON &&
            previousElapsed < closeAt - EPSILON;
          if (validEdge) {
            attack.boostPulses.push({
              started: previousElapsed,
              acceptedUntil: previousElapsed,
            });
            attack.boostActive = true;
          }
          if (attack.boostActive) {
            const pulse = attack.boostPulses.at(-1);
            if (state.playerBoost && state.playerBoosting) {
              pulse.acceptedUntil = Math.min(state.elapsed, closeAt);
              if (
                pulse.acceptedUntil - pulse.started >=
                resonance.boostHold - EPSILON
              ) {
                attack.countered = true;
                attack.counterAt = pulse.started + resonance.boostHold;
                attack.aimLanes = lanes(attack, attackIndex);
                attack.cues |= 16;
                events.push({
                  type: 'interceptor-cue',
                  payload: {
                    source: targetId,
                    bossId,
                    cue: 'counter',
                    elapsed: attack.counterAt,
                    attackIndex,
                    ...attackLocation(attackIndex),
                  },
                });
              }
            } else attack.boostActive = false;
            if (attack.countered || state.elapsed >= closeAt - EPSILON)
              attack.boostActive = false;
          }
        }
        for (const [bit, cue, offset] of [
          [1, 'charge', 0],
          [2, 'lock', LOCK_TIME],
          [4, 'turn', COUNTERATTACK.telegraph],
          [32, 'return', RETURN_START],
          [8, 'expose', FACING_DURATION],
        ]) {
          const elapsed = attack.started + offset;
          if (!(attack.cues & bit) && elapsed <= state.elapsed + EPSILON) {
            attack.cues |= bit;
            if (
              cue !== 'expose' ||
              (resonance ? attack.countered : !attack.incomingHits.length)
            )
              events.push({
                type: 'interceptor-cue',
                payload: {
                  source: targetId,
                  bossId,
                  cue,
                  elapsed,
                  attackIndex,
                  ...attackLocation(attackIndex),
                  ...(cue === 'lock' ? { aimLanes: [...attack.aimLanes] } : {}),
                },
              });
          }
        }
      }
      while (attack.shots < profile.blasts) {
        const elapsed =
          attack.started +
          SHOT_START +
          attack.shots * COUNTERATTACK.shotInterval;
        if (elapsed > state.elapsed + EPSILON) break;
        events.push({
          type: 'interceptor-fire',
          payload: {
            source: targetId,
            kind: COUNTERATTACK.kind,
            elapsed,
            ...(opening
              ? {
                  aimLane: attack.aimLanes[attack.shots],
                  aimDistance: attack.aimDistance,
                  muzzle: resonance
                    ? [attack.shots % 2 === 0 ? -2.2 : 2.2, 0.48, 8.75]
                    : [attack.shots % 2 === 0 ? -4.8 : 4.8, 1, 18.5],
                  shotIndex: attack.shots,
                  attackIndex,
                  ...attackLocation(attackIndex),
                }
              : {}),
          },
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
  const corePoint = (point) =>
    opening &&
    Array.isArray(point) &&
    point.length === 3 &&
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= opening.coreHalfWidth &&
    point[1] >= opening.coreLow &&
    point[1] <= opening.coreHigh &&
    point[2] >= opening.coreRearMin &&
    point[2] <= opening.coreRearMax;
  const breachedAt = (elapsed, current = state) =>
    opening &&
    current.counterattacks.some(
      (attack) =>
        (resonance ? attack.countered : attack.incomingHits.length === 0) &&
        elapsed >= attack.started + FACING_DURATION - EPSILON &&
        elapsed < attack.started + ATTACK_DURATION - EPSILON,
    );
  function validResonanceAttack(attack, index, saved) {
    const lockAt = attack.started + LOCK_TIME;
    const closeAt = attack.started + resonance.counterClose;
    const locked = saved.elapsed >= lockAt - EPSILON;
    if (
      typeof attack.countered !== 'boolean' ||
      typeof attack.boostActive !== 'boolean' ||
      !Array.isArray(attack.boostPulses) ||
      attack.boostPulses.length > 64 ||
      !attack.boostPulses.every(
        (pulse, i, pulses) =>
          pulse &&
          Number.isFinite(pulse.started) &&
          pulse.started >= lockAt - EPSILON &&
          pulse.started < closeAt - EPSILON &&
          Number.isFinite(pulse.acceptedUntil) &&
          pulse.acceptedUntil >= pulse.started &&
          pulse.acceptedUntil <= Math.min(saved.elapsed, closeAt) + EPSILON &&
          (i === 0 || pulse.started > pulses[i - 1].acceptedUntil + EPSILON) &&
          (i === pulses.length - 1 ||
            pulse.acceptedUntil - pulse.started <
              resonance.boostHold - EPSILON),
      )
    )
      return false;
    const earned = attack.boostPulses.find(
      (pulse) =>
        pulse.acceptedUntil - pulse.started >= resonance.boostHold - EPSILON,
    );
    const counterAt = earned ? earned.started + resonance.boostHold : null;
    if (
      attack.countered !== !!earned ||
      attack.counterAt !== counterAt ||
      (attack.boostActive &&
        (attack.countered ||
          !saved.playerBoost ||
          !saved.playerBoosting ||
          saved.elapsed >= closeAt - EPSILON ||
          !attack.boostPulses.length ||
          Math.abs(attack.boostPulses.at(-1).acceptedUntil - saved.elapsed) >
            EPSILON))
    )
      return false;
    let expectedCues = earned ? 16 : 0;
    for (const [bit, offset] of [
      [1, 0],
      [2, LOCK_TIME],
      [4, COUNTERATTACK.telegraph],
      [32, RETURN_START],
      [8, FACING_DURATION],
    ])
      if (saved.elapsed >= attack.started + offset - EPSILON)
        expectedCues |= bit;
    if (
      !Number.isFinite(attack.trackingLane) ||
      Math.abs(attack.trackingLane) > 20 ||
      typeof attack.locked !== 'boolean' ||
      (attack.locked && !locked) ||
      (saved.result === null && attack.locked !== locked) ||
      !Number.isInteger(attack.cues) ||
      attack.cues < 0 ||
      (attack.cues & 16) !== (expectedCues & 16) ||
      (attack.cues & ~expectedCues) !== 0 ||
      (saved.result === null && attack.cues !== expectedCues) ||
      !Array.isArray(attack.aimLanes) ||
      attack.aimLanes.length !== (attack.locked ? profile.blasts : 0) ||
      (attack.locked
        ? !Number.isFinite(attack.aimDistance) ||
          attack.aimDistance < 30 ||
          attack.aimDistance > 240
        : attack.aimDistance !== null)
    )
      return false;
    return attack.aimLanes.every(
      (lane, shot) => lane === lanes(attack, index)[shot],
    );
  }
  return {
    rulesId,
    reset,
    invalidate() {
      if (!state.result) state.playerValid = false;
    },
    hit(payload) {
      // A pressure hit returns charge to the accumulator. Only an actual,
      // unshielded hit on the human pilot can deny that pilot's overload;
      // allied collisions and ordinary hazards never steal the opening.
      if (
        pressure &&
        !state.result &&
        payload?.source === targetId &&
        payload.target === 'player' &&
        payload.signature === 'goliath-pressure' &&
        !payload.shielded &&
        typeof payload.key === 'string' &&
        payload.key.length > 0 &&
        payload.key.length <= 160
      ) {
        const attack = state.counterattacks.at(-1);
        const elapsed = attack ? state.elapsed - attack.started : 0;
        if (
          attack &&
          elapsed >= FIRE_START - EPSILON &&
          elapsed < FACING_DURATION - EPSILON &&
          attack.incomingHits.length < profile.blasts &&
          !attack.incomingHits.some((hit) => hit.key === payload.key)
        ) {
          const first = attack.incomingHits.length === 0;
          attack.incomingHits.push({
            key: payload.key,
            elapsed: state.elapsed,
            signature: payload.signature,
          });
          if (first) {
            attack.cues |= 16;
            return [
              {
                type: 'interceptor-cue',
                payload: {
                  source: targetId,
                  bossId,
                  cue: 'recover',
                  elapsed: state.elapsed,
                  attackIndex: state.counterattacks.length - 1,
                  ...attackLocation(state.counterattacks.length - 1),
                  ...(Array.isArray(payload.position) &&
                  payload.position.length === 3 &&
                  payload.position.every(Number.isFinite)
                    ? { position: [...payload.position] }
                    : {}),
                },
              },
            ];
          }
        }
        return [];
      }
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
      const pulseCore =
        player &&
        equipment === 'repulsor' &&
        Math.abs(state.playerLateral - state.targetLateral) <=
          opening?.coreHalfWidth &&
        state.targetDistance - state.playerDistance >= 0 &&
        state.targetDistance - state.playerDistance <= 38;
      const weakPoint =
        !!breachedAt(state.elapsed) &&
        (equipment === 'repulsor' ? pulseCore : corePoint(payload.hitLocal));
      const baseDamage = DAMAGE[equipment][player ? 'player' : 'ally'];
      const armored = !!opening?.armorPlayer && !weakPoint;
      const damage = Math.min(
        state.health,
        weakPoint
          ? player
            ? baseDamage * opening.coreMultiplier
            : baseDamage + 1
          : armored && player
            ? opening.armorPlayer[equipment]
            : baseDamage,
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
        ...(armored ? { armored: true } : {}),
        ...(weakPoint
          ? {
              weakPoint: true,
              ...(equipment === 'repulsor'
                ? {
                    corePulse: {
                      lateral: state.playerLateral - state.targetLateral,
                      gap: state.targetDistance - state.playerDistance,
                    },
                  }
                : { hitLocal: [...payload.hitLocal] }),
            }
          : {}),
      };
      return [
        {
          type: 'interceptor-hit',
          payload: {
            source: payload.source,
            bossId,
            target: targetId,
            kind: payload.kind,
            equipment,
            damage,
            health: state.health,
            key: payload.key,
            elapsed: state.elapsed,
            ...(armored ? { armored: true } : {}),
            ...(weakPoint ? { weakPoint: true } : {}),
            ...(Array.isArray(payload.position) &&
            payload.position.length === 3 &&
            payload.position.every(Number.isFinite)
              ? { position: [...payload.position] }
              : {}),
          },
        },
      ];
    },
    step(
      dt,
      {
        targetDistance,
        playerDistance,
        playerValid = true,
        playerLateral = 0,
        targetLateral = 0,
        playerBoost = false,
        playerBoosting = false,
      } = {},
    ) {
      if (!Number.isFinite(dt) || dt < 0)
        throw new Error('Invalid Interceptor timestep');
      if (dt === 0 || state.result) return [];
      if (
        !Number.isFinite(targetDistance) ||
        !Number.isFinite(playerDistance) ||
        !Number.isFinite(playerLateral) ||
        !Number.isFinite(targetLateral) ||
        typeof playerValid !== 'boolean' ||
        typeof playerBoost !== 'boolean' ||
        typeof playerBoosting !== 'boolean' ||
        (playerBoosting && !playerBoost) ||
        !Number.isFinite(state.elapsed + dt)
      )
        throw new Error('Interceptor requires finite physical progress');
      const previousElapsed = state.elapsed;
      const previousDistance = state.targetDistance;
      const previousLateral = state.playerLateral;
      const previousBoost = state.playerBoost;
      state.elapsed += dt;
      state.targetDistance = targetDistance;
      state.playerDistance = playerDistance;
      state.playerLateral = playerLateral;
      state.targetLateral = targetLateral;
      state.playerBoost = playerBoost;
      state.playerBoosting = playerBoosting;
      state.playerValid &&= playerValid;
      if (state.health <= 0) return [finish('disabled')];
      if (targetDistance >= escapeDistance) return [finish('escaped')];
      const events = [];
      advanceCounterattack(
        previousElapsed,
        previousDistance,
        previousLateral,
        previousBoost,
        events,
      );
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
        !Number.isFinite(saved.playerLateral) ||
        !Number.isFinite(saved.targetLateral) ||
        typeof saved.playerBoost !== 'boolean' ||
        typeof saved.playerBoosting !== 'boolean' ||
        (saved.playerBoosting && !saved.playerBoost) ||
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
        saved.counterattacks.length > ATTACK_COUNT ||
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
          if (pressure) {
            if (
              !Array.isArray(attack.incomingHits) ||
              attack.incomingHits.length > attack.shots ||
              new Set(attack.incomingHits.map((hit) => hit?.key)).size !==
                attack.incomingHits.length ||
              !attack.incomingHits.every(
                (hit) =>
                  hit &&
                  typeof hit.key === 'string' &&
                  hit.key.length > 0 &&
                  hit.key.length <= 160 &&
                  hit.signature === 'goliath-pressure' &&
                  Number.isFinite(hit.elapsed) &&
                  hit.elapsed <= saved.elapsed + EPSILON &&
                  hit.elapsed >= attack.started + FIRE_START - EPSILON &&
                  hit.elapsed < attack.started + FACING_DURATION - EPSILON,
              )
            )
              return false;
            const locked =
              saved.elapsed >= attack.started + LOCK_TIME - EPSILON;
            let expectedCues = 0;
            for (const [bit, offset] of [
              [1, 0],
              [2, LOCK_TIME],
              [4, COUNTERATTACK.telegraph],
              [32, RETURN_START],
              [8, FACING_DURATION],
            ])
              if (saved.elapsed >= attack.started + offset - EPSILON)
                expectedCues |= bit;
            if (attack.incomingHits.length) expectedCues |= 16;
            if (
              !Number.isFinite(attack.trackingLane) ||
              Math.abs(attack.trackingLane) > laneBound ||
              typeof attack.locked !== 'boolean' ||
              (attack.locked && !locked) ||
              (saved.result === null && attack.locked !== locked) ||
              !Number.isInteger(attack.cues) ||
              attack.cues < 0 ||
              (attack.cues & 16) !== (expectedCues & 16) ||
              (attack.cues & ~expectedCues) !== 0 ||
              (saved.result === null && attack.cues !== expectedCues) ||
              !Array.isArray(attack.aimLanes) ||
              attack.aimLanes.length !== (attack.locked ? profile.blasts : 0) ||
              (attack.locked
                ? !Number.isFinite(attack.aimDistance) ||
                  attack.aimDistance < 30 ||
                  attack.aimDistance > 240
                : attack.aimDistance !== null)
            )
              return false;
            const first = attack.trackingLane;
            const direction =
              Math.abs(first) > 1
                ? -Math.sign(first)
                : index % 2 === 0
                  ? 1
                  : -1;
            if (
              attack.aimLanes.some(
                (lane, shot) =>
                  lane !==
                  boundedLane(first + shot * direction * pressure.laneStep),
              )
            )
              return false;
          }
          if (resonance && !validResonanceAttack(attack, index, saved))
            return false;
          const due = Math.max(
            0,
            Math.min(
              profile.blasts,
              Math.floor(
                (saved.elapsed - attack.started - SHOT_START + EPSILON) /
                  COUNTERATTACK.shotInterval,
              ) + 1,
            ),
          );
          return saved.result === null
            ? attack.shots === due
            : attack.shots <= due;
        }) ||
        !Object.entries(counterattackSnapshot(saved)).every(([key, value]) =>
          value && typeof value === 'object'
            ? JSON.stringify(saved.counterattack?.[key]) ===
              JSON.stringify(value)
            : saved.counterattack?.[key] === value,
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
              (saved.lastHit.weakPoint
                ? saved.lastHit.source === 'player'
                  ? DAMAGE[saved.lastHit.equipment].player *
                    (opening?.coreMultiplier ?? 1)
                  : DAMAGE[saved.lastHit.equipment].ally + 1
                : opening?.armorPlayer && saved.lastHit.source === 'player'
                  ? opening.armorPlayer[saved.lastHit.equipment]
                  : DAMAGE[saved.lastHit.equipment][
                      saved.lastHit.source === 'player' ? 'player' : 'ally'
                    ]) ||
            (!!opening?.armorPlayer && !saved.lastHit.weakPoint
              ? saved.lastHit.armored !== true
              : saved.lastHit.armored !== undefined) ||
            (saved.lastHit.weakPoint !== undefined &&
              (saved.lastHit.weakPoint !== true ||
                !breachedAt(saved.lastHit.elapsed, saved) ||
                (saved.lastHit.equipment === 'repulsor'
                  ? saved.lastHit.source !== 'player' ||
                    !Number.isFinite(saved.lastHit.corePulse?.lateral) ||
                    Math.abs(saved.lastHit.corePulse.lateral) >
                      opening.coreHalfWidth ||
                    !Number.isFinite(saved.lastHit.corePulse?.gap) ||
                    saved.lastHit.corePulse.gap < 0 ||
                    saved.lastHit.corePulse.gap > 38
                  : !corePoint(saved.lastHit.hitLocal)))) ||
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
          'playerLateral',
          'targetLateral',
          'playerBoost',
          'playerBoosting',
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
