import * as T from 'three';
import kit from './collision-kit.json' with { type: 'json' };
import { collectProductionSolids } from '../../physics/production-solids.js';
import { indexedTriangles } from '../../physics/collision-world.js';
import { groundFrame } from '../../environment/placement.js';
import { createVesperRoad } from './track/road.js';

const decode = (data, Type) =>
  new Type(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer);
export function createVesperCollisionWorld({ track }) {
  // Match the production landing_branch instance; keep its real apertures.
  const frame = groundFrame(track, track.jumps[0].landingStart + 95);
  const matrix = new T.Matrix4().compose(
    frame.position.clone().add(new T.Vector3(0, -6, 0)),
    new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      Math.atan2(frame.tangent.x, frame.tangent.z),
    ),
    new T.Vector3(1, 1, 1),
  );
  const bough = kit.modules.landing_branch.flatMap((part) =>
    indexedTriangles(
      decode(part.positions, Float32Array),
      decode(part.indices, Uint32Array),
      { id: 'placed-landing-bough', kind: 'structure' },
      matrix,
    ),
  );
  return collectProductionSolids({
    track,
    id: 'vesper-jump-solids',
    geometryId: `cast-ribbon-v1:bough-${kit.sourceHash}`,
    road: createVesperRoad({ track }),
    additionalTriangles: bough,
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/resin curb|protective divider/.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (
        /resin sides and underside|load roots|root sockets|reinforcement joints/.test(
          object.name,
        )
      )
        return { kind: 'structure' };
      return null;
    },
  });
}
