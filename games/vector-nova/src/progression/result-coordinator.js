import { cupChampion } from '../race/cup.js';
import { raceProgressPoints } from './profile.js';

const freestylePositions = { Gold: 1, Silver: 2, Bronze: 3, Complete: 10 };

export function freestyleProgressPosition(data) {
  const complete =
    data?.mode === 'freestyle' &&
    data.playerValid === true &&
    Object.hasOwn(freestylePositions, data.medal) &&
    Number.isInteger(data.landed) &&
    data.landed >= 0 &&
    data.landed <= 5 &&
    Array.isArray(data.legs) &&
    data.legs.length === 5 &&
    [...data.legs].every(
      (leg, index) =>
        leg?.id === `transfer-${index + 1}` && typeof leg.landed === 'boolean',
    ) &&
    data.legs.filter((leg) => leg.landed).length === data.landed;
  return complete ? freestylePositions[data.medal] : null;
}

// Store APIs own validation, idempotence and storage-failure behavior. This
// coordinator sequences durable awards without owning any presentation state.
export function settleRaceResult(
  { profileStore, cupStore, cupCollection },
  data,
  { sessionIntent, sessionCup, attemptId, getShipId } = {},
) {
  const rewards = [];
  let celebration = null;
  const player = data.standings?.find((row) => row.id === 'player');
  const freestylePosition =
    sessionIntent === 'freestyle' ? freestyleProgressPosition(data) : null;
  const freestyleComplete = freestylePosition != null;
  const interceptorComplete =
    data.mode === 'interceptor' &&
    sessionIntent === 'interceptor' &&
    !!data.playerValid;
  const eliminatorComplete =
    data.mode === 'eliminator' &&
    sessionIntent === 'eliminator' &&
    !!data.playerValid &&
    !!player?.valid &&
    !!player?.finished &&
    raceProgressPoints(player.position) > 0;
  if (data.mode === 'freestyle' && sessionIntent === 'freestyle') {
    rewards.push(
      ...profileStore.recordRace({
        id: attemptId,
        position: freestylePosition,
        valid: freestyleComplete,
        finished: freestyleComplete,
      }),
    );
  } else if (data.mode === 'interceptor' && sessionIntent === 'interceptor') {
    rewards.push(
      ...profileStore.recordRace({
        id: attemptId,
        position: data.won ? 1 : 10,
        valid: interceptorComplete,
        finished: true,
      }),
    );
  } else if (
    data.mode === 'cup' &&
    sessionCup &&
    data.final &&
    cupStore.finish(data)
  ) {
    const saved = cupStore.snapshot().state;
    rewards.push(
      ...profileStore.recordRace({
        id: `${saved.runId}:${saved.eventIndex}`,
        position: player?.position,
        valid: !!player?.valid,
        finished: !!player?.finished,
      }),
    );
    if (cupChampion(saved)) {
      rewards.push(...profileStore.recordCup(saved.cupId));
      celebration = {
        fresh: cupCollection.award(saved),
        runId: saved.runId,
      };
    }
  } else if (
    data.mode !== 'cup' &&
    data.mode !== 'time-trial' &&
    ['race', 'eliminator'].includes(sessionIntent)
  ) {
    rewards.push(
      ...profileStore.recordRace({
        id: attemptId,
        position: player?.position,
        valid: !!data.playerValid && !!player?.valid,
        finished: !!player?.finished,
      }),
    );
  }
  const validWin =
    (sessionIntent === 'race' || data.mode === 'cup') &&
    !!data.playerValid &&
    !!player?.valid &&
    !!player?.finished &&
    player.position === 1;
  const trialWin =
    data.mode === 'time-trial' && data.playerValid && data.improved;
  const championshipWin =
    data.mode === 'cup' && data.final && cupChampion(cupStore.snapshot().state);
  const completionEligible = !!(
    validWin ||
    trialWin ||
    championshipWin ||
    freestyleComplete ||
    interceptorComplete ||
    eliminatorComplete
  );
  if (completionEligible)
    profileStore.queueCompletion(data.shipId ?? getShipId?.());
  // Eligibility is deliberately independent of whether queuing was new: a
  // later presentation callback must still be able to reveal a pending finale.
  return { rewards, celebration, completionEligible };
}

export function settleTrialRecord(
  profileStore,
  data,
  { trackId, getShipId } = {},
) {
  const completionEligible = !!(data.playerValid && data.improved);
  const rewards = profileStore.recordTrial(
    trackId,
    data.playerValid && data.improved,
  );
  if (completionEligible)
    profileStore.queueCompletion(data.shipId ?? getShipId?.());
  return { rewards, completionEligible };
}
