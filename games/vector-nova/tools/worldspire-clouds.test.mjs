import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DataUtils,
  HalfFloatType,
  PerspectiveCamera,
  Texture,
  Vector3,
} from 'three';
import { createWorldspireTrack } from '../src/levels/worldspire/track/model.js';
import {
  createWorldspireClouds,
  createWorldspireCloudClearance,
  createWorldspireCloudNoise,
  createWorldspireCloudBody,
  createWorldspireCloudRootBody,
  createWorldspireCloudGradientVolume,
} from '../src/levels/worldspire/environment/clouds.js';

const track = createWorldspireTrack();

test('cloud exclusion protects the actual driving road and exported full flight envelopes', () => {
  const mask = createWorldspireCloudClearance(track);
  let roadSamples = 0,
    flightSamples = 0,
    worst = 0;
  for (let s = 0; s <= track.length; s += 11) {
    const f = track.sample(s);
    for (const lateral of [-track.width / 2, 0, track.width / 2]) {
      const p = f.position
        .clone()
        .addScaledVector(f.right, lateral)
        .addScaledVector(f.up, 12);
      worst = Math.max(worst, mask.sample(p));
      roadSamples++;
    }
  }
  const route = JSON.parse(
    readFileSync(
      new URL('../assets/levels/worldspire/route-source.json', import.meta.url),
    ),
  );
  assert.equal(
    route.geometryVersion,
    track.geometryVersion,
    'flight export must match the current route',
  );
  for (const corridor of route.flightCorridors)
    for (const col of corridor.columns) {
      const right = new Vector3(corridor.forward[2], 0, -corridor.forward[0]);
      for (const y of [col.minY, col.maxY])
        for (const side of [-1, 1]) {
          const p = new Vector3(col.p[0], y, col.p[2]).addScaledVector(
            right,
            side * corridor.lateralHalfWidth,
          );
          worst = Math.max(worst, mask.sample(p));
          flightSamples++;
        }
    }
  assert.ok(roadSamples > 1000 && flightSamples > 500);
  assert.ok(
    worst < 0.01,
    `cloud density leaked into the road/flight clearance: ${worst}`,
  );
  assert.equal(
    mask.sample(new Vector3(5800, track.spireHeight * 0.46, 0)),
    1,
    'distant cloud banks retain density',
  );
  assert.equal(
    mask.sample(new Vector3(0, -650, 0)),
    1,
    'the below-course cloud sea is not erased by the route exclusion volume',
  );
  mask.texture.dispose();
});

test('weather volume is seeded and genuinely three dimensional', () => {
  const a = createWorldspireCloudNoise(16, 1),
    b = createWorldspireCloudNoise(16, 1),
    c = createWorldspireCloudNoise(16, 2);
  assert.deepEqual(a.image.data, b.image.data);
  assert.notDeepEqual(a.image.data, c.image.data);
  assert.ok(new Set(a.image.data).size > 80);
  assert.notDeepEqual(
    a.image.data.slice(0, 512),
    a.image.data.slice(512, 1024),
  );
  [a, b, c].forEach((t) => t.dispose());
});

test('filtered smooth billows retain both clear pockets and dense cloud bodies', () => {
  const weather = createWorldspireCloudBody();
  try {
    const { data, width: size } = weather.image;
    // Long rays use coarse mip footprints. If this volume averages to a
    // narrow band near 0.5, every bounded bank becomes a smooth filled oval.
    let clear = 0,
      dense = 0,
      count = 0;
    const footprint = 8;
    for (let z = 0; z < size; z += footprint)
      for (let y = 0; y < size; y += footprint)
        for (let x = 0; x < size; x += footprint) {
          let coverage = 0;
          for (let k = 0; k < footprint; k++)
            for (let j = 0; j < footprint; j++)
              for (let i = 0; i < footprint; i++) {
                coverage += DataUtils.fromHalfFloat(
                  data[4 * (x + i + size * (y + j + size * (z + k)))],
                );
              }
          coverage /= footprint ** 3;
          if (coverage < 0.4) clear++;
          if (coverage > 0.6) dense++;
          count++;
        }
    assert.ok(
      clear / count > 0.2,
      'coarse weather must preserve actual empty pockets',
    );
    assert.ok(
      dense / count > 0.2,
      'coarse weather must preserve substantial lit bodies',
    );
  } finally {
    weather.dispose();
  }
});

test('body volume stores periodic, signed gradients without clipping its density into flat cores', () => {
  const body = createWorldspireCloudBody(),
    repeat = createWorldspireCloudBody(),
    other = createWorldspireCloudBody(48, 17);
  try {
    assert.equal(body.type, HalfFloatType);
    assert.equal(body.generateMipmaps, true);
    assert.deepEqual(body.image.data, repeat.image.data);
    assert.notDeepEqual(body.image.data, other.image.data);
    const { data, width: size } = body.image;
    const at = (x, y, z) =>
      4 *
      (((x + size) % size) +
        size * (((y + size) % size) + size * ((z + size) % size)));
    const value = (x, y, z) => DataUtils.fromHalfFloat(data[at(x, y, z)]);
    let maxError = 0,
      maxGradient = 0,
      minDensity = 1,
      maxDensity = 0;
    for (let z = 0; z < size; z++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const density = value(x, y, z);
          minDensity = Math.min(minDensity, density);
          maxDensity = Math.max(maxDensity, density);
          assert.ok(
            density >= 0 && density < 1,
            'smooth lobe union has no clamped full-density plateau',
          );
          const expected = [
            (value(x + 1, y, z) - value(x - 1, y, z)) * size * 0.5,
            (value(x, y + 1, z) - value(x, y - 1, z)) * size * 0.5,
            (value(x, y, z + 1) - value(x, y, z - 1)) * size * 0.5,
          ];
          for (let axis = 0; axis < 3; axis++) {
            const gradient = DataUtils.fromHalfFloat(
              data[at(x, y, z) + axis + 1],
            );
            assert.ok(Number.isFinite(gradient));
            maxError = Math.max(maxError, Math.abs(expected[axis] - gradient));
            maxGradient = Math.max(maxGradient, Math.abs(gradient));
          }
        }
    // Density and derivatives are quantized independently into binary16. The
    // tolerance covers that quantization, including the periodic seam texels.
    assert.ok(maxError < 0.025, `density/gradient mismatch: ${maxError}`);
    assert.ok(
      maxGradient > 4,
      'store raw gradients, not normalized normals that bias coarse mips',
    );
    assert.ok(minDensity < 0.01 && maxDensity > 0.9);
  } finally {
    body.dispose();
    repeat.dispose();
    other.dispose();
  }
});

test('root optical-density mips retain physical mass, dense billows, and clear pockets at Low footprints', () => {
  const root = createWorldspireCloudRootBody();
  try {
    const { data, width: size } = root.image;
    for (const value of data)
      assert.ok(Number.isFinite(DataUtils.fromHalfFloat(value)));
    const means = [];
    for (const footprint of [1, 4, 8]) {
      let total = 0,
        clear = 0,
        dense = 0,
        count = 0;
      for (let z = 0; z < size; z += footprint)
        for (let y = 0; y < size; y += footprint)
          for (let x = 0; x < size; x += footprint) {
            let extinction = 0;
            for (let k = 0; k < footprint; k++)
              for (let j = 0; j < footprint; j++)
                for (let i = 0; i < footprint; i++) {
                  const value = DataUtils.fromHalfFloat(
                    data[4 * (x + i + size * (y + j + size * (z + k)))],
                  );
                  assert.ok(value >= 0 && value <= 1);
                  extinction += value / footprint ** 3;
                }
            total += extinction;
            count++;
            if (extinction < 0.04) clear++;
            if (extinction > 0.35) dense++;
          }
      means.push(total / count);
      assert.ok(
        clear / count > 0.08,
        `root pockets disappear at ${footprint}-voxel footprints`,
      );
      assert.ok(
        dense / count > 0.25,
        `root lobes average away at ${footprint}-voxel footprints`,
      );
    }
    assert.ok(
      Math.max(...means) - Math.min(...means) < 1e-8,
      'mips average extinction without re-thresholding away optical mass',
    );
  } finally {
    root.dispose();
  }
});

test('signed density gradients point outward from a known sphere and transform correctly toward sunlight', () => {
  const size = 32,
    center = size / 2,
    density = new Float32Array(size ** 3);
  const at = (x, y, z) => x + size * (y + size * z);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        density[at(x, y, z)] = Math.exp(
          -((x - center) ** 2 + (y - center) ** 2 + (z - center) ** 2) / 32,
        );
      }
  const texture = createWorldspireCloudGradientVolume(density, size),
    clouds = createWorldspireClouds({ track });
  try {
    const gradient = (x, y, z) =>
      new Vector3(
        ...[1, 2, 3].map((c) =>
          DataUtils.fromHalfFloat(texture.image.data[at(x, y, z) * 4 + c]),
        ),
      );
    assert.equal(
      gradient(center, center, center).length(),
      0,
      'the density maximum has no arbitrary normal',
    );
    for (const direction of [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, -1, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
    ]) {
      const p = direction.clone().multiplyScalar(5).addScalar(center);
      const outward = gradient(p.x, p.y, p.z).negate().normalize();
      assert.ok(
        outward.dot(direction) > 0.999,
        'outward means negative density gradient',
      );
    }
    const frame = clouds.uniforms.bodyFrame.value,
      transpose = frame.clone().transpose();
    const sample = (p) =>
      Math.exp(-p.clone().applyMatrix3(frame).lengthSq() * 0.5);
    const p = new Vector3(0.4, 0.8, -0.3),
      bodyPosition = p.clone().applyMatrix3(frame);
    const analytic = bodyPosition
      .multiplyScalar(-sample(p))
      .applyMatrix3(transpose);
    const finite = new Vector3();
    for (let axis = 0; axis < 3; axis++) {
      const a = p.clone(),
        b = p.clone();
      a.setComponent(axis, a.getComponent(axis) + 1e-4);
      b.setComponent(axis, b.getComponent(axis) - 1e-4);
      finite.setComponent(axis, (sample(a) - sample(b)) / 2e-4);
    }
    assert.ok(
      analytic.distanceTo(finite) < 1e-8,
      'world gradient requires the transform transpose',
    );
    const top = new Vector3(0, 0.8, 0)
      .applyMatrix3(frame)
      .applyMatrix3(transpose)
      .normalize();
    assert.ok(
      top.dot(clouds.uniforms.sunDirection.value) > 0.3,
      'upper lobe faces the sun',
    );
    assert.ok(
      top.negate().dot(clouds.uniforms.sunDirection.value) < -0.3,
      'lower lobe faces away from the sun',
    );
  } finally {
    texture.dispose();
    clouds.dispose();
  }
});

test('root directional light preserves mean energy while distinguishing exposed and shielded lobes', () => {
  const clouds = createWorldspireClouds({ track });
  try {
    const response = clouds.uniforms.rootLightResponse.value;
    const incident = (mu) =>
      Math.max(0, Math.min(1, (mu + response.x) / (1 + response.x)));
    const light = (mu) => response.y + response.z * incident(mu);
    // Equal-area sphere strips are uniform in cosine. Numerically compare
    // integrated energy to the broad wrapped reference, independently of the
    // analytic gain calculation used by production.
    const strips = 10000;
    let energy = 0,
      broadEnergy = 0,
      previous = light(-1);
    for (let i = 0; i < strips; i++) {
      const mu = -1 + (2 * (i + 0.5)) / strips,
        value = light(mu);
      assert.ok(
        Number.isFinite(value) && value >= previous,
        'turning toward sunlight must never darken a lobe',
      );
      previous = value;
      energy += value / strips;
      broadEnergy +=
        (0.15 + 1.05 * Math.max(0, Math.min(1, (mu + 0.25) / 1.25)) ** 0.7) /
        strips;
    }
    assert.ok(
      Math.abs(energy - broadEnergy) < 1e-6,
      'directional contrast must not become a global exposure change',
    );
    assert.ok(
      light(1) > 1.6 && light(-1) < 0.1,
      'warm exposed lobes remain distinct from shielded interiors',
    );
    assert.ok(
      incident(0) < 0.1,
      'side-facing fill should not inherit full warm sunlight',
    );
  } finally {
    clouds.dispose();
  }
});

test('column weather warp is contractive and cannot fold its horizontal coordinates', () => {
  const clouds = createWorldspireClouds({ track });
  try {
    const { data, width: size } = clouds.uniforms.weather.value.image;
    const coefficient = clouds.uniforms.weatherWarp.value / 3100;
    const at = (x, y, z, c) =>
      4 * ((x % size) + size * ((y % size) + size * (z % size))) + c;
    let lipschitzBound = 0;
    for (let z = 0; z < size; z++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          for (const channel of [2, 3]) {
            let dx = 0,
              dz = 0;
            // Each derivative of trilinear interpolation is a convex combination
            // of these four edge differences. Bound both rows of the XZ Jacobian.
            for (let j = 0; j < 2; j++)
              for (let k = 0; k < 2; k++) {
                dx = Math.max(
                  dx,
                  Math.abs(
                    data[at(x + 1, y + j, z + k, channel)] -
                      data[at(x, y + j, z + k, channel)],
                  ),
                );
                dz = Math.max(
                  dz,
                  Math.abs(
                    data[at(x + k, y + j, z + 1, channel)] -
                      data[at(x + k, y + j, z, channel)],
                  ),
                );
              }
            lipschitzBound = Math.max(
              lipschitzBound,
              (((dx + dz) * size) / 255) * coefficient,
            );
          }
    assert.ok(
      lipschitzBound < 0.8,
      `column warp can fold or amplify creases: ${lipschitzBound}`,
    );
  } finally {
    clouds.dispose();
  }
});

test('cloud pass owns its targets, borrows depth, and preserves timing and quality identity', () => {
  const clouds = createWorldspireClouds({
    track,
    camera: new PerspectiveCamera(55, 1.6, 0.1, 26000),
    settings: { quality: 'high' },
  });
  // The pass orders complete altitude groups along the ray. Larger weather
  // fronts must retain separated vertical bounds or that order becomes wrong.
  assert.equal(clouds.uniforms.steps.value, 24);
  assert.equal(clouds.group.userData.cloudStepBudget, 72);
  const centers = clouds.uniforms.bankCenters.value,
    radii = clouds.uniforms.bankRadii.value;
  const rootBodyScale = clouds.uniforms.rootBodyScale.value;
  assert.ok(
    rootBodyScale / 3 >= 500 && rootBodyScale / 3 / 0.62 <= 900,
    'root billow spacing must stay readable at the fixed ray budget',
  );
  const deck = clouds.uniforms.rootDeckBounds.value;
  assert.ok(
    deck.x < -650 && deck.y > -650,
    'the root sea occupies the below-course base altitude',
  );
  assert.ok(
    deck.y < track.bounds.min.y - 100,
    'the entire root deck stays beneath the road before applying its clearance mask',
  );
  for (let i = 0; i < 2; i++) {
    assert.ok(
      deck.x <= centers[i].y - 0.64 * radii[i].y,
      'vertical ray clipping must include the lowest possible cloud base',
    );
  }
  for (let layer = 0; layer < 2; layer++) {
    const upper = Math.max(
      ...[0, 1].map(
        (i) => centers[layer * 2 + i].y + radii[layer * 2 + i].y * 1.4,
      ),
    );
    const lower = Math.min(
      ...[0, 1].map(
        (i) => centers[layer * 2 + 2 + i].y - radii[layer * 2 + 2 + i].y * 1.4,
      ),
    );
    assert.ok(
      upper < lower,
      'cloud bounds must preserve correct front-to-back layer ordering',
    );
  }
  const depth = new Texture();
  let borrowedDisposed = false,
    ownedDisposed = 0;
  depth.addEventListener('dispose', () => {
    borrowedDisposed = true;
  });
  clouds.uniforms.weather.value.addEventListener(
    'dispose',
    () => ownedDisposed++,
  );
  clouds.uniforms.bodyField.value.addEventListener(
    'dispose',
    () => ownedDisposed++,
  );
  clouds.uniforms.rootBodyField.value.addEventListener(
    'dispose',
    () => ownedDisposed++,
  );
  clouds.uniforms.clearance.value.addEventListener(
    'dispose',
    () => ownedDisposed++,
  );
  clouds.pass.setSceneDepth(depth);
  assert.equal(clouds.pass.needsSwap, true);
  assert.equal(
    clouds.pass.composite.uniforms.sceneDepth,
    undefined,
    'composite must not sample the beauty depth attachment while writing composer buffers',
  );
  assert.equal(
    clouds.pass.composite.uniforms.volumeDepth.value,
    clouds.pass.target.textures[1],
  );
  clouds.pass.setSize(1440, 900);
  assert.deepEqual(
    [clouds.pass.target.width, clouds.pass.target.height],
    [720, 450],
  );
  clouds.update({ mode: 'racing', time: 0, reset: true });
  clouds.update({ mode: 'racing', time: 1 });
  assert.equal(clouds.group.userData.cloudTime, 1);
  clouds.update({ mode: 'paused', time: 1 });
  assert.equal(clouds.group.userData.cloudTime, 1);
  clouds.update({ mode: 'racing', time: 2, settings: { reducedMotion: true } });
  assert.equal(clouds.group.userData.cloudTime, 1);
  clouds.update({
    mode: 'racing',
    time: 3,
    settings: { reducedMotion: false, quality: 'low' },
  });
  assert.equal(clouds.group.userData.cloudTime, 2);
  assert.equal(clouds.uniforms.steps.value, 16);
  assert.equal(clouds.group.userData.cloudStepBudget, 48);
  assert.equal(
    clouds.uniforms.rootBodyScale.value,
    rootBodyScale,
    'Low changes sampling, not the root cloud formation',
  );
  assert.deepEqual(
    [clouds.pass.target.width, clouds.pass.target.height],
    [504, 315],
  );
  clouds.update({ mode: 'racing', time: 0, reset: true });
  assert.equal(clouds.group.userData.cloudTime, 0);
  const draws = [],
    renderer = {
      setRenderTarget: (target) => draws.push({ target }),
      render: () => draws.push({ draw: true }),
    };
  const write = { texture: new Texture() },
    read = { texture: new Texture() };
  clouds.pass.prepareSceneDepth(renderer, depth);
  clouds.pass.render(renderer, write, read);
  assert.deepEqual(
    draws.map((d) =>
      d.draw
        ? 'draw'
        : d.target === clouds.pass.target
          ? 'own-target'
          : d.target === write
            ? 'composer-write'
            : 'other',
    ),
    ['own-target', 'draw', 'composer-write', 'draw'],
  );
  clouds.dispose();
  clouds.dispose();
  assert.equal(ownedDisposed, 4);
  assert.equal(borrowedDisposed, false);
  depth.dispose();
  read.texture.dispose();
  write.texture.dispose();
});

test('weather-shaped lower shoulders stay inside conservative, ordered vertical intervals', () => {
  const clouds = createWorldspireClouds({ track });
  try {
    const u = clouds.uniforms,
      shape = u.lowerShoulder.value;
    assert.ok(
      u.lowerFade.value > 0.3,
      'the visible lower boundary must be a broad shoulder, not a narrow shelf',
    );
    // All extrema of the shader's affine weather/slope expression occur at
    // these corners; this tests every possible field value, not one seed.
    for (let bank = 2; bank < 6; bank++) {
      const center = u.bankCenters.value[bank],
        radius = u.bankRadii.value[bank],
        bounds = u.bankYBounds.value[bank];
      for (const b of [0, 1])
        for (const a of [0, 1])
          for (const wind of [-1, 1]) {
            const base =
              shape.x +
              (b - 0.5) * shape.y +
              (a - 0.5) * shape.z +
              wind * shape.w;
            assert.ok(
              bounds.x <= center.y + radius.y * base + 1e-9,
              'interval clipping must never remove an occupied lower shoulder',
            );
          }
      assert.ok(
        bounds.y >= center.y + radius.y * 1.34,
        'interval must include the highest possible tower fade',
      );
    }
    for (let band = 0; band < 2; band++) {
      const upper = Math.max(
        ...u.bankYBounds.value.slice(band * 2, band * 2 + 2).map((b) => b.y),
      );
      const lower = Math.min(
        ...u.bankYBounds.value
          .slice(band * 2 + 2, band * 2 + 4)
          .map((b) => b.x),
      );
      assert.ok(
        upper < lower,
        'broader shoulders must preserve front-to-back ordering between strata',
      );
    }
  } finally {
    clouds.dispose();
  }
});

test('clouds carry title phase through countdown and green, then freeze and reset deterministically', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const clouds = createWorldspireClouds({ track });
  const close = (expected) =>
    assert.ok(
      Math.abs(clouds.group.userData.cloudTime - expected) < 1e-10,
      `${clouds.group.userData.cloudTime} != ${expected}`,
    );
  try {
    clouds.update({ mode: 'title', time: 0, reset: true });
    now = 80;
    clouds.update({ mode: 'title', time: 0 });
    close(0.08);
    now = 100;
    clouds.update({ mode: 'countdown', time: 0, reset: true });
    close(0.08);
    now = 180;
    clouds.update({ mode: 'countdown', time: 0 });
    close(0.16);
    clouds.update({ mode: 'racing', time: 0.02 });
    close(0.18);
    now = 9000;
    clouds.update({ mode: 'paused', time: 0.02 });
    close(0.18);
    now = 12000;
    clouds.update({ mode: 'fly', time: 0.02 });
    close(0.18);
    clouds.update({
      mode: 'racing',
      time: 0.12,
      settings: { reducedMotion: true },
    });
    close(0.18);
    clouds.update({
      mode: 'racing',
      time: 0.22,
      settings: { reducedMotion: false },
    });
    close(0.28);
    clouds.update({ mode: 'countdown', time: 0, reset: true });
    close(0);
    now = 12080;
    clouds.update({ mode: 'countdown', time: 0 });
    close(0.08);
    clouds.update({ mode: 'racing', time: 0, reset: true });
    close(0);
    clouds.update({ mode: 'racing', time: 0.1 });
    close(0.1);
    clouds.update({ mode: 'racing', time: 0 });
    close(0);
  } finally {
    clouds.dispose();
  }
});
