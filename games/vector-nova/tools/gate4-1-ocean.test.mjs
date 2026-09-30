import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCameraRig } from '../src/camera/index.js';
import { createNacreMaterials } from '../src/environment/level3/materials.js';
import { createLevel3Track } from '../src/track/level3/model.js';
import { createNacreEnvironment } from '../src/environment/level3/index.js';
import { createNacreClearance } from '../src/environment/level3/geometry.js';
import { findNacreWaterCrossings } from '../src/environment/level3/water-crossings.js';
import {
  sampleNacreWater,
  nacreWaterLocalVisibility,
} from '../src/environment/level3/atmosphere.js';
import { nacreSeabedHeight } from '../src/environment/level3/seabed.js';
import {
  createNacreBackdrop,
  sampleNacreLightning,
  NACRE_STORM_RULES,
} from '../src/renderer/level3/index.js';

const track = createLevel3Track();

test('Nacre assemblies and their actual instance bounds clear road and both flight corridors', () => {
  const environment = createNacreEnvironment(track);
  const clearance = createNacreClearance(track);
  assert.equal(clearance.flights.length, 2);
  const report = environment.userData.clearanceReport;
  assert.ok(
    report.placements.filter((p) => p.kind === 'reef-colony').length > 35,
  );
  assert.ok(report.placements.some((p) => p.kind === 'tide-observatory'));
  for (const placement of report.placements)
    assert.ok(
      clearance.clears(
        placement.x,
        placement.z,
        placement.radius,
        placement.minY,
        placement.maxY,
      ),
      placement.kind,
    );
  const matrix = new T.Matrix4();
  environment.traverse((object) => {
    if (!object.isInstancedMesh) return;
    if (object.instanceColor) {
      const color = new T.Color();
      for (let i = 0; i < object.count; i += 1) {
        object.getColorAt(i, color);
        assert.ok(
          color.r + color.g + color.b > 0,
          'Uncolored instances must default to white, never black',
        );
      }
    }
    object.geometry.computeBoundingBox();
    for (let i = 0; i < object.count; i += 1) {
      object.getMatrixAt(i, matrix);
      const box = object.geometry.boundingBox.clone().applyMatrix4(matrix);
      const center = box.getCenter(new T.Vector3()),
        size = box.getSize(new T.Vector3());
      assert.ok(
        clearance.route.clears(
          center.x,
          center.z,
          size.x,
          size.z,
          box.max.y,
          0,
          box.min.y,
        ),
        object.name,
      );
      assert.ok(
        clearance.flights.every((flight) => !flight.intersectsBox(box)),
        object.name,
      );
    }
  });
  assert.ok(environment.userData.metrics.meshCount < 60);
  assert.ok(environment.userData.metrics.triangleCount < 300000);
  assert.equal(environment.userData.metrics.textures, 0);
  environment.userData.dispose();
});

test('Nacre water transition is continuous in actual camera height and independent of quality', () => {
  let previous = 1;
  for (let y = -120; y <= 120; y += 0.025) {
    const state = sampleNacreWater(y, 0);
    assert.ok(state.submerged <= previous + 1e-12);
    assert.ok(previous - state.submerged < 0.004);
    assert.ok(state.fogDensity >= 0.00026 && state.fogDensity <= 0.0035);
    previous = state.submerged;
  }
  assert.equal(sampleNacreWater(20).submerged, 0);
  assert.equal(sampleNacreWater(-20).submerged, 1);
  assert.equal(sampleNacreWater(80, 100).submerged, 1);
});

test('Nacre presentation supports overview, low quality, reduced motion and owned teardown', () => {
  const environment = createNacreEnvironment(track);
  const scene = new T.Scene();
  const oldFog = new T.FogExp2('#000000', 0.001),
    oldBackground = new T.Color('#000000');
  scene.fog = oldFog;
  scene.background = oldBackground;
  const camera = new T.Vector3(0, -82, 0);
  const water = environment.children.find(
    (object) => object.material?.name === 'Nacre / living two-sided ocean',
  );
  const particles = environment.children.find((object) => object.isPoints);
  assert.equal(water.position.y, 0);
  assert.equal(water.material.side, T.DoubleSide);
  assert.equal(water.material.forceSinglePass, true);
  environment.userData.updateScene(scene, camera, 22, {
    quality: 'low',
    reducedMotion: true,
  });
  assert.equal(water.material.uniforms.wetness.value, 1);
  assert.equal(water.material.uniforms.time.value, 0);
  assert.equal(particles.geometry.drawRange.count, 800);
  const lowFog = scene.fog.density;
  environment.userData.updateScene(scene, camera, 22, { quality: 'high' });
  assert.equal(scene.fog.density, lowFog);
  environment.userData.setOverview(true);
  environment.userData.updateScene(scene, camera);
  assert.equal(water.visible, false);
  assert.equal(scene.fog.density, 0.000025);
  environment.userData.dispose();
  environment.userData.dispose();
  assert.equal(scene.fog, oldFog);
  assert.equal(scene.background, oldBackground);
  assert.equal(environment.children.length, 0);
});

test('Nacre seeded distant lightning stays bounded, reproducible and disabled by reduced motion', () => {
  let litFrames = 0;
  for (let time = 0; time < 310; time += 0.02) {
    const sample = sampleNacreLightning(time);
    assert.deepEqual(sampleNacreLightning(time), sample);
    assert.ok(sample.intensity >= 0 && sample.intensity <= 0.14);
    assert.equal(sampleNacreLightning(time, true).intensity, 0);
    if (sample.intensity > 0) litFrames += 1;
  }
  const completeCycles = Math.floor(310 / NACRE_STORM_RULES.periodSeconds);
  const litPerCycle = NACRE_STORM_RULES.durationSeconds / 0.02;
  assert.ok(litFrames > completeCycles * litPerCycle * 0.95);
  assert.ok(litFrames < (completeCycles + 1) * litPerCycle * 1.05);
  const sky = createNacreBackdrop({ settings: { reducedMotion: true } });
  sky.update(new T.Vector3(0, 60, 0), 10);
  assert.equal(sky.group.children[0].material.uniforms.lightning.value, 0);
  sky.update(new T.Vector3(0, -82, 0), 10);
  assert.equal(sky.group.children[0].material.uniforms.wetness.value, 1);
  sky.setOverview(true);
  sky.update(new T.Vector3(0, -82, 0), 10);
  assert.equal(sky.group.children[0].material.uniforms.wetness.value, 0);
  sky.dispose();
  sky.dispose();
  assert.equal(sky.group.children.length, 0);
});

test('Nacre geology, reef shelves and observatory have actual geometry embedded in sediment', () => {
  const environment = createNacreEnvironment(track);
  const boxes = [];
  const matrix = new T.Matrix4();
  environment.traverse((object) => {
    if (!object.isInstancedMesh) return;
    object.geometry.computeBoundingBox();
    for (let i = 0; i < object.count; i += 1) {
      object.getMatrixAt(i, matrix);
      boxes.push(object.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
  });
  for (const site of environment.userData.clearanceReport.placements) {
    const groundY = nacreSeabedHeight(track, site.x, site.z);
    const groundPoint = new T.Vector3(site.x, groundY, site.z);
    assert.ok(
      boxes.some(
        (box) => box.containsPoint(groundPoint) && box.min.y <= groundY - 4,
      ),
      site.kind,
    );
  }
  const seabed = environment.children.find(
    (object) => object.name === 'Nacre / sculpted deepwater sediment basin',
  );
  const positions = seabed.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    assert.ok(
      Math.abs(
        positions.getY(i) -
          nacreSeabedHeight(
            track,
            positions.getX(i) + seabed.position.x,
            positions.getZ(i) + seabed.position.z,
          ),
      ) < 0.0001,
    );
  }
  environment.userData.dispose();
});

test('Nacre crossing protects the craft and visible road at the critic camera heights without hiding distant/deep water', () => {
  for (const cameraY of [5.89, -1.15, 0, 15, -15]) {
    assert.equal(nacreWaterLocalVisibility(cameraY, 20), 0);
    assert.equal(nacreWaterLocalVisibility(cameraY, 120), 0);
    assert.ok(nacreWaterLocalVisibility(cameraY, 220) < 0.06);
    assert.equal(nacreWaterLocalVisibility(cameraY, 800), 1);
  }
  assert.equal(nacreWaterLocalVisibility(-82, 90), 1);
  assert.equal(nacreWaterLocalVisibility(68, 90), 1);
  for (let y = -45; y < 45; y += 0.05) {
    const a = nacreWaterLocalVisibility(y, 100),
      b = nacreWaterLocalVisibility(y + 0.05, 100);
    assert.ok(Math.abs(a - b) < 0.003);
  }
});

test('Nacre reefs have three distinct organic growth forms without repeated mushroom caps', () => {
  const environment = createNacreEnvironment(track);
  const species = new Set(
    environment.userData.clearanceReport.placements
      .filter((site) => site.kind === 'reef-colony')
      .map((site) => site.species),
  );
  assert.deepEqual([...species].sort(), [
    'branching-antler',
    'encrusting-boulder',
    'sea-fan',
  ]);
  const meshes = [];
  environment.traverse((object) => {
    if (object.isInstancedMesh) meshes.push(object);
  });
  assert.ok(meshes.some((mesh) => mesh.name.includes(' / fan / ')));
  assert.ok(meshes.some((mesh) => mesh.name.includes(' / twig / ')));
  assert.ok(
    !meshes.some(
      (mesh) =>
        mesh.name.includes(' / shell / ') &&
        mesh.material.name.includes('coral'),
    ),
  );
  assert.ok(
    meshes.filter((mesh) => mesh.name.includes(' / basalt')).length >= 2,
  );
  environment.userData.dispose();
});

test('Nacre readonly sky presentation reports actual lightning uniforms and same-phase reduced-motion suppression', () => {
  const sky = createNacreBackdrop();
  let pulseTime = 0;
  for (let time = 0; time < 31; time += 0.01)
    if (sampleNacreLightning(time).intensity > 0.1) {
      pulseTime = time;
      break;
    }
  assert.ok(pulseTime > 0);
  sky.update(new T.Vector3(0, 70, 0), pulseTime, { reducedMotion: false });
  const live = sky.getPresentation();
  assert.equal(live.elapsed, pulseTime);
  assert.ok(live.lightningIntensity > 0.1);
  assert.equal(
    live.lightningIntensity,
    sky.group.children[0].material.uniforms.lightning.value,
  );
  sky.update(new T.Vector3(0, 70, 0), pulseTime, { reducedMotion: true });
  assert.equal(sky.getPresentation().lightningIntensity, 0);
  assert.equal(sky.getPresentation().reducedMotion, true);
  assert.equal(sky.getPresentation().elapsed, live.elapsed);
  sky.dispose();
});

test('Nacre first seeded lightning pulse projects into the normal 1440x900 exposed storm approach view', () => {
  const camera = new T.PerspectiveCamera(64, 1440 / 900, 0.2, 14000);
  const rig = createCameraRig(camera);
  rig.update(
    track,
    { ...track.scenarios['storm-showcase'], lateral: 0, speed: 0 },
    1 / 60,
  );
  camera.updateMatrixWorld();
  const pulseTime =
    sampleNacreLightning(0).onset + NACRE_STORM_RULES.attackSeconds;
  const pulse = sampleNacreLightning(pulseTime);
  const sky = createNacreBackdrop();
  sky.update(
    camera.position,
    pulseTime,
    {},
    {
      enabled: true,
      direction: camera.getWorldDirection(new T.Vector3()),
    },
  );
  const azimuth = sky.getPresentation().lightningAzimuth;
  assert.ok(pulse.intensity > 0.1399 && pulse.intensity <= 0.14);
  const y = 0.26,
    horizontal = Math.sqrt(1 - y * y);
  const point = new T.Vector3(
    Math.cos(azimuth) * horizontal,
    y,
    Math.sin(azimuth) * horizontal,
  )
    .multiplyScalar(10000)
    .add(camera.position)
    .project(camera);
  assert.ok(
    Math.abs(point.x) < 0.75 && Math.abs(point.y) < 0.75,
    JSON.stringify(point),
  );
  assert.ok(point.z > -1 && point.z < 1);
  assert.equal(sampleNacreLightning(pulseTime, true).intensity, 0);
  sky.dispose();
});

test('Nacre generated material shader locals avoid GLSL reserved identifiers', () => {
  const reserved = new Set(
    'patch sample common partition active asm class union enum typedef template this resource goto inline noinline public static extern external interface long short half fixed unsigned superp input output hvec2 hvec3 hvec4 fvec2 fvec3 fvec4 sampler3DRect filter sizeof cast namespace using packed row_major subroutine'.split(
      ' ',
    ),
  );
  const materials = createNacreMaterials({ value: 0 }, 0);
  for (const material of Object.values(materials)) {
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader);
    for (const source of [shader.vertexShader, shader.fragmentShader]) {
      for (const match of source.matchAll(
        /\b(?:float|vec[234]|mat[234]|int|bool)\s+([A-Za-z_]\w*)/g,
      )) {
        assert.ok(
          !reserved.has(match[1]),
          `${material.name}: reserved GLSL identifier ${match[1]}`,
        );
      }
    }
    assert.ok(
      shader.fragmentShader.includes(
        'float mineralVariation=nacreNoise(drift);',
      ),
    );
    material.dispose();
  }
});

test('Nacre authored storm panorama aligns the eye, accounts for mip memory and disposes its texture exactly once', () => {
  const texture = new T.Texture({ width: 1774, height: 887 });
  let releases = 0;
  texture.addEventListener('dispose', () => releases++);
  const sky = createNacreBackdrop({ skyTexture: texture });
  const material = sky.group.children[0].material;
  assert.deepEqual(sky.ownedTextures, [texture]);
  assert.equal(texture.colorSpace, T.SRGBColorSpace);
  assert.equal(texture.wrapS, T.RepeatWrapping);
  assert.equal(texture.wrapT, T.ClampToEdgeWrapping);
  assert.equal(material.uniforms.stormSky.value, texture);
  assert.equal(sky.metrics.textures, 1);
  assert.equal(
    sky.metrics.skyMapEstimatedBytes,
    Math.ceil((1774 * 887 * 4 * 4) / 3),
  );
  assert.equal(material.defines.NACRE_SKY_MAP, 1);
  const eyeU =
    Math.atan2(sky.sunDirection.z, sky.sunDirection.x) / (Math.PI * 2) +
    material.uniforms.skyYaw.value;
  assert.ok(Math.abs(eyeU - 0.81) < 1e-12);
  sky.update(new T.Vector3(0, -82, 0), 17.93);
  assert.equal(sky.getPresentation().wetness, 1);
  assert.equal(sky.getPresentation().lightningIntensity, 0);
  sky.dispose();
  sky.dispose();
  assert.equal(releases, 1);
  const fallback = createNacreBackdrop();
  assert.equal(fallback.metrics.textures, 0);
  assert.equal(fallback.metrics.skyMapEstimatedBytes, 0);
  assert.deepEqual(fallback.ownedTextures, []);
  fallback.dispose();
  const shape = createNacreBackdrop({ blockout: true });
  assert.deepEqual(shape.ownedTextures, []);
  shape.dispose();
});

test('Nacre reef canopies reach above the road with distinct living forms and local light in high and low quality', () => {
  const environment = createNacreEnvironment(track);
  const canopies = environment.userData.clearanceReport.placements.filter(
    (p) => p.kind === 'living-reef-canopy',
  );
  assert.ok(canopies.length >= 12);
  const matrix = new T.Matrix4();
  const growth = [];
  environment.traverse((object) => {
    if (
      !object.isInstancedMesh ||
      !/ \/ (canopyFan|ribbon) \//.test(object.name)
    )
      return;
    object.geometry.computeBoundingBox();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      growth.push(object.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
  });
  for (const site of canopies) {
    const local = growth.filter((box) => {
      const center = box.getCenter(new T.Vector3());
      return Math.hypot(center.x - site.x, center.z - site.z) < site.radius;
    });
    assert.ok(local.length >= 13, `Living canopy at ${site.distance}`);
    assert.ok(
      Math.max(...local.map((box) => box.max.y)) > site.roadHeight + 32,
    );
  }
  const lights = environment.children.filter((object) => object.isPointLight);
  assert.equal(lights.length, 3);
  assert.ok(lights.every((light) => !light.castShadow));
  const site = canopies[5];
  const camera = new T.Vector3(site.x, site.roadHeight, site.z);
  const scene = new T.Scene();
  environment.userData.updateScene(scene, camera, 0, { quality: 'high' });
  const high = lights.map((light) => light.intensity);
  assert.ok(high.some((intensity) => intensity > 0));
  environment.userData.updateScene(scene, camera, 0, { quality: 'low' });
  assert.deepEqual(
    lights.map((light) => light.intensity),
    high,
  );
  environment.userData.setOverview(true);
  environment.userData.updateScene(scene, camera, 0);
  assert.ok(lights.every((light) => light.intensity === 0));
  environment.userData.dispose();
});

test('Nacre foundation height matches actual benthic mesh triangle interiors, not an unrelated analytic surface', () => {
  const environment = createNacreEnvironment(track);
  const seabed = environment.children.find(
    (object) => object.name === 'Nacre / sculpted deepwater sediment basin',
  );
  const positions = seabed.geometry.attributes.position;
  const indices = seabed.geometry.index;
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  let minY = Infinity,
    maxY = -Infinity;
  for (let triangle = 0; triangle < indices.count / 3; triangle += 97) {
    a.fromBufferAttribute(positions, indices.getX(triangle * 3));
    b.fromBufferAttribute(positions, indices.getX(triangle * 3 + 1));
    c.fromBufferAttribute(positions, indices.getX(triangle * 3 + 2));
    const surfacePoint = a
      .multiplyScalar(0.19)
      .addScaledVector(b, 0.37)
      .addScaledVector(c, 0.44)
      .add(seabed.position);
    const height = nacreSeabedHeight(track, surfacePoint.x, surfacePoint.z);
    assert.ok(Math.abs(height - surfacePoint.y) < 0.00003);
    minY = Math.min(minY, height);
    maxY = Math.max(maxY, height);
  }
  assert.ok(maxY - minY > 40, 'Benthic ridges have real vertical relief');
  assert.ok(maxY <= track.bounds.min.y - 43);
  environment.userData.dispose();
});

test('Nacre ocean borrows the aligned sky map without allocating or releasing another texture', () => {
  const texture = new T.Texture({ width: 1774, height: 887 });
  let releases = 0;
  texture.addEventListener('dispose', () => releases++);
  const sky = createNacreBackdrop({ skyTexture: texture });
  const environment = createNacreEnvironment(track, { skyTexture: texture });
  const water = environment.children.find(
    (object) => object.material?.name === 'Nacre / living two-sided ocean',
  );
  assert.equal(water.material.uniforms.stormSky.value, texture);
  assert.equal(
    water.material.uniforms.skyYaw.value,
    sky.group.children[0].material.uniforms.skyYaw.value,
  );
  assert.equal(environment.userData.metrics.textures, 0);
  assert.equal(environment.userData.metrics.borrowedSkyTextures, 1);
  assert.equal(environment.userData.metrics.additionalRenderPasses, 0);
  assert.equal(water.material.defines.NACRE_SKY_REFLECTION, 1);
  const scene = new T.Scene();
  const camera = new T.Vector3(200, 70, 150);
  environment.userData.updateScene(scene, camera, 17.93, {
    reducedMotion: false,
    quality: 'high',
  });
  assert.equal(water.material.uniforms.time.value, 17.93);
  environment.userData.updateScene(scene, camera, 17.93, {
    reducedMotion: true,
    quality: 'low',
  });
  assert.equal(water.material.uniforms.time.value, 0);
  assert.equal(water.material.uniforms.stormSky.value, texture);
  environment.userData.dispose();
  environment.userData.dispose();
  assert.equal(releases, 0, 'Environment must never release the borrowed map');
  sky.dispose();
  sky.dispose();
  assert.equal(releases, 1);
});

test('Nacre waterline follows the current banked surface across the whole road and a changed sea level', () => {
  const crossings = findNacreWaterCrossings(track);
  assert.equal(crossings.length, 2);
  assert.deepEqual(
    crossings.map((crossing) => crossing.direction),
    ['entry', 'exit'],
  );
  for (const crossing of crossings) {
    assert.ok(crossing.points[0].lateral < -track.width / 2);
    assert.ok(crossing.points.at(-1).lateral > track.width / 2);
    const distances = [];
    for (const point of crossing.points) {
      assert.ok(Math.abs(point.position.y - track.waterY) < 1e-5);
      const frame = track.sample(point.distance);
      const roadPoint = frame.position
        .clone()
        .addScaledVector(frame.right, point.lateral);
      assert.ok(roadPoint.distanceTo(point.position) < 1e-7);
      distances.push(point.distance);
    }
    assert.ok(
      Math.max(...distances) - Math.min(...distances) > 8,
      'A banked crossing must follow its slanted intersection',
    );
  }
  const shifted = findNacreWaterCrossings({
    ...track,
    waterY: track.waterY + 12,
  });
  assert.equal(shifted.length, 2);
  assert.ok(Math.abs(shifted[0].distance - crossings[0].distance) > 10);
  assert.ok(
    shifted.every((crossing) =>
      crossing.points.every((point) => Math.abs(point.position.y - 12) < 1e-5),
    ),
  );
});

test('Nacre swept craft crossing emits once at the actual sea intersection, freezes on pause and expires in simulation time', () => {
  const environment = createNacreEnvironment(track);
  const scene = new T.Scene();
  const quaternion = new T.Quaternion();
  const camera = new T.Vector3(0, 5, -12);
  const tick = (y, z, time, mode = 'racing', reset = false, settings = {}) => {
    environment.userData.updateVehicle({
      position: new T.Vector3(0, y, z),
      quaternion,
      speed: 100,
      time,
      mode,
      reset,
    });
    environment.userData.updateScene(scene, camera, time, settings);
    return environment.userData.getWaterPresentation();
  };
  assert.equal(tick(1, 0, 10).eventCount, 0);
  const crossing = tick(-0.5, 10, 10.1);
  assert.equal(crossing.eventCount, 1);
  assert.equal(crossing.activeSplashCount, 1);
  assert.equal(crossing.activeSprayCount, 1);
  assert.equal(crossing.lastCrossing.direction, 'entry');
  assert.equal(crossing.lastCrossing.position[1], track.waterY);
  assert.ok(Math.abs(crossing.lastCrossing.position[2] - 20 / 3) < 1e-8);
  assert.ok(Math.abs(crossing.lastCrossing.time - (10 + 1 / 15)) < 1e-8);
  const paused = tick(-0.5, 10, 10.1, 'paused');
  for (let i = 0; i < 10; i++)
    assert.deepEqual(tick(-0.5, 10, 10.1, 'paused'), paused);
  assert.equal(tick(-2, 20, 10.2).eventCount, 1);
  for (let i = 3; i <= 20; i++) tick(-2, 20 + i * 5, 10 + i * 0.1);
  const expired = environment.userData.getWaterPresentation();
  assert.equal(expired.activeSplashCount, 0);
  assert.equal(expired.eventCount, 1);
  environment.userData.dispose();
});

test('Nacre reset, navigation, discontinuity and nonadvancing clocks never create false crossing splashes', () => {
  const environment = createNacreEnvironment(track);
  const quaternion = new T.Quaternion();
  const camera = new T.Vector3(0, 5, 0);
  const tick = (y, z, time, mode = 'racing', reset = false) => {
    environment.userData.updateVehicle({
      position: new T.Vector3(0, y, z),
      quaternion,
      speed: 100,
      time,
      mode,
      reset,
    });
    environment.userData.update(camera, time);
    return environment.userData.getWaterPresentation();
  };
  tick(1, 0, 1, 'racing', true);
  assert.equal(tick(-1, 0, 1).eventCount, 0);
  assert.equal(tick(-1, 300, 1.02).eventCount, 0, 'Teleport must not emit');
  tick(1, 0, 2, 'racing', true);
  assert.equal(
    tick(-1, 1, 2.5).eventCount,
    0,
    'Long simulation discontinuity must not emit',
  );
  tick(1, 0, 4, 'racing', true);
  assert.equal(tick(-1, 1, 3.9).eventCount, 0, 'Backward time must not emit');
  tick(1, 0, 5, 'racing', true);
  assert.equal(tick(-1, 2, 5.05).eventCount, 1);
  const reset = tick(1, 0, 0, 'racing', true);
  assert.equal(reset.activeSplashCount, 0);
  assert.equal(reset.lastCrossing, null);
  tick(-1, 2, 0.05);
  assert.equal(tick(-1, 2, 0.05, 'overview').activeSplashCount, 0);
  assert.equal(tick(1, 2, 0.05, 'title').eventCount, 0);
  environment.userData.dispose();
});

test('Nacre high/low and reduced-motion crossings preserve the waterline and ripple while owning all pooled resources once', () => {
  const environment = createNacreEnvironment(track);
  const scene = new T.Scene();
  const camera = new T.Vector3(0, -1, -10),
    quaternion = new T.Quaternion();
  const tick = (y, time, settings) => {
    environment.userData.updateVehicle({
      position: new T.Vector3(0, y, time * 50),
      quaternion,
      speed: 100,
      time,
      mode: 'racing',
    });
    environment.userData.updateScene(scene, camera, time, settings);
    return environment.userData.getWaterPresentation();
  };
  tick(-1, 1, { quality: 'high' });
  let water = tick(1, 1.05, { quality: 'high' });
  assert.equal(water.lastCrossing.direction, 'exit');
  assert.equal(water.pointsPerSplash, 160);
  water = tick(1.2, 1.06, { quality: 'low', reducedMotion: true });
  assert.equal(water.eventCount, 1);
  assert.equal(water.activeSplashCount, 1);
  assert.equal(water.activeSprayCount, 0);
  assert.equal(water.pointsPerSplash, 80);
  assert.equal(water.waterlineShaderTime, 0);
  const crossingGroup = environment.children.find(
    (object) =>
      object.name ===
      'Nacre / physical waterline and craft crossing presentation',
  );
  assert.equal(
    crossingGroup.children.filter((object) => object.visible).length,
    2,
    'Visible waterline and restrained ripple remain',
  );
  environment.userData.setOverview(true);
  assert.equal(crossingGroup.visible, false);
  const resources = new Set();
  environment.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
  });
  const counts = new Map();
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      counts.set(resource, (counts.get(resource) ?? 0) + 1),
    );
  environment.userData.dispose();
  environment.userData.dispose();
  assert.ok([...resources].every((resource) => counts.get(resource) === 1));
  assert.equal(
    environment.userData.getWaterPresentation().activeSplashCount,
    0,
  );
});
