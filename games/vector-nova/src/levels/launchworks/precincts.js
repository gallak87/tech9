import * as T from 'three';
import {
  createRouteClearance,
  groundFrame,
} from '../../environment/placement.js';

const UP = new T.Vector3(0, 1, 0);
const FOUNDATIONS = {
  'nave-bay': ['island-terrace', [0.85, 0.85, 1.1]],
  'cathedral-facade': ['island-grand', [1.25, 1.1, 1.15]],
  'abbey-quarter': ['island-terrace', [1.1, 1, 1.35]],
  'falling-tower': ['island-shard', [0.95, 1.05, 1.05]],
  'cloudspire-needle': ['island-shard', [1.2, 1.35, 1.25]],
  chapel: ['island-grand', [1.1, 0.9, 1.15]],
};
const vectorScale = (value) =>
  Array.isArray(value)
    ? new T.Vector3(...value)
    : new T.Vector3(value, value, value);

// Skywell's close precincts reuse finished Zephyr assemblies. Their independent
// foundations are checked separately: a distant union AABB used to treat the
// empty sky between tower and shore as solid and exile whole districts.
export function populateSkywellPrecincts({
  track,
  place,
  districts = [],
  waterways = null,
  placements = [],
  terraces = [],
}) {
  const clearance = createRouteClearance(track, {
    spacing: 8,
    sidePadding: 12,
    localVertical: [-20, 35],
    longitudinalHalfLength: 12,
  });
  const objects = [],
    gardenTerraces = [],
    metrics = [];
  const bounds = new T.Box3();
  const centre = new T.Vector3(),
    size = new T.Vector3();
  function clear(part) {
    part.updateWorldMatrix(true, true);
    bounds.setFromObject(part);
    bounds.getCenter(centre);
    bounds.getSize(size);
    return clearance.clears(
      centre.x,
      centre.z,
      Math.max(size.x, 0.01),
      Math.max(size.z, 0.01),
      bounds.max.y,
      0,
      bounds.min.y,
    );
  }
  function site(district, distance, side, lateral, along, height) {
    const frame = groundFrame(track, distance);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, side * lateral)
      .addScaledVector(frame.tangent, along)
      .addScaledVector(UP, height);
    return { district, distance, side, lateral, frame, position };
  }
  function moveOrPlace(asset, site, scale, yaw = 0, existing = false) {
    const old =
      existing &&
      districts.find(
        (part) =>
          part.userData.skywellDistrict === site.district &&
          part.userData.skywellAssembly === asset &&
          !part.name.includes('foundation') &&
          (site.existingDistance == null ||
            part.name.endsWith(` / ${Math.round(site.existingDistance)}`)),
      );
    const oldFoundation =
      old &&
      districts.find(
        (part) =>
          part.userData.skywellDistrict === site.district &&
          part.userData.skywellAssembly === asset &&
          part.name.includes('foundation') &&
          (site.existingDistance == null ||
            part.name.endsWith(` / ${Math.round(site.existingDistance)}`)),
      );
    const object =
      old ||
      place(asset, site.distance, { position: site.position, scale, yaw });
    object.position.copy(site.position);
    object.scale.copy(vectorScale(scale));
    object.rotation.set(
      0,
      Math.atan2(site.frame.tangent.x, site.frame.tangent.z) + yaw,
      0,
    );
    object.updateWorldMatrix(true, true);
    const foundationSpec = FOUNDATIONS[asset];
    const floor = new T.Box3().setFromObject(object).min.y;
    const foundation =
      oldFoundation ||
      (foundationSpec &&
        place(foundationSpec[0], site.distance, {
          position: new T.Vector3(site.position.x, floor, site.position.z),
          scale: vectorScale(foundationSpec[1])
            .multiply(vectorScale(scale))
            .toArray(),
          yaw,
        }));
    if (foundation) {
      foundation.position.set(site.position.x, floor, site.position.z);
      foundation.scale.copy(
        vectorScale(foundationSpec[1]).multiply(vectorScale(scale)),
      );
      foundation.rotation.copy(object.rotation);
    }
    const parts = [object, foundation].filter(Boolean);
    let offset = 0;
    while (!parts.every(clear) && offset < 240) {
      offset += 24;
      for (const part of parts)
        part.position.addScaledVector(site.frame.right, site.side * 24);
    }
    if (!parts.every(clear))
      throw new Error(
        `No clear Skywell precinct site: ${site.district}/${asset}`,
      );
    for (const part of parts) {
      part.userData.skywellDistrict = site.district;
      part.userData.skywellAssembly = asset;
      part.userData.skywellPrecinct = true;
      if (!old || (part === object && !existing))
        part.name = `Skywell / ${site.district} / close ${asset}${part === foundation ? ' foundation' : ''}`;
      objects.push(part);
    }
    if (foundation && site.garden !== false)
      gardenTerraces.push({
        object: foundation,
        seed: 2381 + gardenTerraces.length * 73,
      });
    metrics.push({
      district: site.district,
      asset,
      lateral: site.side * (site.lateral + offset),
      reused: !!old,
    });
    return { object, foundation, offset };
  }

  const crown = track.jumps[0],
    veil = track.jumps[2];
  const cloister = crown.recovery + 140;
  // Two overlapping real vaulted bays form one occupied edge, rather than
  // detached objects on display islands. The open race corridor stays outside.
  moveOrPlace(
    'nave-bay',
    site('Cloister walk', cloister, -1, 169, 150, -26),
    0.95,
    0,
    true,
  );
  moveOrPlace(
    'nave-bay',
    site('Cloister walk', cloister, -1, 169, 222, -26),
    0.95,
  );
  // The Veil arrival now exposes the carved facade, not its blank deep return.
  // Repositioning the existing assembly adds no hero geometry or extra memory.
  moveOrPlace(
    'cathedral-facade',
    site('Veil cistern district', veil.landingStart + 160, 1, 245, 0, -62),
    1.1,
    0.08,
    true,
  );
  moveOrPlace(
    'abbey-quarter',
    site('Veil cistern district', veil.landingStart + 160, -1, 185, 220, -48),
    0.82,
    -0.14,
    true,
  );

  // Bring the existing closed canal/source/receiver assembly beside the
  // cloister as one piece. Its masonry arches, receiving pool and foundation
  // shores keep their original relationships; no extra water layer is added.
  const canalName = 'Cloister garden canal';
  const canal = waterways?.group.children.find(
    (part) => part.userData.skywellDistrict === canalName,
  );
  if (canal) {
    const shores = placements.filter(
      (part) => part.userData.skywellDistrict === canalName,
    );
    const frame = groundFrame(track, cloister);
    const destination = frame.position
      .clone()
      .addScaledVector(frame.right, -206)
      .addScaledVector(frame.tangent, 180)
      .addScaledVector(UP, -35);
    const rotation = new T.Quaternion().setFromAxisAngle(
      UP,
      Math.atan2(frame.tangent.x, frame.tangent.z),
    );
    const delta = rotation.clone().multiply(canal.quaternion.clone().invert());
    const origin = canal.position.clone();
    const parts = [canal, ...shores];
    for (const part of parts) {
      part.position.sub(origin).applyQuaternion(delta).add(destination);
      part.quaternion.premultiply(delta);
    }
    let offset = 0;
    while (!parts.every(clear) && offset < 240) {
      offset += 24;
      for (const part of parts) part.position.addScaledVector(frame.right, -24);
    }
    if (!parts.every(clear))
      throw new Error('No clear Skywell cloister canal site');
    canal.userData.skywellCanal.lateral = -206 - offset;
    for (const shore of shores)
      gardenTerraces.push({
        object: shore,
        seed: 4177 + gardenTerraces.length * 73,
      });
    metrics.push({
      district: canalName,
      asset: 'connected canal',
      lateral: -206 - offset,
      reused: true,
    });
  }

  // Last Light's original receiving shore becomes a water-garden district.
  // Reuse the complete bounded spillway, including its carved lip, 350 m fall,
  // lower receiver and all support shores. Its new flow faces the approaching
  // camera, so the drop reads off the mineral edge rather than behind a plinth.
  const light = track.jumps[4];
  const terraceAt = (distance) =>
    terraces.find(({ object }) =>
      object.name.endsWith(` / ${Math.round(distance)}`),
    );
  const receivingShore = terraceAt(light.landingStart + 190);
  const lowerGarden = terraceAt(light.landingStart + 350);
  const spillwayName = 'Last Light spillway';
  const spillway = waterways?.group.children.find(
    (part) => part.userData.skywellDistrict === spillwayName,
  );
  if (receivingShore && spillway) {
    const shore = receivingShore.object;
    shore.updateWorldMatrix(true, true);
    const right = new T.Vector3(1, 0, 0).applyQuaternion(shore.quaternion);
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(shore.quaternion);
    const destination = shore.position
      .clone()
      .addScaledVector(right, -45)
      .addScaledVector(forward, -55)
      .addScaledVector(UP, 6);
    const desired = shore.quaternion
      .clone()
      .multiply(new T.Quaternion().setFromAxisAngle(UP, Math.PI));
    const delta = desired
      .clone()
      .multiply(spillway.quaternion.clone().invert());
    const origin = spillway.position.clone();
    const supportShores = placements.filter(
      (part) => part.userData.skywellDistrict === spillwayName,
    );
    const parts = [spillway, ...supportShores];
    for (const part of parts) {
      part.position.sub(origin).applyQuaternion(delta).add(destination);
      part.quaternion.premultiply(delta);
    }
    const initial = parts.map((part) => part.position.clone());
    let plantedOffset = null;
    for (const offset of [0, 24, 48, 72, 96]) {
      parts.forEach((part, index) =>
        part.position.copy(initial[index]).addScaledVector(right, offset),
      );
      if (!parts.every(clear)) continue;
      plantedOffset = offset;
      break;
    }
    if (plantedOffset == null)
      throw new Error('Last Light water-garden shore has no clear site');
    spillway.userData.skywellCanal.shore = 'Last Light receiving water garden';
    metrics.push({
      district: spillwayName,
      asset: 'shore-seated spillway',
      shoreOffset: plantedOffset,
      reused: true,
    });

    const garden = (weight, trees, shrubs, treeScale, clumps) => ({
      weight,
      trees,
      shrubs,
      treeScale,
      shrubScale: [1.05, 1.7],
      rotation: 0,
      treeRadius: 0.26,
      shrubRadius: 0.31,
      treeSpacing: 19,
      shrubSpacing: 6.5,
      clumps,
      clearance,
    });
    receivingShore.garden = garden(
      7,
      28,
      40,
      [0.28, 0.4],
      [
        [-0.45, -0.12],
        [0.22, 0.09],
        [0.36, 0.47],
      ],
    );
    if (lowerGarden)
      lowerGarden.garden = garden(
        5,
        22,
        32,
        [0.25, 0.36],
        [
          [-0.36, 0.2],
          [0.05, -0.36],
          [0.38, 0.21],
        ],
      );
    for (const [index, object] of supportShores.entries()) {
      // Only actual mineral surfaces can receive roots; the source itself is
      // already an architectural blocker and is never treated as soil.
      if (!/island/.test(object.name)) continue;
      gardenTerraces.push({
        object,
        seed: 7021 + index * 73,
        garden: garden(
          2,
          14,
          20,
          [0.22, 0.32],
          [
            [-0.35, 0.18],
            [0.18, -0.25],
            [0.35, 0.3],
          ],
        ),
      });
    }
    const abbeySite = site(
      'Last Light arrival',
      light.landingStart + 190,
      1,
      160,
      0,
      0,
    );
    abbeySite.position
      .copy(shore.position)
      .addScaledVector(right, 80)
      .addScaledVector(forward, 100)
      .addScaledVector(UP, 10);
    moveOrPlace('abbey-quarter', abbeySite, 0.85, -0.25, true);
  }

  // Bell's orchard falls across the shore, whereas Counterbank's compact
  // chapel court follows the long mineral edge. Both move existing complete
  // hydraulic assemblies instead of repeating Last Light's abbey composition.
  function shoreWater(
    name,
    terrace,
    { across, along, yaw, scale = 1, side, planted = true },
  ) {
    const district = waterways?.group.children.find(
      (part) => part.userData.skywellDistrict === name,
    );
    if (!district || !terrace) return null;
    const shore = terrace.object;
    const right = new T.Vector3(1, 0, 0).applyQuaternion(shore.quaternion);
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(shore.quaternion);
    const target = shore.position
      .clone()
      .addScaledVector(right, across)
      .addScaledVector(forward, along)
      .addScaledVector(UP, 6);
    const desired = shore.quaternion
      .clone()
      .multiply(new T.Quaternion().setFromAxisAngle(UP, yaw));
    const delta = desired
      .clone()
      .multiply(district.quaternion.clone().invert());
    const origin = district.position.clone();
    const shores = placements.filter(
      (part) => part.userData.skywellDistrict === name,
    );
    const parts = [district, ...shores];
    for (const part of parts) {
      part.position
        .sub(origin)
        .multiplyScalar(scale)
        .applyQuaternion(delta)
        .add(target);
      part.quaternion.premultiply(delta);
      part.scale.multiplyScalar(scale);
    }
    const initial = parts.map((part) => part.position.clone());
    let shift = null;
    for (const amount of [0, 24, 48, 72]) {
      parts.forEach((part, index) =>
        part.position
          .copy(initial[index])
          .addScaledVector(right, side * amount),
      );
      if (!parts.every(clear)) continue;
      shift = amount;
      break;
    }
    if (shift == null) throw new Error(`No clear cultivated shore: ${name}`);
    district.userData.skywellCanal.shore = name;
    metrics.push({
      district: name,
      asset: 'shore-seated hydraulic court',
      shoreOffset: shift,
      scale,
      reused: true,
    });
    for (const [index, object] of shores.entries()) {
      if (!planted) continue;
      if (!/island/.test(object.name)) continue;
      gardenTerraces.push({
        object,
        seed: 8053 + index * 71 + name.length * 13,
        garden: {
          weight: 1.3,
          trees: 10,
          shrubs: 16,
          treeScale: [0.2, 0.29],
          shrubScale: [1, 1.5],
          treeSpacing: 17,
          shrubSpacing: 6,
          rotation: 0,
          clumps: [
            [-0.3, 0.17],
            [0.18, -0.24],
            [0.31, 0.25],
          ],
          clearance,
        },
      });
    }
    return { shore, right, forward };
  }
  const bell = track.jumps[1],
    bank = track.jumps[3];
  const bellShore = terraceAt(bell.landingStart + 190);
  const orchard = shoreWater('Bell water stair', bellShore, {
    across: -22,
    along: -16,
    yaw: -Math.PI / 2,
    side: -1,
  });
  if (orchard) {
    bellShore.garden = {
      weight: 4,
      trees: 24,
      shrubs: 34,
      treeScale: [0.24, 0.35],
      shrubScale: [1.05, 1.65],
      treeSpacing: 19,
      shrubSpacing: 6.5,
      treeRadius: 0.24,
      shrubRadius: 0.3,
      rotation: 0,
      clumps: [
        [-0.33, -0.36],
        [0.2, -0.27],
        [0.25, 0.38],
      ],
      clearance,
    };
    const tower = site('Bell chasm', bell.landingStart + 190, -1, 215, 0, 0);
    tower.existingDistance = bell.landingStart + 60;
    tower.position
      .copy(orchard.shore.position)
      .addScaledVector(orchard.right, -132)
      .addScaledVector(orchard.forward, 95)
      .addScaledVector(UP, -12);
    moveOrPlace('falling-tower', tower, 1.15, 0.25, true);
  }
  const bankShore = terraceAt(bank.landingStart + 190);
  const court = shoreWater('Counterbank water street', bankShore, {
    across: 38,
    along: -54,
    yaw: Math.PI,
    scale: 0.72,
    side: -1,
  });
  if (court) {
    bankShore.garden = {
      weight: 4,
      trees: 24,
      shrubs: 34,
      treeScale: [0.25, 0.36],
      shrubScale: [1.05, 1.65],
      treeSpacing: 20,
      shrubSpacing: 6.5,
      treeRadius: 0.24,
      shrubRadius: 0.3,
      rotation: 0.12,
      clumps: [
        [-0.38, 0.25],
        [0.29, 0.3],
        [-0.32, -0.29],
      ],
      clearance,
    };
    const chapel = site(
      'Opposed terraces',
      bank.landingStart + 190,
      -1,
      212,
      0,
      0,
    );
    chapel.position
      .copy(court.shore.position)
      .addScaledVector(court.right, -132)
      .addScaledVector(court.forward, 90)
      .addScaledVector(UP, 8);
    moveOrPlace('chapel', chapel, 0.9, 0.25, true);
  }

  // Crown opens into a formal rose-window forecourt. The cathedral's detailed
  // negative-Z face looks back toward the approach, left of the tall catch
  // beacons; the intact headwater crosses the mineral court to a lower pool.
  // Keep this entrance open rather than repeating the later orchard masses.
  const crownShore = terraceAt(crown.landingStart + 190);
  const forecourt = shoreWater('Crown headwater', crownShore, {
    across: 0,
    along: 0,
    yaw: -Math.PI / 2,
    side: 1,
    planted: false,
  });
  if (forecourt) {
    const facade = site(
      'Crown precinct',
      crown.landingStart + 190,
      1,
      150,
      0,
      0,
    );
    facade.position
      .copy(forecourt.shore.position)
      .addScaledVector(forecourt.right, 150)
      .addScaledVector(forecourt.forward, 90)
      .addScaledVector(UP, 8);
    const shoreYaw = new T.Euler().setFromQuaternion(
      forecourt.shore.quaternion,
      'YXZ',
    ).y;
    const routeYaw = Math.atan2(facade.frame.tangent.x, facade.frame.tangent.z);
    moveOrPlace('cathedral-facade', facade, 1.05, shoreYaw - routeYaw, true);
  }

  // The long Counterbank runout looks toward this existing vaulted court at
  // the next crest. Its mineral foundation carries the raised masonry, while
  // the unchanged lower chapel/water street remains the airborne destination.
  moveOrPlace(
    'nave-bay',
    site('Opposed terraces', bank.recovery + 270, -1, 180, 0, 140),
    1.3,
    0,
    true,
  );

  // This existing shattered crown becomes the final runout's distant vista,
  // high and outboard of the road rather than a gate on the flying line.
  moveOrPlace(
    'broken-halo',
    site('Last Light arrival', track.finishDistance - 60, 1, 400, 0, 550),
    1.3,
    -2.551126,
    true,
  );

  // A single anchored needle balances the opposite nave shore from the
  // grounded Cloister view. Its small occupied footing needs no planted court.
  const needle = site('Cloister water needle', cloister, 1, 300, 450, -80);
  needle.garden = false;
  moveOrPlace('cloudspire-needle', needle, 0.8);

  return { objects, gardenTerraces, metrics };
}
