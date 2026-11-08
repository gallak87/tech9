import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as T from 'three';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';

const output = fileURLToPath(
  new URL(
    '../assets/levels/nomad/blender/route-support-guides.json',
    import.meta.url,
  ),
);
const step = 32;

/** Exact nominal road frames for the retained Blender load-frame builder. */
export function createNomadRouteGuides(track = createNomadTrack()) {
  const carriers = [];
  for (const carrier of track.carriers) {
    const inverse = new T.Matrix4()
      .compose(carrier.origin, carrier.quaternion, carrier.scale)
      .invert();
    const stations = [];
    for (let distance = carrier.start; distance < carrier.end; distance += step)
      stations.push(distance);
    stations.push(carrier.end);
    const samples = stations.map((distance) => {
      // Use the authored frame, exactly as the original retained guides did.
      // sampleSurface refines the normal for contact queries and is not this
      // asset-construction basis.
      const frame = track.sample(distance);
      const point = (right = 0, up = 0) =>
        frame.position
          .clone()
          .addScaledVector(frame.right, right)
          .addScaledVector(frame.up, up)
          .applyMatrix4(inverse)
          .toArray();
      const width = track.halfWidthAt(distance);
      return {
        distance,
        center: point(),
        left: point(-width),
        right: point(width),
        under: point(0, -2),
        localUp: frame.up.clone().transformDirection(inverse).toArray(),
      };
    });
    // Ordinary cargo roads sit on the existing chassis. Added elevated,
    // outboard or extended roads need their own connected load path too.
    // A level-authored boolean takes precedence over the automatic selection.
    const halfLength = carrier.sourceLength / 2;
    const needsSupport = samples.some(
      (sample) =>
        Math.abs(sample.center[2]) > halfLength + 1e-6 ||
        [sample.center, sample.left, sample.right].some(
          ([x, y]) =>
            Math.abs(x) > 90 + 1e-6 || y > carrier.sourceFloor + 28 + 1e-6,
        ),
    );
    if (carrier.supportRoad ?? (carrier.mode !== 'cargo' || needsSupport))
      carriers.push({
        id: carrier.id,
        mode: carrier.mode,
        root: 'same760mcarrierlocalframe',
        // Legacy guides infer their common 1.4 longitudinal stretch. Retain
        // exact scale for longer receivers instead of applying that assumption.
        ...(Math.abs(carrier.scale.z / carrier.scale.x - 1.4) > 1e-9
          ? { scale: carrier.scale.toArray() }
          : {}),
        samples,
      });
  }
  return {
    version: 1,
    geometryVersion: track.geometryVersion,
    meaning:
      'Actual nominal running-skin samples transformed into their owning carrier local frames; under marks 2m behind the road normal.',
    carriers,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'node tools/export-nomad-route-guides.mjs [--check]\n' +
        'Regenerate exact carrier-local Blender road guides, or check the retained file.',
    );
    return;
  }
  assert.ok(
    args.every((arg) => arg === '--check'),
    'Only --check and --help are supported.',
  );
  const guides = createNomadRouteGuides();
  if (args.includes('--check')) {
    const retained = JSON.parse(await readFile(output, 'utf8'));
    assert.ok(
      isDeepStrictEqual(retained, guides),
      'Nomad route guides are stale. Regenerate them, rebuild affected Blender assets and refresh their provenance together.',
    );
    console.log(
      `Nomad road guides match runtime: ${guides.carriers.length} carriers.`,
    );
    return;
  }
  await writeFile(output, JSON.stringify(guides, null, 2) + '\n');
  console.log(`Wrote ${guides.carriers.length} carrier guides to ${output}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
