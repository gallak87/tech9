import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  generateDocument,
  createDocument,
  validateDocument,
  documentIdentity,
  analyzeDocument,
  applySectionShape,
} from './document.js';
import { createEditorTrack } from './track.js';
import { createEditorRoad, createEditorLevel } from './nightweir.js';
import {
  generatePickupLayout,
  createEditorDevices,
  createEditorPickupHardware,
} from './pickups.js';
import { createSurfaceProjector } from '../pickups/surface-projector.js';
import { collectRoadSurfaces } from '../pickups/device-mount.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createTrackLibrary } from './library.js';

const fill = (doc, options) => ({
  ...doc,
  pickups: generatePickupLayout(doc, options),
});

test('fill works with a clearance warning on another section of a playable course', () => {
  const doc = generateDocument({ seedJumps: false, seed: 42, length: 4800 });
  doc.props.push({
    id: 'roadside-building',
    type: 'building',
    distance: 0.8,
    lateral: 0,
    scale: 1,
    rotation: 0,
  });
  assert.equal(analyzeDocument(doc).primaryIssue.kind, 'clearance');
  const filled = fill(doc, { density: 0.5 });
  assert(filled.pickups.devices.length > 1);
  assert.deepEqual(filled.points, doc.points);
  assert.deepEqual(filled.props, doc.props);
});

test('fill is deterministic, keeps the start readable and places all real device types inside spaced road footprints', () => {
  const doc = generateDocument({ seedJumps: false, seed: 42, length: 4800 });
  const original = JSON.stringify(doc);
  for (const preset of ['balanced', 'boost-heavy']) {
    const result = generatePickupLayout(doc, { preset, density: 0.5 });
    assert.deepEqual(
      generatePickupLayout(doc, { preset, density: 0.5 }),
      result,
    );
    const devices = createEditorDevices(createEditorTrack(doc), {
      ...doc,
      pickups: result,
    });
    assert.equal(devices.length, result.devices.length);
    assert.deepEqual(
      new Set(devices.map((d) => d.type)),
      new Set(['vector', 'aegis', 'repulsor', 'arc', 'ion']),
    );
    assert.equal(devices[0].type, 'vector');
    assert.equal(devices[0].distance, 130);
    assert.equal(devices[0].lateral, 0);
    assert.ok(devices[0].width >= doc.width * 0.65);
    assert.equal(new Set(devices.map((d) => d.id)).size, devices.length);
    const track = createEditorTrack(doc);
    for (let i = 0; i < devices.length; i++) {
      const d = devices[i];
      assert.ok(d.distance - d.length / 2 >= 75);
      assert.ok(d.distance + d.length / 2 <= track.length - 100);
      assert.ok(
        Math.abs(d.lateral) + d.width / 2 <= track.width / 2 - 3 + 1e-9,
      );
      if (i) {
        const previous = devices[i - 1];
        assert.ok(
          d.distance - d.length / 2 - previous.distance - previous.length / 2 >=
            80,
        );
      }
    }
  }
  const sparse = generatePickupLayout(doc, { density: 0.2 });
  const dense = generatePickupLayout(doc, { density: 0.85 });
  assert.ok(dense.devices.length > sparse.devices.length);
  const balanced = generatePickupLayout(doc, {
    preset: 'balanced',
    density: 0.85,
  });
  const boosts = generatePickupLayout(doc, {
    preset: 'boost-heavy',
    density: 0.85,
  });
  assert.ok(
    boosts.devices.filter((d) => d.type === 'vector').length >
      balanced.devices.filter((d) => d.type === 'vector').length,
  );
  assert.deepEqual(generatePickupLayout(doc, { density: 0 }).devices, []);
  assert.equal(
    JSON.stringify(doc),
    original,
    'filling does not mutate the draft or write progression',
  );
  assert.throws(
    () => generatePickupLayout(createDocument({ blank: true })),
    /valid road/,
  );
  assert.throws(
    () => generatePickupLayout(doc, { preset: 'unknown' }),
    /preset/,
  );
});

test('resolved pickup entries survive library reload and route edits; layout and clear operations change course identity', async () => {
  const values = new Map();
  const storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const library = createTrackLibrary({ storage });
  const blankLayout = generateDocument({ seedJumps: false });
  const filled = fill(blankLayout);
  assert.notEqual(documentIdentity(filled), documentIdentity(blankLayout));
  await library.save(filled);
  const restored = await library.read(filled.id);
  assert.deepEqual(restored.pickups, filled.pickups);
  assert.deepEqual(
    restored,
    validateDocument(JSON.parse(JSON.stringify(filled))),
  );
  restored.generator.seed++;
  restored.points.forEach((point) => {
    point.x *= 0.9;
    point.z *= 0.9;
  });
  const savedEntries = JSON.stringify(restored.pickups.devices);
  const track = createEditorTrack(restored),
    compiled = createEditorDevices(track, restored);
  assert.ok(compiled.length > 0);
  for (const d of compiled) {
    const entry = restored.pickups.devices.find((item) => item.id === d.id);
    assert.ok(Math.abs(d.distance / track.length - entry.at) < 1e-12);
  }
  assert.equal(
    JSON.stringify(restored.pickups.devices),
    savedEntries,
    'runtime never silently regenerates saved placements',
  );
  const cleared = validateDocument({
    ...filled,
    pickups: { ...filled.pickups, devices: [] },
  });
  assert.deepEqual(
    createEditorDevices(createEditorTrack(cleared), cleared),
    [],
  );
  assert.equal(documentIdentity(cleared), documentIdentity(blankLayout));
  const edited = structuredClone(filled);
  edited.pickups.devices[0].at += 0.002;
  assert.notEqual(documentIdentity(edited), documentIdentity(filled));
});

test('runtime omits newly unsafe gap, recovery and tight-turn footprints without deleting saved placements', () => {
  const doc = fill(generateDocument({ seedJumps: false }));
  const track = createEditorTrack(doc),
    original = JSON.stringify(doc);
  const devices = createEditorDevices(track, doc);
  const first = devices[0],
    second = devices[1];
  const gapTrack = {
    ...track,
    isGap: (s) => Math.abs(s - first.distance) < 30,
  };
  const gapDevices = createEditorDevices(gapTrack, doc);
  assert.ok(!gapDevices.some((d) => d.id === first.id));
  assert.ok(gapDevices.length > 0);
  const jumpTrack = {
    ...track,
    jumps: [
      {
        id: 'test-gap',
        takeoff: second.distance - 20,
        recovery: second.distance + 20,
      },
    ],
  };
  assert.ok(
    !createEditorDevices(jumpTrack, doc).some((d) => d.id === second.id),
  );
  const tightTrack = {
    ...track,
    sample: (s) => ({ ...track.sample(s), curvature: 0.08 }),
  };
  assert.deepEqual(createEditorDevices(tightTrack, doc), []);
  assert.equal(JSON.stringify(doc), original);
});

for (const degrees of [90, 180, 270])
  test(`fill uses held ${degrees}-degree road and hardware follows its exact rendered triangles`, () => {
    const doc = applySectionShape(
      generateDocument({
        generatorVersion: 1,
        seedJumps: false,
        length: 4800,
        elevation: 0,
        density: 0,
      }),
      {
        startIndex: 2,
        endIndex: 5,
        type: 'roll',
        angle: (degrees * Math.PI) / 180,
      },
    );
    assert.equal(analyzeDocument(doc).valid, true);
    doc.pickups = generatePickupLayout(doc, { density: 0.85 });
    const track = createEditorTrack(doc),
      devices = createEditorDevices(track, doc);
    assert.equal(track.deviceProjection, 'rendered-surface');
    const rotated = devices.filter((d) =>
      degrees === 180
        ? track.sample(d.distance).up.y < -0.7
        : Math.abs(track.sample(d.distance).up.y) < 0.35,
    );
    assert.ok(
      rotated.length > 0,
      'held rotated road receives actual generated devices',
    );
    const road = createEditorRoad(track);
    const hardware = createEditorPickupHardware(track, doc, road);
    const projector = createSurfaceProjector(
      track,
      collectRoadSurfaces(road.group),
    );
    const roadSurface = collectRoadSurfaces(road.group)[0].geometry;
    let roadDisposed = 0,
      ownedDisposed = 0;
    roadSurface.addEventListener('dispose', () => roadDisposed++);
    try {
      assert.equal(hardware.group.children.length, devices.length);
      let checked = 0;
      for (const visual of hardware.group.children) {
        const deck = visual.children.find(
          (mesh) => mesh.name === 'Low pickup / deck',
        );
        if (!deck) continue;
        const { position, normal, roadCoord } = deck.geometry.attributes;
        if (!ownedDisposed)
          deck.geometry.addEventListener('dispose', () => ownedDisposed++);
        for (
          let i = 0;
          i < position.count;
          i += Math.max(1, Math.floor(position.count / 32))
        ) {
          const distance = roadCoord.getY(i),
            lateral = roadCoord.getX(i);
          const base = projector.sample(distance, lateral),
            up = new Vector3().fromBufferAttribute(normal, i);
          const actual = new Vector3().fromBufferAttribute(position, i);
          assert.ok(actual.distanceTo(base.addScaledVector(up, 0.07)) < 0.002);
          assert.ok(up.dot(track.sample(distance).up) > 0.98);
          checked++;
        }
      }
      assert.ok(checked > 100);
      hardware.dispose();
      hardware.dispose();
      assert.equal(hardware.group.children.length, 0);
      assert.equal(
        ownedDisposed,
        devices.length,
        'owned deck geometry disposes exactly once',
      );
      assert.equal(
        roadDisposed,
        0,
        'preview hardware does not dispose borrowed road geometry',
      );
    } finally {
      hardware.dispose();
      projector.dispose();
      road.dispose();
    }
  });

test('compiled pickups activate the real magnetic-device runtime, including boost, shield and automatic combat programs', () => {
  const doc = fill(generateDocument({ seedJumps: false, length: 4800 }));
  const level = createEditorLevel(doc),
    track = level.createTrack();
  const devices = level.racing.createDevices(track);
  for (const type of ['vector', 'aegis', 'repulsor', 'arc', 'ion']) {
    const device = devices.find((d) => d.type === type);
    assert.ok(device);
    const motion = createMagneticRuntime({ track });
    const state = {
      ...createVehicleState(),
      distance: device.distance - device.length / 2 - 15,
      lateral: device.lateral,
      speed: 80,
    };
    motion.pose = () => {
      const frame = track.sample(state.distance);
      return {
        position: frame.position
          .addScaledVector(frame.right, state.lateral)
          .addScaledVector(frame.up, 1.2),
        quaternion: frame.quaternion,
        grounded: true,
      };
    };
    const runtime = createDeviceRuntime({
      track,
      devices: [device],
      motion,
      combat: createCombatSimulation({ track }),
    });
    try {
      runtime.reset({ state });
      const events = [];
      for (
        let i = 0;
        i < 120 &&
        !events.some(
          (e) => e.type === 'pickup-activate' && e.payload.kind === type,
        );
        i++
      ) {
        events.push(
          ...runtime.advance(
            state,
            { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false },
            1 / 120,
          ),
        );
        events.push(...runtime.advanceInteractions(1 / 120));
      }
      assert.ok(
        events.some(
          (e) => e.type === 'pickup-activate' && e.payload.kind === type,
        ),
        `${type} must activate through real runtime contact`,
      );
      if (type === 'vector')
        assert.ok(
          state.speed > 140,
          'real Vector entry impulse changes ship speed',
        );
      else if (type === 'aegis')
        assert.ok(runtime.snapshot().aegisRemaining > 0);
      else assert.equal(runtime.snapshot().combat.emitters.player.kind, type);
    } finally {
      runtime.dispose();
    }
  }
});

test('downhill fill and runtime layouts stop before the finish and leave the supported runout empty', () => {
  const doc = fill(
    generateDocument({
      seedJumps: false,
      courseType: 'downhill',
      length: 4800,
    }),
  );
  const track = createEditorTrack(doc);
  assert.equal(track.closed, false);
  assert.ok(track.finishDistance < track.length);
  const devices = createEditorDevices(track, doc);
  assert.ok(devices.length > 0);
  for (const device of devices)
    assert.ok(
      device.distance + device.length / 2 <= track.finishDistance - 100,
    );
  const withRunoutEntry = structuredClone(doc);
  withRunoutEntry.pickups.devices.push({
    id: 'pickup-after-finish',
    type: 'aegis',
    at: (track.finishDistance + 200) / track.length,
    lane: 0,
  });
  assert.ok(
    !createEditorDevices(track, withRunoutEntry).some(
      (device) => device.id === 'pickup-after-finish',
    ),
  );
  assert.equal(
    withRunoutEntry.pickups.devices.at(-1).id,
    'pickup-after-finish',
    'unsafe entries stay in the saved document instead of being silently deleted',
  );
});
