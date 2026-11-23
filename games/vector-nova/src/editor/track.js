import * as T from 'three';
import { createRouteSampler } from './route.js';
import { validateDocument, documentIdentity } from './document.js';
import { compileEditorJumps } from './jumps.js';
import { resolvedBiomeSpans } from './biome-spans.js';

/** Compile the persisted control points; generator settings never replace edits. */
export function createEditorTrack(value) {
  const doc = validateDocument(value);
  if (doc.points.length < 4)
    throw new Error('A driving circuit needs at least four road points');
  const { length, sample, positionAt, closed, rollClosure } =
    createRouteSampler(doc);
  const finishDistance = closed ? undefined : length - 600;
  const sections = [
    'Starting quay',
    'Generating district',
    'Harbor bend',
    'Return viaduct',
  ].map((name, i) => ({
    id: `district-${i}`,
    name,
    label: name,
    start: (length * i) / 4,
    end: (length * (i + 1)) / 4,
    showcase: (length * (i + 0.5)) / 4,
  }));
  const id = documentIdentity(doc);
  const track = {
    id,
    name: doc.name,
    editorBiome: doc.biome,
    editorBiomeSpans: resolvedBiomeSpans(doc, length),
    editorEnvironment: {
      biome: doc.biome,
      environment: doc.environment,
      settings: doc.settings,
      generator: { seed: doc.generator.seed },
    },
    version: 1,
    geometryVersion: id,
    length,
    width: doc.width,
    closed,
    rollClosure,
    ...(closed ? {} : { finishDistance }),
    deviceProjection: 'rendered-surface',
    groundY: doc.settings.waterLevel - 14,
    sample,
    jumps: [],
    inversions: (doc.rolls ?? []).map((roll) => ({
      ...roll,
      start: roll.start * length,
      end: roll.end * length,
    })),
    hasAuthoredRoll:
      doc.points.some((p) => Math.abs(p.roll) > 0.00001) ||
      doc.rolls.length > 0,
    sections,
    checkpoints: [],
    bounds: new T.Box3()
      .setFromPoints(
        Array.from({ length: 256 }, (_, i) => positionAt((length * i) / 256)),
      )
      .expandByVector(new T.Vector3(350, 160, 350)),
    scenarios: { staging: { distance: 0, lateral: 0, speed: 0, heading: 0 } },
  };
  track.jumps = compileEditorJumps(doc, track);
  // Modulo around a circuit can shift a station by a few ulps. The exact
  // launch and landing lips belong to the supported road on every lap.
  const lipTolerance = 1e-7;
  track.isGap = (distance) => {
    const station = closed
      ? T.MathUtils.euclideanModulo(distance, length)
      : distance;
    return track.jumps.some(
      (j) =>
        station > j.takeoff + lipTolerance &&
        station < j.landingStart - lipTolerance,
    );
  };
  track.jumpProtectedSpans = track.jumps.map((jump) => ({
    start: jump.takeoff - 120,
    end: jump.recovery + 80,
  }));
  track.isJumpProtected = (distance) => {
    const station = closed
      ? T.MathUtils.euclideanModulo(distance, length)
      : distance;
    return track.jumpProtectedSpans.some(
      ({ start, end }) => station >= start && station <= end,
    );
  };
  let from = 0;
  track.boundaryIntervals = track.jumps.flatMap((j) => {
    const interval = { start: from, end: j.takeoff };
    from = j.landingStart;
    return [interval];
  });
  track.boundaryIntervals.push({ start: from, end: length });
  const distances = Array.from({ length: 12 }, (_, i) =>
    closed
      ? (length * i) / 12
      : i === 11
        ? finishDistance
        : (finishDistance * i) / 11,
  ).filter(
    (s) =>
      !track.jumps.some(
        (j) => s > j.takeoff && s <= Math.max(j.recovery, j.landingEnd),
      ),
  );
  distances.push(...track.jumps.map((j) => j.landingStart));
  distances.sort((a, b) => a - b);
  track.checkpoints = distances
    .filter((s, i) => !i || s - distances[i - 1] > 0.0001)
    .map((distance, index) => ({ id: `checkpoint-${index}`, index, distance }));
  for (const jump of track.jumps) {
    track.scenarios[jump.id + '-approach'] = {
      distance: Math.max(0, jump.takeoff - 160),
      lateral: 0,
      speed: 112,
      heading: 0,
    };
    track.scenarios[jump.id + '-launch'] = {
      distance: jump.takeoff - 1,
      lateral: 0,
      speed: 157,
      heading: 0,
    };
  }
  if (!closed)
    track.scenarios['finish-approach'] = {
      distance: finishDistance - 100,
      lateral: 0,
      speed: 112,
      heading: 0,
    };
  return track;
}
