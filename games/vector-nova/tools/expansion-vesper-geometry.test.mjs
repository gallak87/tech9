import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, ShaderLib, Texture, Vector3 } from 'three';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import { createVesperRoad } from '../src/levels/vesper/track/road.js';
import { sampleVesperSurface } from '../src/levels/vesper/surface.js';
import {
  createVehicleState,
  stepVehicle,
  STEERING_ASSIST,
} from '../src/physics/index.js';
import { assertTrackContract } from './level-checks/track-contract.mjs';

const track = createVesperTrack();
const DT = 1 / 120;
const idle = { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false };
const point = (attribute, index) =>
  new Vector3().fromBufferAttribute(attribute, index);

// These are CPU geometry/simulation checks, not a visual or real-input grade.
test('Vesper wraps metre frames continuously and the hollow has a rising full turn', (t) => {
  const result = assertTrackContract(track, { step: 0.5 });
  const hollow = track.landmarks.hollow;
  let winding = 0;
  let previous;
  let lastHeight = -Infinity;
  for (let s = hollow.spiralStart; s <= hollow.spiralEnd; s += 2) {
    const p = track.sample(s).position;
    const angle = Math.atan2(p.z - hollow.center[2], p.x - hollow.center[0]);
    if (previous !== undefined)
      winding += Math.atan2(
        Math.sin(angle - previous),
        Math.cos(angle - previous),
      );
    assert.ok(p.y > lastHeight, `hollow doubles back vertically at ${s}`);
    lastHeight = p.y;
    previous = angle;
  }
  assert.ok(
    Math.abs(winding) > Math.PI * 2,
    'the hollow contains a full spiral',
  );
  const climb =
    track.sample(hollow.spiralEnd).position.y -
    track.sample(hollow.spiralStart).position.y;
  assert.ok(climb > 85, 'the winding is a substantial ascent');
  t.diagnostic(
    JSON.stringify({ ...result, spiralTurns: winding / (2 * Math.PI), climb }),
  );
});

test('nonadjacent roadway envelopes and hollow crossing headroom stay separated', (t) => {
  const frames = [];
  for (let s = 0; s < track.length; s += 4)
    frames.push({ s, ...track.sample(s) });
  let minimumDistance = Infinity;
  let crossingHeadroom = Infinity;
  let crossings = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const a = frames[i];
    for (let j = i + 1; j < frames.length; j += 1) {
      const b = frames[j];
      const along = Math.min(b.s - a.s, track.length - b.s + a.s);
      if (along < 90) continue;
      const separation = a.position.distanceTo(b.position);
      minimumDistance = Math.min(minimumDistance, separation);
      // Each road cross-section fits in a 20m sphere including its underside
      // and 10m driving/camera headroom. Extra 4m covers sample spacing.
      assert.ok(
        separation > 44,
        `nonadjacent envelopes overlap at ${a.s}/${b.s}`,
      );
      if (
        Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >
        36
      )
        continue;
      const [low, high] = a.position.y < b.position.y ? [a, b] : [b, a];
      const lowRoof =
        low.position.y + 14 * Math.abs(low.right.y) + 10 * Math.abs(low.up.y);
      const highFloor =
        high.position.y -
        14 * Math.abs(high.right.y) -
        4.2 * Math.abs(high.up.y);
      const clearance = highFloor - lowRoof;
      assert.ok(
        clearance > 20,
        `crossing headroom fails at ${a.s}/${b.s}: ${clearance}`,
      );
      crossingHeadroom = Math.min(crossingHeadroom, clearance);
      crossings += 1;
    }
  }
  assert.ok(
    crossings > 100,
    'the check must actually sample projected spiral crossings',
  );
  t.diagnostic(
    JSON.stringify({ minimumDistance, crossingHeadroom, crossings }),
  );
});

test('rendered driving triangles preserve 28m width and leave actual jump apertures', (t) => {
  const road = createVesperRoad({ track, shape: false });
  try {
    const surfaces = road.group.children.filter(
      (mesh) => mesh.userData.drivingSurface,
    );
    assert.ok(surfaces.length > 7);
    let fullRows = 0;
    let branchRows = 0;
    let measuredLength = 0;
    for (const mesh of surfaces) {
      const p = mesh.geometry.attributes.position;
      const uv = mesh.geometry.attributes.uv;
      assert.equal(p.count % 2, 0);
      for (let i = 0; i < p.count; i += 2) {
        const s = uv.getY(i) * 16;
        const f = track.sample(s);
        const a = point(p, i).sub(f.position);
        const b = point(p, i + 1).sub(f.position);
        const width = point(p, i).distanceTo(point(p, i + 1));
        assert.ok(Math.abs(a.dot(f.up)) < 0.001);
        assert.ok(Math.abs(b.dot(f.up)) < 0.001);
        assert.ok(Math.abs(a.dot(f.right) + 14) < 0.001);
        // Inspect the actual endpoints, including open edges at the takeoff
        // and receiving seams; nearby full-width strips share those seams.
        if (Math.abs(width - 19.5) < 0.001) {
          assert.ok(Math.abs(b.dot(f.right) - 5.5) < 0.001);
          branchRows += 1;
        } else {
          assert.ok(Math.abs(width - 28) < 0.001, `width ${width} at ${s}`);
          fullRows += 1;
        }
      }
      const indices = mesh.geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
        const distances = ids.map((id) => uv.getY(id) * 16);
        const s = distances.reduce((sum, x) => sum + x, 0) / 3;
        const f = track.sample(s);
        const center = ids
          .reduce((sum, id) => sum.add(point(p, id)), new Vector3())
          .multiplyScalar(1 / 3);
        const lateral = center.sub(f.position).dot(f.right);
        assert.equal(
          track.isGap(s, lateral),
          false,
          `triangle bridges gap at ${s}/${lateral}`,
        );
        for (const jump of track.jumps) {
          if (jump.optional) continue;
          assert.ok(
            Math.max(...distances) <= jump.takeoff + 0.001 ||
              Math.min(...distances) >= jump.landingStart - 0.001,
            `triangle straddles crown aperture at ${s}`,
          );
        }
      }
      measuredLength += (uv.getY(uv.count - 1) - uv.getY(0)) * 16;
    }
    const requiredGap = track.jumps
      .filter((jump) => !jump.optional)
      .reduce((sum, jump) => sum + jump.landingStart - jump.takeoff, 0);
    assert.ok(
      Math.abs(measuredLength - (track.length - requiredGap)) < 0.01,
      'surface spans cover the grounded lap exactly once',
    );
    assert.ok(fullRows > 1400 && branchRows > 10);
    t.diagnostic(JSON.stringify({ fullRows, branchRows, measuredLength }));
  } finally {
    road.dispose();
    assert.equal(road.group.children.length, 0);
  }
});

test('every visible sap triangle occupies a real sap response zone and resin has precise boundaries', (t) => {
  const road = createVesperRoad({ track, shape: false });
  let triangles = 0;
  try {
    const films = road.group.children.filter((mesh) => mesh.userData.sapFilm);
    assert.ok(films.length >= track.sapZones.length * 2);
    for (const mesh of films) {
      const p = mesh.geometry.attributes.position;
      const uv = mesh.geometry.attributes.uv;
      const indices = mesh.geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
        const distance = ids.reduce((sum, id) => sum + uv.getY(id) * 16, 0) / 3;
        const frame = track.sample(distance);
        const position = ids
          .reduce((sum, id) => sum.add(point(p, id)), new Vector3())
          .multiplyScalar(1 / 3);
        const lateral = position.sub(frame.position).dot(frame.right);
        assert.equal(
          sampleVesperSurface(track, { distance, lateral }).id,
          'sap',
        );
        assert.equal(track.isGap(distance, lateral), false);
        triangles += 1;
      }
    }
    for (const zone of track.sapZones) {
      const middle = (zone.start + zone.end) / 2;
      for (const lap of [-2, 0, 2]) {
        const distance = middle + track.length * lap;
        for (const side of [-1, 1]) {
          const edge = zone.resinCenter + side * zone.resinHalfWidth;
          assert.equal(
            sampleVesperSurface(track, {
              distance,
              lateral: edge - side * 1e-8,
            }).id,
            'resin',
          );
          assert.equal(
            sampleVesperSurface(track, {
              distance,
              lateral: edge + side * 1e-8,
            }).id,
            'sap',
          );
        }
      }
      const lateral = zone.resinCenter + zone.resinHalfWidth + 1;
      assert.equal(
        sampleVesperSurface(track, { distance: zone.start - 1e-8, lateral }).id,
        'resin',
      );
      assert.equal(
        sampleVesperSurface(track, { distance: zone.start + 1e-8, lateral }).id,
        'sap',
      );
      assert.equal(
        sampleVesperSurface(track, { distance: zone.end - 1e-8, lateral }).id,
        'sap',
      );
      assert.equal(
        sampleVesperSurface(track, { distance: zone.end + 1e-8, lateral }).id,
        'resin',
      );
    }
    assert.ok(triangles > 300);
    t.diagnostic(
      `Measured ${triangles} sap triangles against the surface sampler.`,
    );
  } finally {
    road.dispose();
  }
});

test('each jump transfer crosses exactly its landing checkpoint and has a receiving shelf', () => {
  for (const jump of track.jumps) {
    assert.ok(
      jump.takeoff < jump.landingStart &&
        jump.landingStart < jump.landingEnd &&
        jump.landingEnd <= jump.recovery,
    );
    const crossed = track.checkpoints.filter(
      ({ distance }) => distance > jump.takeoff && distance <= jump.recovery,
    );
    assert.equal(crossed.length, 1);
    assert.equal(crossed[0].distance, jump.landingStart);
    assert.ok(jump.landingEnd - jump.landingStart > 90);
    for (let s = jump.landingStart + 1; s <= jump.recovery; s += 2)
      for (const lateral of [-11, 0, 11])
        assert.equal(track.isGap(s, lateral), false);
  }
});

test('all grounded slopes hold still with ordinary 0.3 assistance and zero throttle', () => {
  assert.equal(STEERING_ASSIST, 0.3);
  for (let distance = 0; distance < track.length; distance += 53) {
    if (track.isGap(distance)) continue;
    for (const steer of [-1, 0, 1]) {
      const state = { ...createVehicleState(), distance };
      for (let i = 0; i < 120; i += 1)
        stepVehicle(state, { ...idle, steer }, track, DT);
      assert.equal(state.distance, distance);
      assert.equal(state.speed, 0);
      assert.equal(state.lateral, 0);
      assert.equal(state.lateralSpeed, 0);
    }
  }
});

test('bounded steering inputs traverse hollow and Rootfall under the unmodified magnetic model', (t) => {
  const segments = [
    ['hollow', track.landmarks.hollow.entry, track.landmarks.hollow.exit],
    [
      'rootfall',
      track.sections.find(({ id }) => id === 'rootfall').start,
      track.sections.find(({ id }) => id === 'rootfall').end,
    ],
  ];
  for (const [name, start, end] of segments) {
    const state = { ...createVehicleState(), distance: start, speed: 38 };
    let maxLateral = 0;
    let ticks = 0;
    let impacts = 0;
    while (state.distance < end && ticks < 5000) {
      const frame = track.sample(state.distance);
      const desiredHeading =
        Math.asin(
          Math.max(
            -0.5,
            Math.min(0.5, (frame.curvature * state.speed * 0.75) / 7.2),
          ),
        ) -
        state.lateral * 0.02;
      const steer = Math.max(
        -1,
        Math.min(
          1,
          -(
            frame.curvature * state.speed * 0.7 +
            (desiredHeading - state.heading) * 2.5
          ) / 1.05,
        ),
      );
      const events = stepVehicle(
        state,
        {
          ...idle,
          throttle: state.speed < 40 ? 1 : 0,
          brake: state.speed > 43 ? 0.3 : 0,
          steer,
        },
        track,
        DT,
      );
      impacts += events.filter(({ type }) => type === 'impact').length;
      maxLateral = Math.max(maxLateral, Math.abs(state.lateral));
      ticks += 1;
    }
    assert.ok(state.distance >= end, `${name} failed to complete`);
    assert.equal(impacts, 0);
    assert.ok(maxLateral < 2);
    t.diagnostic(
      JSON.stringify({ name, seconds: ticks * DT, maxLateral, impacts }),
    );
  }
});

test('plain low curbs retain their boundary and clear the nonlocal ten-metre camera envelope', (t) => {
  const road = createVesperRoad({ track, shape: false });
  const cell = 24;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let s = 0; s < track.length; s += 2) {
    if (track.isGap(s, 0)) continue;
    const frame = { s, ...track.sample(s) };
    const coordinates = frame.position
      .toArray()
      .map((value) => Math.floor(value / cell));
    const id = key(...coordinates);
    if (!grid.has(id)) grid.set(id, []);
    grid.get(id).push(frame);
  }
  let barrierVertices = 0;
  let candidates = 0;
  let maxCurbHeight = 0;
  let glowVertices = 0;
  try {
    assert.equal(
      road.group.children.some((mesh) =>
        mesh.name.startsWith('Hooked petal family'),
      ),
      false,
    );
    assert.equal(
      road.group.children.filter(
        (mesh) => mesh.name === 'Jump edge sapwood beacon',
      ).length,
      0,
    );
    for (const mesh of road.group.children) {
      const positions = mesh.geometry?.attributes.position;
      const uv = mesh.geometry?.attributes.uv;
      if (!positions) continue;
      let barrier = mesh.name === 'Branch bypass main-road protective divider';
      if (!barrier && uv) {
        // Recognize the actual swept protective curb from its first profile
        // vertex. Other road surfaces, load roots and reinforcement are separate.
        const frame = track.sample(uv.getY(0) * 16);
        const first = point(positions, 0).sub(frame.position);
        barrier =
          Math.abs(first.dot(frame.up) - 1.2) < 0.002 &&
          Math.abs(first.dot(frame.right)) >= 13.999 &&
          Math.abs(first.dot(frame.right)) <= 15.501;
        const glow =
          Math.abs(first.dot(frame.up) - 0.12) < 0.002 &&
          Math.abs(first.dot(frame.right)) > 13.3 &&
          Math.abs(first.dot(frame.right)) < 13.7;
        if (glow) {
          assert.ok(mesh.material.emissiveIntensity > 1.5);
          for (let index = 0; index < positions.count; index += 1) {
            const own = track.sample(uv.getY(index) * 16);
            const delta = point(positions, index).sub(own.position);
            assert.ok(delta.dot(own.up) >= 0.019 && delta.dot(own.up) <= 0.121);
            assert.ok(
              Math.abs(Math.abs(delta.dot(own.right)) - 13.48) <= 0.116,
            );
            glowVertices += 1;
          }
        }
      }
      if (!barrier) continue;
      for (let index = 0; index < positions.count; index += 1) {
        barrierVertices += 1;
        const own = track.sample(uv.getY(index) * 16);
        const height = point(positions, index).sub(own.position).dot(own.up);
        maxCurbHeight = Math.max(maxCurbHeight, height);
        assert.ok(
          height >= -0.001 && height <= 1.201,
          `raised curb at ${uv.getY(index) * 16}: ${height}`,
        );
        const vertex = point(positions, index);
        const coordinates = vertex
          .toArray()
          .map((value) => Math.floor(value / cell));
        for (let x = -1; x <= 1; x += 1)
          for (let y = -1; y <= 1; y += 1)
            for (let z = -1; z <= 1; z += 1) {
              const frames =
                grid.get(
                  key(
                    coordinates[0] + x,
                    coordinates[1] + y,
                    coordinates[2] + z,
                  ),
                ) ?? [];
              for (const frame of frames) {
                candidates += 1;
                const delta = vertex.clone().sub(frame.position);
                if (Math.abs(delta.dot(frame.tangent)) > 1.1) continue;
                {
                  // Curbs and the split-deck divider deliberately touch their
                  // own road boundary. Their real sweep UV identifies that ring.
                  const along = Math.abs(frame.s - uv.getY(index) * 16);
                  if (Math.min(along, track.length - along) < 12) continue;
                }
                const height = delta.dot(frame.up);
                if (height <= 0.05 || height >= 10) continue;
                const lateral = delta.dot(frame.right);
                assert.ok(
                  Math.abs(lateral) >= 13.95,
                  `${mesh.name || 'Protective curb'} vertex ${index} intrudes at s=${frame.s}, lateral=${lateral}, height=${height}`,
                );
              }
            }
      }
    }
    assert.ok(barrierVertices > 10000 && glowVertices > 10000);
    assert.ok(candidates > 100000);
    assert.ok(maxCurbHeight > 1.19);
    t.diagnostic(
      JSON.stringify({
        glowVertices,
        barrierVertices,
        candidates,
        maxCurbHeight,
        frameSpacing: 2,
        testedHeight: [0.05, 10],
      }),
    );
  } finally {
    road.dispose();
  }
});

test('resin transmits through the actual deck stack and retains depth, quality and owned-resource lifecycle', (t) => {
  const road = createVesperRoad({ track, shape: false });
  const study = createVesperRoad({ track, shape: true });
  const probe = new Texture();
  let probeDisposals = 0;
  probe.addEventListener('dispose', () => probeDisposals++);
  const materials = new Set(road.group.children.map((mesh) => mesh.material));
  const geometries = new Set(road.group.children.map((mesh) => mesh.geometry));
  const disposals = new Map();
  for (const resource of [...materials, ...geometries]) {
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () =>
      disposals.set(resource, disposals.get(resource) + 1),
    );
  }
  try {
    const resin = [...materials].filter(
      (material) => material.transmission > 0,
    );
    assert.equal(resin.length, 3);
    const shaders = resin.map((material) => {
      // Feed the production hook the real Three physical shader, preserving
      // its transmission path alongside the local view-dependent inclusions.
      const shader = {
        uniforms: {},
        vertexShader: ShaderLib.physical.vertexShader,
        fragmentShader: ShaderLib.physical.fragmentShader,
      };
      material.onBeforeCompile(shader);
      assert.ok(
        shader.fragmentShader.includes('#include <transmission_fragment>'),
      );
      assert.ok(shader.fragmentShader.includes('vec3 interiorRay=refract('));
      assert.equal(material.transparent, false);
      assert.equal(material.opacity, 1);
      assert.equal(material.depthWrite, true);
      assert.ok(material.transmission >= 0.1 && material.transmission <= 0.25);
      assert.ok(
        material.attenuationColor.r > material.attenuationColor.g &&
          material.attenuationColor.g > material.attenuationColor.b,
      );
      return shader;
    });
    road.setReflection(probe);
    for (const material of resin) assert.equal(material.envMap, probe);
    road.update({
      time: 7.5,
      settings: { quality: 'low', reducedMotion: false },
    });
    for (const shader of shaders) {
      assert.equal(shader.uniforms.vesperResinLayers.value, 3);
      assert.equal(shader.uniforms.vesperSapTime.value, 7.5);
    }
    road.update({
      time: 9,
      settings: { quality: 'high', reducedMotion: true },
    });
    for (const shader of shaders) {
      assert.equal(shader.uniforms.vesperResinLayers.value, 6);
      assert.equal(shader.uniforms.vesperSapTime.value, 0);
    }
    assert.ok(
      study.group.children.every((mesh) => !(mesh.material.transmission > 0)),
    );
    road.group.updateMatrixWorld(true);
    const ray = new Raycaster();
    let checkedStacks = 0;
    let checkedLayers = 0;
    for (let s = 17; s < track.length; s += 37) {
      if (track.isGap(s, 0)) continue;
      const frame = track.sample(s);
      for (const lateral of [0, 5]) {
        ray.set(
          frame.position
            .clone()
            .addScaledVector(frame.right, lateral)
            .addScaledVector(frame.up, 3),
          frame.up.clone().negate(),
        );
        ray.far = 8;
        const hits = ray.intersectObjects(road.group.children, false);
        const surface = hits.find(
          ({ object }) => object.userData.drivingSurface,
        );
        if (!surface || !(surface.object.material.transmission > 0)) continue;
        // Opaque guides and sap are intentional. Everywhere else, an opaque
        // hidden layer would defeat a transmissive top by masking background.
        if (
          hits.some(
            ({ object }) =>
              object.name === 'Advance jump lane and landing guidance' ||
              object.userData.sapFilm ||
              object.name === 'Translucent reinforcement joints',
          )
        )
          continue;
        assert.ok(hits.length > 0);
        for (const { object } of hits) {
          assert.ok(
            object.material.transmission > 0,
            `opaque layer under resin at ${s}/${lateral}: ${object.name}`,
          );
          assert.ok(
            object.geometry.attributes.vesperResinActive,
            'transmitted resin retains its internal depth attributes',
          );
          checkedLayers += 1;
        }
        checkedStacks += 1;
      }
    }
    assert.ok(checkedStacks > 100 && checkedLayers > checkedStacks);
    t.diagnostic(
      JSON.stringify({
        checkedStacks,
        checkedLayers,
        meshes: road.group.children.length,
        resinMaterials: resin.length,
      }),
    );
  } finally {
    road.dispose();
    road.dispose();
    study.dispose();
    assert.equal(road.group.children.length, 0);
    for (const count of disposals.values()) assert.equal(count, 1);
    assert.equal(
      probeDisposals,
      0,
      'borrowed reflection texture remains renderer-owned',
    );
    probe.dispose();
  }
});
