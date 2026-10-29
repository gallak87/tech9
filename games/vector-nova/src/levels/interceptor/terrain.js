import * as T from 'three';
import { createQuarry } from '../colossus/environment/quarry.js';
import { createColossusMountains } from '../colossus/environment/mountains.js';

// Reuse the finished Colossus geology. These stations describe extraction
// shoulders for this presentation only; the actual route/sections stay fixed.
export function createDispatchTerrain({ track, view }) {
  const stations = [
    ['headstock', 0.015],
    ['intake', 0.09],
    ['screw', 0.16],
    ['press', 0.26],
    ['die', 0.34],
    ['dive', 0.43],
    ['crossfeed', 0.51],
    ['auger', 0.57],
    ['gantry', 0.65],
    ['counterweight', 0.73],
    ['cooling', 0.81],
    ['crown', 0.91],
  ];
  const site = {
    ...track,
    sections: stations.map(([id, fraction]) => ({
      id,
      start: track.length * fraction,
      end: track.length * Math.min(0.99, fraction + 0.045),
    })),
  };
  const quarry = createQuarry(site, view?.renderer);
  const mountains = createColossusMountains(site, quarry);
  quarry.material.color.set('#7f8b8d');
  quarry.material.roughness = 0.97;
  const group = new T.Group();
  group.name = 'Dispatch / excavated factory shoulder and mountain ranges';
  group.add(quarry.mesh, mountains.group);
  const seats = [];
  const point = new T.Vector3();
  function seatedHeight(x, z, height) {
    for (const seat of seats) {
      point.set(x, 0, z).applyMatrix4(seat.inverse);
      const outside = Math.max(
        0,
        Math.abs(point.x) - seat.width / 2,
        Math.abs(point.z) - seat.depth / 2,
      );
      if (outside >= seat.feather) continue;
      const blend = T.MathUtils.smoothstep(outside, 0, seat.feather);
      height = Math.min(height, T.MathUtils.lerp(seat.height, height, blend));
    }
    return height;
  }
  let disposed = false;
  return {
    group,
    ready: quarry.ready,
    // Recess founded process decks into actual terrain, rather than hiding a
    // floating raft with a decorative collar. Only this owned mesh is changed.
    seat({ position, quaternion, width, depth, height, feather = 85 }) {
      seats.push({
        inverse: new T.Matrix4()
          .compose(
            new T.Vector3(position.x, 0, position.z),
            quaternion,
            new T.Vector3(1, 1, 1),
          )
          .invert(),
        width,
        depth,
        height,
        feather,
      });
      const positions = quarry.mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++)
        positions.setY(
          i,
          seatedHeight(positions.getX(i), positions.getZ(i), positions.getY(i)),
        );
      positions.needsUpdate = true;
      quarry.mesh.geometry.computeVertexNormals();
      quarry.mesh.geometry.computeBoundingSphere();
    },
    heightAt(x, z) {
      return seatedHeight(x, z, quarry.heightAt(x, z));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mountains.dispose();
      quarry.dispose();
      seats.length = 0;
      group.clear();
    },
  };
}
