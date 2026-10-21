/** Feedback controller presses actual browser keyboard keys; never writes game state. */
export async function driveRoute(
  page,
  route,
  { timeout = 240000, onSample = () => {} } = {},
) {
  const held = new Set();
  const keys = async (desired) => {
    for (const k of held)
      if (!desired.has(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    for (const k of desired)
      if (!held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      }
  };
  const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
  let cursor = 0,
    lastLog = 0;
  const started = Date.now(),
    observed = {
      maxSpeed: 0,
      airborneFrames: 0,
      collisions: 0,
      maxPitch: 0,
      maxLean: 0,
      surfaces: new Set(),
    };
  try {
    while (Date.now() - started < timeout) {
      const state = await page.evaluate(() => window.__SCENE_TEST__.snapshot());
      const s = state.motion;
      if (state.state === 'results')
        return {
          vehicle: state.vehicle,
          route: route.id,
          result: state.result,
          wallSeconds: (Date.now() - started) / 1000,
          observed: { ...observed, surfaces: [...observed.surfaces] },
        };
      if (state.state !== 'driving')
        throw Error(`Unexpected game state ${state.state}`);
      observed.maxSpeed = Math.max(observed.maxSpeed, s.speed);
      observed.airborneFrames += Number(s.airborne);
      observed.collisions += Number(s.collision);
      observed.maxPitch = Math.max(observed.maxPitch, Math.abs(s.pitch));
      observed.maxLean = Math.max(observed.maxLean, Math.abs(s.lean));
      observed.surfaces.add(s.surface.kind);
      let best = Infinity;
      for (
        let i = Math.max(0, cursor - 3);
        i < Math.min(route.points.length, cursor + 32);
        i++
      ) {
        const p = route.points[i],
          d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < best) {
          best = d;
          cursor = i;
        }
      }
      const lookahead = Math.max(8, Math.abs(s.speed) * 0.85);
      let index = cursor,
        distance = 0;
      while (index < route.points.length - 1 && distance < lookahead) {
        distance += Math.hypot(
          route.points[index + 1].x - route.points[index].x,
          route.points[index + 1].z - route.points[index].z,
        );
        index++;
      }
      const p = route.points[index];
      const error = wrap(Math.atan2(p.x - s.x, -(p.z - s.z)) - s.heading);
      const turnPredict =
        ((s.steer * Math.max(2, s.speed)) /
          (state.vehicle === 'jeep' ? 2.8 : 1.55)) *
        0.18;
      const adjusted = error - turnPredict;
      const desired = new Set();
      if (adjusted > 0.027) desired.add('d');
      else if (adjusted < -0.027) desired.add('a');
      const far = route.points[Math.min(route.points.length - 1, index + 6)],
        bend = Math.abs(
          wrap(Math.atan2(far.x - p.x, -(far.z - p.z)) - s.heading),
        );
      const targetSpeed = Math.max(
        8,
        17.5 - bend * 7 - Math.max(0, best - 2) * 0.8,
      );
      if (s.speed < targetSpeed - 0.25) desired.add('w');
      else if (s.speed > targetSpeed + 1.0) desired.add('Space');
      await keys(desired);
      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        await onSample({
          state,
          cursor,
          routePoints: route.points.length,
          error,
          best,
          wallSeconds: (Date.now() - started) / 1000,
        });
      }
      await page.waitForTimeout(85);
    }
    const s = await page.evaluate(() => window.__SCENE_TEST__.snapshot());
    throw Error(
      `Route timed out: ${JSON.stringify({ state: s.state, trial: s.trial, motion: s.motion, cursor })}`,
    );
  } finally {
    await keys(new Set());
  }
}
