import { createColossusFoundationBuilder } from './foundations.js';
import { buildColossusReceivingHalls } from './receivers.js';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createQuarry } from './quarry.js';
import { buildColossusHalls } from './halls.js';
import { createProcessStencils } from './stencils.js';
import { emitIntakeOpenLoadBed, emitOpenPayloadCover } from './casing.js';
import { createColossusMountains } from './mountains.js';
import { createColossusGrinders } from './grinders.js';
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { createColossusPaint, housingGeometry } from '../track/presentation.js';
import {
  samplePress,
  pressPose,
  sampleEjector,
  ejectorPose,
} from '../mechanics.js';

export function createColossusEnvironment({
  track,
  shape = false,
  road = null,
  view = null,
  collectSolid = null,
  collisionOnly = false,
}) {
  const group = new T.Group();
  group.name = 'Colossus / quarry and working machinery';
  const paint = collisionOnly ? null : createColossusPaint(track);
  const stencils = createProcessStencils({ shape });
  group.add(stencils.group);
  const kit = createIndustrialKit({ finish: shape ? null : road?.finish }),
    geometries = new Set(),
    materials = new Set();
  const formedBoxes = new Map();
  const records = [],
    ejectorRecords = [],
    moving = [],
    assemblies = new Map(),
    machineBatches = [];
  // Physics reuses the static placement emitters without creating terrain,
  // texture paint or render batches. Moving machines keep their own actors.
  const quarry = collisionOnly
    ? null
    : createQuarry(track, shape ? null : view?.renderer);
  const mountains = collisionOnly
    ? null
    : createColossusMountains(track, quarry);
  if (!collisionOnly) group.add(quarry.mesh, mountains.group);
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
    // Physical bevel widths survive long beams and thin sheet returns. Size
    // prototypes join the existing culled batches instead of adding draw calls.
    const key = size.join('/');
    if (!formedBoxes.has(key)) {
      let geometry = new RoundedBoxGeometry(
        ...size,
        1,
        Math.min(0.8, Math.min(...size) * 0.12),
      );
      if (geometry.index) {
        const flat = geometry.toNonIndexed();
        geometry.dispose();
        geometry = flat;
      }
      geometry.name = name;
      geometries.add(geometry);
      formedBoxes.set(key, geometry);
    }
    const geometry = formedBoxes.get(key),
      placement = matrix
        .clone()
        .multiply(new T.Matrix4().makeTranslation(...localPosition)),
      batchKey = geometry.uuid + '/' + material.uuid;
    collectSolid?.({ name, geometry, matrix: placement, boxSize: size });
    if (collisionOnly) return;
    if (!assemblies.has(batchKey))
      assemblies.set(batchKey, { geometry, material, matrices: [] });
    assemblies.get(batchKey).matrices.push(placement);
  };
  const mesh = (geometry, material, name) => {
    geometries.add(geometry);
    const object = new T.Mesh(geometry, material);
    object.name = name;
    object.castShadow = object.receiveShadow = true;
    group.add(object);
    return object;
  };
  const placeAssembly = (name, matrix) => {
    for (const part of kit.prototypes[name]) {
      collectSolid?.({
        name: part.geometry.name,
        geometry: part.geometry,
        matrix,
      });
      if (collisionOnly) continue;
      const key = part.geometry.uuid;
      if (!assemblies.has(key)) assemblies.set(key, { ...part, matrices: [] });
      assemblies.get(key).matrices.push(matrix);
    }
  };
  const assembly = (name, distance, lateral = 0, up = 0, turn = 0) => {
    let matrix = trackMatrix(distance, lateral, up);
    if (
      [
        'coolingBank',
        'serviceTower',
        'factoryBay',
        'feedRoll',
        'serviceDeck',
        'hydraulicBank',
        'louverPanel',
      ].includes(name)
    ) {
      const f = track.sample(distance),
        forward = f.tangent.clone().setY(0).normalize(),
        right = new T.Vector3(0, 1, 0).cross(forward).normalize();
      const position = f.position
        .clone()
        .addScaledVector(f.right, lateral)
        .add(new T.Vector3(0, up, 0));
      matrix = new T.Matrix4().makeBasis(
        right,
        new T.Vector3(0, 1, 0),
        forward,
      );
      matrix.setPosition(position);
    }
    matrix.multiply(new T.Matrix4().makeRotationY(turn));
    if (name === 'serviceDeck') {
      const inverse = matrix.clone().invert();
      if (
        routeSurvey.some((p) => {
          const v = p.clone().applyMatrix4(inverse);
          return Math.abs(v.x) < 48 && Math.abs(v.y) < 22 && Math.abs(v.z) < 85;
        })
      )
        return;
    }
    if (name === 'factoryBay')
      for (const side of [-1, 1])
        foundation(
          new T.Vector3(side * 85, -18, 0).applyMatrix4(matrix),
          46,
          64,
        );
    if (name === 'feedRoll')
      for (const side of [-1, 1])
        foundation(
          new T.Vector3(side * 92, -20, 0).applyMatrix4(matrix),
          44,
          62,
        );
    if (name === 'coolingBank')
      foundation(new T.Vector3(0, -32, 0).applyMatrix4(matrix), 66, 124);

    placeAssembly(name, matrix);
  };
  const staticPart = (
    geometry,
    material,
    name = 'Colossus / static machinery',
  ) => {
    collectSolid?.({ name, geometry, matrix: null });
    if (collisionOnly) {
      geometry.dispose();
      return;
    }
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    // Batched materials share one attribute layout, including untextured
    // sweep geometry and UV-bearing kit parts.
    if (!geometry.attributes.uv)
      geometry.setAttribute(
        'uv',
        new T.BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 2),
          2,
        ),
      );
    geometry.name = name;
    geometries.add(geometry);
    assemblies.set(geometry.uuid, {
      geometry,
      material,
      matrices: [new T.Matrix4()],
    });
  };
  const supplyPipe = (points, matrix, radius = 2.8) => {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p).applyMatrix4(matrix)),
      false,
      'centripetal',
    );
    staticPart(
      new T.TubeGeometry(curve, points.length * 5, radius, 8, false),
      kit.materials.steel,
      'Hydraulics / connected pressure feed',
    );
    for (const t of [0, 1]) {
      const flange = new T.CylinderGeometry(
        radius * 1.9,
        radius * 1.9,
        2.4,
        16,
      );
      flange.applyQuaternion(
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          curve.getTangent(t),
        ),
      );
      flange.translate(...curve.getPoint(t).toArray());
      staticPart(flange, kit.materials.dark, 'Hydraulics / flange coupling');
    }
  };
  const workLights = [],
    workAnchors = [];
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
  const taskLamp = (matrix, position, color = '#ffe1b3', strength = 1) => {
    putBox(
      kit.materials.dark,
      [14, 5, 18],
      position,
      matrix,
      'Service / task-light housing',
    );
    putBox(
      fixture,
      [10, 1.4, 14],
      [position[0], position[1] - 3, position[2]],
      matrix,
      'Service / task-light lens',
    );
    workAnchors.push({
      strength,
      position: new T.Vector3(
        position[0],
        position[1] - 5,
        position[2],
      ).applyMatrix4(matrix),
      target: new T.Vector3(
        position[0] + Math.sign(position[0]) * 12,
        position[1] - 16,
        position[2] + 8,
      ).applyMatrix4(matrix),
      color: new T.Color(color),
    });
  };
  if (!shape)
    for (let i = 0; i < 3; i++) {
      const light = new T.SpotLight('#ffe1b3', 0, 95, 0.52, 0.75, 2);
      group.add(light, light.target);
      workLights.push(light);
    }
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
  // Real world-vertical foundation piers root the elevated open works in the quarry.
  // Reject placements near any other route reach, including beneath overpasses.
  const routeSurvey = [];
  for (let s = 0; s < track.length; s += 16)
    routeSurvey.push(track.sample(s).position);
  const uprightMatrix = (distance) => {
    const f = track.sample(distance),
      up = new T.Vector3(0, 1, 0),
      forward = f.tangent.clone().setY(0).normalize();
    return new T.Matrix4()
      .makeBasis(up.clone().cross(forward), up, forward)
      .setPosition(f.position);
  };
  const bodyClear = (size, position, matrix) => {
    const inverse = matrix
      .clone()
      .multiply(new T.Matrix4().makeTranslation(...position))
      .invert();
    return !routeSurvey.some((p) => {
      const v = p.clone().applyMatrix4(inverse);
      return (
        Math.abs(v.x) < size[0] / 2 + 40 &&
        Math.abs(v.y) < size[1] / 2 + 40 &&
        Math.abs(v.z) < size[2] / 2 + 20
      );
    });
  };
  const solidBody = (material, size, position, matrix, name) => {
    if (bodyClear(size, position, matrix))
      putBox(material, size, position, matrix, name);
  };
  const groundY = -70;
  const foundationRequests = [];
  const foundation = (top, width, depth) =>
    foundationRequests.push({ top, width, depth });
  const concrete = new T.MeshStandardMaterial({
    color: '#74746b',
    roughness: 0.91,
    metalness: 0.04,
  });
  materials.add(concrete);
  if (!shape) road?.finish?.bind(concrete, 'dark');
  const makeFoundation = collisionOnly
    ? null
    : createColossusFoundationBuilder({
        quarry,
        kit,
        concrete,
        putBox,
        staticPart,
        routeSurvey,
        groundY,
      });
  // Structural stations follow working assemblies. Between them a low formed
  // lip exposes drive beds instead of masking them with tall cream skins.
  const bearingStations = [];
  const stationRecipes = {
    intake: [110, 120, 32],
    screw: [220, 220, 32],
    press: [55, 125, 26],
    die: [55, 180, 28],
    dive: [70, 240, 26],
    crossfeed: [100, 180, 32],
    auger: [220, 220, 32],
    gantry: [65, 300, 32],
    return: [55, 380, 32],
    rise: [100, 230, 30],
    counterweight: [120, 240, 30],
    cooling: [85, 190, 34],
    crown: [100, 450, 36],
    headstock: [210, 290, 34],
  };
  for (const section of track.sections) {
    const [first, spacing, length] = stationRecipes[section.id] || [
      70, 240, 28,
    ];
    for (let d = section.start + first; d < section.end - 35; d += spacing)
      if (!openBay(d, 90) && !track.isGap(d))
        bearingStations.push({ distance: d, length, section: section.id });
  }
  // Continuous swept housings seat the running sheet inside a load-bearing bed.
  // The cross sections stay outside the full 72 m playable sheet through rolls.
  for (const run of track.runs) {
    const cuts = [
      run.start,
      run.end,
      ...track.sections
        .flatMap((s) => [s.start, s.end])
        .filter((s) => s > run.start && s < run.end),
      ...bearingStations
        .flatMap((s) => [s.distance - s.length / 2, s.distance + s.length / 2])
        .filter((s) => s > run.start && s < run.end),
      ...track.ejectors
        .flatMap((e) => [e.openingStart - 10, e.openingEnd + 10])
        .filter((s) => s > run.start && s < run.end),
    ].sort((a, b) => a - b);
    for (let n = 0; n < cuts.length - 1; n++) {
      if (openBay((cuts[n] + cuts[n + 1]) / 2, 10)) continue;
      for (let a = cuts[n]; a < cuts[n + 1] - 0.01; a += 250) {
        const b = Math.min(a + 250, cuts[n + 1]);
        const district = track.sections.find(
          (s) => (a + b) / 2 >= s.start && (a + b) / 2 < s.end,
        )?.id;
        const station = bearingStations.some(
          (s) => Math.abs((a + b) / 2 - s.distance) < s.length / 2 + 0.01,
        );
        const casingHeight = station
          ? [
              'press',
              'die',
              'dive',
              'crossfeed',
              'return',
              'headstock',
            ].includes(district)
            ? 0.45
            : 0.85
          : 0.16;
        const casingProfile = (profile, side) =>
          profile.map(([x, y]) => [x * side, y > 0 ? y * casingHeight : y]);
        for (const side of [-1, 1]) {
          if (district === 'intake') {
            emitIntakeOpenLoadBed({
              track,
              a,
              b,
              side,
              station,
              casingHeight,
              housingGeometry,
              staticPart,
              materials: kit.materials,
            });
          } else {
            staticPart(
              housingGeometry(
                track,
                a,
                b,
                casingProfile(
                  [
                    [40, -5],
                    [40, -24],
                    [65, -24],
                    [65, 9],
                    [60, 15],
                    [49, 15],
                    [49, -5],
                  ],
                  side,
                ),
              ),
              kit.materials.dark,
              'Continuous load bed',
            );
            staticPart(
              housingGeometry(
                track,
                a,
                b,
                casingProfile(
                  [
                    [49, 15],
                    [49, 20],
                    [60, 20],
                    [66, 14],
                    [66, 9],
                    [60, 15],
                  ],
                  side,
                ),
              ),
              kit.materials.shell,
              'Formed outer casing',
            );
          }
          staticPart(
            housingGeometry(
              track,
              a,
              b,
              casingProfile(
                [
                  [40, -23],
                  [40, -27],
                  [67, -27],
                  [67, -23],
                ],
                side,
              ),
            ),
            kit.materials.steel,
            'Lower carrying flange',
          );
        }
      }
    }
  }
  // Shared walls, bearing floors and roof wings turn the beds into factory spaces.
  // Upright architecture follows the ground plan without inheriting racing banks.
  const uprightTrack = {
    sample(distance) {
      const f = track.sample(distance),
        up = new T.Vector3(0, 1, 0);
      return {
        position: f.position,
        right: up.clone().cross(f.tangent).normalize(),
        up,
      };
    },
  };
  const cladding = new T.MeshStandardMaterial({
    color: '#718078',
    roughness: 0.61,
    metalness: 0.22,
  });
  materials.add(cladding);
  if (!shape) road?.finish?.bind(cladding, 'shell');
  const warmCladding = cladding.clone(),
    coolCladding = cladding.clone();
  warmCladding.color.set('#876f5c');
  coolCladding.color.set('#597b86');
  for (const m of [warmCladding, coolCladding]) {
    materials.add(m);
    if (!shape) road?.finish?.bind(m, 'shell');
  }
  if (!shape && road?.finish) {
    for (const m of [cladding, warmCladding, coolCladding]) {
      const compile = m.onBeforeCompile,
        cacheKey = m.customProgramCacheKey();
      m.onBeforeCompile = (shader, renderer) => {
        compile.call(m, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        vec3 wallNormal=abs(normalize(cross(dFdx(industrialPoint),dFdy(industrialPoint))));
        vec2 wallCoord=vec2(wallNormal.x>wallNormal.z?industrialPoint.z:industrialPoint.x,industrialPoint.y);
        vec2 panelSize=vec2(26.,9.);
        vec2 panelCell=mod(wallCoord+vec2(mod(floor(wallCoord.y/9.),2.)*13.,0.),panelSize);
        vec2 panelEdge=min(panelCell,panelSize-panelCell);
        vec2 panelAA=max(fwidth(wallCoord),vec2(.025));
        vec2 panelJoint=(1.-smoothstep(vec2(.06),vec2(.13)+panelAA,panelEdge))*min(vec2(1.),vec2(.15)/panelAA);
        float panelLine=max(panelJoint.x,panelJoint.y)*(1.-smoothstep(.65,.9,wallNormal.y));
        diffuseColor.rgb*=1.-panelLine*.32;
        roughnessFactor=clamp(roughnessFactor+panelLine*.15,.25,.95);`,
        );
      };
      m.customProgramCacheKey = () => cacheKey + '-fabricated-panels-v1';
    }
  }
  const sweepBuilding = (a, b, profile, material, name) =>
    staticPart(housingGeometry(uprightTrack, a, b, profile), material, name);
  for (const id of ['intake', 'press', 'cooling']) {
    const zone = track.sections.find((s) => s.id === id);
    for (
      let a = zone.start + 28, index = 0;
      a < zone.end - 40;
      a += 160, index++
    ) {
      const b = Math.min(a + 154, zone.end - 24);
      if (openBay((a + b) / 2, 180)) continue;
      for (const side of [-1, 1]) {
        const curvature = Math.max(
          ...[a, (a + b) / 2, b].map((d) =>
            Math.abs(track.sample(d).curvature),
          ),
        );
        // Keep swept architecture away from its offset-curve singularity.
        const reach = Math.min(157, 0.75 / Math.max(curvature, 0.0001));
        if (reach < 90) continue;
        const p = (profile) =>
          profile.map(([x, y]) => [Math.min(x, reach) * side, y]);
        sweepBuilding(
          a,
          b,
          p([
            [68, -59],
            [155, -59],
            [155, -26],
            [68, -26],
          ]),
          kit.materials.dark,
          'Factory / continuous bearing floor',
        );
        sweepBuilding(
          a,
          b,
          p([
            [68, -27],
            [155, -27],
            [155, -19],
            [68, -19],
          ]),
          kit.materials.shell,
          'Factory / shared floor cap',
        );
        if (id === 'cooling') continue;
        const height =
          (id === 'press' ? 132 : side > 0 ? 118 : 81) +
          (index % 3 === 1 ? 20 : 0);
        const recessTop = Math.min(height - 16, id === 'press' ? 104 : 78);
        // Deep cast end frames carry a thin rear skin; the service volume is open.
        sweepBuilding(
          a,
          b,
          p([
            [140, -19],
            [150, -19],
            [150, height],
            [140, height],
          ]),
          id === 'press' ? warmCladding : cladding,
          'Factory / recessed rear skin',
        );
        const cheek = p([
          [96, -19],
          [154, -19],
          [154, -4],
          [145, 5],
          [145, height - 24],
          [134, height],
          [104, height],
          [96, height - 12],
          [96, recessTop],
          [111, recessTop],
          [122, recessTop - 12],
          [122, 32],
          [111, 20],
          [96, 20],
        ]);
        for (const [from, to] of [
          [a, a + 14],
          [b - 14, b],
        ])
          sweepBuilding(
            from,
            to,
            cheek,
            kit.materials.cast,
            'Factory / tapered cast bearing cheek',
          );
        for (const y of [-10, height - 7])
          sweepBuilding(
            a,
            b,
            p([
              [132, y],
              [154, y],
              [154, y + 6],
              [132, y + 6],
            ]),
            kit.materials.steel,
            'Factory / continuous load spine',
          );
        for (const y of [27])
          sweepBuilding(
            a,
            b,
            p([
              [id === 'press' ? 114 : 68, y],
              [155, y],
              [155, y + 11],
              [id === 'press' ? 114 : 68, y + 11],
            ]),
            kit.materials.steel,
            'Factory / connected mezzanine',
          );
        sweepBuilding(
          a,
          b,
          p([
            [side > 0 ? 28 : 61, height + 9],
            [157, height + 9],
            [157, height + 21],
            [side > 0 ? 28 : 61, height + 21],
          ]),
          kit.materials.shell,
          'Factory / asymmetric roof wing',
        );
      }
    }
  }
  // Press services occupy the recessed wall rather than another outer box.
  const pressZone = track.sections.find((s) => s.id === 'press');
  for (let d = pressZone.start + 45; d < pressZone.end - 45; d += 100) {
    const m = uprightMatrix(d);
    for (const side of [-1, 1]) {
      for (const z of [-36, 36]) {
        putBox(
          kit.materials.dark,
          [10, 94, 9],
          [side * 111, 62, z],
          m,
          'Press / recessed bay jamb',
        );
        putBox(
          kit.materials.shell,
          [4, 94, 14],
          [side * 103, 62, z],
          m,
          'Press / removable jamb cover',
        );
      }
      for (const y of [18, 108])
        putBox(
          kit.materials.steel,
          [20, 6, 82],
          [side * 107, y, 0],
          m,
          'Press / service aperture lintel',
        );
      for (const z of [-22, 0, 22]) {
        const duct = new T.CylinderGeometry(6, 6, 67, 16);
        duct.translate(side * 109, 62, z);
        duct.applyMatrix4(m);
        staticPart(
          duct,
          kit.materials.steel,
          'Press / recessed hydraulic riser',
        );
        for (const y of [34, 90])
          putBox(
            kit.materials.dark,
            [14, 5, 16],
            [side * 109, y, z],
            m,
            'Press / pipe anchor',
          );
      }
      taskLamp(m, [side * 99, 103, 0], '#c9e6ff', 0.32);
    }
  }
  // Intake is an exposed feed mill: the road is the work bed beneath its rolls.
  const intake = track.sections.find((s) => s.id === 'intake');
  for (const offset of [110, 230]) assembly('feedRoll', intake.start + offset);
  // Room-size assemblies make the chutes read as machine beds within a factory.
  for (const id of ['press', 'return']) {
    const zone = track.sections.find((s) => s.id === id);
    for (
      let d = zone.start + 55;
      d < zone.end - 40;
      d += id === 'press' ? 125 : id === 'return' ? 380 : 290
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
    for (let d = zone.start + 220; d < zone.end - 60; d += 220) {
      for (const side of [-1, 1]) {
        assembly('rollerBank', d, side * 77, -18);
        const wheel = kit.createAssembly('driveWheel');
        const pivot = new T.Group();
        pivot.applyMatrix4(trackMatrix(d, side * 84, 42));
        wheel.scale.setScalar(1.35);
        pivot.add(wheel);
        for (const x of [-14, 14]) {
          const bearing = kit.createAssembly('driveBearing');
          bearing.scale.setScalar(1.35);
          bearing.position.set(x, -4, 0);
          pivot.add(bearing);
        }
        const gearbox = kit.createAssembly('driveGearbox');
        gearbox.position.set(side * 44, -4, 0);
        pivot.add(gearbox);
        const driveMatrix = trackMatrix(d, side * 84, 42);
        solidBody(
          kit.materials.dark,
          [126, 12, 95],
          [side * 26, -40, 0],
          driveMatrix,
          'Roll / complete drive bearing seat',
        );
        for (const z of [-34, 34])
          solidBody(
            kit.materials.steel,
            [126, 7, 10],
            [side * 26, -33.5, z],
            driveMatrix,
            'Roll / mounting crossmember',
          );
        group.add(pivot);
        moving.push({ object: wheel, axis: 'x', speed: side * 0.18 });
      }
    }
  }

  // Partial barrel casings enclose the wall rolls, with daylight slots above.
  const innerCasing = kit.materials.dark.clone();
  innerCasing.side = T.DoubleSide;
  if (!shape) road?.finish?.bind(innerCasing, 'dark');
  materials.add(innerCasing);
  for (const id of ['screw', 'auger']) {
    const zone = track.sections.find((s) => s.id === id);
    for (let s = zone.start + 50; s < zone.end - 60; s += 140) {
      const m = trackMatrix(s);
      // Wide inspection apertures reveal the roller drives between load rings.
      for (const z of [-45, 45]) {
        const drum = new T.CylinderGeometry(
          69,
          69,
          16,
          40,
          1,
          true,
          -Math.PI * 0.77,
          Math.PI * 1.54,
        );
        drum.rotateX(Math.PI / 2);
        drum.translate(0, 0, z);
        drum.applyMatrix4(m);
        staticPart(drum, innerCasing, 'Roll / open inspection bay');
      }
      // Longitudinal ribs and bolted segment joins make the roll casing a machine.
      for (let i = 0; i <= 10; i++) {
        const angle = Math.PI * 0.73 + (i * Math.PI * 1.54) / 10;
        const x = Math.cos(angle) * 66,
          y = Math.sin(angle) * 66;
        const rib = new T.BoxGeometry(3.4, 3.4, 102);
        rib.rotateZ(angle);
        rib.translate(x, y, 0);
        rib.applyMatrix4(m);
        staticPart(
          rib,
          kit.materials.steel,
          'Roll / internal longitudinal rib',
        );
        for (const z of [-51, 51]) {
          const plate = new T.BoxGeometry(10, 4, 8);
          plate.rotateZ(angle);
          plate.translate(x, y, z);
          plate.applyMatrix4(m);
          staticPart(plate, kit.materials.dark, 'Roll / casing joint clamp');
        }
      }

      for (const z of [-53, 53]) {
        const ring = new T.TorusGeometry(70, 3.8, 8, 48, Math.PI * 1.54);
        ring.rotateZ(Math.PI * 0.73);
        ring.translate(0, 0, z);
        ring.applyMatrix4(m);
        staticPart(ring, kit.materials.shell);
      }
      for (const side of [-1, 1]) {
        // Separate ring feet leave the drive visible through the barrel window.
        for (const z of [-45, 45])
          putBox(kit.materials.shell, [16, 34, 18], [side * 75, -9, z], m);
        putBox(kit.materials.dark, [12, 10, 112], [side * 75, -21, 0], m);
        putBox(kit.materials.steel, [28, 8, 116], [side * 75, -28, 0], m);
      }
    }
  }
  for (const station of bearingStations) {
    const m = trackMatrix(station.distance);
    for (const side of [-1, 1]) {
      putBox(kit.materials.steel, [28, 36, 8], [side * 56, -7, 0], m);
      putBox(kit.materials.cast, [8, 30, 18], [side * 44, -7, 0], m);
      putBox(kit.materials.dark, [34, 10, 26], [side * 55, -30, 0], m);
      if (['die', 'dive', 'gantry', 'crown'].includes(station.section))
        assembly(
          'channelCassette',
          station.distance,
          side * 80,
          0,
          side < 0 ? Math.PI : 0,
        );
    }
  }
  // Ordinary production floor: unequal work bays and rooted utility stacks.
  for (const section of track.sections.filter(
    (s) =>
      ![
        'screw',
        'auger',
        'die',
        'gantry',
        'cooling',
        'headstock',
        'return',
        'rise',
        'counterweight',
        'crossfeed',
      ].includes(s.id),
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
    }
  }
  // An open transfer line replaces the repeated enclosed hall at crossfeed.
  const transferZone = track.sections.find((s) => s.id === 'crossfeed');
  for (let d = transferZone.start + 100; d < transferZone.end - 70; d += 180) {
    if (openBay(d, 100)) continue;
    const m = trackMatrix(d);
    for (const side of [-1, 1]) {
      assembly('transferBed', d, side * 108, 10, side < 0 ? Math.PI : 0);
      for (const dx of [-32, 32])
        solidBody(
          kit.materials.dark,
          [10, 20, 160],
          [side * 108 + dx, -8, 0],
          m,
          'Crossfeed / open longitudinal chassis',
        );
      for (const z of [-58, 58])
        solidBody(
          kit.materials.steel,
          [90, 8, 16],
          [side * 108, 3, z],
          m,
          'Crossfeed / bearing beam',
        );
    }
  }
  // The press hall is a connected structure with a partial roof and broad daylight.
  for (const press of collisionOnly ? [] : track.presses) {
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
      for (const y of [54, 78])
        putBox(
          kit.materials.dark,
          [34, 5, 180],
          [side * 76, y, 70],
          m,
          'Press / open service girder',
        );
      for (const z of [0, 60, 120])
        putBox(
          kit.materials.shell,
          [6, 23, 24],
          [side * 58, 66, z],
          m,
          'Press / separate removable cover',
        );
      supplyPipe(
        [
          [side * 76, 66, -18],
          [side * 76, 66, 150],
        ],
        m,
        4,
      );
      for (const z of [30, 90, 150]) {
        putBox(
          kit.materials.steel,
          [18, 5, 9],
          [side * 76, 66, z],
          m,
          'Press / manifold clamp',
        );
        supplyPipe(
          [
            [side * 76, 66, z],
            [side * 76, 40, z],
            [side * 65, 34, z],
          ],
          m,
          2.3,
        );
      }
      putBox(kit.materials.steel, [30, 4, 180], [side * 72, 49, 70], m);
      putBox(kit.materials.shell, [20, 4, 150], [side * 43, 94, 60], m);
      putBox(kit.materials.steel, [20, 3, 145], [side * 60, 32, 60], m);
    }
  }
  const conveyors = collisionOnly
    ? null
    : createColossusGrinders({ track, paint, shape, finish: road?.finish });
  if (conveyors) group.add(conveyors.group);

  // Ejector bays have open discharge edges, physical piston heads and a visible
  // stroke footprint. The housing and guide rails sit outside the running bed.
  for (const e of collisionOnly ? [] : track.ejectors) {
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
  const loadMatrix = trackMatrix(hero.landingStart + 130, 0, 170);
  emitOpenPayloadCover({
    putBox,
    staticPart,
    materials: kit.materials,
    loadMatrix,
  });
  for (const side of [-1, 1])
    putBox(kit.materials.dark, [12, 25, 90], [side * 48, -19.5, 0], loadMatrix);
  const hoistFrame = trackMatrix(hero.landingStart + 100);
  for (const x of [-38, 38])
    for (const z of [-30, 30]) {
      const a = new T.Vector3(x, 207, z * 0.6).applyMatrix4(hoistFrame);
      const b = new T.Vector3(x, 8, z).applyMatrix4(loadMatrix);
      const line = new T.LineCurve3(a, b);
      staticPart(
        new T.TubeGeometry(line, 1, 0.85, 6, false),
        kit.materials.dark,
        'Gantry / tensioned load suspension',
      );
      putBox(
        kit.materials.steel,
        [12, 6, 12],
        [x, 9, z],
        loadMatrix,
        'Gantry / lifting lug',
      );
    }
  for (const z of [-30, 30]) {
    putBox(
      kit.materials.amber,
      [100, 10, 16],
      [0, 196, z * 0.6],
      hoistFrame,
      'Gantry / spreader crosshead',
    );
    putBox(
      kit.materials.steel,
      [105, 4, 20],
      [0, -8, z],
      loadMatrix,
      'Gantry / payload flange',
    );
  }
  // Broad return-leg landmarks: exposed counterweight guides, cooling shells
  // and the massive crown bed. They are readable from the driving surface.
  const section = (id) => track.sections.find((entry) => entry.id === id);
  const rise = section('rise');
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
      // Deep stepped bases follow the actual bend beneath the steel. Long rigid
      // banked boxes raised their outboard corners into the crown sightline.
      const bed = (profile, material, name) =>
        staticPart(
          housingGeometry(track, s - 80, s + 80, profile),
          material,
          id + ' / swept ' + name,
        );
      bed(
        [
          [-52, -64],
          [52, -64],
          [52, -20],
          [44, -20],
          [44, -12],
          [-44, -12],
          [-44, -20],
          [-52, -20],
        ],
        kit.materials.shell,
        'stepped bearing bed',
      );
      bed(
        [
          [-50, -70],
          [50, -70],
          [50, -64],
          [-50, -64],
        ],
        kit.materials.dark,
        'bearing sole',
      );
      for (const side of [-1, 1])
        bed(
          [
            [42, -17],
            [45, -17],
            [45, -14],
            [42, -14],
          ].map(([x, y]) => [x * side, y]),
          kit.materials.amber,
          'recessed shoulder lip',
        );
    }
  }
  buildColossusReceivingHalls({
    track,
    kit,
    uprightMatrix,
    bodyClear,
    putBox,
    staticPart,
    foundation,
  });
  // Low dispatch workshop beyond the final jump.
  for (const jump of track.jumps.filter(
    (j) => j.id !== 'die-transfer' && !j.hero,
  )) {
    const distance = jump.landingStart + 180,
      m = uprightMatrix(distance),
      length = 210,
      height = 70;
    for (const side of [-1, 1]) {
      solidBody(
        kit.materials.dark,
        [98, 54, length + 35],
        [side * 126, -53, 0],
        m,
        'District / receiving plinth',
      );
      solidBody(
        kit.materials.shell,
        [106, 16, length + 45],
        [side * 126, -20, 0],
        m,
        'District / bearing deck',
      );
      for (const z of [-length / 2 + 28, length / 2 - 28]) {
        if (
          !bodyClear([82, height + 3, 59], [side * 126, height / 2 - 14, z], m)
        )
          continue;
        const frame = new T.Shape(
          [
            [-39, -14],
            [39, -14],
            [39, 18],
            [31, 28],
            [31, height - 58],
            [22, height - 14],
            [-22, height - 14],
            [-31, height - 58],
            [-31, 28],
            [-39, 18],
          ].map(([x, y]) => new T.Vector2(x, y)),
        );
        const body = new T.ExtrudeGeometry(frame, {
          depth: 18,
          bevelEnabled: true,
          bevelThickness: 1.5,
          bevelSize: 1.5,
          bevelSegments: 1,
          steps: 1,
        });
        body.translate(side * 126, 0, z - 9);
        body.applyMatrix4(m);
        staticPart(
          body,
          kit.materials.steel,
          'District / fabricated receiving web',
        );
        for (const edge of [-29, 29])
          solidBody(
            kit.materials.shell,
            [9, height - 62, 62],
            [side * 126 + edge, (height - 62) / 2 + 14, z],
            m,
            'District / column flange',
          );
        for (const y of [-8, height - 17])
          solidBody(
            kit.materials.dark,
            [86, 12, 68],
            [side * 126, y, z],
            m,
            'District / bolted bearing seat',
          );
      }
      solidBody(
        cladding,
        [14, 24, length - 12],
        [side * 155, height - 32, 0],
        m,
        'District / deep upper body',
      );
      solidBody(
        kit.materials.shell,
        [86, 7, length + 20],
        [side * 107, height + 1, 0],
        m,
        'District / supported roof return',
      );
      for (const z of [-86, -43, 0, 43, 86]) {
        solidBody(
          kit.materials.dark,
          [68, 4, 5],
          [side * 123, 55, z],
          m,
          'Dispatch / open roof rib',
        );
        solidBody(
          kit.materials.steel,
          [5, 49, 8],
          [side * 155, 30, z],
          m,
          'Dispatch / rib root',
        );
      }
      for (const z of [-65, 0, 65]) {
        const unit = kit.createAssembly('driveGearbox');
        unit.position.set(side * 126, 25, z);
        unit.applyMatrix4(m);
        group.add(unit);
        if (collectSolid) {
          unit.updateMatrix();
          for (const part of kit.prototypes.driveGearbox)
            collectSolid({
              name: part.geometry.name,
              geometry: part.geometry,
              matrix: unit.matrix,
            });
        }
        solidBody(
          kit.materials.steel,
          [74, 7, 12],
          [side * 126, 1, z],
          m,
          'Dispatch / exposed drive mounting',
        );
      }
      foundation(
        new T.Vector3(side * 126, -74, 0).applyMatrix4(m),
        88,
        length * 0.72,
      );
    }
  }
  for (const press of track.presses) {
    const matrix = uprightMatrix(press.distance),
      supplyDistance = press.distance + 55,
      supplyMatrix = uprightMatrix(supplyDistance);
    for (const side of [-1, 1]) {
      // Seat supplies in the open space between columns, below the outer service deck.
      assembly('serviceDeck', press.distance, side * 108, 40);
      assembly('hydraulicBank', supplyDistance, side * 78, 0);
      const points = [
        ...[
          [side * 78 + 24, 58, 21],
          [side * 78 + 24, 83, 21],
        ].map((p) => new T.Vector3(...p).applyMatrix4(supplyMatrix).toArray()),
        ...[
          [side * 60, 83, 0],
          [side * 60, 67, 0],
          [press.lateral, 65, 0],
        ].map((p) => new T.Vector3(...p).applyMatrix4(matrix).toArray()),
      ];
      supplyPipe(points, new T.Matrix4());
      solidBody(
        kit.materials.dark,
        [55, 14, 90],
        [side * 78, -12, 0],
        supplyMatrix,
        'Press / hydraulic service plinth',
      );
      for (const z of [-36, 36])
        solidBody(
          kit.materials.steel,
          [55, 5, 10],
          [side * 78, -3, z],
          supplyMatrix,
          'Press / equipment mounting crossmember',
        );
      taskLamp(supplyMatrix, [side * 64, 71, -38], '#ffe1b3', 0.4);
    }
  }
  for (const d of [
    section('intake').start + 110,
    section('intake').start + 230,
  ])
    for (const side of [-1, 1])
      taskLamp(uprightMatrix(d), [side * 70, 61, -33], '#ffe1b3', 0.28);

  for (let d = cooling.start + 85; d < cooling.end - 80; d += 190)
    for (const side of [-1, 1]) assembly('serviceDeck', d, side * 58, 26);
  for (const jump of track.jumps) {
    const d = jump.landingStart + (jump.hero ? 320 : 180),
      m = uprightMatrix(d);
    for (const side of [-1, 1]) {
      assembly('serviceDeck', d, side * 101, 20);
      taskLamp(m, [side * 100, 57, -24]);
      for (const z of [-58, 58])
        solidBody(
          kit.materials.steel,
          [5, 40, 5],
          [side * 101, 0, z],
          m,
          'Receiving / service deck support',
        );
    }
  }
  const dieJump = track.jumps.find((j) => j.id === 'die-transfer');
  for (const d of [dieJump.takeoff - 110, dieJump.landingStart + 180])
    for (const side of [-1, 1])
      assembly('dieJaw', d, side * 110, 0, side < 0 ? Math.PI : 0);
  const returnZone = section('return'),
    returnDistance = returnZone.end + 110,
    returnFrame = track.sample(returnDistance),
    outboard = -Math.sign(returnFrame.curvature || 1),
    returnMatrix = uprightMatrix(returnDistance);
  solidBody(
    kit.materials.dark,
    [138, 85, 240],
    [outboard * 160, -18, 0],
    returnMatrix,
    'Return / powerhouse base',
  );
  for (const [z, h] of [
    [-80, 105],
    [0, 165],
    [80, 130],
  ]) {
    solidBody(
      coolCladding,
      [98, h, 64],
      [outboard * 187, h / 2 + 2, z],
      returnMatrix,
      'Return / stepped powerhouse bay',
    );
    solidBody(
      kit.materials.shell,
      [118, 12, 75],
      [outboard * 183, h + 8, z],
      returnMatrix,
      'Return / separate service roof',
    );
    // The equipment face looks toward the driving approach, with a deep louvered inlet.
    const vent = kit.createAssembly('louverPanel');
    vent.position.set(outboard * 132, 62, z);
    vent.rotation.y = outboard > 0 ? Math.PI / 2 : -Math.PI / 2;
    vent.applyMatrix4(returnMatrix);
    group.add(vent);
    solidBody(
      kit.materials.dark,
      [12, h + 12, 78],
      [outboard * 237, h / 2, z],
      returnMatrix,
      'Return / rear structural spine',
    );
  }
  for (const z of [-75, 0, 75]) {
    const vessel = new T.CylinderGeometry(22, 22, 100, 24);
    vessel.translate(outboard * 112, 62, z);
    vessel.applyMatrix4(returnMatrix);
    staticPart(vessel, kit.materials.steel, 'Return / accumulator bank');
    for (const y of [16, 108]) {
      const collar = new T.CylinderGeometry(24.5, 24.5, 5, 24);
      collar.translate(outboard * 112, y, z);
      collar.applyMatrix4(returnMatrix);
      staticPart(collar, kit.materials.dark, 'Return / accumulator flange');
    }
    supplyPipe(
      [
        [outboard * 112, 113, z],
        [outboard * 112, 128, z],
        [outboard * 83, 128, z],
        [outboard * 83, 70, z],
      ],
      returnMatrix,
      4,
    );
  }
  assembly('hydraulicBank', returnDistance, outboard * 70, 0);
  solidBody(
    kit.materials.dark,
    [54, 14, 90],
    [outboard * 70, -12, 0],
    returnMatrix,
    'Return / pump mounting bed',
  );
  assembly('serviceDeck', returnDistance, outboard * 145, 26);
  supplyPipe(
    [
      [outboard * 83, 70, -75],
      [outboard * 83, 70, 0],
      [outboard * 83, 70, 75],
    ],
    returnMatrix,
    4,
  );
  supplyPipe(
    [
      [outboard * 70 + 24, 58, 21],
      [outboard * 83, 93, 21],
      [outboard * 83, 70, 21],
    ],
    returnMatrix,
    3,
  );
  taskLamp(returnMatrix, [outboard * 75, 92, -55], '#c9e6ff', 0.28);
  taskLamp(returnMatrix, [outboard * 75, 92, 55], '#c9e6ff', 0.28);
  foundation(
    new T.Vector3(outboard * 165, -60, 0).applyMatrix4(returnMatrix),
    120,
    200,
  );
  // One exposed headstock flywheel replaces the generic portal sequence.
  // Its outboard mounting reads from the last hairpin and never enters a reach.
  const headDistance = section('headstock').start + 210,
    headFrame = track.sample(headDistance),
    headApproach = track.sample(section('headstock').start + 10).position;
  const headWheel = kit.createAssembly('driveWheel');
  headWheel.scale.setScalar(4.2);
  const headMount = new T.Group();
  headMount.add(headWheel);
  for (const x of [-65, 65]) {
    const bearing = kit.createAssembly('driveBearing');
    bearing.scale.setScalar(4.2);
    bearing.position.set(x, 0, 0);
    headMount.add(bearing);
  }
  const mainGearbox = kit.createAssembly('driveGearbox');
  mainGearbox.scale.setScalar(2.4);
  mainGearbox.position.set(-140, 0, 0);
  headMount.add(mainGearbox);
  headMount.name = 'Headstock / exposed main flywheel';
  for (const offset of [190, 230, 280]) {
    const up = new T.Vector3(0, 1, 0),
      right = up.clone().cross(headFrame.tangent).normalize(),
      position = headFrame.position
        .clone()
        .addScaledVector(right, offset)
        .addScaledVector(up, 95),
      axis = headApproach.clone().sub(position).setY(0).normalize();
    const headMatrix = new T.Matrix4()
      .makeBasis(axis, up, axis.clone().cross(up))
      .setPosition(position);
    headMount.matrix.copy(headMatrix);
    headMount.matrix.decompose(
      headMount.position,
      headMount.quaternion,
      headMount.scale,
    );
    headMount.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(headMount).expandByScalar(38);
    if (routeSurvey.some((p) => bounds.containsPoint(p))) continue;
    group.add(headMount);
    moving.push({ object: headWheel, axis: 'x', speed: 0.075 });
    solidBody(
      kit.materials.dark,
      [100, 55, 242],
      [0, -133, 0],
      headMatrix,
      'Headstock / main bearing block',
    );
    for (const z of [-112, 112])
      solidBody(
        kit.materials.shell,
        [112, 125, 33],
        [0, -60, z],
        headMatrix,
        'Headstock / deep bearing cheeks',
      );
    solidBody(
      kit.materials.dark,
      [120, 40, 180],
      [-140, -87, 0],
      headMatrix,
      'Headstock / main gearbox saddle',
    );
    foundation(new T.Vector3(0, -160, 0).applyMatrix4(headMatrix), 110, 235);
    break;
  }
  for (const d of [section('headstock').start + 500])
    for (const side of [-1, 1]) {
      const m = trackMatrix(d, side * 101, 42),
        drive = new T.Group();
      drive.applyMatrix4(m);
      const wheel = kit.createAssembly('driveWheel');
      wheel.scale.setScalar(1.7);
      drive.add(wheel);
      for (const x of [-23, 23]) {
        const bearing = kit.createAssembly('driveBearing');
        bearing.position.set(x, -5, 0);
        bearing.scale.setScalar(1.7);
        drive.add(bearing);
      }
      const gearbox = kit.createAssembly('driveGearbox');
      gearbox.position.set(side * 55, -5, 0);
      gearbox.scale.setScalar(1.4);
      drive.add(gearbox);
      group.add(drive);
      moving.push({ object: wheel, axis: 'x', speed: side * 0.12 });
      solidBody(
        kit.materials.dark,
        [110, 18, 100],
        [side * 22, -48, 0],
        m,
        'Headstock / exposed drive bed',
      );
      taskLamp(m, [side * 35, 55, -35], '#c9e6ff', 0.45);
    }
  // One station owns guides, sheaves, weights and taut ropes on the same plumb frame.
  for (const d of [
    rise.start + 100,
    rise.start + 330,
    section('counterweight').start + 360,
  ]) {
    const m = uprightMatrix(d),
      up = new T.Vector3(0, 1, 0);
    for (const side of [-1, 1]) {
      const station = m
        .clone()
        .multiply(new T.Matrix4().makeTranslation(side * 90, 0, 0));
      placeAssembly('counterweightGuide', station);
      const block = kit.createAssembly('counterweight');
      block.name = 'Climb / travelling counterweight';
      block.quaternion.setFromRotationMatrix(station);
      const origin = new T.Vector3(0, 42, 0).applyMatrix4(station);
      block.position.copy(origin);
      group.add(block);
      const tethers = [-8, 8].map((x) => ({
        object: mesh(
          new T.CylinderGeometry(0.65, 0.65, 1, 8),
          kit.materials.steel,
          'Climb / tensioned lifting rope',
        ),
        top: new T.Vector3(x, 145, -12).applyMatrix4(station),
        bottom: new T.Vector3(x, 28, -12),
      }));
      moving.push({
        object: block,
        origin,
        up,
        travel: 32,
        phase: side,
        speed: 0.21,
        tethers,
      });
      for (const x of [-8, 8])
        putBox(
          kit.materials.dark,
          [1.3, 164, 1.3],
          [x, 63, 12],
          station,
          'Climb / return rope',
        );
      foundation(new T.Vector3(0, -35, 0).applyMatrix4(station), 65, 60);
      taskLamp(station, [0, 118, -24], '#ffe1b3', 0.35);
    }
    solidBody(
      kit.materials.dark,
      [206, 12, 34],
      [0, 169, 0],
      m,
      'Climb / winch crosshead',
    );
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
  buildColossusHalls({
    track,
    kit,
    stencils,
    uprightMatrix,
    bodyClear,
    putBox,
    foundation,
    cladding,
    warmCladding,
    coolCladding,
  });

  if (collisionOnly) {
    // No graphics resources survive this CPU collection pass.
    let disposed = false;
    return {
      group,
      dispose() {
        if (disposed) return;
        disposed = true;
        group.clear();
        stencils.dispose();
        kit.dispose();
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
      },
    };
  }

  // Merge adjacent loads into broad abutments; reject any merged footprint that
  // would intrude on another reach. The continuous bearing floors bridge the gaps.
  const groups = [];
  const safeFoot = (top, width, depth) =>
    !routeSurvey.some(
      (p) =>
        Math.abs(p.x - top.x) < width / 2 + 48 &&
        Math.abs(p.z - top.z) < depth / 2 + 48 &&
        p.y > groundY - 20 &&
        p.y < top.y + 20,
    );
  for (const request of foundationRequests) {
    let merged = false;
    for (const g of groups) {
      if (
        Math.abs(g.top.y - request.top.y) > 90 ||
        g.top.distanceTo(request.top) > 250
      )
        continue;
      const minX = Math.min(
          g.top.x - g.width / 2,
          request.top.x - request.width / 2,
        ),
        maxX = Math.max(
          g.top.x + g.width / 2,
          request.top.x + request.width / 2,
        );
      const minZ = Math.min(
          g.top.z - g.depth / 2,
          request.top.z - request.depth / 2,
        ),
        maxZ = Math.max(
          g.top.z + g.depth / 2,
          request.top.z + request.depth / 2,
        );
      const width = maxX - minX,
        depth = maxZ - minZ,
        top = new T.Vector3(
          (minX + maxX) / 2,
          Math.max(g.top.y, request.top.y),
          (minZ + maxZ) / 2,
        );
      if (width > 240 || depth > 240 || !safeFoot(top, width, depth)) continue;
      Object.assign(g, { top, width, depth });
      merged = true;
      break;
    }
    if (!merged) groups.push({ ...request });
  }
  for (const g of groups) makeFoundation(g.top, g.width, g.depth);
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
    batch.userData.geometryNames = [];
    for (const { geometry, matrices } of entries) {
      const id = batch.addGeometry(geometry);
      batch.userData.geometryNames[id] = geometry.name;
      for (const matrix of matrices)
        batch.setMatrixAt(batch.addInstance(id), matrix);
    }
    batch.castShadow = batch.receiveShadow = true;
    batch.computeBoundingSphere();
    group.add(batch);
    machineBatches.push(batch);
  }
  paint.dispose();
  let disposed = false;
  return {
    group,
    ready: quarry.ready,
    setReflection(texture) {
      conveyors.setReflection(texture);
      for (const m of [...materials, ...Object.values(kit.materials)])
        if (m.isMeshStandardMaterial) {
          m.envMap = texture;
          m.envMapIntensity =
            m === kit.materials.shell
              ? 1.1
              : m === kit.materials.cast
                ? 0.7
                : m === polished || m === kit.materials.machined
                  ? 0.95
                  : 0.65;
          m.needsUpdate = true;
        }
    },
    update({ time = 0, settings = {}, camera }) {
      if (camera?.position) {
        const nearest = workAnchors
          .map((anchor) => ({
            ...anchor,
            distance: anchor.position.distanceTo(camera.position),
          }))
          .sort((a, b) => a.distance - b.distance);
        workLights.forEach((light, i) => {
          const anchor = nearest[i];
          if (!anchor) {
            light.intensity = 0;
            return;
          }
          light.position.copy(anchor.position);
          light.target.position.copy(anchor.target);
          light.target.updateMatrixWorld();
          light.color.copy(anchor.color);
          light.intensity =
            2500 *
            anchor.strength *
            (1 - T.MathUtils.smoothstep(anchor.distance, 140, 320));
        });
      }
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
        for (const rope of item.tethers ?? []) {
          const bottom = rope.bottom
              .clone()
              .applyQuaternion(item.object.quaternion)
              .add(item.object.position),
            delta = rope.top.clone().sub(bottom);
          rope.object.position.copy(bottom).add(rope.top).multiplyScalar(0.5);
          rope.object.scale.y = delta.length();
          rope.object.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            delta.normalize(),
          );
        }
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
      conveyors.update({ time });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      machineBatches.forEach((b) => b.dispose());
      kit.dispose();
      conveyors.dispose();
      stencils.dispose();
      mountains.dispose();
      quarry.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
