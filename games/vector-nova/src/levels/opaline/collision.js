import { createShelfBankGeometry } from './environment/strata.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import {
  createOpalineSurfaceGeometry,
  createOpalineSurfGeometry,
  createOpalineConnectorRailGeometry,
  roadIntervals,
} from './track/geometry.js';

export function createOpalineCollisionWorld({ track }) {
  const triangles = [];
  const append = (geometry, info) => {
    try {
      triangles.push(
        ...indexedTriangles(
          geometry.attributes.position.array,
          geometry.index.array,
          info,
          null,
          geometry.attributes.roadCoord,
        ),
      );
    } finally {
      geometry.dispose();
    }
  };
  for (const [index, interval] of roadIntervals(track).entries())
    append(createOpalineSurfaceGeometry(track, interval), {
      id: `opaline-shelf-${index}`,
      kind: 'deck',
      start: interval.start,
      end: interval.end,
    });
  for (const bank of track.surfBanks)
    append(createOpalineSurfGeometry(track, bank), {
      id: `opaline-${bank.id}`,
      kind: 'deck',
      start: bank.start,
      end: bank.end,
    });
  for (const [index, interval] of roadIntervals(track).entries())
    if (!interval.constructed)
      for (const side of [-1, 1])
        append(createShelfBankGeometry(track, { ...interval, side }), {
          id: `opaline-bank-${index}-${side}`,
          kind: 'terrain',
        });
  for (const interval of track.constructedIntervals)
    for (const side of [-1, 1])
      append(createOpalineConnectorRailGeometry(track, { ...interval, side }), {
        id: `${interval.id}-rail-${side}`,
        kind: 'rail',
        roadBoundary: true,
        start: interval.start,
        end: interval.end,
      });
  return createCollisionWorld({
    id: 'opaline-shelf-solids',
    version: 2,
    geometryId: `${track.geometryVersion}:mineral-surf-top-bank-terrain-connector-rails-v2`,
    triangles,
  });
}
