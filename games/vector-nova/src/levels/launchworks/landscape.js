import * as T from 'three';
import { groundFrame } from '../../environment/placement.js';

// The race descends through inhabited limestone shores. These are authored
// stacked landforms, not a height field: water and empty air pass between them.
export function populateSkywellLandscape({ track, place }) {
  const terraces = [];
  const road = [];
  for (let s = 0; s <= track.finishDistance; s += 24)
    road.push(track.sample(s).position);
  const bounds = new T.Box3();
  function island(name, distance, options, garden = true) {
    const object = place(name, distance, options);
    const right = groundFrame(track, distance).right;
    for (let attempt = 0; attempt < 10; attempt++) {
      object.updateWorldMatrix(true, true);
      bounds.setFromObject(object);
      // Keep the actual upper rock triangles outside the broad flight/camera
      // corridor. A foundation well below the road can still support it.
      const blocked = road.some(
        (p) =>
          p.x > bounds.min.x - 105 &&
          p.x < bounds.max.x + 105 &&
          p.z > bounds.min.z - 105 &&
          p.z < bounds.max.z + 105 &&
          p.y > bounds.min.y - 160 &&
          p.y < bounds.max.y + 35,
      );
      if (!blocked) break;
      object.position.addScaledVector(
        right,
        Math.sign(options.lateral || 1) * 90,
      );
    }
    object.name = `Skywell / limestone water-garden shore / ${Math.round(distance)}`;
    object.userData.skywellLandform = true;
    if (garden) terraces.push({ object, seed: 710 + terraces.length * 37 });
    return object;
  }
  // A substantial departure and receiving shore sits beneath each actual deck.
  // Higher outboard escarpments give the flying camera a foreground and horizon.
  for (const [index, jump] of track.jumps.entries()) {
    const side = index % 2 ? -1 : 1;
    const upperShore = [180, 65, 190, 105, 130][index];
    const shoreDepth = [2.3, 3, 2.1, 1.9, 2.6][index];
    island('island-grand', jump.takeoff - 160, {
      lateral: -side * 110,
      height: -105,
      scale: [1.45, 1.35, 1.8],
      yaw: side * 0.3,
    });
    island('island-grand', jump.landingStart + 190, {
      lateral: side * 80,
      height: -105,
      scale: [1.55, 1.5, 1.85],
      yaw: -side * 0.25,
    });
    island('island-grand', jump.takeoff + 620, {
      lateral: -side * 515,
      height: upperShore,
      scale: [1.8, shoreDepth, 2],
      yaw: side * 0.18,
    });
    island('island-terrace', jump.takeoff + 30, {
      lateral: -side * 380,
      height: -225,
      scale: [1.6, 1.35, 1.9],
      yaw: side * 0.3,
    });
    island('island-terrace', jump.landingStart + 350, {
      lateral: side * 350,
      height: -210,
      scale: [1.8, 1.5, 2],
      yaw: -side * 0.35,
    });
    if (index < track.jumps.length - 1) {
      const next = track.jumps[index + 1];
      const connector = (jump.recovery + next.takeoff) / 2;
      island('island-grand', connector, {
        lateral: side * 255,
        height: -120,
        scale: [1.45, 1.45, 2.1],
        yaw: side * 0.2,
      });
      island(
        'island-shard',
        connector + 145,
        {
          lateral: -side * 410,
          height: -20,
          scale: [1.6, 2.2, 1.8],
          yaw: 0.8,
        },
        false,
      );
    }
  }
  return terraces;
}
