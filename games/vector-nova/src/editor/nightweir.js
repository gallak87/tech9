import { createEditorOwner as owner, instanceFinish } from './world-owner.js';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { framePoint } from '../track/frames.js';
import { sweepGeometry, boxProfile, beamTransform } from '../track/geometry.js';
import { groundFrame, createRouteClearance } from '../environment/placement.js';
import { createAsphalt } from '../levels/halcyon/track/asphalt.js';
import { assetURL } from '../assets/url.js';
import {
  finishNightweirConcrete,
  finishNightweirMetal,
  finishNightweirBrick,
  finishNightweirRoof,
  finishNightweirRock,
} from '../levels/nightweir/environment/materials.js';
import { createEditorBackdrop } from './biome-backdrop.js';
import { attachRoadFinish } from './road-finishes.js';
import { createBiomeEnvironment } from './biome-environment.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../physics/collision-world.js';
import {
  validateDocument,
  analyzeDocument,
  documentIdentity,
  editorRandom,
} from './document.js';
import { createEditorTrack } from './track.js';
import { editorBiome } from './biomes.js';
import { worldPreset } from './world-presets.js';
import { createRegionPlan } from './region-plan.js';
import { buildRegionEnvironment } from './region-environment.js';
import { enrichNightweirPlan } from './nightweir-quarters.js';
import { createEditorFlightRuntime } from './jumps.js';
import { createEditorDevices, createEditorPickupHardware } from './pickups.js';

function prepareRegion(doc, track) {
  if (doc.environment.layoutVersion !== 1 || !track) return null;
  track.editorRegionPlan ??= createRegionPlan(doc, track);
  const profile = editorBiome(doc.biome);
  track.groundHeightAt =
    !profile.environment.waterEnabled && !profile.road.suspended
      ? (x, z) =>
          Math.max(
            track.editorRegionPlan.surfaceHeight(x, z),
            track.editorRegionPlan.seaLevel - 28,
          )
      : track.editorRegionPlan.surfaceHeight;
  return track.editorRegionPlan;
}

function createPreparedTrack(doc) {
  const track = createEditorTrack(doc);
  prepareRegion(doc, track);
  return track;
}

export function createEditorRoad(
  track,
  { renderer = null, collectSolid = null, preview = false } = {},
) {
  if (track.editorEnvironment) prepareRegion(track.editorEnvironment, track);
  const biome = editorBiome(track.editorBiome ?? 'nightweir');
  const style = biome.road ?? {
    kind: 'asphalt',
    deck: '#4d5a60',
    structure: '#8f9997',
    metal: '#735142',
    paint: '#d5d8c4',
    edge: '#293b42',
    glow: '#f6ae63',
    roughness: 0.72,
    metalness: 0.02,
  };
  const asphaltKind = style.kind === 'asphalt';
  const suspended = Boolean(style.suspended);
  const part = owner(`Editor / ${biome.label} ${style.kind} road kit`, preview);
  part.group.userData.biome = biome.id;
  part.group.userData.roadKind = style.kind;
  const asphalt =
    asphaltKind && renderer && !collectSolid
      ? createAsphalt(renderer, track.width, {
          label: `${biome.label} editor`,
          moisture: biome.id === 'shatterline' ? 0.02 : 0.28,
        })
      : null;
  if (asphalt) part.borrowed.push(asphalt);
  const deck =
    asphalt?.material ??
    part.material('Editor / damp asphalt', {
      color: style.deck,
      roughness: style.roughness,
      metalness: style.metalness,
      ...(style.kind === 'crystal'
        ? { transparent: true, opacity: 0.72, depthWrite: false }
        : {}),
    });
  const finish = !asphaltKind
    ? attachRoadFinish(deck, {
        id: biome.id,
        renderer: collectSolid ? null : renderer,
        width: track.width,
        uvLength: 16,
      })
    : null;
  if (finish) part.borrowed.push(finish);
  const concrete = part.material(
    'Editor / rain-dark precast',
    { color: style.structure, roughness: style.kind === 'alloy' ? 0.45 : 0.86 },
    asphaltKind || style.kind === 'masonry' || style.kind === 'promenade'
      ? finishNightweirConcrete
      : undefined,
  );
  const steel = part.material(
    'Editor / oxide municipal steel',
    { color: style.metal, roughness: 0.6, metalness: 0.45 },
    finishNightweirMetal,
  );
  const paint = part.material('Editor / ivory road markings', {
    color: style.paint,
    roughness: 0.8,
  });
  const iron = part.material(
    'Editor / cast-iron gutters',
    { color: style.edge, roughness: 0.53, metalness: 0.45 },
    finishNightweirMetal,
  );
  const glow = part.material('Editor / shielded amber lanterns', {
    color: style.glow,
    emissive: style.glow,
    emissiveIntensity: 0.7,
    roughness: 0.4,
  });
  const roadRuns = (
    track.boundaryIntervals ?? [{ start: 0, end: track.length }]
  ).map((run, i) => ({
    ...run,
    start: i === 0 && track.closed === false ? -70 : run.start,
  }));
  const sweepRoad = (route, profile, options = {}) => {
    const geometries = roadRuns
      .map((run) => ({
        start: Math.max(run.start, options.start ?? run.start),
        end: Math.min(run.end, options.end ?? run.end),
      }))
      .filter((run) => run.end > run.start)
      .flatMap((run) => {
        const count = Math.ceil((run.end - run.start) / (options.step ?? 6));
        const step = (run.end - run.start) / count;
        const perPiece = Math.max(1, Math.floor(1200 / (options.step ?? 6)));
        const result = [];
        // Keep every original longitudinal sample; chunks only bound allocation.
        for (let first = 0; first < count; first += perPiece)
          result.push(
            sweepGeometry(route, profile, {
              ...options,
              step: step * (1 + 1e-9),
              start: run.start + step * first,
              end: run.start + step * Math.min(count, first + perPiece),
            }),
          );
        return result;
      });
    if (!geometries.length)
      throw new Error('Road detail has no supported interval');
    if (geometries.length === 1) return geometries[0];
    const result = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    result.userData.roadRuns = roadRuns;
    return result;
  };
  const half = track.width / 2,
    range = {
      step: preview
        ? Math.min(
            12,
            (track.hasAuthoredRoll ? 3 : 5) *
              Math.sqrt(Math.max(1, track.length / 6000)),
          )
        : track.hasAuthoredRoll
          ? 1.5
          : 3,
      uvScale: 16,
      transverseStep: preview
        ? track.hasAuthoredRoll
          ? 3
          : 6
        : track.hasAuthoredRoll
          ? 1
          : 2,
    };
  part.solid(
    'Continuous asphalt driving deck',
    sweepRoad(
      track,
      [
        [-half, 0],
        [half, 0],
      ],
      range,
    ),
    deck,
    { kind: 'deck', start: 0, end: track.length },
    collectSolid,
  );
  const soffit =
    style.kind === 'alloy' ||
    style.kind === 'membrane' ||
    style.kind === 'weave'
      ? [
          [half, 0],
          [half + 1, -0.8],
          [half - 3, -1.8],
          [-half + 3, -1.8],
          [-half - 1, -0.8],
          [-half, 0],
        ]
      : style.kind === 'steel'
        ? [
            [half, 0],
            [half + 4, -2],
            [half + 4, -12],
            [half - 7, -17],
            [-half + 7, -17],
            [-half - 4, -12],
            [-half - 4, -2],
            [-half, 0],
          ]
        : style.kind === 'resin' || style.kind === 'crystal'
          ? [
              [half, 0],
              [half + 3, -3],
              [half - 5, -9],
              [0, -12],
              [-half + 5, -9],
              [-half - 3, -3],
              [-half, 0],
            ]
          : style.kind === 'promenade' || style.kind === 'masonry'
            ? [
                [half, 0],
                [half + 3, -1],
                [half + 3, -4],
                [half, -4],
                [half - 4, -9],
                [-half + 4, -9],
                [-half, -4],
                [-half - 3, -4],
                [-half - 3, -1],
                [-half, 0],
              ]
            : [
                [half, 0],
                [half + 0.5, -1.6],
                [half - 2, -5],
                [-half + 2, -5],
                [-half - 0.5, -1.6],
                [-half, 0],
              ];
  part.solid(
    'Formed bridge soffit',
    sweepRoad(track, soffit, range),
    steel,
    { kind: 'structure' },
    collectSolid,
  );
  for (const side of [-1, 1]) {
    part.solid(
      'Precast road boundary',
      sweepRoad(track, boxProfile(side * (half + 0.6), 0.5, 1.2, 1.8), range),
      concrete,
      { kind: 'rail', roadBoundary: true, start: 0, end: track.length },
      collectSolid,
    );
    part.solid(
      'Ivory shoulder stripe',
      sweepRoad(
        track,
        [
          [side * (half - 1.8), 0.025],
          [side * (half - 1.45), 0.025],
        ],
        range,
      ),
      paint,
    );
    part.solid(
      asphaltKind
        ? 'Open cast drainage channel'
        : `${style.kind} formed edge carrier`,
      sweepRoad(
        track,
        asphaltKind
          ? [
              [side * (half + 1.2), -0.4],
              [side * (half + 1.4), -1.5],
              [side * (half + 3.3), -1.5],
              [side * (half + 3.7), -0.4],
            ]
          : style.kind === 'pearl' || style.kind === 'resin'
            ? [
                [side * (half + 1.2), -1],
                [side * (half + 4), -3],
                [side * (half + 10), -1],
                [side * (half + 7), 2.5],
              ]
            : style.kind === 'ceramic' ||
                style.kind === 'alloy' ||
                style.kind === 'membrane'
              ? [
                  [side * (half + 1.2), -0.5],
                  [side * (half + 2), -3],
                  [side * (half + 7), -4],
                  [side * (half + 8), -1],
                ]
              : [
                  [side * (half + 1.2), -0.5],
                  [side * (half + 4), -4],
                  [side * (half + 5), -2],
                  [side * (half + 4), 0],
                ],
        range,
      ),
      iron,
      { kind: 'structure' },
      collectSolid,
    );
  }
  const samples = Array.from(
    { length: Math.ceil(track.length / 12) },
    (_, i) => ({ distance: i * 12, frame: track.sample(i * 12) }),
  ).filter(({ distance }) => !track.isGap?.(distance));
  // Test structural beams against the actual rotated road/camera corridor.
  // This catches inverted piers crossing through their own running surface.
  const clearsBeam = (from, to, radius = 1) =>
    samples.every(({ frame }) => {
      const local = (point) => {
        const d = point.clone().sub(frame.position);
        return [d.dot(frame.right), d.dot(frame.up), d.dot(frame.tangent)];
      };
      const a = local(from),
        b = local(to),
        limits = [
          [-half - 7 - radius, half + 7 + radius],
          [-1 - radius, 16 + radius],
          [-8 - radius, 8 + radius],
        ];
      let enter = 0,
        leave = 1;
      for (let axis = 0; axis < 3; axis++) {
        const delta = b[axis] - a[axis],
          [min, max] = limits[axis];
        if (Math.abs(delta) < 1e-8) {
          if (a[axis] < min || a[axis] > max) return true;
        } else {
          const u = (min - a[axis]) / delta,
            v = (max - a[axis]) / delta;
          enter = Math.max(enter, Math.min(u, v));
          leave = Math.min(leave, Math.max(u, v));
          if (enter > leave) return true;
        }
      }
      return false;
    });
  const beam = (name, material, from, to, thickness, depth = thickness) => {
    const transform = beamTransform(from, to, thickness, depth);
    part.block(
      name,
      material,
      transform.position,
      transform.scale,
      transform.quaternion,
      collectSolid,
    );
  };
  const footprints = [];
  for (let s = 36; s < track.length; s += 90) {
    if (track.isJumpProtected?.(s)) continue;
    const frame = track.sample(s);
    for (const side of suspended ? [] : [-1, 1]) {
      const top = framePoint(frame, side * 9, -5),
        base = track.groundHeightAt?.(top.x, top.z) ?? track.groundY;
      const obstructed = samples.some(({ distance, frame: other }) => {
        const delta = Math.abs(distance - s),
          separation = Math.min(delta, track.length - delta);
        return (
          separation > 70 &&
          Math.hypot(other.position.x - top.x, other.position.z - top.z) <
            half + 7 &&
          other.position.y > base - 5 &&
          other.position.y < top.y + 12
        );
      });
      if (
        frame.up.y < 0.7 ||
        obstructed ||
        top.y - base < 8 ||
        !clearsBeam(new T.Vector3(top.x, base, top.z), top, 3)
      )
        continue;
      const position = new T.Vector3(top.x, (top.y + base) / 2, top.z);
      part.block(
        'Automatic concrete pier',
        concrete,
        position,
        new T.Vector3(4.2, top.y - base, 5),
        new T.Quaternion(),
        collectSolid,
        true,
      );
      part.block(
        'Pier spread footing',
        concrete,
        new T.Vector3(top.x, base + 1.5, top.z),
        new T.Vector3(9, 3, 10),
        new T.Quaternion(),
        collectSolid,
        true,
      );
      footprints.push({
        x: top.x,
        z: top.z,
        minY: base,
        maxY: top.y,
        halfX: 4.5,
        halfZ: 5,
      });
    }
    if (!suspended && frame.up.y < 0.7) {
      const upright = groundFrame(track, s),
        span = half + 42,
        crownY = frame.position.y + half + 38;
      const heads = [-1, 1].map((side) =>
        upright.position
          .clone()
          .addScaledVector(upright.right, side * span)
          .setY(crownY),
      );
      const feet = heads.map(
        (head) =>
          new T.Vector3(
            head.x,
            track.groundHeightAt?.(head.x, head.z) ?? track.groundY,
            head.z,
          ),
      );
      const anchors = [-1, 1].map((side) =>
        framePoint(frame, side * (half + 9), -6),
      );
      const stays = anchors.map(
        (anchor) =>
          heads
            .filter((head) => clearsBeam(anchor, head, 0.5))
            .sort(
              (a, b) =>
                a.distanceToSquared(anchor) - b.distanceToSquared(anchor),
            )[0],
      );
      if (
        stays.every(Boolean) &&
        heads.every((head, i) => clearsBeam(feet[i], head, 3)) &&
        clearsBeam(heads[0], heads[1], 2)
      ) {
        for (let i = 0; i < 2; i++) {
          beam('Automatic portal leg', concrete, feet[i], heads[i], 4, 5);
          footprints.push({
            x: feet[i].x,
            z: feet[i].z,
            minY: feet[i].y,
            maxY: crownY,
            halfX: 3,
            halfZ: 3,
          });
          beam('Underside suspension stay', steel, anchors[i], stays[i], 0.65);
        }
        beam('Automatic portal crown', steel, heads[0], heads[1], 3, 4);
        beam(
          'Rotated underside crosshead',
          steel,
          anchors[0],
          anchors[1],
          3,
          4,
        );
      }
    }
    if (!asphaltKind) {
      const keelDepth =
        style.kind === 'steel'
          ? 20
          : style.kind === 'resin' || style.kind === 'crystal'
            ? 14
            : 7;
      for (const side of [-1, 1]) {
        const a = framePoint(frame, side * (half + 4), -4);
        const b = framePoint(frame, side * (half - 5), -keelDepth);
        if (clearsBeam(a, b, 1.5))
          beam(
            `${style.kind} outboard keel rib`,
            style.kind === 'resin' ? concrete : steel,
            a,
            b,
            style.kind === 'steel' ? 3 : 1.2,
            2,
          );
      }
      if (
        style.kind === 'ceramic' ||
        style.kind === 'alloy' ||
        style.kind === 'promenade'
      ) {
        part.block(
          `${style.kind} fitted transverse panel joint`,
          iron,
          framePoint(frame, 0, 0.035),
          new T.Vector3(track.width - 4, 0.04, 0.15),
          frame.quaternion,
        );
      }
    }
    for (const side of [-1, 1]) {
      const q = frame.quaternion;
      part.block(
        'Shielded road lantern post',
        iron,
        framePoint(frame, side * (half + 2.6), 4),
        new T.Vector3(0.45, 8, 0.55),
        q,
        collectSolid,
      );
      part.block(
        'Shielded road lantern hood',
        iron,
        framePoint(frame, side * (half + 2.6), 8.1),
        new T.Vector3(2.3, 0.5, 1.7),
        q,
        collectSolid,
        true,
      );
      part.block(
        'Shielded road lantern glass',
        glow,
        framePoint(frame, side * (half + 2.6), 7.8),
        new T.Vector3(1.9, 0.14, 1.3),
        q,
      );
    }
  }
  // Visible start line and its physical surface use the same route frame.
  part.solid(
    'Starting quay line',
    sweepRoad(
      track,
      [
        [-half + 2, 0.04],
        [half - 2, 0.04],
      ],
      { start: 1, end: 3, step: 1 },
    ),
    paint,
  );
  track.supportFootprints = footprints;
  part.finish();
  part.ready = Promise.all([asphalt?.ready, finish?.ready]);
  const reflect = part.setReflection;
  part.setReflection = (texture) => {
    reflect(texture);
    if (asphalt) {
      asphalt.material.envMap = texture;
      asphalt.material.envMapIntensity = 0.75;
      asphalt.material.needsUpdate = true;
    }
  };
  return part;
}

function propDimensions(type, scale) {
  const sizes = {
    building: [34, 72, 38],
    warehouse: [68, 28, 50],
    pump: [34, 34, 30],
    trees: [28, 38, 28],
  };
  return sizes[type].map((n) => n * scale);
}

export function createEditorEnvironment(
  doc,
  track,
  { collectSolid = null, renderer = null, preview = false } = {},
) {
  if (doc.biome !== 'nightweir')
    return createBiomeEnvironment(doc, track, {
      renderer,
      collectSolid,
      preview,
      plan: prepareRegion(doc, track),
    });
  const preset = worldPreset(doc.settings.sceneryPreset);
  const styles = {
    waterfront: {
      spacing: 88,
      setback: 100,
      salt: 0xbac125,
      roles: ['building', 'building', 'warehouse', 'building', 'pump', 'trees'],
      brick: '#80604d',
      plaster: '#c2b59e',
      roof: '#4b6168',
      water: '#31515f',
      foliage: '#354f41',
    },
    industrial: {
      spacing: 110,
      setback: 116,
      salt: 0x1d057,
      roles: [
        'warehouse',
        'pump',
        'warehouse',
        'warehouse',
        'pump',
        'building',
      ],
      brick: '#61524b',
      plaster: '#9b9f95',
      roof: '#52636a',
      water: '#243e48',
      foliage: '#34453b',
    },
    reclaimed: {
      spacing: 90,
      setback: 103,
      salt: 0x6aee91,
      roles: ['trees', 'trees', 'building', 'trees', 'trees', 'pump'],
      brick: '#70624d',
      plaster: '#a3aa8e',
      roof: '#405a4f',
      water: '#304e45',
      foliage: '#496547',
    },
  };
  const style = styles[preset.id];
  const blank = !track;
  const region =
    doc.environment.layoutVersion === 1
      ? (prepareRegion(doc, track) ?? createRegionPlan(doc, null))
      : null;
  if (!track) {
    const radius = 620,
      length = Math.PI * 2 * radius;
    track = {
      length,
      width: 40,
      closed: true,
      sample(distance) {
        const a = distance / radius;
        const position = new T.Vector3(
          Math.sin(a) * radius,
          52,
          Math.cos(a) * radius,
        );
        const tangent = new T.Vector3(Math.cos(a), 0, -Math.sin(a));
        return {
          position,
          tangent,
          up: new T.Vector3(0, 1, 0),
          right: new T.Vector3(-Math.sin(a), 0, -Math.cos(a)),
        };
      },
    };
  }
  const part = owner('Editor / ' + preset.label, preview);
  part.group.userData.sceneryPreset = preset.id;
  part.group.userData.emptyRoad = blank;
  part.group.userData.assemblyCounts = {
    building: 0,
    warehouse: 0,
    pump: 0,
    trees: 0,
  };
  const concrete = part.material(
    'Editor / retained basin concrete',
    { color: '#89948c', roughness: 0.87 },
    finishNightweirConcrete,
  );
  const paving = part.material('Editor / continuous quay paving', {
    color: '#566264',
    roughness: 0.94,
  });
  const brick = part.material('Editor / fired brick districts', {
    color: '#70574d',
    roughness: 0.91,
  });
  const plaster = part.material(
    'Editor / limestone plaster',
    { color: style.plaster, roughness: 0.85 },
    finishNightweirConcrete,
  );
  const roof = part.material(
    'Editor / dark folded zinc roofs',
    { color: style.roof, roughness: 0.55, metalness: 0.45 },
    finishNightweirMetal,
  );
  const windows = part.material('Editor / recessed cool glazing', {
    color: '#274552',
    roughness: 0.32,
    metalness: 0.2,
  });
  const occupied = part.material('Editor / warm occupied rooms', {
    color: '#f4b66c',
    emissive: '#d89346',
    emissiveIntensity: 0.6,
    roughness: 0.5,
  });
  const foliage = part.material('Editor / sheltered basin trees', {
    color: style.foliage,
    roughness: 0.94,
  });
  const wood = part.material('Editor / wet tree bark', {
    color: '#574d3d',
    roughness: 0.94,
  });
  const water = part.material('Editor / sheltered harbor water', {
    color: style.water,
    roughness: 0.28,
    metalness: 0.24,
  });
  const textures = part.textures;
  let terrainReady = Promise.resolve();
  const surfaceReady =
    renderer && !collectSolid
      ? Promise.allSettled(
          [
            ['fired-brick-v1.png', brick, finishNightweirBrick, 1 / 1.25],
            ['zinc-roof-v1.png', roof, finishNightweirRoof, 1 / 8],
          ].map(async ([file, material, finish, repeat]) => {
            const texture = await new T.TextureLoader().loadAsync(
              assetURL('assets/levels/nightweir/' + file),
            );
            if (part.isDisposed()) {
              texture.dispose();
              return;
            }
            textures.add(texture);
            texture.wrapS = texture.wrapT = T.RepeatWrapping;
            texture.colorSpace = T.SRGBColorSpace;
            texture.repeat.setScalar(repeat);
            texture.anisotropy = Math.min(
              8,
              renderer.capabilities.getMaxAnisotropy(),
            );
            finish(material, texture);
            instanceFinish(material, repeat);
          }),
        ).then((results) => {
          const failure = results.find((r) => r.status === 'rejected');
          if (failure) throw failure.reason;
        })
      : Promise.resolve();
  const bounds =
    track?.bounds?.clone() ??
    new T.Box3(new T.Vector3(-800, -60, -800), new T.Vector3(800, 100, 800));
  const center = bounds.getCenter(new T.Vector3()),
    size = bounds.getSize(new T.Vector3());
  const basin = new T.PlaneGeometry(
    Math.max(200000, size.x * 8 + 800),
    Math.max(200000, size.z * 8 + 800),
  );
  basin.rotateX(-Math.PI / 2);
  basin.translate(center.x, doc.settings.waterLevel, center.z);
  const horizonWater = part.solid('Retained harbor basin', basin, water);
  horizonWater.castShadow = false;
  const { clears } = createRouteClearance(track, {
    spacing: 8,
    sidePadding: 18,
    localVertical: [-9, 25],
  });
  const random = editorRandom(
    (doc.environment?.seed ?? doc.generator.seed) ^ style.salt,
  );
  const plots = [];
  const canopyGeometry = new T.IcosahedronGeometry(1, 1);
  part.geometries.add(canopyGeometry);
  const drawProp = (prop, automatic = false) => {
    const f = prop.absolute
      ? null
      : groundFrame(track, prop.distance * track.length);
    const position = prop.absolute
      ? new T.Vector3(prop.x, prop.y, prop.z)
      : f.position.clone().addScaledVector(f.right, prop.lateral);
    const [width, height, depth] = propDimensions(prop.type, prop.scale),
      bottom = prop.absolute ? prop.y : doc.settings.waterLevel + 5;
    const yaw = prop.absolute
      ? prop.yaw
      : Math.atan2(f.tangent.x, f.tangent.z) + prop.rotation;
    if (
      automatic &&
      !clears(
        position.x,
        position.z,
        width + 8,
        depth + 8,
        bottom + height + 8,
        yaw,
        bottom - 8,
      )
    )
      return;
    if (
      automatic &&
      plots.some(
        (p) =>
          Math.hypot(p.x - position.x, p.z - position.z) <
          Math.max(width, depth) * 0.75 + p.radius,
      )
    )
      return;
    part.group.userData.assemblyCounts[prop.type]++;
    plots.push({
      x: position.x,
      z: position.z,
      radius: Math.max(width, depth) * 0.55,
      width,
      depth,
      distance: prop.distance,
      side: Math.sign(prop.lateral),
    });
    const quaternion = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      yaw,
    );
    const local = (x, y, z) =>
      new T.Vector3(x, y, z)
        .applyQuaternion(quaternion)
        .add(new T.Vector3(position.x, bottom, position.z));
    const block = (name, mat, x, y, z, w, h, d, collision = false) =>
      part.block(
        name,
        mat,
        local(x, y, z),
        new T.Vector3(w, h, d),
        quaternion,
        collision ? collectSolid : null,
        true,
      );
    block(
      'Rooted retained quay',
      concrete,
      0,
      -5,
      0,
      width + 14,
      10,
      depth + 14,
      true,
    );
    if (prop.type === 'trees') {
      for (const [x, z, k] of [
        [-width * 0.25, 0, 0.86],
        [width * 0.25, -depth * 0.2, 1],
        [0, depth * 0.25, 0.78],
      ]) {
        block(
          'Sheltered tree trunk',
          wood,
          x,
          height * 0.25 * k,
          z,
          1.6 * prop.scale,
          height * 0.5 * k,
          1.6 * prop.scale,
          true,
        );
        for (const [dx, dy, dz, size] of [
          [0, 0, 0, 1],
          [-0.2, 0.13, 0.15, 0.7],
          [0.19, 0.02, -0.16, 0.78],
        ]) {
          const crown = local(
            x + dx * width,
            height * (0.64 + dy) * k,
            z + dz * depth,
          );
          part.instance(
            'Unequal branching park canopy',
            canopyGeometry,
            foliage,
            crown,
            new T.Vector3(
              width * 0.28 * size * k,
              height * 0.31 * size * k,
              depth * 0.3 * size * k,
            ),
            quaternion,
          );
        }
        for (const direction of [-1, 1]) {
          const from = local(x, height * 0.3 * k, z),
            to = local(
              x + direction * width * 0.18,
              height * 0.65 * k,
              z + direction * depth * 0.13,
            );
          const branch = beamTransform(
            from,
            to,
            1.2 * prop.scale,
            1.1 * prop.scale,
          );
          part.block(
            'Forked park branch',
            wood,
            branch.position,
            branch.scale,
            branch.quaternion,
          );
        }
      }
      return;
    }
    block(
      'Connected district frontage',
      prop.type === 'building'
        ? automatic && random() > 0.5
          ? brick
          : plaster
        : concrete,
      0,
      height / 2,
      0,
      width,
      height,
      depth,
      true,
    );
    block(
      'Setback roof carrier',
      roof,
      0,
      height + 0.8,
      0,
      width + 2,
      1.6,
      depth + 2,
      true,
    );
    block(
      'Raised roof plant',
      roof,
      width * 0.2,
      height + 3,
      0,
      width * 0.3,
      4.5,
      depth * 0.45,
      true,
    );
    for (const side of [-1, 1]) {
      for (
        let y =
          prop.lod === 'far'
            ? height
            : prop.type === 'warehouse'
              ? height * 0.6
              : 5;
        y < height - 3;
        y += (prop.lod === 'mid' ? 14 : 7) * prop.scale
      ) {
        for (let x = -width / 2 + 4; x < width / 2 - 2; x += 6 * prop.scale) {
          block(
            'Recessed occupied room',
            random() > 0.55 ? occupied : windows,
            x,
            y,
            side * (depth / 2 + 0.15),
            2.7 * prop.scale,
            3.8 * prop.scale,
            0.3,
          );
        }
      }
      block(
        'Rooted entry gallery',
        roof,
        0,
        4 * prop.scale,
        side * (depth / 2 + 2),
        width * 0.85,
        0.65,
        5 * prop.scale,
        true,
      );
    }
    if (prop.type === 'pump') {
      for (const x of [-width * 0.25, width * 0.25]) {
        block(
          'Connected pressure riser',
          roof,
          x,
          height * 0.45,
          -depth * 0.6,
          5 * prop.scale,
          height * 0.9,
          5 * prop.scale,
          true,
        );
        block(
          'Pressure riser head',
          concrete,
          x,
          height * 0.9,
          -depth * 0.6,
          8 * prop.scale,
          4 * prop.scale,
          8 * prop.scale,
          true,
        );
      }
    }
  };
  if (region) {
    const soil = part.material('Editor / surveyed gorge rock', {
      color: '#59645b',
      roughness: 0.96,
    });
    if (renderer && !collectSolid) {
      terrainReady = Promise.all(
        [
          'assets/levels/shatterline/limestone-v1.png',
          'assets/levels/nightweir/gorge-strata-v1.png',
          'assets/levels/nightweir/damp-scree-v1.png',
        ].map(async (path) => {
          const texture = await new T.TextureLoader().loadAsync(assetURL(path));
          if (part.isDisposed()) {
            texture.dispose();
            return null;
          }
          textures.add(texture);
          texture.wrapS = texture.wrapT = T.RepeatWrapping;
          texture.colorSpace = T.SRGBColorSpace;
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          return texture;
        }),
      ).then((maps) => {
        if (!part.isDisposed()) {
          finishNightweirRock(soil, ...maps);
          soil.needsUpdate = true;
        }
      });
    }
    const regional = buildRegionEnvironment(
      enrichNightweirPlan(doc, blank ? null : track, region),
      {
        owner: part,
        districtCourts: true,
        materials: {
          soil,
          park: part.material('Editor / connected reclaimed parkland', {
            color: '#526347',
            roughness: 0.97,
          }),
          concrete,
          paving,
          brick,
          plaster,
          roof,
          windows,
          occupied,
          foliage,
          wood,
          water,
        },
        collectSolid,
        clears,
        placeAssembly: (placement) =>
          drawProp({ ...placement, absolute: true }, true),
      },
    );
    part.group.userData.region = regional.stats;
    part.group.userData.regionBounds = region.bounds;
  } else {
    // Curated large assemblies fill only clear parcels; the seed never changes
    // road geometry and scenery density remains bounded independently of length.
    for (let s = 45, slot = 0; s < track.length; s += style.spacing, slot++) {
      if (track.isJumpProtected?.(s)) continue;
      for (const side of [-1, 1]) {
        if (random() > doc.settings.density) continue;
        const district = Math.floor(s / 620);
        const role =
          (slot + district + (side > 0 ? 2 : 0)) % style.roles.length;
        const type = style.roles[role];
        drawProp(
          {
            type,
            distance: s / track.length,
            lateral:
              side * (track.width / 2 + style.setback + (random() - 0.5) * 16),
            scale: (preset.id === 'industrial' ? 0.9 : 0.82) + random() * 0.32,
            rotation: 0,
          },
          true,
        );
      }
    }
    for (const prop of doc.props) drawProp(prop);
    // Adjacent occupied parcels share broad retaining terraces and civic walks.
    // Keep the viaduct channel and its piers clear instead of connecting across it.
    for (const side of [-1, 1]) {
      const row = plots
        .filter((p) => p.side === side)
        .sort((a, b) => a.distance - b.distance);
      for (let i = 0; i < row.length; i++) {
        const a = row[i],
          b = row[(i + 1) % row.length];
        const routeSpan = ((b.distance - a.distance + 1) % 1) * track.length;
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        if (row.length < 2 || routeSpan > 260 || span < 1 || span > 250)
          continue;
        const width = Math.max(64, a.width + 20, b.width + 20),
          depth = span + Math.min(a.radius, b.radius) * 1.3;
        const x = (a.x + b.x) / 2,
          z = (a.z + b.z) / 2,
          top = doc.settings.waterLevel + 5;
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        if (!clears(x, z, width, depth, top + 1, yaw, top - 20)) continue;
        const quaternion = new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 1, 0),
          yaw,
        );
        part.block(
          'Connected retaining terrace',
          concrete,
          new T.Vector3(x, top - 9, z),
          new T.Vector3(width, 18, depth),
          quaternion,
          collectSolid,
          true,
        );
        part.block(
          'Continuous civic quay walk',
          paving,
          new T.Vector3(x, top + 0.12, z),
          new T.Vector3(width - 6, 0.24, depth - 4),
          quaternion,
          collectSolid,
          true,
        );
      }
    }
  }
  part.finish();
  part.ready = Promise.all([surfaceReady, terrainReady]);
  return part;
}

export function createEditorWorld(
  value,
  { renderer = null, preview = false } = {},
) {
  const doc = validateDocument(value),
    group = new T.Group();
  group.name = `${editorBiome(doc.biome).label} track editor preview`;
  const track = doc.points.length >= 4 ? createPreparedTrack(doc) : null;
  const road = track ? createEditorRoad(track, { renderer, preview }) : null;
  const environment = createEditorEnvironment(doc, track, {
    renderer,
    preview,
  });
  const pickups = road ? createEditorPickupHardware(track, doc, road) : null;
  if (pickups) group.add(pickups.group);
  if (road) group.add(road.group);
  group.add(environment.group);
  group.userData.editorBiome = doc.biome;
  group.userData.environment =
    environment.group.userData.region ??
    environment.group.userData.assemblyCounts ??
    null;
  let disposed = false;
  return {
    group,
    track,
    get ownedTextures() {
      return new Set([
        ...(road?.ownedTextures ?? []),
        ...environment.ownedTextures,
      ]);
    },
    bounds:
      track?.bounds ??
      new T.Box3(new T.Vector3(-800, -60, -800), new T.Vector3(800, 100, 800)),
    ready: Promise.all([road?.ready, environment.ready]),
    setReflection(texture) {
      road?.setReflection(texture);
      environment.setReflection(texture);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pickups?.dispose();
      road?.dispose();
      environment.dispose();
      group.clear();
    },
  };
}

export function createEditorCollisionWorld(doc, track) {
  prepareRegion(doc, track);
  const triangles = [];
  const collectSolid = ({ name, geometry, matrix, ...info }) => {
    const attribute = geometry.getAttribute('position');
    const index =
      geometry.index?.array ??
      Array.from({ length: attribute.count }, (_, i) => i);
    // A rotated deck can contain more triangles than Chromium's function
    // argument limit. Append in order without expanding geometry into arguments.
    for (const triangle of indexedTriangles(
      attribute.array,
      index,
      {
        id: 'editor-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        ...info,
      },
      matrix,
      geometry.getAttribute('roadCoord'),
    ))
      triangles.push(triangle);
  };
  const road = createEditorRoad(track, { collectSolid });
  const environment = createEditorEnvironment(doc, track, { collectSolid });
  road.dispose();
  environment.dispose();
  return createCollisionWorld({
    id: track.id + '-solids',
    version: 3,
    geometryId: track.geometryVersion,
    triangles,
  });
}

export function createEditorLevel(value) {
  const doc = validateDocument(value),
    analysis = analyzeDocument(doc);
  if (!analysis.valid) throw new Error(analysis.errors.join(' '));
  return {
    version: `editor-${doc.biome}-regional-v1`,
    renderer: {
      ...editorBiome(doc.biome).renderer,
      world: `${doc.biome}-editor`,
      bloomStrength: 0.07,
      bloomThreshold: 1.15,
      fillHeight: 70,
      reflectionFar: editorBiome(doc.biome).road.suspended ? 200000 : 12000,
      ambientOcclusion: { enabled: false },
    },
    camera: {
      chaseHeight: 7.5,
      chaseDistance: 17,
      lookAhead: 60,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.6, top: 0.8 },
    },
    createTrack: () => createPreparedTrack(doc),
    createRoad: ({ track, view }) =>
      createEditorRoad(track, { renderer: view?.renderer }),
    createEnvironment: ({ track, view }) =>
      createEditorEnvironment(doc, track, { renderer: view?.renderer }),
    createBackdrop: ({ track } = {}) => createEditorBackdrop(doc, { track }),
    createCollisionWorld: ({ track }) => createEditorCollisionWorld(doc, track),
    createRuntime: createEditorFlightRuntime,
    racing: {
      createDevices: (track) => createEditorDevices(track, doc),
      createMotion: createEditorFlightRuntime,
    },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    editorDocumentId: doc.id,
    editorIdentity: documentIdentity(doc),
  };
}
