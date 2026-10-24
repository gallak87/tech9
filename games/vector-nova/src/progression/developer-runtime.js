// This module is absent from Electron. All seeded results use the isolated
// browser playtest profile; crossing the finish still uses ordinary physics.
export function setupDeveloperRace(
  { track, state, race, runtime, racers, timeTrial },
  options = {},
) {
  const bounded = (value, min, max, fallback) =>
    Number.isFinite(Number(value))
      ? Math.max(min, Math.min(max, Number(value)))
      : fallback;
  const finish = options.finish === true || options.finish === '1';
  const speed = bounded(options.speed ?? 75, 0, 200, 75);
  const terminal = track.closed === false ? track.finishDistance : track.length;
  Object.assign(state, {
    distance: finish
      ? terminal * (track.closed !== false && !timeTrial ? 2 : 1) -
        Math.max(15, speed)
      : bounded(options.distance ?? 0, 0, terminal - 1, 0),
    lateral: 0,
    heading: 0,
    steeringHeading: 0,
    lateralSpeed: 0,
    speed,
    energy: bounded(options.energy ?? 60, 0, 100, 60),
    boosting: false,
  });
  race.placeScenario(state.distance);
  if (finish) {
    race.valid = options.valid !== false;
    const place = Math.round(bounded(options.place ?? 1, 1, 10, 1));
    race.complete = false;
    race.elapsed = 59;
    race.history =
      track.closed !== false && !timeTrial
        ? [{ duration: 60, valid: true, rulesId: race.rulesId }]
        : [];
    race.lap = race.history.length + 1;
    race.splits = timeTrial
      ? Array.from(
          { length: race.checkpoint },
          (_, i) => ((i + 1) * 59) / Math.max(1, race.checkpoint),
        )
      : [];
    race.completedTime = 0;
    for (const [i, opponent] of (racers?.opponents ?? []).entries()) {
      const lapTimes = Array.from(
        { length: track.closed === false ? 1 : 2 },
        () => (i < place - 1 ? 50 : 65) + i,
      );
      opponent.finish = {
        lapTimes,
        lapValidity: lapTimes.map(() => true),
        totalTime: lapTimes.reduce((a, b) => a + b, 0),
        valid: true,
      };
    }
  }
  runtime.reset({ reason: 'developer-setup', state, seed: 7 });
  if (!finish && options.rivalAhead && racers?.opponents[0]) {
    const other = racers.opponents[0];
    Object.assign(other.state, {
      distance: state.distance + 35,
      lateral: 0,
      heading: 0,
      speed,
    });
    other.prev = { ...other.state };
    other.race.placeScenario(other.state.distance);
    other.runtime.reset({
      reason: 'developer-setup',
      state: other.state,
      seed: 7,
    });
  }
}
