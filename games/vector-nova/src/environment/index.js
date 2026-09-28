import * as THREE from 'three';
import {
  createBatches,
  facadeGeometry,
  roofGeometry,
  ellipticalTowerGeometry,
} from './geometry.js';
import { createSurfaces, randomSource } from './surfaces.js';
import { createMeridianPrecinct } from './precinct.js';
import { groundFrame, createRouteClearance } from './placement.js';

export function createEnvironment(track) {
  const group = new THREE.Group();
  group.name = 'Halcyon / inhabited metropolitan infrastructure';
  const groundY = track.groundY ?? -78;
  const random = randomSource(93017);
  const { surfaces, textures, update: updateSurfaces } = createSurfaces();
  const batch = createBatches(group, surfaces);
  const box = (...args) => batch.primitive('box', ...args);
  const cylinder = (...args) => batch.primitive('cylinder', ...args);
  const route = [];
  const bounds = new THREE.Box3();
  for (let s = 0; s < track.length; s += 16) {
    const p = track.sample(s).position;
    route.push(p);
    bounds.expandByPoint(p);
  }
  const routeClearance = createRouteClearance(track);
  const clearsRoute = routeClearance.clears;
  const precinct = createMeridianPrecinct(track, batch);
  const centre = bounds.getCenter(new THREE.Vector3());
  const first = groundFrame(track, 70);
  const landmark = first.position
    .clone()
    .addScaledVector(first.tangent, 900)
    .addScaledVector(first.right, 165);
  landmark.y = groundY;
  const landmarkYaw = Math.atan2(first.tangent.x, first.tangent.z);
  let placedBuildings = 0;
  let rejectedBuildings = 0;

  function distanceToRoute(x, z) {
    let nearest = Infinity;
    for (const p of route)
      nearest = Math.min(nearest, Math.hypot(p.x - x, p.z - z));
    return nearest;
  }

  while (
    !clearsRoute(landmark.x, landmark.z, 142, 104, groundY + 540, landmarkYaw)
  )
    landmark.addScaledVector(first.tangent, 40);
  const reserved = [{ x: landmark.x, z: landmark.z, radius: 130 }];
  const concourseFrame = groundFrame(track, precinct.layout.concourseDistance);
  const concourseSite = concourseFrame.position
    .clone()
    .addScaledVector(concourseFrame.right, 106);
  const concourseAngle = Math.atan2(
    concourseFrame.tangent.x,
    concourseFrame.tangent.z,
  );
  if (
    clearsRoute(
      concourseSite.x,
      concourseSite.z,
      96,
      155,
      concourseFrame.position.y + 19,
      concourseAngle,
    )
  ) {
    reserved.push({ x: concourseSite.x, z: concourseSite.z, radius: 94 });
  }
  const waterSection =
    track.sections.find((section) => section.id === 'waterfront') ??
    track.sections.find((section) => section.id === 'south');
  if (waterSection) {
    const waterFrame = groundFrame(
      track,
      (waterSection.start + waterSection.end) / 2,
    );
    for (const side of [-1, 1]) {
      const p = waterFrame.position
        .clone()
        .addScaledVector(waterFrame.right, side * 100);
      const yaw = Math.atan2(waterFrame.tangent.x, waterFrame.tangent.z);
      if (clearsRoute(p.x, p.z, 105, 200, groundY + 9, yaw))
        reserved.push({ x: p.x, z: p.z, radius: 113 });
    }
  }
  const sightline = landmark.clone().sub(first.position);
  const sightLength = Math.hypot(sightline.x, sightline.z);
  sightline.y = 0;
  sightline.normalize();
  function blocksLandmark(x, z, height, radius) {
    const dx = x - first.position.x,
      dz = z - first.position.z;
    const along = dx * sightline.x + dz * sightline.z;
    const across = Math.abs(dx * sightline.z - dz * sightline.x);
    return (
      along > 120 &&
      along < sightLength - 115 &&
      across < radius + 32 &&
      height > 130 + along * 0.18
    );
  }
  function localPoint(x, z, yaw, localX, localZ) {
    return [
      x + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
      z - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
    ];
  }
  function localBox(
    surface,
    x,
    y,
    z,
    width,
    height,
    depth,
    yaw,
    offsetX = 0,
    offsetZ = 0,
    detail = false,
    tint = '#ffffff',
  ) {
    const [px, pz] = localPoint(x, z, yaw, offsetX, offsetZ);
    box(surface, px, y, pz, width, height, depth, yaw, detail, tint);
  }
  function shell(
    surface,
    x,
    base,
    z,
    width,
    depth,
    height,
    yaw = 0,
    taper = 1,
    tint = '#ffffff',
    horizon = false,
  ) {
    const geometry = facadeGeometry(width, depth, height, taper);
    batch.add(
      geometry,
      surface,
      x,
      base,
      z,
      1,
      1,
      1,
      yaw,
      false,
      tint,
      horizon,
    );
    geometry.dispose();
    const roof = roofGeometry(width * taper, depth * taper);
    batch.add(
      roof,
      'dark',
      x,
      base + height,
      z,
      1,
      1,
      1,
      yaw,
      false,
      tint,
      horizon,
    );
    roof.dispose();
  }
  function mechanicalRoof(x, y, z, width, depth, yaw, detailed) {
    localBox(
      'dark',
      x,
      y + 2.1,
      z,
      width * 0.35,
      4.2,
      depth * 0.34,
      yaw,
      -width * 0.17,
      0,
      detailed,
    );
    localBox(
      'steel',
      x,
      y + 4.4,
      z,
      width * 0.38,
      0.45,
      depth * 0.37,
      yaw,
      -width * 0.17,
      0,
      detailed,
    );
    for (let i = 0; i < 3; i += 1) {
      const [px, pz] = localPoint(
        x,
        z,
        yaw,
        width * 0.23,
        (i - 1) * depth * 0.2,
      );
      cylinder('steel', px, y + 2, pz, 4.8, 4, 4.8, 0, detailed);
      cylinder('dark', px, y + 4.03, pz, 3.7, 0.2, 3.7, 0, detailed);
    }
    if (detailed) {
      for (let i = -2; i <= 2; i += 1)
        localBox(
          'steel',
          x,
          y + 4.8,
          z,
          width * 0.32,
          0.18,
          0.25,
          yaw,
          -width * 0.17,
          i * 1.1,
          true,
        );
      localBox(
        'steel',
        x,
        y + 0.7,
        z,
        width * 0.74,
        0.3,
        0.38,
        yaw,
        0,
        -depth * 0.3,
        true,
      );
      localBox(
        'warm',
        x,
        y + 4.7,
        z,
        1.6,
        0.22,
        0.3,
        yaw,
        -width * 0.3,
        -depth * 0.17,
        true,
      );
    }
  }
  function terraces(x, y, z, width, depth, yaw, detail) {
    localBox('concrete', x, y + 0.25, z, width, 0.5, depth, yaw);
    for (const side of [-1, 1]) {
      localBox(
        'stone',
        x,
        y + 0.7,
        z,
        width - 3,
        1.4,
        1,
        yaw,
        0,
        side * (depth / 2 - 1),
      );
      if (detail) {
        localBox(
          'vegetation',
          x,
          y + 1.35,
          z,
          width - 7,
          1.1,
          2.2,
          yaw,
          0,
          side * (depth / 2 - 3),
          true,
        );
        for (const offset of [-0.25, 0, 0.25]) {
          const [px, pz] = localPoint(
            x,
            z,
            yaw,
            width * offset,
            side * (depth / 2 - 3),
          );
          batch.primitive(
            'shrub',
            'vegetation',
            px,
            y + 2.5,
            pz,
            3.8,
            3.2,
            3.8,
            0,
            true,
          );
        }
      }
    }
  }
  function curvedOffice(
    x,
    z,
    width,
    depth,
    height,
    yaw,
    detailed,
    horizon = false,
  ) {
    const pedestalHeight = 14;
    if (!horizon) {
      shell(
        'industrial',
        x,
        groundY,
        z,
        width + 9,
        depth + 9,
        pedestalHeight,
        yaw,
        1,
        '#bbc7c2',
      );
      terraces(
        x,
        groundY + pedestalHeight,
        z,
        width + 11,
        depth + 11,
        yaw,
        detailed,
      );
    }
    const base = horizon ? groundY : groundY + pedestalHeight + 1;
    const tower = ellipticalTowerGeometry(
      width,
      depth,
      height - pedestalHeight,
      0.8,
    );
    batch.add(
      tower.walls,
      'ribbonGlass',
      x,
      base,
      z,
      1,
      1,
      1,
      yaw,
      false,
      '#d4e5e4',
      horizon,
    );
    batch.add(
      tower.roof,
      'steel',
      x,
      base,
      z,
      1,
      1,
      1,
      yaw,
      false,
      '#98abaa',
      horizon,
    );
    tower.walls.dispose();
    tower.roof.dispose();
    if (!horizon) {
      // Three recessed service fins express the elliptical form, not floor stripes.
      for (const angle of [0, Math.PI * 0.65, Math.PI * 1.35]) {
        const [px, pz] = localPoint(
          x,
          z,
          yaw,
          Math.cos(angle) * width * 0.38,
          Math.sin(angle) * depth * 0.38,
        );
        box(
          'steel',
          px,
          base + (height - pedestalHeight) * 0.45,
          pz,
          1.2,
          (height - pedestalHeight) * 0.86,
          1.2,
          yaw,
          detailed,
        );
      }
      const [plantX, plantZ] = localPoint(x, z, yaw, -width * 0.12, 0);
      mechanicalRoof(
        plantX,
        groundY + height - 4,
        plantZ,
        width * 0.27,
        depth * 0.35,
        yaw,
        detailed,
      );
    }
  }

  function urbanBlock(x, z, district, detailed) {
    const floorSurface =
      district === 'utility'
        ? 'industrial'
        : district === 'residential'
          ? 'ceramicWindows'
          : 'ribbonGlass';
    const tone = district === 'residential' ? '#cbbdac' : '#abb9b6';
    const lowHeight = district === 'utility' ? 12 : 8.5;
    box('pavement', x, groundY + 0.14, z, 103, 0.28, 115);
    const complete = clearsRoute(x, z, 104, 116, Infinity);
    if (complete) {
      // Street walls form a city block; a sunken courtyard owns its centre.
      for (const side of [-1, 1])
        shell(
          floorSurface,
          x + side * 37,
          groundY + 0.3,
          z,
          28,
          112,
          lowHeight,
          0,
          1,
          tone,
        );
      shell(
        floorSurface,
        x,
        groundY + 0.3,
        z + 41,
        47,
        30,
        lowHeight,
        0,
        1,
        tone,
      );
      box('vegetation', x, groundY + 0.45, z - 33, 42, 0.4, 28);
      box('pavement', x, groundY + 0.75, z - 33, 3.5, 0.14, 32);
      if (detailed) {
        for (const side of [-1, 1]) {
          box(
            'steel',
            x + side * 37,
            groundY + lowHeight + 0.6,
            z - 17,
            17,
            0.7,
            38,
            0,
            true,
          );
          box(
            'dark',
            x + side * 37,
            groundY + lowHeight + 1,
            z - 17,
            15,
            0.12,
            35,
            0,
            true,
          );
          box(
            'warm',
            x + side * 21.5,
            groundY + 5.2,
            z - 16,
            0.17,
            0.15,
            28,
            0,
            true,
          );
        }
      }
    } else {
      // A viaduct cutting a parcel produces service yards, not a vanished city block.
      for (const dx of [-28, 28])
        for (const dz of [-32, 32]) {
          if (clearsRoute(x + dx, z + dz, 40, 45, Infinity)) {
            shell(
              'industrial',
              x + dx,
              groundY + 0.3,
              z + dz,
              38,
              43,
              lowHeight * 0.76,
              0,
              1,
              '#abb8b3',
            );
            box(
              'steel',
              x + dx,
              groundY + lowHeight * 0.76 + 0.65,
              z + dz,
              26,
              0.7,
              17,
              0,
              detailed,
            );
          } else {
            box('vegetation', x + dx, groundY + 0.35, z + dz, 27, 0.3, 32);
            box('pavement', x + dx, groundY + 0.55, z + dz, 3, 0.12, 33);
          }
        }
    }
  }

  const heroSites = [
    [-252, 138],
    [-252, 276],
    [-252, 414],
    [-252, 0],
    [252, 0],
    [252, 276],
    [-378, -276],
    [-126, -552],
    [126, -552],
  ];
  function finishedRoomFacade(
    x,
    z,
    span,
    perpendicular,
    height,
    base,
    angle,
    side,
    family,
  ) {
    const [originX, originZ] = localPoint(
      x,
      z,
      angle,
      0,
      (side * perpendicular) / 2,
    );
    const yaw = angle + (side < 0 ? Math.PI : 0);
    const geometryParts = new Map();
    function quad(surface, points) {
      const record = geometryParts.get(surface) ?? {
        positions: [],
        uv: [],
        indices: [],
      };
      const n = record.positions.length / 3;
      for (const p of points) record.positions.push(...p);
      record.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      record.indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
      geometryParts.set(surface, record);
    }
    const usable = span * 0.82;
    const bays = Math.max(3, Math.round(usable / 6.8));
    const columns = usable / bays;
    const floors = Math.max(4, Math.floor(height / 4.5));
    const rise = height / floors;
    const structure = family === 'mineral' ? 'stone' : 'steel';
    // These selected foreground sites have real cavity rooms behind glazing; their
    // light/parallax and internal side walls change with the driving viewpoint.
    for (let floor = 0; floor < floors; floor += 1) {
      for (let bay = 0; bay < bays; bay += 1) {
        const left = -usable / 2 + bay * columns + 0.5;
        const right = left + columns - 1;
        const bottom = floor * rise + 0.75,
          top = (floor + 1) * rise - 0.4;
        const selected =
          Math.abs(Math.floor(x * 31 + z * 13 + floor * 71 + bay * 103)) % 13;
        const room =
          selected < 2 ? 'roomWarm' : selected === 3 ? 'roomCool' : 'roomDark';
        quad(room, [
          [left, bottom, 0.1],
          [right, bottom, 0.1],
          [right, top, 0.1],
          [left, top, 0.1],
        ]);
        quad(room, [
          [left, bottom, 2.6],
          [left, bottom, 0.1],
          [left, top, 0.1],
          [left, top, 2.6],
        ]);
        quad(room, [
          [right, bottom, 0.1],
          [right, bottom, 2.6],
          [right, top, 2.6],
          [right, top, 0.1],
        ]);
        quad('roomDark', [
          [left, bottom, 0.1],
          [left, bottom, 2.6],
          [right, bottom, 2.6],
          [right, bottom, 0.1],
        ]);
        quad(room, [
          [left, top, 2.6],
          [left, top, 0.1],
          [right, top, 0.1],
          [right, top, 2.6],
        ]);
        quad('heroGlass', [
          [left, bottom, 2.62],
          [right, bottom, 2.62],
          [right, top, 2.62],
          [left, top, 2.62],
        ]);
        if (selected < 4) {
          quad('dark', [
            [left + columns * 0.45, bottom, 0.65],
            [left + columns * 0.53, bottom, 0.65],
            [left + columns * 0.53, top, 0.65],
            [left + columns * 0.45, top, 0.65],
          ]);
        }
      }
      localBox(
        structure,
        x,
        base + floor * rise + 0.2,
        z,
        usable + 1.7,
        1.2,
        3.8,
        angle,
        0,
        side * (perpendicular / 2 + 1.6),
        true,
        '#b8c0b9',
      );
    }
    for (let bay = 0; bay <= bays; bay += 1)
      localBox(
        structure,
        x,
        base + height / 2,
        z,
        1.05,
        height + 1,
        3.7,
        angle,
        -usable / 2 + bay * columns,
        side * (perpendicular / 2 + 1.6),
        true,
        '#b8c0b9',
      );
    for (const [surface, data] of geometryParts) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(data.positions, 3),
      );
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
      geometry.setIndex(data.indices);
      geometry.computeVertexNormals();
      batch.add(geometry, surface, originX, base, originZ, 1, 1, 1, yaw, true);
      geometry.dispose();
    }
    localBox(
      structure,
      x,
      base + height + 0.65,
      z,
      usable + 1.9,
      1.3,
      3.8,
      angle,
      0,
      side * (perpendicular / 2 + 1.55),
      true,
      '#b8c0b9',
    );
  }

  function finishFacadeBays(x, z, width, depth, height, base, yaw, family) {
    let nearest = null,
      distance = Infinity;
    for (const p of route) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < distance) {
        nearest = p;
        distance = d;
      }
    }
    if (distance > 255 || height < 26) return;
    const dx =
      (nearest.x - x) * Math.cos(yaw) - (nearest.z - z) * Math.sin(yaw);
    const dz =
      (nearest.x - x) * Math.sin(yaw) + (nearest.z - z) * Math.cos(yaw);
    const faces = [];
    if (Math.abs(dz) > Math.abs(dx) * 0.65)
      faces.push([width, depth, yaw, Math.sign(dz)]);
    if (Math.abs(dx) > Math.abs(dz) * 0.65)
      faces.push([depth, width, yaw + Math.PI / 2, Math.sign(dx)]);
    const hero = heroSites.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 35);
    for (const [span, perpendicular, angle, side] of faces) {
      if (hero) {
        finishedRoomFacade(
          x,
          z,
          span,
          perpendicular,
          height,
          base,
          angle,
          side,
          family,
        );
        continue;
      }

      const bays = Math.max(3, Math.round(span / 11.8));
      const inset = span * 0.11;
      const usable = span - inset * 2;
      const surface = family === 'mineral' ? 'stone' : 'steel';
      // Full-depth load-bearing piers stand proud of recessed glazed bays.
      for (let bay = 0; bay <= bays; bay += 1) {
        const offset = -usable / 2 + (usable * bay) / bays;
        localBox(
          surface,
          x,
          base + height / 2,
          z,
          family === 'mineral' ? 1.55 : 0.85,
          height,
          1.8,
          angle,
          offset,
          side * (perpendicular / 2 + 0.6),
          true,
          '#bdc3bd',
        );
        localBox(
          'dark',
          x,
          base + height / 2,
          z,
          0.17,
          height - 1,
          0.2,
          angle,
          offset + 0.7,
          side * (perpendicular / 2 + 1.56),
          true,
        );
      }
      for (let floor = 0; floor < height - 1; floor += 12.6) {
        localBox(
          surface,
          x,
          base + floor + 0.4,
          z,
          usable + 1.6,
          0.8,
          2.2,
          angle,
          0,
          side * (perpendicular / 2 + 0.6),
          true,
          '#bec4bd',
        );
        localBox(
          'dark',
          x,
          base + floor + 1.4,
          z,
          usable,
          1.15,
          0.16,
          angle,
          0,
          side * (perpendicular / 2 + 0.16),
          true,
          '#879799',
        );
      }
      // Thick final parapet and recessed service rail finish the silhouette.
      localBox(
        surface,
        x,
        base + height + 0.6,
        z,
        usable + 1.8,
        1.2,
        1.7,
        angle,
        0,
        side * (perpendicular / 2 + 0.38),
        true,
        '#bdc3bd',
      );
    }
  }

  function commercialTower(x, z, width, depth, height, yaw, detailed, style) {
    if (style === 3) {
      curvedOffice(x, z, width, depth, height, yaw, detailed);
      return;
    }
    const podiumHeight = 12 + Math.min(14, height * 0.09);
    const tone = random() > 0.5 ? '#e4e3da' : '#c1ccd0';
    shell(
      'stoneWindows',
      x,
      groundY,
      z,
      width + 9,
      depth + 9,
      podiumHeight,
      yaw,
      1,
      tone,
    );
    terraces(
      x,
      groundY + podiumHeight,
      z,
      width + 10,
      depth + 10,
      yaw,
      detailed,
    );
    const towerBase = groundY + podiumHeight + 0.5;
    const lowerHeight = (height - podiumHeight) * (style === 0 ? 0.67 : 0.81);
    const topHeight = height - podiumHeight - lowerHeight;
    const surface =
      style === 2 ? 'ceramicWindows' : style === 1 ? 'silverGlass' : 'glass';
    const taper = style === 0 ? 0.87 : 1;
    shell(
      surface,
      x,
      towerBase,
      z,
      width,
      depth,
      lowerHeight,
      yaw,
      taper,
      tone,
    );
    const [upperX, upperZ] = localPoint(
      x,
      z,
      yaw,
      style === 1 ? width * 0.12 : 0,
      0,
    );
    const upperWidth = width * (style === 1 ? 0.62 : 0.77),
      upperDepth = depth * 0.77;
    terraces(
      x,
      towerBase + lowerHeight,
      z,
      width * taper,
      depth * taper,
      yaw,
      detailed,
    );
    shell(
      surface,
      upperX,
      towerBase + lowerHeight + 0.5,
      upperZ,
      upperWidth,
      upperDepth,
      topHeight,
      yaw,
      style === 0 ? 0.88 : 1,
      tone,
    );
    if (style !== 0) {
      finishFacadeBays(
        x,
        z,
        width,
        depth,
        lowerHeight,
        towerBase,
        yaw,
        style === 2 ? 'mineral' : 'metal',
      );
      finishFacadeBays(
        upperX,
        upperZ,
        upperWidth,
        upperDepth,
        topHeight,
        towerBase + lowerHeight + 0.5,
        yaw,
        style === 2 ? 'mineral' : 'metal',
      );
    }
    const roofY = groundY + height + 1;
    terraces(
      upperX,
      roofY,
      upperZ,
      upperWidth * (style === 0 ? 0.88 : 1),
      upperDepth * (style === 0 ? 0.88 : 1),
      yaw,
      false,
    );
    mechanicalRoof(
      upperX,
      roofY + 0.6,
      upperZ,
      upperWidth * 0.8,
      upperDepth * 0.8,
      yaw,
      detailed,
    );
    if (style !== 0)
      for (const side of [-1, 1])
        for (const offset of [-0.36, 0, 0.36])
          localBox(
            style === 2 ? 'stone' : 'steel',
            x,
            towerBase + lowerHeight / 2,
            z,
            style === 2 ? 1.5 : 0.42,
            lowerHeight,
            0.8,
            yaw,
            width * offset,
            side * (depth / 2 + 0.25),
            detailed,
          );
    // One genuine plant floor rather than repeated silhouette stripes.
    localBox(
      'dark',
      x,
      towerBase + lowerHeight * 0.51,
      z,
      width * (style === 0 ? 0.94 : 1) + 0.6,
      3.8,
      depth * (style === 0 ? 0.94 : 1) + 0.6,
      yaw,
    );
    if (detailed)
      for (const side of [-1, 1]) {
        localBox(
          'dark',
          x,
          groundY + 4,
          z,
          width * 0.5,
          7,
          1,
          yaw,
          0,
          side * (depth / 2 + 5),
        );
        localBox(
          'steel',
          x,
          groundY + 8,
          z,
          width * 0.57,
          0.7,
          5.5,
          yaw,
          0,
          side * (depth / 2 + 5.5),
          true,
        );
        localBox(
          'warm',
          x,
          groundY + 7.6,
          z,
          width * 0.49,
          0.12,
          0.4,
          yaw,
          0,
          side * (depth / 2 + 7),
          true,
        );
      }
  }
  function residentialBlock(x, z, width, depth, height, yaw, detailed) {
    const terraceHeight = height * 0.73;
    finishFacadeBays(
      x,
      z,
      width,
      depth,
      terraceHeight,
      groundY,
      yaw,
      'mineral',
    );
    shell(
      'ceramicWindows',
      x,
      groundY,
      z,
      width,
      depth,
      terraceHeight,
      yaw,
      1,
      '#e8dfca',
    );
    terraces(
      x,
      groundY + terraceHeight,
      z,
      width + 1.5,
      depth + 1.5,
      yaw,
      detailed,
    );
    const [tx, tz] = localPoint(x, z, yaw, width * 0.12, depth * 0.08);
    shell(
      'stoneWindows',
      tx,
      groundY + terraceHeight + 0.5,
      tz,
      width * 0.7,
      depth * 0.65,
      height - terraceHeight,
      yaw,
      1,
      '#b5c1bd',
    );
    terraces(
      tx,
      groundY + height + 0.5,
      tz,
      width * 0.72,
      depth * 0.67,
      yaw,
      false,
    );
    mechanicalRoof(
      tx,
      groundY + height + 0.8,
      tz,
      width * 0.54,
      depth * 0.5,
      yaw,
      detailed,
    );
    for (const side of [-1, 1]) {
      localBox(
        'stone',
        x,
        groundY + terraceHeight / 2,
        z,
        3.2,
        terraceHeight,
        depth + 1.1,
        yaw,
        side * width * 0.31,
      );
      if (detailed)
        for (let y = 12; y < terraceHeight - 3; y += 12.6) {
          localBox(
            'concrete',
            x,
            groundY + y,
            z,
            width * 0.34,
            0.65,
            3.2,
            yaw,
            0,
            side * (depth / 2),
            true,
          );
          localBox(
            'dark',
            x,
            groundY + y + 1.05,
            z,
            width * 0.34,
            1.4,
            0.16,
            yaw,
            0,
            side * (depth / 2 + 1.5),
            true,
          );
        }
    }
  }
  function utilityBuilding(x, z, width, depth, height, yaw, detailed) {
    const lowHeight = Math.min(height, 40);
    shell(
      'industrial',
      x,
      groundY,
      z,
      width,
      depth,
      lowHeight,
      yaw,
      1,
      '#a4b3b4',
    );
    terraces(x, groundY + lowHeight, z, width + 1, depth + 1, yaw, false);
    if (height > 60) {
      const [tx, tz] = localPoint(x, z, yaw, -width * 0.18, 0);
      shell(
        'glass',
        tx,
        groundY + lowHeight + 0.5,
        tz,
        width * 0.58,
        depth * 0.65,
        height - lowHeight,
        yaw,
        0.84,
        '#b8c9c8',
      );
      mechanicalRoof(
        tx,
        groundY + height + 0.5,
        tz,
        width * 0.47,
        depth * 0.52,
        yaw,
        detailed,
      );
    }
    for (const side of [-1, 1]) {
      localBox(
        'concrete',
        x,
        groundY + lowHeight / 2,
        z,
        3.5,
        lowHeight + 2,
        depth + 3,
        yaw,
        side * width * 0.41,
      );
      if (detailed)
        for (let bay = -2; bay <= 2; bay += 1)
          localBox(
            'steel',
            x,
            groundY + 4.3,
            z,
            width * 0.13,
            7.8,
            0.4,
            yaw,
            bay * width * 0.18,
            side * (depth / 2 + 0.6),
            true,
          );
    }
    for (let k = -1; k <= 1; k += 1) {
      const [px, pz] = localPoint(x, z, yaw, width * 0.24, k * depth * 0.23);
      cylinder('steel', px, groundY + lowHeight + 3, pz, 8, 6, 8, 0, detailed);
      cylinder(
        'dark',
        px,
        groundY + lowHeight + 6.1,
        pz,
        6.4,
        0.3,
        6.4,
        0,
        detailed,
      );
    }
    if (detailed)
      for (const y of [lowHeight * 0.6, lowHeight * 0.6 + 1.7])
        localBox(
          'copper',
          x,
          groundY + y,
          z,
          width + 2.5,
          0.45,
          0.45,
          yaw,
          0,
          -depth / 2 - 1,
          true,
        );
  }

  const cityMinX = Math.floor((bounds.min.x - 760) / 126) * 126,
    cityMaxX = Math.ceil((bounds.max.x + 760) / 126) * 126;
  const cityMinZ = Math.floor((bounds.min.z - 760) / 138) * 138,
    cityMaxZ = Math.ceil((bounds.max.z + 760) / 138) * 138;
  const cityWidth = cityMaxX - cityMinX + 180,
    cityDepth = cityMaxZ - cityMinZ + 180;
  const ground = new THREE.PlaneGeometry(19000, 19000);
  ground.rotateX(-Math.PI / 2);
  const uv = ground.attributes.uv;
  for (let i = 0; i < uv.count; i += 1)
    uv.setXY(i, uv.getX(i) * 700, uv.getY(i) * 700);
  batch.add(ground, 'ground', centre.x, groundY - 0.15, centre.z);
  ground.dispose();
  // Lower streets are clipped into the Meridian precinct at real block junctions.
  const streetPlane = (surface, x, z, width, depth, y) =>
    batch.primitive('plane', surface, x, groundY + y, z, width, 1, depth);
  for (let x = cityMinX - 63; x <= cityMaxX + 63; x += 126) {
    const width = Math.abs(Math.round(x / 126)) % 4 === 0 ? 23 : 15;
    for (let z = cityMinZ - 46; z < cityMaxZ + 69; z += 46) {
      if (precinct.contains(x, z, 26)) continue;
      streetPlane('road', x, z, width, 46, 0.035);
      for (const side of [-1, 1])
        streetPlane('pavement', x + side * (width / 2 + 0.6), z, 1.2, 46, 0.07);
      if (distanceToRoute(x, z) < 450)
        box('paint', x, groundY + 0.08, z, 0.18, 0.016, 8, 0, true);
    }
  }
  for (let z = cityMinZ - 69; z <= cityMaxZ + 69; z += 138) {
    const width = Math.abs(Math.round(z / 138)) % 4 === 0 ? 23 : 15;
    for (let x = cityMinX - 42; x < cityMaxX + 63; x += 42) {
      if (precinct.contains(x, z, 24)) continue;
      streetPlane('road', x, z, 42, width, 0.04);
      for (const side of [-1, 1])
        streetPlane(
          'pavement',
          x,
          z + side * (width / 2 + 0.6),
          42,
          1.2,
          0.075,
        );
      if (distanceToRoute(x, z) < 450)
        box('paint', x, groundY + 0.085, z, 8, 0.016, 0.18, 0, true);
    }
  }
  for (let z = cityMinZ; z <= cityMaxZ; z += 138)
    for (let x = cityMinX; x <= cityMaxX; x += 126) {
      const width = 44 + random() * 30,
        depth = 49 + random() * 33;
      const px = x + (random() - 0.5) * 19,
        pz = z + (random() - 0.5) * 21;
      const yaw = random() < 0.16 ? Math.PI / 2 : 0;
      const near = distanceToRoute(px, pz),
        detailed = near < 330;
      const district =
        x < centre.x - 330
          ? 'residential'
          : z < centre.z - 300
            ? 'utility'
            : 'commercial';
      if (
        precinct.contains(px, pz, Math.hypot(width, depth) / 2 + 14) ||
        reserved.some(
          (zone) =>
            Math.hypot(px - zone.x, pz - zone.z) <
            zone.radius + Math.hypot(width, depth) / 2 + 9,
        )
      ) {
        rejectedBuildings += 1;
        continue;
      }
      urbanBlock(x, z, district, detailed);
      const core = Math.max(
        0,
        1 - Math.hypot((x - centre.x) / 1500, (z - centre.z) / 1500),
      );
      const height =
        district === 'utility'
          ? 26 + random() ** 1.8 * 120
          : 42 + random() ** 1.65 * (120 + core * 140);
      if (
        !clearsRoute(
          px,
          pz,
          width + 16,
          depth + 16,
          groundY + height + 14,
          yaw,
        ) ||
        Math.hypot(px - landmark.x, pz - landmark.z) < 145 ||
        blocksLandmark(px, pz, height, Math.max(width, depth) * 0.6)
      ) {
        rejectedBuildings += 1;
        if (near > 40 && clearsRoute(px, pz, width, depth, groundY + 14, yaw)) {
          box('pavement', px, groundY + 0.25, pz, width, 0.5, depth, yaw);
          for (const offset of [-0.22, 0.22]) {
            localBox(
              'steel',
              px,
              groundY + 3.8,
              pz,
              width * 0.3,
              7.6,
              depth * 0.5,
              yaw,
              offset * width,
              0,
              detailed,
            );
            localBox(
              'dark',
              px,
              groundY + 7.7,
              pz,
              width * 0.3 + 1,
              0.35,
              depth * 0.5 + 1,
              yaw,
              offset * width,
              0,
              detailed,
            );
          }
        }
        continue;
      }
      if (district === 'residential')
        residentialBlock(px, pz, width, depth, height, yaw, detailed);
      else if (district === 'utility')
        utilityBuilding(px, pz, width, depth, height, yaw, detailed);
      else
        commercialTower(
          px,
          pz,
          width,
          depth,
          height,
          yaw,
          detailed,
          random() < 0.18 ? 3 : Math.floor(random() * 3),
        );
      placedBuildings += 1;
      if (detailed)
        for (const side of [-1, 1]) {
          box(
            'dark',
            x + side * 48,
            groundY + 4.8,
            z - 49,
            0.28,
            9.6,
            0.28,
            0,
            true,
          );
          box(
            'steel',
            x + side * 46.5,
            groundY + 9.7,
            z - 49,
            3.4,
            0.23,
            0.4,
            0,
            true,
          );
          box(
            'warm',
            x + side * 46.4,
            groundY + 9.52,
            z - 49,
            2.7,
            0.08,
            0.25,
            0,
            true,
          );
          box(
            'concrete',
            x + side * 42,
            groundY + 0.6,
            z + 46,
            10,
            1.2,
            3.8,
            0,
            true,
          );
          box(
            'vegetation',
            x + side * 42,
            groundY + 1.5,
            z + 46,
            9,
            1.6,
            3,
            0,
            true,
          );
        }
    }
  // Complete outer borough geometry, with shaped roofs and deliberately varied height.
  for (let ring = 0; ring < 3; ring += 1) {
    const count = 96 + ring * 24;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.018;
      const x =
        centre.x +
        Math.cos(angle) * (cityWidth * 0.58 + ring * 550 + random() * 280);
      const z =
        centre.z +
        Math.sin(angle) * (cityDepth * 0.58 + ring * 480 + random() * 250);
      const width = 55 + random() * 80,
        depth = 48 + random() * 64;
      const height = 70 + random() ** 1.4 * (ring === 2 ? 380 : 220),
        yaw = angle + (i % 3) * 0.3;
      if (i % 6 === 0) {
        curvedOffice(x, z, width, depth, height, yaw, false, true);
        continue;
      }
      shell(
        i % 3 === 0 ? 'stoneWindows' : 'silverGlass',
        x,
        groundY,
        z,
        width,
        depth,
        height * 0.83,
        yaw,
        0.88,
        '#b0bcc0',
        true,
      );
      shell(
        'glass',
        x,
        groundY + height * 0.83,
        z,
        width * 0.63,
        depth * 0.65,
        height * 0.17,
        yaw,
        0.85,
        '#b0bcc0',
        true,
      );
      if (i % 6 === 0)
        batch.primitive(
          'box',
          'steel',
          x,
          groundY + height + 13,
          z,
          2.3,
          26,
          2.3,
          yaw,
          false,
          '#ffffff',
          true,
        );
    }
  }
  // Twin tapered shafts, deep service decks and suspended plant bridges establish
  // the split-crown utility tower as a consistent, fully modelled navigation anchor.
  const lx = landmark.x,
    lz = landmark.z;
  shell(
    'stoneWindows',
    lx,
    groundY,
    lz,
    136,
    99,
    34,
    landmarkYaw,
    0.94,
    '#d3d6cf',
  );
  terraces(lx, groundY + 34, lz, 140, 103, landmarkYaw, true);
  for (const side of [-1, 1]) {
    const [tx, tz] = localPoint(lx, lz, landmarkYaw, side * 38, side * 4);
    const shaftHeight = side < 0 ? 411 : 438;
    shell(
      'glass',
      tx,
      groundY + 35,
      tz,
      51,
      68,
      shaftHeight,
      landmarkYaw,
      0.76,
      '#d6e3e4',
    );
    for (const edge of [-1, 1]) {
      localBox(
        'stone',
        tx,
        groundY + 191,
        tz,
        4.5,
        312,
        7,
        landmarkYaw,
        edge * 23,
        23,
      );
      localBox(
        'steel',
        tx,
        groundY + 353,
        tz,
        3.1,
        132,
        5,
        landmarkYaw,
        edge * 19,
        21,
      );
    }
    const roof = groundY + 35 + shaftHeight;
    terraces(tx, roof, tz, 40, 54, landmarkYaw, false);
    localBox('steel', tx, roof + 8, tz, 38, 16, 28, landmarkYaw);
    localBox('dark', tx, roof + 8.2, tz, 34, 11.5, 28.5, landmarkYaw);
    for (let y = 3; y <= 13; y += 2)
      localBox('steel', tx, roof + y, tz, 35, 0.45, 29, landmarkYaw);
    localBox('warm', tx, roof + 16.3, tz, 32, 0.4, 0.5, landmarkYaw, 0, -14.6);
    const [ax, az] = localPoint(tx, tz, landmarkYaw, side * 12, 5);
    cylinder('steel', ax, roof + 34, az, 1.1, 38, 1.1);
    cylinder('red', ax, roof + 53.2, az, 1.4, 0.8, 1.4);
  }
  for (const [elevation, width, height, depth] of [
    [146, 112, 17, 43],
    [304, 101, 9, 29],
  ]) {
    localBox(
      'dark',
      lx,
      groundY + elevation,
      lz,
      width,
      height,
      depth,
      landmarkYaw,
    );
    for (const side of [-1, 1])
      localBox(
        'steel',
        lx,
        groundY + elevation + (side * height) / 2,
        lz,
        width + 2,
        1.1,
        depth + 2,
        landmarkYaw,
      );
    for (let offset = -width * 0.44; offset < width * 0.45; offset += 7)
      localBox(
        'steel',
        lx,
        groundY + elevation,
        lz,
        0.6,
        height,
        0.75,
        landmarkYaw,
        offset,
        -depth / 2 - 0.2,
      );
    localBox(
      'warm',
      lx,
      groundY + elevation - height / 2 + 0.5,
      lz,
      width * 0.7,
      0.25,
      0.35,
      landmarkYaw,
      0,
      -depth / 2 - 0.7,
    );
  }
  // Civic concourse frames the first vista at ship height, clear of both route decks.
  const start = groundFrame(track, precinct.layout.concourseDistance);
  const concourse = start.position.clone().addScaledVector(start.right, 106);
  const cyaw = Math.atan2(start.tangent.x, start.tangent.z),
    concourseHeight = Math.max(30, start.position.y - groundY + 9);
  if (
    clearsRoute(
      concourse.x,
      concourse.z,
      96,
      155,
      groundY + concourseHeight + 10,
      cyaw,
    )
  ) {
    shell(
      'silverGlass',
      concourse.x,
      groundY,
      concourse.z,
      82,
      142,
      concourseHeight,
      cyaw,
      1,
      '#d6d6c8',
    );
    terraces(
      concourse.x,
      groundY + concourseHeight,
      concourse.z,
      96,
      155,
      cyaw,
      true,
    );
    for (let offset = -52; offset <= 52; offset += 26) {
      localBox(
        'stone',
        concourse.x,
        groundY + concourseHeight / 2,
        concourse.z,
        4,
        concourseHeight,
        5,
        cyaw,
        -42,
        offset,
      );
      localBox(
        'warm',
        concourse.x,
        groundY + concourseHeight - 1.5,
        concourse.z,
        0.35,
        0.25,
        18,
        cyaw,
        -43,
        offset,
      );
    }
    finishedRoomFacade(
      concourse.x,
      concourse.z,
      142,
      82,
      concourseHeight,
      groundY,
      cyaw + Math.PI / 2,
      -1,
      'mineral',
    );
    finishedRoomFacade(
      concourse.x,
      concourse.z,
      82,
      142,
      concourseHeight,
      groundY,
      cyaw,
      -1,
      'metal',
    );
    mechanicalRoof(
      concourse.x,
      groundY + concourseHeight + 1,
      concourse.z,
      68,
      100,
      cyaw,
      true,
    );
  }
  const south =
    track.sections.find((section) => section.id === 'waterfront') ??
    track.sections.find((section) => section.id === 'south');
  if (south) {
    const frame = groundFrame(track, (south.start + south.end) / 2);
    for (const side of [-1, 1]) {
      const p = frame.position.clone().addScaledVector(frame.right, side * 100),
        yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      if (!clearsRoute(p.x, p.z, 105, 200, groundY + 9, yaw)) continue;
      box('concrete', p.x, groundY + 0.4, p.z, 107, 0.8, 202, yaw);
      box('water', p.x, groundY + 0.9, p.z, 96, 0.08, 190, yaw);
      for (const edge of [-1, 1]) {
        localBox('concrete', p.x, groundY + 2, p.z, 4, 4, 202, yaw, edge * 52);
        localBox('steel', p.x, groundY + 4.5, p.z, 0.3, 1, 202, yaw, edge * 52);
        localBox(
          'concrete',
          p.x,
          groundY + 2,
          p.z,
          104,
          4,
          4,
          yaw,
          0,
          edge * 99,
        );
      }
      for (let offset = -60; offset <= 60; offset += 60)
        localBox('steel', p.x, groundY + 3, p.z, 106, 1.7, 2.6, yaw, 0, offset);
    }
  }
  const geometry = batch.finish();
  let disposed = false;
  group.userData = {
    update: (_cameraPosition, time) => updateSurfaces(time),
    asset:
      'Original authored Halcyon city geometry and procedural surface sources',
    landmark: {
      position: landmark.toArray(),
      name: 'Municipal split-crown utility tower',
    },
    precinct: precinct.identity,
    precinctLayout: precinct.layout,
    districts: [
      'Civic concourse',
      'North financial crown',
      'South water and transit utilities',
      'West residential terraces',
      'Outer borough skyline',
    ],
    groundY,
    routeClearance: {
      sampleCount: routeClearance.sampleCount,
      supportCount: routeClearance.supportCount,
      halfWidth: routeClearance.halfWidth,
      localVertical: routeClearance.localVertical,
      longitudinalHalfLength: routeClearance.longitudinalHalfLength,
    },
    placedBuildings,
    rejectedBuildings,
    triangleCount: geometry.triangleCount,
    meshCount: geometry.meshCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      for (const material of Object.values(surfaces)) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
  return group;
}
