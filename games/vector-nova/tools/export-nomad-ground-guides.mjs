import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { NOMAD_MOTION_RULES } from '../src/levels/nomad/motion.js';
import { createNomadCompanions } from '../src/levels/nomad/companions.js';

const output = fileURLToPath(
  new URL(
    '../assets/levels/nomad/blender/salt-escarpments/salt-ground-guides.json',
    import.meta.url,
  ),
);
const encounterSpeed = 140;

/** Exact immutable cross-section used by the static Blender terrace extrusion. */
export function createNomadGroundGuides(track = createNomadTrack()) {
  assert.ok(
    track.saltBenches?.length >= 2 && track.groundProfileKnots?.length >= 4,
    'Nomad must expose its frozen saltBenches and piecewise-linear groundProfileKnots.',
  );
  const benches = track.saltBenches.toSorted((a, b) => a.minX - b.minX);
  const knots = track.groundProfileKnots.toSorted((a, b) => a.x - b.x);
  const staticDomain = {
    minX: Math.min(-80000, benches[0].minX - 6000),
    maxX: Math.max(80000, benches.at(-1).maxX + 6000),
    minZ: -80000,
    maxZ: 80000,
  };
  const detailedFloorDomain = { minZ: -8000, maxZ: 32000 };
  const coverageClock = { min: 0, max: 150 };
  const courseMaxZ = Math.max(track.length, track.positionAt(track.length).z);
  const forwardDistance = 14000;
  const groundTravel = NOMAD_MOTION_RULES.convoySpeed * coverageClock.max;
  const detailCoverage = {
    minZ: detailedFloorDomain.minZ,
    maxZ:
      Math.ceil((courseMaxZ + forwardDistance + groundTravel) / 1000) * 1000,
    courseMaxZ,
    forwardDistance,
    groundTravel,
  };
  const crossSection = [
    { x: staticDomain.minX, heightOffset: knots[0].heightOffset },
    ...knots.map(({ x, heightOffset }) => ({ x, heightOffset })),
    { x: staticDomain.maxX, heightOffset: knots.at(-1).heightOffset },
  ];
  for (const knot of crossSection)
    assert.ok(
      Math.abs(
        track.groundHeightAt(knot.x, 0) -
          track.saltPlane.height -
          knot.heightOffset,
      ) < 1e-7,
      'Retained cross-section knots must describe the real physical ground.',
    );
  for (let index = 1; index < crossSection.length; index++) {
    const a = crossSection[index - 1],
      b = crossSection[index],
      x = (a.x + b.x) / 2,
      slope = (b.heightOffset - a.heightOffset) / (b.x - a.x),
      normal = track.groundNormalAt(x, 0);
    assert.ok(
      Math.abs(
        track.groundHeightAt(x, 0) -
          track.saltPlane.height -
          (a.heightOffset + b.heightOffset) / 2,
      ) < 1e-7,
      'Ground between knots must be the exact piecewise-linear profile.',
    );
    assert.ok(
      Math.abs(normal.x / normal.y + slope) < 1e-8 &&
        Math.abs(normal.z / normal.y - track.saltPlane.grade) < 1e-8,
      'Authored ground normals must match the actual profile faces.',
    );
  }
  const detailBands = [];
  for (let index = 0; index < benches.length - 1; index++) {
    const from = benches[index],
      to = benches[index + 1];
    const width = to.minX - from.maxX,
      drop = Math.abs(to.heightOffset - from.heightOffset);
    if (width <= 20 || drop <= 1e-7) continue;
    const receiver = track.carriers.find((carrier) =>
      to.carrierIds.includes(carrier.id),
    );
    const jump = track.jumps.find(
      (entry) => entry.receivingCarrierId === receiver?.id,
    );
    const distance =
      jump?.landingStart ??
      receiver?.start ??
      (track.length * (index + 1)) / benches.length;
    const time = Math.max(0, distance / encounterSpeed);
    const inset = Math.min(2, width * 0.04);
    detailBands.push({
      id: `salt-riser-${index + 1}`,
      minX: from.maxX + inset,
      maxX: to.minX - inset,
      minZ: detailCoverage.minZ,
      maxZ: detailCoverage.maxZ,
      centerZ: (detailCoverage.minZ + detailCoverage.maxZ) / 2,
      length: detailCoverage.maxZ - detailCoverage.minZ,
      relief: Math.min(80, drop * 0.4),
      phase: index * 1.7,
      fromBench: from.id,
      toBench: to.id,
      encounterDistance: distance,
      encounterTime: time,
    });
  }
  return {
    version: 1,
    geometryVersion: track.geometryVersion,
    meaning:
      'Final rest-world coordinates, +Y up and +Z course. The exact profile extrusion is static. Only separately named scarp details translate with the ground group.',
    saltPlane: { ...track.saltPlane },
    saltBenches: benches,
    convoy: [...track.carriers, ...createNomadCompanions(track)].map(
      (carrier) => ({
        id: carrier.id,
        origin: carrier.origin.toArray(),
        quaternion: carrier.quaternion.toArray(),
        scale: carrier.scale.toArray(),
      }),
    ),
    groundProfileKnots: crossSection,
    staticDomain,
    detailedFloorDomain,
    detailCoverage,
    detailShape: {
      maxLongitudinalStep: 300,
      crestLength: 5200,
      shoulderLength: 2100,
      gullyPeriod: 7200,
      fadeLength: 1500,
    },
    detailBands,
    detailMotion: {
      convoySpeed: NOMAD_MOTION_RULES.convoySpeed,
      encounterSpeed,
      coverageClock,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'node tools/export-nomad-ground-guides.mjs [--check]\n' +
        'Export or verify the exact frozen Nomad terrace profile for Blender.',
    );
    return;
  }
  assert.ok(
    args.every((arg) => arg === '--check'),
    'Only --check and --help are supported.',
  );
  const guides = createNomadGroundGuides();
  if (args.includes('--check')) {
    const retained = JSON.parse(await readFile(output, 'utf8'));
    assert.ok(
      isDeepStrictEqual(retained, guides),
      'Nomad ground guides are stale. Regenerate the connected terrain and its provenance together.',
    );
    console.log(
      `Nomad ground guides match ${guides.saltBenches.length} frozen shelves.`,
    );
    return;
  }
  await writeFile(output, JSON.stringify(guides, null, 2) + '\n');
  console.log(`Wrote ${guides.saltBenches.length} shelf guides to ${output}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
