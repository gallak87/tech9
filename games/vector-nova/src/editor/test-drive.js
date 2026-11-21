import { getShip } from '../ships/catalog.js';
import {
  assertEditorPracticeReady,
  documentIdentity,
  pointRouteFractions,
  validateDocument,
} from './document.js';
import { createEditorTrack } from './track.js';

const SPEEDS = ['standing', 'cruise', 'boost'];
const RESERVES = { full: 100, half: 50, empty: 0 };
const MIN_APPROACH = 80;
const APPROACH_ALIGNMENT = Math.cos((8 * Math.PI) / 180);

function inspectApproach(track, start, takeoff) {
  const target = track.sample(takeoff).tangent;
  const targetLength = Math.hypot(target.x, target.z);
  const count = Math.ceil((takeoff - start) / 10);
  let straight = targetLength > 0.001;
  for (let index = 0; index <= count; index++) {
    const station =
      index === count ? takeoff : start + ((takeoff - start) * index) / count;
    const frame = track.sample(station);
    if (
      track.isGap(station) ||
      frame.up.y <= 0.65 ||
      Math.abs(frame.tangent.y) >= 0.65
    )
      return null;
    const length = Math.hypot(frame.tangent.x, frame.tangent.z);
    if (
      length < 0.001 ||
      (frame.tangent.x * target.x + frame.tangent.z * target.z) /
        (length * targetLength) <
        APPROACH_ALIGNMENT
    )
      straight = false;
  }
  return { distance: start, straight };
}

/** Session options are bundled choices, separate from the persisted course. */
export function normalizeEditorTestRequest(value = {}) {
  const kind = value.kind ?? 'course';
  const speed = value.speed ?? (kind === 'course' ? 'standing' : 'cruise');
  const reserve = value.reserve ?? 'full';
  if (
    !['course', 'point', 'jump'].includes(kind) ||
    !SPEEDS.includes(speed) ||
    !Object.hasOwn(RESERVES, reserve)
  )
    throw new Error('Choose a course, point or jump and a stock test speed.');
  if (kind === 'point' && typeof value.pointId !== 'string')
    throw new Error('Choose a road point to test from.');
  if (kind === 'jump' && typeof value.jumpId !== 'string')
    throw new Error('Choose a jump to test.');
  return {
    kind,
    speed,
    reserve,
    ...(kind === 'point' ? { pointId: value.pointId } : {}),
    ...(kind === 'jump' ? { jumpId: value.jumpId } : {}),
  };
}

/** Resolve against actual, supported course geometry, never a forecast launch. */
export function resolveEditorTestStart(
  value,
  input = {},
  { shipId = 'kestrel', track: suppliedTrack } = {},
) {
  const doc = validateDocument(value);
  const request = normalizeEditorTestRequest(input);
  if (!suppliedTrack) assertEditorPracticeReady(doc);
  const track = suppliedTrack ?? createEditorTrack(doc);
  const ship = getShip(shipId);
  const speed =
    request.speed === 'standing' ? 0 : ship.handling[request.speed + 'Speed'];
  const energy = RESERVES[request.reserve];
  const finish = track.finishDistance ?? track.length;
  const warnings = [];
  let distance = 0,
    approachMetres = null,
    targetJumpId = null,
    label = 'Course start';
  if (request.kind === 'point') {
    const index = doc.points.findIndex((point) => point.id === request.pointId);
    if (index < 0)
      throw new Error('That road point is no longer on this course.');
    distance = pointRouteFractions(doc)[index] * track.length;
    label = `Point ${String(index + 1).padStart(2, '0')}`;
    if (distance >= finish) {
      distance = Math.max(0, finish - 30);
      warnings.push(
        'The point is in the finish runout; the test starts before the finish.',
      );
    }
    const gap = track.jumps.find(
      (jump) => distance > jump.takeoff && distance < jump.landingStart,
    );
    if (gap) {
      distance = gap.landingStart + 2;
      warnings.push(
        'The selected point is in a gap; the test starts on its landing road.',
      );
    }
  } else if (request.kind === 'jump') {
    const jump = track.jumps.find((entry) => entry.id === request.jumpId);
    if (!jump) throw new Error('That jump is no longer on this course.');
    const previous = track.jumps
      .filter((entry) => entry.recovery < jump.takeoff)
      .at(-1);
    const firstClear = previous ? previous.recovery + 20 : 0;
    // This is room to drive, not a minimum speed or a predicted ballistic path.
    const starts = [
      ...new Set(
        [240, 160, 120].map((metres) =>
          Math.max(firstClear, jump.takeoff - metres),
        ),
      ),
    ];
    const candidates = starts
      .filter((start) => jump.takeoff - start >= MIN_APPROACH)
      .map((start) => inspectApproach(track, start, jump.takeoff))
      .filter(Boolean);
    let approach =
      candidates.find((candidate) => candidate.straight) ?? candidates.at(-1);
    // A short remaining deck can still be useful, but never put the player at
    // the lip with no reaction time or silently skip an intervening rotation.
    if (!approach) {
      for (let metres = 110; metres >= MIN_APPROACH; metres -= 10) {
        const start = Math.max(firstClear, jump.takeoff - metres);
        if (jump.takeoff - start < MIN_APPROACH) continue;
        approach = inspectApproach(track, start, jump.takeoff);
        if (approach) break;
      }
    }
    if (!approach)
      throw new Error(
        'This jump needs a clear, upright approach with at least 80 m to react before it can be tested locally. Move its takeoff or test from an earlier road point.',
      );
    distance = approach.distance;
    approachMetres = jump.takeoff - distance;
    targetJumpId = jump.id;
    label = jump.label;
    if (!approach.straight)
      warnings.push(
        'Curved approach: steer through the bend before takeoff. Start speed is not launch speed.',
      );
    if (approachMetres < 160)
      warnings.push(
        'Short approach: compare start speeds, then check the complete course. A stock start does not guarantee the landing.',
      );
  }
  if (track.isGap(distance))
    throw new Error('The test needs supported road at its starting point.');
  return {
    request,
    kind: request.kind,
    label,
    shipId: ship.id,
    courseIdentity: documentIdentity(doc),
    distance,
    speed,
    energy,
    approachMetres,
    targetJumpId,
    warnings,
    state: { distance, lateral: 0, speed, energy, heading: 0 },
  };
}

export function getEditorTestStartSummary(plan) {
  const approach =
    plan.approachMetres === null
      ? ''
      : ` · ${Math.round(plan.approachMetres)} m approach`;
  return `${plan.label}${approach} · ${Math.round(plan.speed * 3.6)} km/h start · ${plan.energy}% reserve · stock ${getShip(plan.shipId).name}${plan.warnings.length ? `. ${plan.warnings.join(' ')}` : ''}`;
}

function observation(state, pose) {
  return {
    distance: state.distance,
    lateral: state.lateral,
    speed: state.speed,
    energy: state.energy,
    heading: state.heading,
    time: state.time,
    position: pose?.position?.toArray?.() ?? null,
  };
}

/** Read-only diagnostics from real runtime events, including physical contacts. */
export function createEditorTestAttemptRecorder() {
  let report = null;
  return {
    begin(plan) {
      report = {
        version: 1,
        courseIdentity: plan.courseIdentity,
        shipId: plan.shipId,
        request: structuredClone(plan.request),
        start: {
          distance: plan.distance,
          speed: plan.speed,
          energy: plan.energy,
          approachMetres: plan.approachMetres,
        },
        status: 'not-launched',
        jumps: [],
        lastAttempt: null,
        current: null,
      };
    },
    event(event, state, pose) {
      if (
        !report ||
        !['jump-launch', 'jump-miss', 'jump-transfer'].includes(event.type)
      )
        return;
      const { id } = event.payload;
      if (event.type === 'jump-launch') {
        report.jumps.push({
          id,
          launch: {
            ...observation(state, pose),
            speed: event.payload.speed,
            heading: event.payload.heading,
          },
          outcome: 'airborne',
        });
        if (report.jumps.length > 30) report.jumps.shift();
        report.status = 'airborne';
      } else {
        const attempt = report.jumps.findLast((entry) => entry.id === id);
        if (!attempt) return;
        if (event.type === 'jump-miss') {
          attempt.outcome = 'missed';
          attempt.reason = event.payload.reason;
          attempt.miss = observation(state, pose);
          report.status = 'missed';
        } else if (event.payload.outcome === 'landed') {
          attempt.outcome = 'landed';
          attempt.landing = observation(state, pose);
          report.status = 'landed';
        } else if (!attempt.miss) {
          attempt.outcome = 'missed';
          attempt.reason = event.payload.outcome;
          attempt.miss = observation(state, pose);
          report.status = 'missed';
        }
      }
      report.lastAttempt = report.jumps.at(-1) ?? null;
    },
    read(state, pose) {
      if (!report) return null;
      report.current = observation(state, pose);
      return structuredClone(report);
    },
  };
}
