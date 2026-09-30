import assert from 'node:assert/strict';
import { Vector3 } from 'three';

const AXES = ['right', 'up', 'tangent'];
const UNIT_AXES = [
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 0, 1),
];
const EPSILON = 1e-5;

// CPU-only checks of the existing track API. These do not grade art, route
// difficulty, scenery clearance or real driving; each level still owns those.
export function assertTrackContract(
  track,
  { step = 1, arcTolerance = 0.01, maxFrameTurnPerMetre = 0.1 } = {},
) {
  for (const [name, value] of Object.entries({
    length: track?.length,
    width: track?.width,
    step,
    arcTolerance,
    maxFrameTurnPerMetre,
  }))
    assert.ok(
      Number.isFinite(value) && value > 0,
      name + ' must be positive and finite',
    );
  assert.equal(
    typeof track.sample,
    'function',
    'track.sample must be a function',
  );
  assert.ok(
    typeof track.id === 'string' && track.id.length,
    'track.id is required',
  );
  assert.ok(
    typeof track.name === 'string' && track.name.trim(),
    'track.name is required',
  );
  const count = Math.ceil(track.length / step);
  assert.ok(
    count >= 4 && count <= 25000,
    'Choose a step producing 4–25000 samples',
  );
  const spacing = track.length / count;
  const at = (distance) => track.id + ' at ' + distance.toFixed(4) + 'm';

  function read(distance) {
    const frame = track.sample(distance);
    const label = at(distance);
    assert.ok(frame && typeof frame === 'object', label + ': missing frame');
    for (const key of ['position', ...AXES]) {
      const vector = frame[key];
      assert.ok(
        vector?.isVector3 && vector.toArray().every(Number.isFinite),
        label + ': invalid ' + key,
      );
    }
    assert.ok(
      frame.quaternion?.isQuaternion &&
        frame.quaternion.toArray().every(Number.isFinite) &&
        Math.abs(frame.quaternion.length() - 1) < EPSILON,
      label + ': invalid unit quaternion',
    );
    for (const key of ['bank', 'curvature'])
      assert.ok(Number.isFinite(frame[key]), label + ': invalid ' + key);
    if (frame.roll !== undefined)
      assert.ok(Number.isFinite(frame.roll), label + ': invalid roll');
    for (const [index, key] of AXES.entries()) {
      assert.ok(
        Math.abs(frame[key].length() - 1) < EPSILON,
        label + ': ' + key + ' must be unit length',
      );
      assert.ok(
        UNIT_AXES[index]
          .clone()
          .applyQuaternion(frame.quaternion)
          .distanceTo(frame[key]) < EPSILON,
        label + ': quaternion does not match ' + key,
      );
    }
    assert.ok(
      frame.right.clone().cross(frame.up).distanceTo(frame.tangent) < EPSILON,
      label + ': frame must be orthonormal and right-handed',
    );
    // A sampler may reuse scratch objects. Preserve each result before the next
    // call so aliasing cannot conceal a seam, wrap or frame discontinuity.
    return {
      position: frame.position.clone(),
      quaternion: frame.quaternion.clone(),
    };
  }

  // Check negative distances and multiple laps, not just sample(length) == 0.
  for (const distance of [
    0,
    track.length * 0.371,
    track.length - spacing / 2,
  ]) {
    const reference = read(distance);
    for (const lap of [-2, -1, 1, 2]) {
      const wrapped = read(distance + lap * track.length);
      assert.ok(
        reference.position.distanceTo(wrapped.position) < EPSILON &&
          reference.quaternion.angleTo(wrapped.quaternion) < EPSILON,
        at(distance) + ': position/orientation must wrap across laps',
      );
    }
  }

  let previous = read(0);
  let measuredLength = 0;
  let maxArcError = 0;
  let maxFrameTurn = 0;
  for (let index = 1; index <= count; index += 1) {
    const distance = index * spacing;
    const next = read(distance);
    const chord = previous.position.distanceTo(next.position);
    const arcError = Math.abs(chord / spacing - 1);
    const turn = previous.quaternion.angleTo(next.quaternion) / spacing;
    assert.ok(
      arcError <= arcTolerance,
      at(distance) +
        ': sample distance must be in metres; relative chord error ' +
        arcError,
    );
    assert.ok(
      turn <= maxFrameTurnPerMetre,
      at(distance) + ': frame discontinuity; radians/metre ' + turn,
    );
    measuredLength += chord;
    maxArcError = Math.max(maxArcError, arcError);
    maxFrameTurn = Math.max(maxFrameTurn, turn);
    previous = next;
  }

  assert.ok(
    Array.isArray(track.sections) && track.sections.length,
    'sections are required',
  );
  const sectionIds = new Set();
  let end = 0;
  for (const section of track.sections) {
    assert.ok(
      typeof section.id === 'string' &&
        section.id.length &&
        !sectionIds.has(section.id),
      'section IDs must be nonempty and unique',
    );
    sectionIds.add(section.id);
    assert.ok(
      typeof section.name === 'string' && section.name.trim(),
      section.id + ': section name is required',
    );
    assert.ok(
      Number.isFinite(section.start) &&
        Number.isFinite(section.end) &&
        Math.abs(section.start - end) < EPSILON &&
        section.end > section.start &&
        section.end <= track.length + EPSILON,
      section.id +
        ': sections must cover the route in order without gaps/overlap',
    );
    if (section.showcase !== undefined)
      assert.ok(
        Number.isFinite(section.showcase) &&
          section.showcase >= section.start &&
          section.showcase < section.end,
        section.id + ': showcase must be inside its section',
      );
    end = section.end;
  }
  assert.ok(
    Math.abs(end - track.length) < EPSILON,
    'sections must cover the whole route',
  );
  assert.ok(
    Array.isArray(track.checkpoints) && track.checkpoints.length,
    'checkpoints are required',
  );
  let previousCheckpoint = -Infinity;
  for (const [index, checkpoint] of track.checkpoints.entries()) {
    const distance = checkpoint.distance ?? checkpoint.s;
    assert.ok(
      (checkpoint.index === undefined || checkpoint.index === index) &&
        Number.isFinite(distance) &&
        distance >= 0 &&
        distance < track.length &&
        distance > previousCheckpoint,
      'checkpoint indices/distances must be ordered within the lap',
    );
    // Race accepts either alias; when both are supplied they must agree.
    if (checkpoint.s !== undefined && checkpoint.distance !== undefined)
      assert.equal(
        checkpoint.s,
        checkpoint.distance,
        'checkpoint s/distance must agree',
      );
    previousCheckpoint = distance;
  }
  assert.ok(
    track.scenarios &&
      typeof track.scenarios === 'object' &&
      !Array.isArray(track.scenarios),
    'scenarios must be an object',
  );
  for (const [name, scenario] of Object.entries(track.scenarios)) {
    assert.ok(
      scenario && typeof scenario === 'object' && !Array.isArray(scenario),
      name + ': invalid scenario',
    );
    // Scenario placement overlays a fresh vehicle state. Omitted optional fields
    // intentionally retain the shared defaults (including distance zero).
    for (const key of ['distance', 'lateral', 'speed', 'heading'])
      if (scenario[key] !== undefined)
        assert.ok(
          Number.isFinite(scenario[key]),
          name + ': scenario must contain finite ' + key,
        );
  }

  return {
    id: track.id,
    samples: count + 1,
    spacing,
    measuredLength,
    maxArcError,
    maxFrameTurnPerMetre: maxFrameTurn,
  };
}
