import { pathToFileURL } from 'node:url';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import createLevel from '../src/levels/shatterline/index.js';
import { getRacerControl } from '../src/race/racers.js';
import { VEHICLE_HULL } from '../src/physics/hull.js';

const dt = 1 / 120;
const wrap = (n, period) =>
  ((((n + period / 2) % period) + period) % period) - period / 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function tubeSurfaceFailures(report) {
  return report.rows.flatMap((row) => {
    const failures = [];
    if ((row.brakeHold ?? row.unsteered) ? !row.stopped : !row.complete)
      failures.push('incomplete');
    if (row.assist) {
      if (!row.nudges) failures.push('no physical exit-nudge contact');
      if (row.elapsed > 6 || row.maximumStallSeconds > 0.5)
        failures.push('prolonged collector slowdown');
    }
    if (row.maximumPoseExcess > VEHICLE_HULL.hover / 2)
      failures.push('pose step exceeds integrated travel');
    if (!row.supported) failures.push('lost support');
    if (Object.keys(row.overlaps).length) failures.push('hull penetration');
    if (
      row.rotation &&
      (!row.seamCrossed || !row.ceiling || row.impacts.length)
    )
      failures.push('closed steering or seam contact');
    if (
      row.sequence &&
      (!row.ceiling ||
        !row.upright ||
        row.impacts.length ||
        row.tubePassages.some(
          (passage) =>
            !passage.entered ||
            !passage.exited ||
            !(passage.entryUpY < -0.7 && passage.exitUpY < -0.7),
        ))
    )
      failures.push('normal sequence');
    return failures.map((reason) => row.id + ': ' + reason);
  });
}

/** Ordinary supported inputs against the production surface and its actual solids. */
export async function inspectTubeSurfaces({
  progress = () => {},
  caseIds = null,
  suite = 'surfaces',
} = {}) {
  const level = createLevel(),
    track = level.createTrack();
  if (track.tubes?.length !== 2 || !track.overturn)
    throw new Error(
      'The Overturn verification requires two ordered tubes and its complete district bounds',
    );
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  if (!['surfaces', 'collector-assist'].includes(suite))
    throw new Error('Unknown tube inspection suite: ' + suite);
  const cases =
    suite === 'collector-assist'
      ? track.tubes.flatMap((tube) => [
          ...[-1, 1].flatMap((side) => [
            {
              id:
                tube.id +
                '-assist-wall-' +
                (side < 0 ? 'negative' : 'positive'),
              tube,
              fraction: side * 0.5,
              assist: true,
            },
            {
              id:
                tube.id +
                '-assist-seam-' +
                (side < 0 ? 'negative' : 'positive'),
              tube,
              fraction: side * 0.9999,
              assist: true,
            },
          ]),
          { id: tube.id + '-brake-hold', tube, fraction: 0.5, brakeHold: true },
        ])
      : [
          { id: 'two-tube-sequence', sequence: true },
          ...track.tubes.flatMap((tube, index) => [
            { id: tube.id + '-rotate', tube, rotation: index ? -1 : 1 },
            { id: tube.id + '-wall', tube, fraction: 0.5 },
            { id: tube.id + '-seam', tube, fraction: index ? -0.9999 : 0.9999 },
            ...(index
              ? []
              : [
                  {
                    id: tube.id + '-brake-hold',
                    tube,
                    fraction: 0.5,
                    brakeHold: true,
                  },
                ]),
          ]),
        ];
  const rows = [];
  try {
    for (const entry of cases.filter(
      (candidate) => !caseIds || caseIds.includes(candidate.id),
    )) {
      const tube = entry.tube ?? track.tubes[0],
        circumference = 2 * Math.PI * tube.radius;
      const runtime = level.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
      });
      const state = {
        ...createVehicleState(entry.sequence ? 'needle' : 'kestrel'),
        speed: entry.sequence
          ? getVehiclePace('needle', track.pace).boostSpeed
          : entry.rotation
            ? 100
            : 155,
        distance: entry.sequence
          ? track.overturn.start - 10
          : entry.rotation
            ? tube.entryEnd + 8
            : tube.exitStart - 10,
        lateral: ((entry.fraction ?? 0) * circumference) / 2,
      };
      let travelled = 0,
        previousLateral = state.lateral,
        previousPosition = null;
      let maximumPoseStep = 0,
        ceiling = false,
        supported = true,
        seamCrossed = false,
        closed = true;
      let firstContactTick = null,
        stoppedTicks = 0,
        stallTicks = 0,
        maximumStallSeconds = 0;
      let maximumPoseExcess = 0,
        minimumPostContactProgress = Infinity,
        nudges = 0;
      const tubePassages = track.tubes.map((descriptor) => ({
        id: descriptor.id,
        entered: false,
        exited: false,
        entryUpY: null,
        exitUpY: null,
      }));
      const impacts = [],
        overlaps = {},
        firstOverlaps = [];
      try {
        const maximumTicks = entry.brakeHold
          ? 600
          : entry.assist
            ? 720
            : entry.sequence
              ? 5400
              : 2400;
        for (let tick = 0; tick < maximumTicks; tick++) {
          const controls = entry.brakeHold
            ? {
                throttle: firstContactTick === null && tick < 240 ? 1 : 0,
                brake: firstContactTick !== null || tick >= 240 ? 1 : 0,
                steer: 0,
                airbrake: false,
                boost: false,
              }
            : entry.assist
              ? {
                  throttle: 1,
                  brake: 0,
                  steer: 0,
                  airbrake: false,
                  boost: false,
                }
              : entry.rotation
                ? {
                    // A short curved bore calls for a slower, deliberate wall ride.
                    // These are ordinary steering/throttle inputs; no state or pose is forced.
                    throttle: 0.3,
                    brake: 0,
                    boost: false,
                    airbrake: false,
                    steer: clamp(
                      (state.heading - entry.rotation * 0.9) * 3,
                      -1,
                      1,
                    ),
                  }
                : getRacerControl(state, track, {
                    runtime,
                    difficulty: 'hard',
                  });
          const beforeDistance = state.distance;
          const beforeWorldSpeed = Math.hypot(
            state.speed * Math.cos(state.heading),
            state.lateralSpeed,
          );
          const events = runtime.advance(state, controls, dt);
          impacts.push(
            ...events
              .filter((event) => event.type === 'impact')
              .map((event) => ({
                ...event.payload,
                distance: state.distance,
                lateral: state.lateral,
              })),
          );
          if (
            firstContactTick === null &&
            events.some((event) => event.type === 'impact')
          )
            firstContactTick = tick;
          nudges += events.filter(
            (event) =>
              event.type === 'impact' &&
              event.payload?.response === 'exit-nudge',
          ).length;
          stoppedTicks =
            state.speed === 0 && state.lateralSpeed === 0
              ? stoppedTicks + 1
              : 0;
          const lateralDelta = state.lateral - previousLateral;
          travelled += wrap(lateralDelta, circumference);
          seamCrossed ||= Math.abs(lateralDelta) > circumference / 2;
          previousLateral = state.lateral;
          const pose = runtime.pose(1),
            surface = track.sampleSurface(state.distance, state.lateral);
          supported &&= pose?.grounded === true;
          if (previousPosition) {
            const movement = pose.position.distanceTo(previousPosition);
            const afterWorldSpeed = Math.hypot(
              state.speed * Math.cos(state.heading),
              state.lateralSpeed,
            );
            maximumPoseStep = Math.max(maximumPoseStep, movement);
            // The small allowance covers finite hull support over a real beveled
            // guide; movement beyond half the hull's height is not a smooth nudge.
            maximumPoseExcess = Math.max(
              maximumPoseExcess,
              movement - dt * Math.max(beforeWorldSpeed, afterWorldSpeed),
            );
          }
          if (firstContactTick !== null && !entry.brakeHold) {
            const progressSpeed =
              ((state.distance - beforeDistance) / dt) *
              (surface?.longitudinalMetric ?? 1);
            minimumPostContactProgress = Math.min(
              minimumPostContactProgress,
              progressSpeed,
            );
            stallTicks = progressSpeed < 10 ? stallTicks + 1 : 0;
            maximumStallSeconds = Math.max(
              maximumStallSeconds,
              stallTicks * dt,
            );
          }
          previousPosition = pose.position;
          ceiling ||= surface?.up.y < -0.7;
          for (const [index, descriptor] of track.tubes.entries()) {
            const passage = tubePassages[index];
            if (
              beforeDistance < descriptor.start &&
              state.distance >= descriptor.start
            ) {
              passage.entered = true;
              passage.entryUpY =
                surface?.up.y ?? track.sample(state.distance).up.y;
            }
            if (
              beforeDistance <= descriptor.end &&
              state.distance > descriptor.end
            ) {
              passage.exited = true;
              passage.exitUpY =
                surface?.up.y ?? track.sample(state.distance).up.y;
            }
          }
          if (entry.rotation)
            closed &&=
              track.tubeAt(state.distance)?.id === tube.id &&
              surface?.period > 0;
          // Static whole-box overlap measures the real mesh at the actual pose,
          // avoiding conservative angular sweep inflation on a curved support.
          const hit = collisionWorld.sweepHull(pose, pose);
          if (hit) {
            const key = hit.shape.kind + ':' + hit.shape.id;
            const row = (overlaps[key] ??= { count: 0, maximumPenetration: 0 });
            row.count++;
            if (hit.penetration > row.maximumPenetration) {
              row.maximumPenetration = hit.penetration;
              row.maximum = {
                distance: state.distance,
                lateral: state.lateral,
                heading: state.heading,
                position: pose.position.toArray(),
                quaternion: pose.quaternion.toArray(),
                point: hit.point.toArray(),
              };
            }
            if (firstOverlaps.length < 6)
              firstOverlaps.push({
                key,
                penetration: hit.penetration,
                distance: state.distance,
                lateral: state.lateral,
                position: pose.position.toArray(),
                point: hit.point.toArray(),
              });
          }
          if (
            entry.brakeHold
              ? stoppedTicks >= 30
              : entry.rotation
                ? Math.abs(travelled) >= circumference || !closed
                : state.distance >
                  (entry.sequence ? track.overturn.end : tube.end) + 5
          )
            break;
        }
        // The physically short bore need not fit a full circle at racing speed.
        // A controlled seam crossing proves free circumferential travel; retain
        // measured full-turn coverage separately instead of inventing a wrap.
        const rotationComplete = closed && Math.abs(travelled) >= circumference;
        const row = {
          id: entry.id,
          tubeId: entry.tube?.id ?? null,
          sequence: Boolean(entry.sequence),
          rotation: Boolean(entry.rotation),
          assist: Boolean(entry.assist),
          brakeHold: Boolean(entry.brakeHold),
          stopped: stoppedTicks >= 30,
          nudges,
          maximumStallSeconds,
          minimumPostContactProgress: Number.isFinite(
            minimumPostContactProgress,
          )
            ? minimumPostContactProgress
            : null,
          elapsed: state.time,
          distance: state.distance,
          lateral: state.lateral,
          speed: state.speed,
          turns: travelled / circumference,
          complete: entry.rotation
            ? rotationComplete || seamCrossed
            : state.distance >
              (entry.sequence ? track.overturn.end : tube.end) + 5,
          fullRotation: rotationComplete,
          seamCrossed,
          closed,
          supported,
          ceiling,
          upright: track.sample(state.distance).up.y > 0.6,
          tubePassages,
          maximumPoseStep,
          maximumPoseExcess,
          impacts,
          overlaps,
          firstOverlaps,
        };
        rows.push(row);
        progress(row);
      } finally {
        runtime.dispose();
      }
    }
    return {
      suite,
      geometryVersion: track.geometryVersion,
      collisionVersion: collisionWorld.version,
      triangles: collisionWorld.triangleCount,
      rows,
    };
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await inspectTubeSurfaces({
    suite: process.argv.includes('--collector-assist')
      ? 'collector-assist'
      : 'surfaces',
  });
  console.log(JSON.stringify(result, null, 2));
  const failures = tubeSurfaceFailures(result);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
