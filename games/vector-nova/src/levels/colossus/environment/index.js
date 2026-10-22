import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { createColossusPaint, housingGeometry } from '../track/presentation.js';
import {
  samplePress,
  pressPose,
  sampleEjector,
  ejectorPose,
} from '../mechanics.js';

export function createColossusEnvironment({ track, shape = false }) {
  const group = new T.Group();
  group.name = 'Colossus / quarry and working machinery';
  const paint = createColossusPaint(track);
  const kit = createIndustrialKit(),
    geometries = new Set(),
    materials = new Set();
  const boxes = new T.BoxGeometry(1, 1, 1);
  geometries.add(boxes);
  const batches = new Map();
  const records = [],
    ejectorRecords = [],
    moving = [],
    assemblies = new Map(),
    machineBatches = [];
  const stone = new T.MeshStandardMaterial({
    color: '#907861',
    roughness: 0.98,
    flatShading: true,
  });
  materials.add(stone);
  const rock = new T.CylinderGeometry(0.72, 1, 1, 9, 5);
  const rp = rock.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i),
      y = rp.getY(i),
      z = rp.getZ(i),
      angle = Math.atan2(z, x);
    const radius =
      1 + Math.sin(angle * 3.1 + y * 4) * 0.12 + Math.cos(angle * 7.7) * 0.08;
    rp.setXYZ(i, x * radius, y + Math.sin(angle * 4.3) * 0.055, z * radius);
  }
  rock.computeVertexNormals();
  geometries.add(rock);
  const rockMass = (position, scale, turn = 0) => {
    const object = new T.Mesh(rock, stone);
    object.position.set(...position);
    object.scale.set(...scale);
    object.rotation.y = turn;
    object.castShadow = object.receiveShadow = true;
    object.name = 'Quarry / fractured bench';
    group.add(object);
  };
  const warning = new T.MeshStandardMaterial({
    color: '#f1b54c',
    emissive: '#ff9d24',
    emissiveIntensity: 0.6,
  });
  materials.add(warning);
  const red = new T.MeshStandardMaterial({
    color: '#e65c39',
    emissive: '#d53b18',
    emissiveIntensity: 1,
  });
  materials.add(red);
  const trackMatrix = (distance, lateral = 0, up = 0) => {
    const f = track.sample(distance);
    return new T.Matrix4().compose(
      f.position
        .clone()
        .addScaledVector(f.right, lateral)
        .addScaledVector(f.up, up),
      f.quaternion,
      new T.Vector3(1, 1, 1),
    );
  };
  const putBox = (
    material,
    size,
    localPosition,
    matrix = new T.Matrix4(),
    name = 'machine structure',
  ) => {
    const transform = matrix
      .clone()
      .multiply(
        new T.Matrix4().compose(
          new T.Vector3(...localPosition),
          new T.Quaternion(),
          new T.Vector3(...size),
        ),
      );
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push({ transform, name });
  };
  const mesh = (geometry, material, name) => {
    geometries.add(geometry);
    const object = new T.Mesh(geometry, material);
    object.name = name;
    object.castShadow = object.receiveShadow = true;
    group.add(object);
    return object;
  };
  const assembly = (name, distance, lateral = 0, up = 0, turn = 0) => {
    const matrix = trackMatrix(distance, lateral, up).multiply(
      new T.Matrix4().makeRotationY(turn),
    );
    for (const part of kit.prototypes[name]) {
      const key = part.geometry.uuid;
      if (!assemblies.has(key)) assemblies.set(key, { ...part, matrices: [] });
      assemblies.get(key).matrices.push(matrix);
    }
  };
  const staticPart = (
    geometry,
    material,
    name = 'Colossus / static machinery',
  ) => {
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    geometry.name = name;
    geometries.add(geometry);
    assemblies.set(geometry.uuid, {
      geometry,
      material,
      matrices: [new T.Matrix4()],
    });
  };
  const openBay = (s, margin = 0) =>
    track.ejectors.some(
      (e) => s > e.openingStart - margin && s < e.openingEnd + margin,
    );
  const fixture = new T.MeshStandardMaterial({
    color: '#ffce70',
    emissive: '#ffc360',
    emissiveIntensity: 0.8,
    roughness: 0.5,
  });
  materials.add(fixture);
  const caution = new T.MeshStandardMaterial({
    color: '#e6aa32',
    roughness: 0.58,
    metalness: 0.18,
  });
  caution.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 cautionPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncautionPosition=position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 cautionPosition;',
      )
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nfloat stripe=step(.48,fract((cautionPosition.x+cautionPosition.y)/7.)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.018,.025,.029),stripe);',
      );
  };
  caution.customProgramCacheKey = () => 'colossus-tooling-caution-v1';
  materials.add(caution);
  const polished = new T.MeshStandardMaterial({
    color: '#b8c9cf',
    roughness: 0.18,
    metalness: 0.94,
  });
  const hazardPaint = new T.MeshStandardMaterial({
    color: '#e6aa32',
    emissive: '#b8750d',
    emissiveIntensity: 0.45,
    roughness: 0.72,
    metalness: 0.08,
  });
  materials.add(polished);
  materials.add(hazardPaint);
  // Continuous swept housings seat the running sheet inside a load-bearing bed.
  // The cross sections stay outside the full 72 m playable sheet through rolls.
  for (const run of track.runs) {
    const cuts = [
      run.start,
      run.end,
      ...track.ejectors
        .flatMap((e) => [e.openingStart - 10, e.openingEnd + 10])
        .filter((s) => s > run.start && s < run.end),
    ].sort((a, b) => a - b);
    for (let n = 0; n < cuts.length - 1; n++) {
      if (openBay((cuts[n] + cuts[n + 1]) / 2, 10)) continue;
      for (let a = cuts[n]; a < cuts[n + 1] - 0.01; a += 250) {
        const b = Math.min(a + 250, cuts[n + 1]);
        for (const side of [-1, 1]) {
          staticPart(
            housingGeometry(
              track,
              a,
              b,
              [
                [40, -5],
                [40, -24],
                [65, -24],
                [65, 9],
                [60, 15],
                [49, 15],
                [49, -5],
              ].map(([x, y]) => [x * side, y]),
            ),
            kit.materials.dark,
            'Continuous load bed',
          );
          staticPart(
            housingGeometry(
              track,
              a,
              b,
              [
                [49, 15],
                [49, 20],
                [60, 20],
                [66, 14],
                [66, 9],
                [60, 15],
              ].map(([x, y]) => [x * side, y]),
            ),
            kit.materials.shell,
            'Formed outer casing',
          );
          staticPart(
            housingGeometry(
              track,
              a,
              b,
              [
                [40, -23],
                [40, -27],
                [67, -27],
                [67, -23],
              ].map(([x, y]) => [x * side, y]),
            ),
            kit.materials.steel,
            'Lower carrying flange',
          );
        }
      }
    }
  }
  // Room-size assemblies make the chutes read as machine beds within a factory.
  for (const id of ['intake', 'press', 'crossfeed', 'return', 'headstock']) {
    const zone = track.sections.find((s) => s.id === id);
    for (
      let d = zone.start + 55;
      d < zone.end - 40;
      d += id === 'press' ? 85 : 150
    ) {
      if (openBay(d, 100)) continue;
      assembly('factoryBay', d);
      for (const side of [-1, 1]) {
        putBox(fixture, [1.4, 8, 2], [side * 56, 25, -20], trackMatrix(d));
        if (id !== 'press') assembly('rollerBank', d, side * 91, -18);
      }
    }
  }
  for (const id of ['screw', 'auger']) {
    const zone = track.sections.find((s) => s.id === id);
    for (let d = zone.start + 140; d < zone.end - 80; d += 220) {
      for (const side of [-1, 1]) {
        assembly('rollerBank', d, side * 77, -18);
        const wheel = kit.createAssembly('driveWheel');
        const pivot = new T.Group();
        pivot.applyMatrix4(trackMatrix(d, side * 67, 24));
        pivot.add(wheel);
        group.add(pivot);
        moving.push({ object: wheel, axis: 'x', speed: side * 0.18 });
      }
    }
  }

  // Partial barrel casings enclose the wall rolls, with daylight slots above.
  const innerCasing = kit.materials.dark.clone();
  innerCasing.side = T.DoubleSide;
  materials.add(innerCasing);
  for (const id of ['screw', 'auger']) {
    const zone = track.sections.find((s) => s.id === id);
    for (let s = zone.start + 50; s < zone.end - 60; s += 140) {
      const m = trackMatrix(s);
      const drum = new T.CylinderGeometry(
        69,
        69,
        106,
        40,
        1,
        true,
        -Math.PI * 0.77,
        Math.PI * 1.54,
      );
      drum.rotateX(Math.PI / 2);
      drum.applyMatrix4(m);
      staticPart(drum, innerCasing);
      for (const z of [-53, 53]) {
        const ring = new T.TorusGeometry(70, 3.8, 8, 48, Math.PI * 1.54);
        ring.rotateZ(Math.PI * 0.73);
        ring.translate(0, 0, z);
        ring.applyMatrix4(m);
        staticPart(ring, kit.materials.shell);
      }
      for (const side of [-1, 1]) {
        putBox(kit.materials.shell, [12, 34, 112], [side * 75, -9, 0], m);
        putBox(kit.materials.steel, [28, 8, 116], [side * 75, -28, 0], m);
      }
    }
  }
  for (const section of track.sections) {
    for (let s = section.start + 40; s < section.end - 30; s += 140) {
      if (openBay(s, 80) || track.isGap(s)) continue;
      const m = trackMatrix(s);
      for (const side of [-1, 1]) {
        putBox(kit.materials.steel, [28, 44, 6], [side * 56, -3, 0], m);
        putBox(kit.materials.shell, [6, 39, 12], [side * 42.5, -5, 0], m);
        putBox(kit.materials.dark, [34, 10, 18], [side * 55, -30, 0], m);
        // Sparse service panels break the outer skin without making a picket fence.
        if (!['screw', 'auger', 'cooling'].includes(section.id))
          assembly('channelCassette', s, side * 77, 6, side < 0 ? Math.PI : 0);
      }
    }
  }
  // Ordinary production floor: unequal work bays and rooted utility stacks.
  for (const section of track.sections.filter(
    (s) => !['screw', 'auger', 'die', 'gantry'].includes(s.id),
  )) {
    for (
      let s = section.start + 70, i = 0;
      s < section.end - 80;
      s += 230, i++
    ) {
      if (openBay(s, 110) || track.isGap(s)) continue;
      const side = i % 2 ? -1 : 1,
        m = trackMatrix(s);
      assembly('serviceTower', s, side * 105, -48);
      putBox(kit.materials.shell, [90, 38, 110], [side * 105, -37, 5], m);
      putBox(kit.materials.dark, [110, 9, 130], [side * 105, -60, 5], m);
      const base = track
        .sample(s)
        .position.clone()
        .addScaledVector(track.sample(s).right, side * 155);
      rockMass([base.x, base.y - 155, base.z], [130, 220, 120], s * 0.01);
    }
  }
  // The press hall is a connected structure with a partial roof and broad daylight.
  for (const press of track.presses) {
    assembly('pressFrame', press.distance);
    const head = mesh(
      new T.BoxGeometry(press.width - 4, press.height - 4, press.depth - 2),
      kit.materials.dark,
      press.id + ' / swept press shoe',
    );
    const face = mesh(
      new T.BoxGeometry(press.width, 2.4, press.depth),
      caution,
      press.id + ' / caution face',
    );
    const ram = mesh(
      new T.CylinderGeometry(4.4, 4.4, 1, 16),
      polished,
      press.id + ' / connected ram',
    );
    const light = mesh(
      new T.BoxGeometry(3, 3, 3),
      warning,
      press.id + ' / cycle signal',
    );
    const m = trackMatrix(press.distance);
    light.applyMatrix4(
      m
        .clone()
        .multiply(new T.Matrix4().makeTranslation(press.lateral, 45, -19)),
    );
    for (const [height, radius, length] of [
      [63, 6.4, 8],
      [69, 8, 3],
    ]) {
      const collar = new T.CylinderGeometry(radius, radius, length, 24);
      collar.applyMatrix4(trackMatrix(press.distance, press.lateral, height));
      staticPart(collar, kit.materials.dark);
    }
    // Recessed receiving die visibly identifies the hazardous half of the floor.
    const die = paint.rectangle(press.distance - 16, press.distance + 16, {
      min: press.lateral - press.width / 2,
      max: press.lateral + press.width / 2,
      lift: 0.035,
      columns: 6,
    });
    mesh(die, kit.materials.dark, press.id + ' / die footprint');
    const left = press.lateral - press.width / 2,
      right = press.lateral + press.width / 2;
    for (const [a, b, x, y] of [
      [press.distance - 16, press.distance - 14.8, left, right],
      [press.distance + 14.8, press.distance + 16, left, right],
      [press.distance - 14.8, press.distance + 14.8, left, left + 1.1],
      [press.distance - 14.8, press.distance + 14.8, right - 1.1, right],
    ])
      mesh(
        paint.rectangle(a, b, { min: x, max: y, lift: 0.07 }),
        hazardPaint,
        'Press / coverage boundary',
      );
    records.push({ press, head, face, ram, light });
    // Captive tooling: stepped platen, recessed face, replaceable die and cheek plates.
    const detail = new T.Group();
    head.add(detail);
    const tooling = (size, position, material) => {
      const part = new T.Mesh(
        new RoundedBoxGeometry(
          ...size,
          1,
          Math.min(0.45, Math.min(...size) * 0.15),
        ),
        material,
      );
      geometries.add(part.geometry);
      part.position.set(...position);
      part.castShadow = part.receiveShadow = true;
      detail.add(part);
    };
    tooling(
      [press.width, 2, press.depth],
      [0, press.height / 2 - 1, 0],
      kit.materials.steel,
    );
    tooling(
      [press.width - 2, 1.5, press.depth - 1],
      [0, -press.height / 2 + 0.75, 0],
      kit.materials.steel,
    );
    for (const x of [-press.width / 2 + 1.5, press.width / 2 - 1.5])
      tooling(
        [3, press.height - 2, press.depth],
        [x, 0, 0],
        kit.materials.shell,
      );
    const collar = new T.Mesh(new T.CylinderGeometry(6.2, 7, 2, 24), polished);
    geometries.add(collar.geometry);
    collar.position.y = press.height / 2;
    detail.add(collar);
    for (const z of [-press.depth / 2, press.depth / 2]) {
      tooling([press.width - 8, 1.2, 1.8], [0, 2.4, z], kit.materials.shell);
      tooling([press.width - 8, 1.2, 1.8], [0, -0.5, z], kit.materials.steel);
      for (const x of [-6, 0, 6])
        tooling([1.2, 2.9, 1.4], [x, 0.9, z], kit.materials.steel);
    }
    for (const side of [-1, 1]) {
      putBox(kit.materials.dark, [34, 26, 180], [side * 76, 66, 70], m);
      putBox(kit.materials.shell, [6, 23, 176], [side * 58, 66, 70], m);
      putBox(kit.materials.steel, [30, 4, 180], [side * 72, 49, 70], m);
      putBox(kit.materials.shell, [20, 4, 150], [side * 43, 94, 60], m);
      putBox(kit.materials.steel, [20, 3, 145], [side * 60, 32, 60], m);
    }
  }
  // Rotating transverse patterns make the actual sideways surface force legible.
  const beltMaterials = [];
  for (const belt of track.belts) {
    const material = new T.MeshStandardMaterial({
      color: '#48575b',
      roughness: 0.7,
      metalness: 0.4,
    });
    const clock = { value: 0 };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.beltClock = clock;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec2 roadCoord; varying vec2 beltCoord;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nbeltCoord=roadCoord;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float beltClock; varying vec2 beltCoord;',
        )
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nfloat band=step(.68,fract((beltCoord.y-beltClock*8.)/10.)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.44,.30,.10),band*.65);',
        );
    };
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      compile(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.18,.085,.014)*band;',
      );
    };
    material.customProgramCacheKey = () => 'colossus-crossfeed-v2';
    materials.add(material);
    const min = belt.side > 0 ? -9 : -35,
      max = belt.side > 0 ? 35 : 9;
    mesh(
      paint.rectangle(belt.start, belt.end, { min, max, lift: 0.035 }),
      material,
      belt.id + ' / moving tread',
    );
    beltMaterials.push({ clock, side: belt.side });
    for (const d of [belt.start + 25, belt.end - 25])
      assembly('motor', d, belt.side * 56, 4);
    // Approach marks lie on the working sheet, so they cannot read as floating obstacles.
    for (let x = -20; x <= 20; x += 10)
      mesh(
        paint.rectangle(belt.start - 46, belt.start - 34, {
          min: x - 2.5,
          max: x + 2.5,
          lift: 0.04,
          columns: 2,
        }),
        hazardPaint,
        belt.id + ' / approach mark',
      );
  }

  // Ejector bays have open discharge edges, physical piston heads and a visible
  // stroke footprint. The housing and guide rails sit outside the running bed.
  for (const e of track.ejectors) {
    assembly('ejectorHousing', e.distance, -e.side * 84, 8);
    const m = trackMatrix(e.distance);
    for (const z of [-23, 23]) {
      putBox(kit.materials.steel, [155, 5, 6], [-e.side * 16, -8, z], m);
      putBox(kit.materials.dark, [155, 6, 9], [-e.side * 16, -13, z], m);
    }
    const head = mesh(
      new T.BoxGeometry(e.width, e.height, e.depth),
      caution,
      e.id + ' / physical sliding head',
    );
    const cap = new T.Mesh(
      new T.BoxGeometry(e.width + 0.2, e.height - 4, e.depth - 4),
      kit.materials.shell,
    );
    geometries.add(cap.geometry);
    head.add(cap);
    const shaft = mesh(
      new T.CylinderGeometry(3.6, 3.6, 1, 16),
      polished,
      e.id + ' / hydraulic shaft',
    );
    const lamps = [];
    for (const offset of [-140, -65]) {
      const f = trackMatrix(e.distance + offset);
      for (const side of [-1, 1]) {
        putBox(kit.materials.dark, [3, 17, 4], [side * 41, 9, 0], f);
        const lamp = mesh(
          new T.BoxGeometry(2, 8, 2),
          warning,
          e.id + ' / stroke signal',
        );
        lamp.applyMatrix4(trackMatrix(e.distance + offset, side * 41, 19));
        lamps.push(lamp);
      }
    }
    mesh(
      paint.rectangle(e.distance - 18, e.distance + 18, {
        min: -35,
        max: 35,
        lift: 0.045,
      }),
      kit.materials.dark,
      e.id + ' / recessed stroke bed',
    );
    for (const d of [e.distance - 19, e.distance + 19])
      mesh(
        paint.rectangle(d - 1, d + 1, { min: -35, max: 35, lift: 0.075 }),
        warning,
        e.id + ' / swept area boundary',
      );
    for (let x = -30; x <= 30; x += 10)
      mesh(
        paint.rectangle(e.distance - 12, e.distance + 12, {
          min: x - 1,
          max: x + 1,
          lift: 0.075,
        }),
        kit.materials.amber,
        e.id + ' / stroke footprint',
      );
    for (const d of [e.openingStart - 10, e.openingEnd + 10])
      for (const side of [-1, 1]) {
        putBox(
          kit.materials.amber,
          [3, 5, 8],
          [side * 38, 4, 0],
          trackMatrix(d),
        );
      }
    ejectorRecords.push({ e, head, shaft, lamps });
  }
  const hero = track.jumps.find((j) => j.hero);
  for (const s of [hero.takeoff - 90, hero.landingStart + 100])
    assembly('gantry', s);
  const loadMatrix = trackMatrix(hero.landingStart + 130, 0, 105);
  putBox(kit.materials.shell, [110, 14, 96], [0, 0, 0], loadMatrix);
  for (const side of [-1, 1])
    putBox(kit.materials.dark, [12, 25, 96], [side * 48, -13, 0], loadMatrix);
  // Broad return-leg landmarks: exposed counterweight guides, cooling shells
  // and the massive crown bed. They are readable from the driving surface.
  const section = (id) => track.sections.find((entry) => entry.id === id);
  const rise = section('rise');
  for (const fraction of [0.2, 0.65]) {
    const distance = T.MathUtils.lerp(rise.start, rise.end, fraction),
      m = trackMatrix(distance);
    for (const side of [-1, 1]) {
      putBox(kit.materials.shell, [36, 230, 50], [side * 90, 30, 0], m);
      putBox(kit.materials.dark, [20, 190, 60], [side * 90, 25, 0], m);
      putBox(kit.materials.steel, [50, 70, 65], [side * 90, -25, 0], m);
    }
    putBox(kit.materials.shell, [220, 24, 55], [0, 153, 0], m);
  }
  const cooling = section('cooling');
  for (let s = cooling.start + 85; s < cooling.end - 80; s += 190) {
    const m = trackMatrix(s);
    for (const side of [-1, 1])
      assembly('coolingBank', s, side * 102, 12, side < 0 ? Math.PI : 0);
    putBox(kit.materials.dark, [260, 25, 35], [0, -44, 0], m);
    putBox(kit.materials.steel, [256, 4, 42], [0, -29, 0], m);
  }
  for (const id of ['crown', 'headstock']) {
    const zone = section(id);
    for (let s = zone.start + 100; s < zone.end - 100; s += 450) {
      const m = trackMatrix(s);
      putBox(kit.materials.shell, [175, 54, 160], [0, -48, 0], m);
      for (const side of [-1, 1]) {
        putBox(kit.materials.dark, [65, 80, 160], [side * 88, -36, 0], m);
        putBox(kit.materials.amber, [4, 6, 70], [side * 58, 8, 0], m);
      }
    }
  }
  // Counterweights travel inside their guides; this movement is decorative.
  for (const d of [rise.start + 100, rise.start + 330]) {
    const f = track.sample(d);
    for (const side of [-1, 1]) {
      const block = mesh(
        new T.BoxGeometry(28, 44, 32),
        kit.materials.steel,
        'Travelling counterweight',
      );
      block.quaternion.copy(f.quaternion);
      moving.push({
        object: block,
        origin: f.position
          .clone()
          .addScaledVector(f.right, side * 90)
          .addScaledVector(f.up, 42),
        up: f.up,
        travel: 32,
        phase: side,
        speed: 0.21,
      });
      for (const x of [-10, 10])
        putBox(
          kit.materials.steel,
          [1.1, 160, 1.1],
          [side * 90 + x, 70, -20],
          trackMatrix(d),
        );
    }
  }
  // Distant transfer bridges and cranes tie separate sections into one works.
  for (const id of ['die', 'gantry', 'crown']) {
    const d = section(id).start + 120;
    const m = trackMatrix(d, 0, 190);
    for (const side of [-1, 1]) {
      putBox(kit.materials.dark, [10, 300, 16], [side * 180, -140, 0], m);
      putBox(kit.materials.shell, [23, 300, 10], [side * 180, -140, 10], m);
    }
    putBox(kit.materials.shell, [390, 14, 32], [0, 10, 0], m);
    putBox(kit.materials.dark, [390, 5, 38], [0, -9, 0], m);
    for (let x = -170; x <= 170; x += 35)
      putBox(kit.materials.steel, [3, 28, 4], [x, 6, 0], m);
    putBox(kit.materials.amber, [45, 19, 48], [-80, -20, 0], m);
    for (const x of [-92, -68])
      putBox(kit.materials.steel, [1, 70, 1], [x, -60, 0], m);
    putBox(kit.materials.shell, [85, 22, 45], [-80, -105, 0], m);
  }
  // Real world-vertical foundation piers root the elevated open works in the quarry.
  // Reject placements near any other route reach, including beneath overpasses.
  const routeSurvey = [];
  for (let s = 0; s < track.length; s += 16)
    routeSurvey.push(track.sample(s).position);
  const groundY = -70;
  const foundation = (top, width, depth) => {
    if (
      top.y < groundY + 40 ||
      routeSurvey.some(
        (p) =>
          Math.abs(p.x - top.x) < width / 2 + 48 &&
          Math.abs(p.z - top.z) < depth / 2 + 48 &&
          p.y > groundY - 20 &&
          p.y < top.y + 20,
      )
    )
      return;
    const h = top.y - groundY;
    putBox(
      kit.materials.dark,
      [width, h, depth],
      [top.x, groundY + h / 2, top.z],
    );
    putBox(
      kit.materials.shell,
      [width + 12, 18, depth + 12],
      [top.x, top.y - 9, top.z],
    );
    putBox(
      kit.materials.steel,
      [width + 14, 4, depth + 14],
      [top.x, top.y + 2, top.z],
    );
    putBox(stone, [width + 80, 36, depth + 80], [top.x, groundY + 18, top.z]);
    for (let y = groundY + 100; y < top.y - 20; y += 120)
      putBox(kit.materials.shell, [width + 5, 9, depth + 5], [top.x, y, top.z]);
    rockMass(
      [top.x, groundY - 20, top.z],
      [width + 100, 90, depth + 100],
      top.x * 0.01,
    );
  };
  for (const d of [hero.takeoff - 90, hero.landingStart + 100]) {
    for (const side of [-1, 1]) {
      const f = track.sample(d),
        foot = f.position
          .clone()
          .addScaledVector(f.right, side * 77)
          .addScaledVector(f.up, -12);
      foundation(foot, 36, 60);
      putBox(
        kit.materials.dark,
        [40, 10, 130],
        [side * 90, -14, 0],
        trackMatrix(d),
      );
      putBox(
        kit.materials.steel,
        [42, 3, 132],
        [side * 90, -7, 0],
        trackMatrix(d),
      );
    }
  }
  for (const id of ['die', 'gantry', 'crown']) {
    const d = section(id).start + 120,
      m = trackMatrix(d, 0, 190);
    for (const side of [-1, 1])
      foundation(new T.Vector3(side * 180, -290, 0).applyMatrix4(m), 48, 64);
  }
  // Large quarry terraces, kept below the playable envelope.
  const center = track.bounds.getCenter(new T.Vector3());
  const size = track.bounds.getSize(new T.Vector3());
  putBox(stone, [size.x + 1600, 80, size.z + 1300], [center.x, -110, center.z]);
  const floor = new T.MeshStandardMaterial({ color: '#857e70', roughness: 1 });
  materials.add(floor);
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? -1 : 1;
    const x = center.x + side * (size.x / 2 + 580),
      z = center.z + (Math.floor(i / 2) - 2) * 680;
    for (let tier = 0; tier < 3; tier++) {
      const height = 300 + (i % 3) * 75;
      rockMass(
        [x + side * tier * 120, tier * 285 + height / 2 - 80, z],
        [620 - tier * 75, height, 520 - tier * 55],
        i * 0.8,
      );
    }
    putBox(floor, [340, 10, 110], [x - side * 300, 170, z]);
  }
  // One multi-draw batch per material keeps the kit's distinct parts culled
  // individually without paying a draw call for every nearby casing.
  const materialGroups = new Map();
  for (const entry of assemblies.values()) {
    if (!materialGroups.has(entry.material))
      materialGroups.set(entry.material, []);
    materialGroups.get(entry.material).push(entry);
  }
  for (const [material, entries] of materialGroups) {
    const count = entries.reduce((n, e) => n + e.matrices.length, 0);
    const vertices = entries.reduce(
      (n, e) => n + e.geometry.attributes.position.count,
      0,
    );
    const batch = new T.BatchedMesh(count, vertices, 0, material);
    batch.name = 'Colossus / culled machinery batch';
    for (const { geometry, matrices } of entries) {
      const id = batch.addGeometry(geometry);
      for (const matrix of matrices)
        batch.setMatrixAt(batch.addInstance(id), matrix);
    }
    batch.castShadow = batch.receiveShadow = true;
    batch.computeBoundingSphere();
    group.add(batch);
    machineBatches.push(batch);
  }
  for (const [material, items] of batches) {
    // Bounded local batches preserve culling around the long descent.
    for (let i = 0; i < items.length; i += 24) {
      const chunk = items.slice(i, i + 24);
      const instances = new T.InstancedMesh(boxes, material, chunk.length);
      instances.name = 'Colossus / structural assembly batch';
      chunk.forEach((entry, index) =>
        instances.setMatrixAt(index, entry.transform),
      );
      instances.castShadow = instances.receiveShadow = true;
      instances.computeBoundingSphere();
      group.add(instances);
    }
  }
  paint.dispose();
  let disposed = false;
  return {
    group,
    update({ time = 0, settings = {} }) {
      for (const item of moving) {
        const t = settings.reducedMotion ? 0 : time;
        if (item.axis) item.object.rotation[item.axis] = t * item.speed;
        else
          item.object.position
            .copy(item.origin)
            .addScaledVector(
              item.up,
              Math.sin(t * item.speed + item.phase) * item.travel,
            );
      }
      for (const { e, head, shaft, lamps } of ejectorRecords) {
        const f = track.sample(e.distance),
          phase = sampleEjector(time, e),
          pose = ejectorPose(track, e, time);
        head.position.copy(pose.position);
        head.quaternion.copy(pose.quaternion);
        const anchor = -e.side * 84,
          length = Math.abs(phase.lateral - anchor);
        shaft.position
          .copy(f.position)
          .addScaledVector(f.right, (anchor + phase.lateral) / 2)
          .addScaledVector(f.up, e.height / 2 + 0.4 + phase.clearance);
        shaft.quaternion
          .copy(f.quaternion)
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(0, 0, 1),
              Math.PI / 2,
            ),
          );
        shaft.scale.y = length;
        for (const lamp of lamps) {
          lamp.material = phase.striking ? red : warning;
          lamp.visible = phase.warning || phase.extension > 0.02 || shape;
        }
      }
      for (const { press, head, face, ram, light } of records) {
        const pose = pressPose(track, press, time),
          phase = samplePress(time, press),
          f = track.sample(press.distance);
        head.position.copy(pose.position);
        head.quaternion.copy(pose.quaternion);
        face.position
          .copy(pose.position)
          .addScaledVector(f.up, -press.height / 2 + 1);
        face.quaternion.copy(pose.quaternion);
        const top = phase.bottom + press.height,
          ramLength = 65 - top;
        ram.position
          .copy(f.position)
          .addScaledVector(f.right, press.lateral)
          .addScaledVector(f.up, top + ramLength / 2);
        ram.quaternion.copy(f.quaternion);
        ram.scale.y = ramLength;
        light.material = phase.active ? red : warning;
        light.visible = phase.active || phase.warning || shape;
      }
      for (const { clock, side } of beltMaterials) clock.value = time * side;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      machineBatches.forEach((b) => b.dispose());
      kit.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
