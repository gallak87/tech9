import { cupChampion } from '../race/cup.js';

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
  if (
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
    sessionIntent === 'race'
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
  const completionEligible = !!(validWin || trialWin || championshipWin);
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
