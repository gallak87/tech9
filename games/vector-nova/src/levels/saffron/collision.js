import * as T from 'three';
import kit from './collision-kit.json' with { type: 'json' };
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { sweepGeometry } from '../../track/geometry.js';
import { createLandformSurvey } from './environment/terrain.js';
import { buildFossilPlacements } from './environment/placements.js';
import { jumpSupportPlan } from './track/supports.js';
import {
  SAFFRON_SOLIDS,
  roadRuns,
  toeProfile,
  createBaffleGeometry,
  bafflePlacements,
  receivingBeacons,
  fixtureMatrix,
  deckEndGeometry,
} from './track/solids.js';

const worlds = new WeakMap();
const decode = (encoded, Type) =>
  new Type(
    Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      .buffer,
  );
const modules = Object.fromEntries(
  Object.entries(kit.modules).map(([name, parts]) => [
    name,
    parts.map((part) => ({
      positions: decode(part.positions, Float32Array),
      indices: decode(part.indices, Uint32Array),
    })),
  ]),
);
export function createSaffronCollisionWorld({ track }) {
  if (worlds.has(track)) return worlds.get(track);
  const survey = createLandformSurvey(track);
  const triangles = [];
  function geometry(data, info, matrix) {
    const positions = data.attributes.position.array;
    const indices =
      data.index?.array ??
      Array.from({ length: positions.length / 3 }, (_, i) => i);
    triangles.push(...indexedTriangles(positions, indices, info, matrix));
  }
  for (const [start, end] of roadRuns(track)) {
    for (const [kind, profile] of [
      ['deck', SAFFRON_SOLIDS.top],
      ['structure', SAFFRON_SOLIDS.underside],
      ...[-1, 1].map((side) => ['rail', toeProfile(side)]),
    ]) {
      const data = sweepGeometry(track, profile, {
        start,
        end,
        step: SAFFRON_SOLIDS.step,
      });
      geometry(data, { id: `road-${start}-${kind}`, kind, start, end });
      data.dispose();
    }
  }
  const ends = deckEndGeometry(track);
  geometry(ends, { id: 'ramp-faces', kind: 'structure' });
  ends.dispose();
  const baffles = bafflePlacements(track);
  const vane = createBaffleGeometry(),
    box = new T.BoxGeometry(1, 1, 1);
  for (const [family, data, entries] of [
    ['vane', vane, baffles.vanes],
    ['clamp', box, baffles.clamps],
    ['beacon', box, receivingBeacons(track)],
  ])
    for (const [i, item] of entries.entries())
      geometry(
        data,
        { id: `${family}-${i}`, kind: 'rail', distance: item.s },
        fixtureMatrix(track, item),
      );
  vane.dispose();
  box.dispose();
  triangles.push(
    ...indexedTriangles(survey.meshData.positions, survey.meshData.indices, {
      id: 'desert',
      kind: 'terrain',
    }),
  );
  const placements = buildFossilPlacements(track, survey);
  const fossilTriangles = [];
  // Real apertures stay open. Bake only static anatomy around the three jumps;
  // the animated grazer and distant panorama are outside this physical pass.
  for (const name of Object.keys(kit.modules)) {
    const entries = name.startsWith('vertebra')
      ? placements[name].filter((matrix) => {
          const position = new T.Vector3().setFromMatrixPosition(matrix);
          return track.jumps.some(
            (jump) =>
              !jump.optional &&
              [
                jump.takeoff - 27,
                jump.landingStart + 40,
                jump.landingEnd - 26,
              ].some((s) => position.distanceTo(track.sample(s).position) < 12),
          );
        })
      : placements[name].slice(0, 5);
    for (const [i, matrix] of entries.entries())
      for (const part of modules[name])
        fossilTriangles.push(
          ...indexedTriangles(
            part.positions,
            part.indices,
            { id: `${name}-${i}`, kind: 'structure' },
            matrix,
          ),
        );
  }
  triangles.push(...fossilTriangles);
  const supports = jumpSupportPlan(track, survey, fossilTriangles);
  const leg = new T.BoxGeometry(1, 1, 1),
    shoe = new T.CylinderGeometry(0.38, 0.7, 1, 6),
    collar = new T.TorusGeometry(0.5, 0.13, 4, 8).rotateX(Math.PI / 2);
  for (const [i, support] of supports)
    for (const [part, data] of [
      ['leg', leg],
      ['shoe', shoe],
      ['collar', collar],
    ])
      geometry(
        data,
        { id: `support-${i}-${part}`, kind: 'structure' },
        support[part],
      );
  leg.dispose();
  shoe.dispose();
  collar.dispose();
  const world = createCollisionWorld({
    id: 'saffron-solids',
    version: 1,
    geometryId: `${track.geometryVersion}:${SAFFRON_SOLIDS.version}:terrain176-v1:fossils-${kit.sourceHash}:placements-v1:jump-supports-v1`,
    triangles,
  });
  // The factory cache belongs to the level/track, while core owns disposal.
  const owner = Object.freeze({
    ...world,
    survey,
    supports,
    dispose() {
      if (worlds.get(track) === owner) worlds.delete(track);
      world.dispose();
    },
  });
  worlds.set(track, owner);
  return owner;
}
