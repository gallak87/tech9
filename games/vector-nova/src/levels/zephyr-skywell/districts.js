import * as T from 'three';

// Canonical Zephyr assemblies remain owned by the Zephyr kit. Skywell owns
// their relationships: a descending inhabited water district, not a new kit.
const FOUNDATION = {
  'cathedral-facade': ['island-grand', [1.25, 1.1, 1.15]],
  'nave-bay': ['island-terrace', [0.85, 0.85, 1.1]],
  chapel: ['island-grand', [1.1, 0.9, 1.15]],
  'falling-tower': ['island-shard', [0.95, 1.05, 1.05]],
  'cloudspire-needle': ['island-shard', [1.2, 1.35, 1.25]],
  'abbey-quarter': ['island-terrace', [1.1, 1, 1.35]],
};

const UP = new T.Vector3(0, 1, 0);
const scaleVector = (scale) =>
  Array.isArray(scale)
    ? new T.Vector3(...scale)
    : new T.Vector3().setScalar(scale);

export function populateSkywellDistricts({ track, place }) {
  const [crown, bell, veil, bank, light] = track.jumps;
  const road = [];
  for (let distance = 0; distance <= track.finishDistance; distance += 30)
    road.push(track.sample(distance).position);
  road.push(track.sample(track.finishDistance).position);
  const placed = [];
  function assembly(district, asset, distance, options) {
    const { lateral, height, yaw = 0, scale = 1, floating = false } = options;
    const frame = track.sample(distance);
    const right = new T.Vector3(
      frame.tangent.z,
      0,
      -frame.tangent.x,
    ).normalize();
    const size = scaleVector(scale);
    const position = frame.position
      .clone()
      .addScaledVector(right, lateral)
      .addScaledVector(UP, height);
    const object = place(asset, distance, { position, scale, yaw });
    object.updateWorldMatrix(true, true);
    const foundation = floating ? null : FOUNDATION[asset];
    let island = null;
    if (foundation) {
      const foot = new T.Box3().setFromObject(object).min.y;
      island = place(foundation[0], distance, {
        position: new T.Vector3(position.x, foot, position.z),
        scale: scaleVector(foundation[1]).multiply(size).toArray(),
        yaw,
      });
      island.updateWorldMatrix(true, true);
    }
    // Test the complete transformed assembly and its island, including the
    // neighbouring road on a bend. A distant centre alone proves no clearance.
    // These scenery bounds stay well outside the camera and flight corridor.
    for (let attempt = 0; attempt < 8; attempt++) {
      const bounds = new T.Box3().setFromObject(object);
      if (island) bounds.union(new T.Box3().setFromObject(island));
      bounds.expandByScalar(130);
      if (!road.some((point) => bounds.containsPoint(point))) break;
      for (const part of [object, island].filter(Boolean)) {
        part.position.addScaledVector(right, Math.sign(lateral) * 100);
        part.updateWorldMatrix(true, true);
      }
    }
    const decorate = (object, name) => {
      object.userData.skywellDistrict = district;
      object.userData.skywellAssembly = asset;
      object.name = `Skywell / ${district} / ${name} / ${Math.round(distance)}`;
      placed.push(object);
    };
    if (island) decorate(island, `${asset} foundation`);
    decorate(object, asset);
    return object;
  }

  // Crown: a broad asymmetric abbey edge and a shattered rose silhouette.
  // The illuminated landing remains an open diagonal between the two shores.
  assembly('Crown precinct', 'cathedral-facade', crown.takeoff + 440, {
    lateral: -360,
    height: -52,
    scale: 1.2,
    yaw: -0.45,
  });
  assembly('Crown precinct', 'broken-halo', crown.takeoff + 620, {
    lateral: 465,
    height: 215,
    scale: 1.35,
    yaw: -0.18,
    floating: true,
  });
  assembly('Crown precinct', 'abbey-quarter', crown.landingStart + 125, {
    lateral: -345,
    height: -60,
    scale: 1.15,
    yaw: 0.25,
  });
  assembly('Crown precinct', 'chapel', crown.landingStart + 395, {
    lateral: -435,
    height: -92,
    scale: 0.95,
    yaw: 0.25,
  });
  assembly('Cloister walk', 'nave-bay', crown.recovery + 140, {
    lateral: 340,
    height: 20,
    scale: 0.85,
    yaw: -0.1,
  });

  // Bell Dive falls between an upper belfry and a lower anchored tower. Their
  // bases show the actual vertical distance rather than floating at road level.
  assembly('Bell chasm', 'falling-tower', bell.takeoff - 110, {
    lateral: 245,
    height: -165,
    scale: 1.25,
    yaw: 0.1,
  });
  assembly('Bell chasm', 'falling-tower', bell.landingStart + 60, {
    lateral: -300,
    height: -115,
    scale: 1.4,
    yaw: 0.5,
  });
  assembly('Bell chasm', 'cloudspire-needle', bell.takeoff + 330, {
    lateral: 575,
    height: -485,
    scale: 1.3,
    yaw: -0.15,
  });
  assembly('Lower water abbey', 'abbey-quarter', bell.recovery + 140, {
    lateral: -350,
    height: -80,
    scale: 1.1,
    yaw: -0.4,
  });

  // The existing traversable veil stays exactly where it is. These off-axis
  // masonry silhouettes make its tube a destination in a larger water district.
  assembly('Veil cistern district', 'abbey-quarter', veil.takeoff - 205, {
    lateral: 365,
    height: -110,
    scale: 1.05,
    yaw: 0.25,
  });
  assembly('Veil cistern district', 'broken-halo', veil.takeoff + 230, {
    lateral: -340,
    height: 110,
    scale: 1.05,
    yaw: 0.35,
    floating: true,
  });
  assembly(
    'Veil cistern district',
    'cathedral-facade',
    veil.landingStart + 160,
    {
      lateral: 390,
      height: -62,
      scale: 1.1,
      yaw: -0.65,
    },
  );
  assembly('Water stair belfry', 'falling-tower', veil.recovery + 145, {
    lateral: -245,
    height: -155,
    scale: 0.95,
    yaw: 0.35,
  });

  // Counterbank reads as two inhabited cliff edges, with their open central
  // void preserving the opposing-bank arrival and its entire runout.
  assembly('Opposed terraces', 'abbey-quarter', bank.takeoff - 145, {
    lateral: -335,
    height: -70,
    scale: 1.2,
    yaw: 0.65,
  });
  assembly('Opposed terraces', 'chapel', bank.landingStart + 155, {
    lateral: 395,
    height: -65,
    scale: 1.25,
    yaw: -0.5,
  });
  assembly('Opposed terraces', 'nave-bay', bank.landingEnd - 90, {
    lateral: 350,
    height: -75,
    scale: 1,
    yaw: -0.35,
  });
  assembly('Opposed terraces', 'broken-halo', bank.takeoff + 410, {
    lateral: 560,
    height: 170,
    scale: 1.45,
    yaw: 0.45,
    floating: true,
  });

  // Last Light: the tall upstream tower gives way to a low, broad arrival
  // precinct. The final descent can see its destination against open warm sky.
  assembly('Last Light headwater', 'falling-tower', light.takeoff - 180, {
    lateral: -305,
    height: -125,
    scale: 1.35,
    yaw: 0.15,
  });
  assembly('Last Light arrival', 'abbey-quarter', light.landingStart + 270, {
    lateral: -385,
    height: -55,
    scale: 1.3,
    yaw: -0.45,
  });
  assembly('Last Light arrival', 'broken-halo', track.finishDistance - 80, {
    lateral: -575,
    height: 205,
    scale: 1.3,
    yaw: 0.15,
    floating: true,
  });
  return placed;
}
