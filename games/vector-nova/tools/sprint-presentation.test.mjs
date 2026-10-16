import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createWorldspireTrack } from '../src/levels/worldspire/track/model.js';
import { createAwakening } from '../src/levels/worldspire/environment/awakening.js';
import worldspireSeats from '../assets/levels/worldspire/resonance-kit.json' with { type: 'json' };
import { createWorldspireEnvironment } from '../src/levels/worldspire/environment/index.js';
import { createWorldspireBackdrop } from '../src/levels/worldspire/backdrop/index.js';
import { createNightweirTrack } from '../src/levels/nightweir/track/model.js';
import { createNightweirWater } from '../src/levels/nightweir/environment/water.js';
import nightweirKit from '../assets/levels/nightweir/water-kit.json' with { type: 'json' };

test('Awakening rewinds exactly and reduced motion preserves the navigation state', () => {
  const track = createWorldspireTrack(),
    texture = new T.Texture(),
    a = createAwakening(track, texture);
  const plates = a.group.getObjectByName(
    'Worldspire / paired grown valve leaves',
  );
  const quiet = Array.from(plates.instanceMatrix.array);
  const seatIndex = worldspireSeats.anchors.findIndex((a) => a.hero);
  assert.ok(seatIndex >= 0);
  a.update({
    state: { distance: worldspireSeats.anchors[seatIndex].distance - 300 },
  });
  assert.notDeepEqual(
    Array.from(
      plates.instanceMatrix.array.slice(seatIndex * 32, seatIndex * 32 + 32),
    ),
    quiet.slice(seatIndex * 32, seatIndex * 32 + 32),
    'the hero mineral leaves open on the driving approach, before reaching their authored station',
  );

  a.update({ state: { distance: 7000 } });
  const opening = Array.from(plates.instanceMatrix.array);
  assert.notDeepEqual(opening, quiet);
  a.update({ state: { distance: 7000 }, settings: { reducedMotion: true } });
  assert.deepEqual(Array.from(plates.instanceMatrix.array), opening);
  a.update({ state: { distance: 0 } });
  assert.deepEqual(Array.from(plates.instanceMatrix.array), quiet);
  const lights = a.group.children.filter((o) => o.isLight);
  assert.equal(lights.length, 2);
  assert.ok(lights.every((l) => l.isRectAreaLight));
  const ltc = T.UniformsLib.LTC_FLOAT_1;
  const seat = worldspireSeats.anchors.find((anchor) => anchor.hero);
  const camera = {
    position: new T.Vector3(...seat.center).add(new T.Vector3(0, 0, 100)),
  };
  a.update({ state: { distance: seat.distance }, camera });
  const illuminated = lights.filter((l) => l.intensity > 0);
  assert.ok(illuminated.length > 0);
  for (const l of illuminated) {
    assert.ok(l.height > l.width * 6, 'core emits from a long seam');
    const station = worldspireSeats.anchors.reduce(
      (nearest, anchor) => {
        const position = new T.Vector3(...anchor.center).addScaledVector(
          new T.Vector3(...anchor.normal),
          10,
        );
        return position.distanceToSquared(l.position) < nearest.distance
          ? { anchor, distance: position.distanceToSquared(l.position) }
          : nearest;
      },
      { distance: Infinity },
    ).anchor;
    const direction = new T.Vector3(0, 0, -1).applyQuaternion(l.quaternion);
    assert.ok(
      direction.dot(new T.Vector3(...station.normal)) > 0.999,
      'emission faces outward from the actual fitted core',
    );
  }
  a.update({ state: { distance: 0 }, camera });
  assert.ok(lights.every((l) => l.intensity === 0));
  assert.deepEqual(
    a.group.children.filter((o) => o.isLight),
    lights,
    'rewind retains the warmed light slots',
  );
  assert.equal(T.UniformsLib.LTC_FLOAT_1, ltc);
  const gs = new Set(),
    ms = new Set();
  a.group.traverse((o) => {
    if (o.geometry) gs.add(o.geometry);
    if (o.material) ms.add(o.material);
    if (o.isInstancedMesh) o.dispose();
  });
  gs.forEach((g) => g.dispose());
  ms.forEach((m) => m.dispose());
  texture.dispose();
});

test('failed Worldspire model loading releases the concurrently acquired texture', async () => {
  const texture = new T.Texture();
  let released = 0;
  texture.addEventListener('dispose', () => released++);
  await assert.rejects(
    createWorldspireEnvironment({
      track: createWorldspireTrack(),
      loadAsset: async () => {
        throw new Error('model unavailable');
      },
      loadTexture: async () => texture,
    }),
    (error) =>
      /Worldspire monolith could not load/.test(error.message) &&
      error.cause.message === 'model unavailable',
  );
  assert.equal(released, 1);
});

test('Worldspire image-loader events reject with retry messages and release acquired scenery', async () => {
  const cause = new Event('error'),
    geometry = new T.BoxGeometry(),
    material = new T.MeshStandardMaterial(),
    mineral = new T.Texture();
  const root = new T.Group();
  root.add(new T.Mesh(geometry, material));
  const disposed = new Map();
  for (const resource of [geometry, material, mineral])
    resource.addEventListener('dispose', () =>
      disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
    );
  await assert.rejects(
    createWorldspireEnvironment({
      track: createWorldspireTrack(),
      loadAsset: async () => ({ scene: root }),
      loadTexture: async (url) => {
        if (url.includes('fractured-obsidian')) throw cause;
        return mineral;
      },
    }),
    (error) =>
      error instanceof Error &&
      /Worldspire mineral grain could not load/.test(error.message) &&
      error.cause === cause,
  );
  assert.equal(root.children.length, 0);
  for (const resource of [geometry, material, mineral])
    assert.equal(disposed.get(resource), 1);
  await assert.rejects(
    createWorldspireBackdrop({
      loadTexture: async () => {
        throw cause;
      },
    }),
    (error) =>
      error instanceof Error &&
      /Worldspire sky could not load/.test(error.message) &&
      error.cause === cause,
  );
});

test('Worldspire detaches clouds once and releases owned presentation resources while retaining borrowed depth and reflection', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  return (async () => {
    const geometry = new T.BoxGeometry(),
      material = new T.MeshStandardMaterial({
        name: 'Worldspire / obsidian outer face',
      });
    const root = new T.Group();
    root.add(new T.Mesh(geometry, material));
    const mineral = new T.Texture(),
      substrate = new T.Texture(),
      reflection = new T.Texture(),
      depth = new T.DepthTexture(4, 4);
    const camera = new T.PerspectiveCamera(55, 1.6, 0.1, 26000);
    let attached = 0,
      detached = 0,
      pass;
    const environment = await createWorldspireEnvironment({
      track: createWorldspireTrack(),
      settings: { quality: 'low' },
      loadAsset: async () => ({ scene: root }),
      loadTexture: async (url) =>
        url.includes('fractured-obsidian') ? substrate : mineral,
      view: {
        camera,
        attachWorldPass(value) {
          attached++;
          pass = value;
          return () => detached++;
        },
      },
    });
    const resources = new Set([
      geometry,
      material,
      mineral,
      substrate,
      pass.target,
      pass.volume,
      pass.composite,
      pass.uniforms.weather.value,
      pass.uniforms.bodyField.value,
      pass.uniforms.rootBodyField.value,
      pass.uniforms.clearance.value,
    ]);
    environment.group.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      for (const m of [object.material].flat().filter(Boolean))
        resources.add(m);
    });
    const disposals = new Map();
    for (const resource of [...resources, depth, reflection])
      resource.addEventListener('dispose', () =>
        disposals.set(resource, (disposals.get(resource) ?? 0) + 1),
      );
    try {
      environment.setReflection(reflection);
      pass.setSceneDepth(depth);
      assert.equal(attached, 1);
      assert.equal(pass.needsSwap, true);
      assert.equal(pass.enabled, true);
      assert.equal(material.envMap, reflection);
      assert.equal(pass.uniforms.steps.value, 16);
      const frame = {
        camera,
        state: { distance: 0 },
        time: 0,
        mode: 'title',
        settings: { quality: 'low' },
      };
      environment.update(frame);
      now = 80;
      environment.update(frame);
      const clouds = environment.group.getObjectByName(
        'Worldspire / broken cloud strata',
      );
      assert.equal(clouds.userData.cloudTime, 0.08);
      now = 9000;
      environment.update({ ...frame, mode: 'paused' });
      assert.equal(clouds.userData.cloudTime, 0.08);
      const steadyLights = environment.group.children.filter(
        (object) => object.isPointLight,
      );
      assert.equal(steadyLights.length, 4);
      for (const fixture of worldspireSeats.fixtures) {
        camera.position.fromArray(fixture.position);
        environment.update({ ...frame, mode: 'paused' });
        assert.ok(
          steadyLights.some((light) => light.intensity > 0),
          'each authored chamber station receives practical light',
        );
        assert.ok(
          steadyLights.every(
            (light) =>
              Number.isFinite(light.intensity) &&
              light.position.toArray().every(Number.isFinite),
          ),
        );
      }
      camera.position.set(50000, 50000, 50000);
      environment.update({ ...frame, mode: 'paused' });
      assert.ok(
        steadyLights.every((light) => light.intensity === 0),
        'distant practicals extinguish',
      );
      assert.deepEqual(
        environment.group.children.filter((object) => object.isPointLight),
        steadyLights,
        'moving through chambers retains the warmed light pool',
      );
      environment.dispose();
      environment.dispose();
      assert.equal(detached, 1);
      assert.equal(environment.group.children.length, 0);
      for (const resource of resources)
        assert.equal(
          disposals.get(resource),
          1,
          resource.name || resource.type || 'owned resource',
        );
      assert.equal(disposals.get(depth), undefined);
      assert.equal(disposals.get(reflection), undefined);
    } finally {
      environment.dispose();
      depth.dispose();
      reflection.dispose();
    }
  })();
});

test('Floodgates open on approach, rewind exactly, freeze flow under reduced motion and dispose once', () => {
  const track = createNightweirTrack(),
    water = createNightweirWater(track),
    gate = water.group.getObjectByName('Nightweir / rising sluice leaves');
  assert.equal(gate.count, nightweirKit.gates.length);
  const i = Math.min(2, gate.count - 1),
    s = track.curtains[nightweirKit.gates[i].sourceIndex].s,
    m = new T.Matrix4(),
    y = () => {
      gate.getMatrixAt(i, m);
      return m.elements[13];
    };
  water.update({ state: { distance: s - 350 }, time: 10 });
  const closed = y();
  water.update({ state: { distance: s - 190 }, time: 10 });
  const mid = y();
  water.update({ state: { distance: s - 50 }, time: 10 });
  const open = y();
  assert.ok(closed < mid && mid < open);
  assert.ok(Math.abs(open - closed - 26) < 0.01);
  const fixed = Array.from(gate.instanceMatrix.array);
  water.update({ state: { distance: s - 50 }, time: 10 });
  assert.deepEqual(Array.from(gate.instanceMatrix.array), fixed);
  assert.equal(water.group.userData.flowTime, 10);
  water.update({
    state: { distance: s - 50 },
    time: 20,
    settings: { reducedMotion: true },
  });
  assert.equal(water.group.userData.flowTime, 0);
  assert.deepEqual(Array.from(gate.instanceMatrix.array), fixed);
  water.update({ state: { distance: s - 350 }, time: 0 });
  assert.equal(y(), closed);
  assert.equal(
    water.group.userData.wetness,
    0,
    'retired crossings create no invisible wetness field',
  );
  const resources = new Set();
  water.group.traverse((o) => {
    if (o.geometry) resources.add(o.geometry);
    if (o.material) resources.add(o.material);
  });
  const disposed = new Map();
  for (const r of resources)
    r.addEventListener('dispose', () =>
      disposed.set(r, (disposed.get(r) ?? 0) + 1),
    );
  water.dispose();
  water.dispose();
  assert.equal(water.group.children.length, 0);
  for (const r of resources) assert.equal(disposed.get(r), 1);
});

test('Nightweir water runs before green without moving gates or simulation and holds on pause', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const water = createNightweirWater(createNightweirTrack());
  const state = Object.freeze({ distance: 0, time: 0 });
  const gates = water.group.getObjectByName('Nightweir / rising sluice leaves');
  const turbineWater = water.group.getObjectByName(
    'Nightweir / connected turbine water',
  );
  const flow = () => {
    assert.equal(
      turbineWater.userData.flowTime,
      water.group.userData.flowTime,
      'turbine discharge, foam and spray share the existing presentation clock',
    );
    return water.group.userData.flowTime;
  };
  try {
    water.update({ mode: 'title', time: 0, state });
    const fixedGates = Array.from(gates.instanceMatrix.array);
    now = 80;
    water.update({ mode: 'title', time: 0, state });
    assert.equal(flow(), 0.08);
    now = 100;
    water.update({ mode: 'countdown', time: 0, state, reset: true });
    assert.equal(flow(), 0.08, 'countdown preserves the title phase');
    now = 180;
    water.update({ mode: 'countdown', time: 0, state });
    assert.ok(Math.abs(flow() - 0.16) < 1e-10);
    assert.deepEqual(Array.from(gates.instanceMatrix.array), fixedGates);
    assert.equal(state.time, 0);
    water.update({ mode: 'racing', time: 0.02, state });
    assert.ok(
      Math.abs(flow() - 0.18) < 1e-10,
      'green carries pre-race flow forward',
    );
    now = 5000;
    water.update({ mode: 'paused', time: 0.02, state });
    const paused = flow();
    now = 10000;
    water.update({ mode: 'fly', time: 0.02, state });
    assert.equal(flow(), paused);
    water.update({
      mode: 'countdown',
      time: 0,
      state,
      settings: { reducedMotion: true },
    });
    assert.equal(flow(), 0);
    water.update({ mode: 'racing', time: 0, state, reset: true });
    assert.equal(flow(), 0, 'fresh sessions reset the water clock');
  } finally {
    water.dispose();
  }
});

test('Nightweir falling water owns mipmapped ripples and borrows the city probe', () => {
  const water = createNightweirWater(createNightweirTrack());
  const material = water.group.getObjectByName(
    'Nightweir / actual falling curtains',
  ).material;
  const shader = {
    uniforms: {},
    vertexShader: T.ShaderLib.physical.vertexShader,
    fragmentShader: T.ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader);
  const ripple = shader.uniforms.rippleTexture.value;
  const probe = new T.Texture();
  let rippleDisposals = 0,
    probeDisposals = 0;
  ripple.addEventListener('dispose', () => rippleDisposals++);
  probe.addEventListener('dispose', () => probeDisposals++);
  try {
    assert.equal(ripple.image.width, 256);
    assert.equal(ripple.generateMipmaps, true);
    assert.equal(ripple.minFilter, T.LinearMipmapLinearFilter);
    water.setReflection(probe);
    assert.equal(material.envMap, probe);
    water.update({ time: 8 });
    assert.equal(shader.uniforms.waterTime.value, 8);
    water.update({ time: 9, settings: { reducedMotion: true } });
    assert.equal(shader.uniforms.waterTime.value, 0);
    water.update({ time: 0 });
    assert.equal(shader.uniforms.waterTime.value, 0);
    water.dispose();
    water.dispose();
    assert.equal(rippleDisposals, 1);
    assert.equal(probeDisposals, 0);
  } finally {
    water.dispose();
    probe.dispose();
  }
});

test('Nightweir owns its linear water composition and releases it once while borrowing reflections', async () => {
  const { createNightweirEnvironment } =
    await import('../src/levels/nightweir/environment/index.js');
  const root = new T.Group(),
    geometry = new T.BoxGeometry(),
    material = new T.MeshStandardMaterial({
      name: 'Nightweir / wet gorge bedrock',
    });
  const brickMaterial = new T.MeshStandardMaterial({
    name: 'Nightweir / fired brick',
  });
  const roofMaterial = new T.MeshStandardMaterial({
    name: 'Nightweir / weathered zinc roofing',
  });
  root.add(
    new T.Mesh(geometry, material),
    new T.Mesh(geometry, brickMaterial),
    new T.Mesh(geometry, roofMaterial),
  );
  const reflected = new T.Texture(),
    rock = new T.Texture(),
    brick = new T.Texture(),
    roof = new T.Texture(),
    scree = new T.Texture();
  let attached = 0,
    detached = 0,
    geometryReleased = 0,
    materialReleased = 0,
    reflectionReleased = 0,
    rockReleased = 0,
    brickReleased = 0,
    roofReleased = 0,
    screeReleased = 0;
  geometry.addEventListener('dispose', () => geometryReleased++);
  material.addEventListener('dispose', () => materialReleased++);
  reflected.addEventListener('dispose', () => reflectionReleased++);
  rock.addEventListener('dispose', () => rockReleased++);
  brick.addEventListener('dispose', () => brickReleased++);
  roof.addEventListener('dispose', () => roofReleased++);
  scree.addEventListener('dispose', () => screeReleased++);
  const environment = await createNightweirEnvironment({
    track: createNightweirTrack(),
    loadAsset: async () => ({ scene: root }),
    loadTexture: async (url) =>
      url.includes('fired-brick')
        ? brick
        : url.includes('zinc-roof')
          ? roof
          : url.includes('damp-scree')
            ? scree
            : rock,
    view: {
      attachWorldPass(pass) {
        attached++;
        assert.equal(pass.needsSwap, false);
        assert.equal(pass.enabled, true);
        pass.render();
        return () => detached++;
      },
    },
  });
  environment.setReflection(reflected);
  assert.equal(rock.colorSpace, T.SRGBColorSpace);
  assert.equal(rock.wrapS, T.RepeatWrapping);
  assert.equal(scree.colorSpace, T.SRGBColorSpace);
  assert.equal(scree.wrapS, T.RepeatWrapping);
  assert.equal(material.envMapIntensity, 0.35);
  assert.equal(brickMaterial.map, brick);
  assert.equal(brick.colorSpace, T.SRGBColorSpace);
  assert.equal(roofMaterial.map, roof);
  assert.equal(roof.colorSpace, T.SRGBColorSpace);
  environment.update({
    state: { distance: 4945 },
    camera: { position: new T.Vector3(0, 1500, 2000) },
    time: 4,
  });
  environment.dispose();
  environment.dispose();
  assert.deepEqual(
    {
      attached,
      detached,
      geometryReleased,
      materialReleased,
      reflectionReleased,
      rockReleased,
      brickReleased,
      roofReleased,
      screeReleased,
    },
    {
      attached: 1,
      detached: 1,
      geometryReleased: 1,
      materialReleased: 1,
      reflectionReleased: 0,
      rockReleased: 1,
      brickReleased: 1,
      roofReleased: 1,
      screeReleased: 1,
    },
  );
  reflected.dispose();
});

test('Nightweir loads both bare gzip and HTTP-decoded city payloads', async (t) => {
  const { gzipSync } = await import('node:zlib');
  const { createNightweirEnvironment } =
    await import('../src/levels/nightweir/environment/index.js');
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'City payload fixture' }],
  });
  const length = Math.ceil(Buffer.byteLength(json) / 4) * 4;
  const glb = Buffer.alloc(20 + length, 0x20);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  glb.write(json, 20);
  for (const encoded of [true, false])
    await t.test(encoded ? 'bare gzip' : 'HTTP decoded', async (child) => {
      child.mock.method(
        globalThis,
        'fetch',
        async () => new Response(encoded ? gzipSync(glb) : glb),
      );
      const environment = await createNightweirEnvironment({
        track: createNightweirTrack(),
      });
      try {
        assert.ok(environment.group.getObjectByName('City_payload_fixture'));
      } finally {
        environment.dispose();
      }
    });
});

test('Nightweir keeps its warmed light count through the start and jump while extinguishing distant fixtures', async () => {
  const { createNightweirEnvironment } =
    await import('../src/levels/nightweir/environment/index.js');
  const { createNightweirRoad } =
    await import('../src/levels/nightweir/track/road.js');
  const track = createNightweirTrack(),
    road = createNightweirRoad({ track }),
    environment = await createNightweirEnvironment({
      track,
      loadAsset: async () => ({ scene: new T.Group() }),
    }),
    camera = new T.PerspectiveCamera();
  const lights = () => {
    const result = [];
    for (const owner of [road, environment])
      owner.group.traverseVisible((o) => {
        if (o.isPointLight) result.push(o);
      });
    return result;
  };
  const count = lights().length;
  assert.ok(count > 0);
  try {
    const powers = new Set();
    for (const distance of [
      0,
      2,
      84,
      91,
      5676,
      6029,
      6266,
      ...track.curtains.map((c) => c.s),
    ]) {
      camera.position.copy(track.sample(distance).position);
      for (const owner of [road, environment])
        owner.update({ camera, state: { distance } });
      assert.equal(
        lights().length,
        count,
        `shader light count at ${distance}m`,
      );
      const power = lights().reduce((sum, l) => sum + l.intensity, 0);
      assert.ok(
        power > 0,
        `nearby fixtures illuminate the route at ${distance}m`,
      );
      powers.add(power);
    }
    assert.ok(powers.size > 1, 'lights still respond to the local district');
    const workingFacilities = nightweirKit.lights.filter(
      (fixture) => fixture.focusRange,
    );
    assert.ok(
      workingFacilities.length > 0,
      'Canal exchange has an authored working light',
    );
    for (const fixture of workingFacilities) {
      const distance = (fixture.focusRange[0] + fixture.focusRange[1]) / 2;
      camera.position.copy(track.sample(distance).position);
      for (const owner of [road, environment])
        owner.update({ camera, state: { distance } });
      assert.equal(
        lights().length,
        count,
        'working facility reuses warmed shader slots',
      );
      assert.ok(
        lights().some(
          (light) =>
            light.intensity > 0 &&
            light.position.distanceTo(new T.Vector3(...fixture.p)) < 0.01,
        ),
        'visible machinery hall retains illumination despite closer doorway lamps',
      );
    }
    camera.position.set(1e7, 1e7, 1e7);
    for (const owner of [road, environment]) owner.update({ camera });
    assert.equal(
      lights().length,
      count,
      'distant fixtures retain shader slots',
    );
    assert.ok(
      lights().every((l) => l.intensity === 0),
      'distant fixtures cast no light',
    );
  } finally {
    road.dispose();
    environment.dispose();
  }
});

test('Nightweir dam curtains stay downstream of their spill lips and solid faces', async () => {
  const { default: kit } = await import(
    '../assets/levels/nightweir/water-kit.json',
    { with: { type: 'json' } }
  );
  const water = createNightweirWater(createNightweirTrack());
  try {
    const sheets = water.group.getObjectByName(
      'Nightweir / actual falling curtains',
    );
    const positions = sheets.geometry.getAttribute('position');
    const phases = sheets.geometry.getAttribute('sourcePhase');
    assert.equal(
      sheets.material.depthTest,
      true,
      'buildings still occlude water',
    );
    for (const fall of kit.falls.filter((f) => f.kind === 'dam')) {
      let count = 0;
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(phases.getX(i) - fall.seed) > 0.00001) continue;
        count++;
        // The exported dam face is four metres upstream of the spill mouth.
        // Float32 positions at multi-kilometre coordinates retain millimetre tolerance.
        // Every triangle stays in front when all its vertices do: the old bow
        // crossed back into that wall midway down every broad waterfall.
        assert.ok(
          positions.getZ(i) >= fall.top[2] - 0.001,
          `dam at z=${fall.top[2]} bends upstream into its retaining wall`,
        );
        if (
          Math.abs(positions.getY(i) - fall.top[1]) < 0.0001 ||
          Math.abs(positions.getY(i) - (fall.top[1] - fall.height)) < 0.0001
        )
          assert.ok(
            Math.abs(positions.getZ(i) - fall.top[2]) < 0.001,
            'fall remains attached to its spill lip and receiving foam',
          );
      }
      assert.ok(count > 0, 'every authored dam has a rendered curtain');
    }
  } finally {
    water.dispose();
  }
});

test('Blackstart restores districts ahead, holds on pause and reduced motion, and rewinds without changing lighting slots', async () => {
  const { createNightweirBlackstart } =
    await import('../src/levels/nightweir/environment/blackstart.js');
  const { default: kit } = await import(
    '../assets/levels/nightweir/water-kit.json',
    { with: { type: 'json' } }
  );
  const track = createNightweirTrack(),
    system = createNightweirBlackstart(track, kit);
  const rotors = system.group.getObjectByName(
    'Nightweir / active generating rotors',
  );
  const resources = new Set();
  system.group.traverse((o) => {
    if (o.geometry) resources.add(o.geometry);
    if (o.material) resources.add(o.material);
  });
  const released = new Map();
  for (const r of resources)
    r.addEventListener('dispose', () =>
      released.set(r, (released.get(r) ?? 0) + 1),
    );
  try {
    system.update({ state: { distance: 0 }, time: 0, reset: true });
    const start = system.uniforms.front.value;
    let last = start;
    for (let distance = 0; distance < track.finishDistance; distance += 31) {
      system.update({ state: { distance }, time: 0 });
      assert.ok(
        system.uniforms.front.value >= last,
        'returning bends never extinguish districts already restored',
      );
      last = system.uniforms.front.value;
    }
    assert.ok(last > start + 3000);
    system.update({ state: { distance: track.finishDistance }, time: 1 });
    const before = Array.from(rotors.instanceMatrix.array);
    system.update({ state: { distance: track.finishDistance }, time: 1.08 });
    assert.notDeepEqual(
      Array.from(rotors.instanceMatrix.array),
      before,
      'working turbines rotate',
    );
    const running = Array.from(rotors.instanceMatrix.array);
    system.update({
      state: { distance: track.finishDistance },
      time: 1.08,
      mode: 'paused',
    });
    assert.deepEqual(Array.from(rotors.instanceMatrix.array), running);
    system.update({
      state: { distance: track.finishDistance },
      time: 2,
      settings: { reducedMotion: true },
    });
    const reduced = Array.from(rotors.instanceMatrix.array),
      front = system.uniforms.front.value;
    system.update({
      state: { distance: track.finishDistance },
      time: 3,
      settings: { reducedMotion: true },
    });
    assert.deepEqual(Array.from(rotors.instanceMatrix.array), reduced);
    assert.equal(
      system.uniforms.front.value,
      front,
      'reduced motion retains restoration state',
    );
    system.update({ state: { distance: 0 }, time: 0, reset: true });
    assert.equal(system.uniforms.front.value, start);
  } finally {
    system.dispose();
    system.dispose();
    for (const r of resources) assert.equal(released.get(r), 1);
  }
});

test('Blackstart water occupies the authored basin beds and leaves the roadway crossings open', async () => {
  const { default: kit } = await import(
    '../assets/levels/nightweir/water-kit.json',
    { with: { type: 'json' } }
  );
  assert.ok(kit.basins.length >= 3);
  assert.ok(!kit.falls.some((fall) => fall.kind === 'crossing'));
  for (let i = 1; i < kit.basins.length; i++) {
    assert.equal(kit.basins[i].start, kit.basins[i - 1].end);
    assert.ok(kit.basins[i].y <= kit.basins[i - 1].y);
  }
  const water = createNightweirWater(createNightweirTrack());
  try {
    const positions = water.group.getObjectByName(
      'Nightweir / falling river and lower basin',
    ).geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      assert.ok(
        kit.basins.some(
          (b) =>
            Math.abs(positions.getY(i) - b.y - 4) < 0.001 &&
            positions.getZ(i) >= b.start - 0.001 &&
            positions.getZ(i) <= b.end + 0.001,
        ),
      );
    }
  } finally {
    water.dispose();
  }
});

test('Nightweir turbine discharges connect their mouths to contained water and downstream outlets', () => {
  const systems = nightweirKit.turbineWater;
  assert.equal(systems.length, nightweirKit.turbines.length);
  assert.ok(
    systems.length >= 2,
    'both visible machines own a hydraulic circuit',
  );
  for (const { id, distance, discharge, basin, runoff } of systems) {
    assert.ok(
      nightweirKit.turbines.some((t) => Math.abs(t.distance - distance) < 0.01),
      id,
    );
    const mouth = new T.Vector3(...discharge.mouth),
      impact = new T.Vector3(...discharge.impact);
    assert.ok(
      mouth.distanceTo(new T.Vector3(...discharge.jet[0])) < 0.01,
      'water begins inside its outlet',
    );
    assert.ok(
      impact.distanceTo(new T.Vector3(...discharge.jet.at(-1))) < 0.01,
      'jet terminates at its impact',
    );
    assert.ok(mouth.y > impact.y + 5, 'discharge drops under gravity');
    assert.ok(
      Math.abs(impact.y - basin.waterY) < 0.1,
      'impact meets the actual pool waterline',
    );
    const local = impact.clone().sub(new T.Vector3(...basin.center));
    assert.ok(
      Math.abs(local.dot(new T.Vector3(...basin.along))) +
        discharge.width * 0.5 <
        basin.width * 0.5,
      'full jet width lands inside the basin walls',
    );
    assert.ok(
      Math.abs(local.dot(new T.Vector3(...basin.out))) < basin.length * 0.5,
      'impact lies within basin depth',
    );
    assert.ok(
      basin.waterY > basin.bedY + 0.5,
      'pool has water depth above its solid bed',
    );
    assert.ok(
      runoff.points[0][1] <= basin.waterY + 0.1,
      'tailrace drains from the receiving waterline',
    );
    assert.ok(
      runoff.points.at(-1)[1] < basin.waterY - 5,
      'tailrace continues downstream',
    );
    assert.equal(
      runoff.widths.length,
      runoff.points.length,
      'each runoff station has an authored width',
    );
    assert.ok(
      runoff.widths.every((w) => Number.isFinite(w) && w > 0),
      'overflow widths stay finite and positive',
    );
    assert.ok(
      runoff.widths.at(-1) > runoff.widths[0],
      'free falling water fans below its lip',
    );
    for (const p of [...discharge.jet, ...runoff.points])
      assert.ok(p.every(Number.isFinite));
  }
});
