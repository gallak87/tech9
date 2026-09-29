import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLevel2Track, buildOrbitalTrack } from './index.js';
import { sweepGeometry } from '../geometry.js';

const track = createLevel2Track();

test('production orbital circuit has bounded geometry, no planet, and idempotent ownership cleanup', () => {
  const group = buildOrbitalTrack(track);
  let calls = 0;
  let triangles = 0;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  group.traverse((object) => {
    if (!object.isMesh) return;
    calls += 1;
    triangles +=
      ((object.geometry.index?.count ??
        object.geometry.attributes.position.count) /
        3) *
      (object.count ?? 1);
    assert.ok(
      Array.from(object.geometry.attributes.position.array).every(
        Number.isFinite,
      ),
    );
    assert.notEqual(
      object.geometry.type,
      'SphereGeometry',
      'Renderer owns the planet',
    );
    geometries.add(object.geometry);
    materials.add(object.material);
    for (const value of Object.values(object.material))
      if (value?.isTexture) textures.add(value);
  });
  assert.ok(calls <= 150, `${calls} source mesh draw calls`);
  assert.ok(triangles < 400000, `${triangles} source triangles`);
  let disposed = 0;
  const resources = [...geometries, ...materials, ...textures];
  for (const resource of resources)
    resource.addEventListener('dispose', () => disposed++);
  group.userData.dispose();
  group.userData.dispose();
  assert.equal(disposed, resources.length);
});

test('portal and underside beams remain outside the full swept driving and camera corridor', () => {
  const group = buildOrbitalTrack(track);
  const corridorGeometry = sweepGeometry(
    track,
    [
      [-14, 0],
      [14, 0],
      [14, 14],
      [-14, 14],
      [-14, 0],
    ],
    { step: 5 },
  );
  const corridorMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });
  const corridor = new THREE.Mesh(corridorGeometry, corridorMaterial);
  corridor.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const { from, to, radius } of group.userData.structuralSegments) {
    const direction = to.clone().sub(from).normalize();
    const across = new THREE.Vector3(1, 0, 0).addScaledVector(
      direction,
      -direction.x,
    );
    if (across.lengthSq() < 0.01)
      across.set(0, 0, 1).addScaledVector(direction, -direction.z);
    across.normalize();
    const up = new THREE.Vector3().crossVectors(direction, across).normalize();
    for (const [x, y] of [
      [0, 0],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      ray.set(
        from
          .clone()
          .addScaledVector(across, x * radius)
          .addScaledVector(up, y * radius),
        direction,
      );
      ray.far = from.distanceTo(to);
      assert.equal(
        ray.intersectObject(corridor).length,
        0,
        `Structural beam enters camera corridor near ${from.toArray()}`,
      );
    }
  }
  for (const distance of group.userData.portalDistances)
    assert.ok(
      Math.abs(track.sample(distance).bank) < Math.PI / 4,
      'No covered portal on the near-vertical wall ride',
    );
  corridorGeometry.dispose();
  corridorMaterial.dispose();
  group.userData.dispose();
});

test('practical light ownership changes only at zero intensity across the entire seam', () => {
  const group = buildOrbitalTrack(track);
  const lights = group.children.filter((object) => object.isSpotLight);
  assert.equal(lights.length, 3);
  group.userData.update(0);
  const previous = lights.map((light) => ({
    position: light.position.clone(),
    intensity: light.intensity,
  }));
  for (let distance = 0.25; distance < track.length + 0.5; distance += 0.25) {
    group.userData.update(distance);
    lights.forEach((light, index) => {
      assert.ok(Number.isFinite(light.intensity));
      if (light.position.distanceTo(previous[index].position) > 0.01) {
        assert.ok(
          previous[index].intensity < 0.001,
          'Outgoing fixture was still visibly lit',
        );
        assert.ok(light.intensity < 0.001, 'Incoming fixture begins dark');
      }
      previous[index].position.copy(light.position);
      previous[index].intensity = light.intensity;
    });
  }
  group.userData.dispose();
});

test('high-demand guidance precedes the docking apex and preserves the driving corridor', () => {
  const group = buildOrbitalTrack(track);
  const brake = group.userData.guidance.find(
    ({ kind }) => kind === 'brake-left',
  );
  assert.ok(
    (brake.hazardDistance - brake.distance) / 120 > 1.5,
    'Advance board is over1.5seconds before tightest corner even at120m/s',
  );
  assert.ok(
    track.sample(brake.hazardDistance).curvature > 0.01,
    'Docking turn requires driver-left input',
  );
  for (const board of group.userData.guidance)
    assert.ok(
      19.3 - board.width / 2 > 14.2,
      'Sign plates stay beyond the driving corridor',
    );
  assert.equal(
    group.userData.guidance.filter(({ kind }) => kind === 'left-chevron')
      .length,
    6,
  );
  for (const name of [
    'Folded titanium lower safety rail',
    'Open titanium upper rail',
    'Exposed triangulated underside frame',
  ]) {
    const material = group.children.find(
      (child) => child.name === name,
    ).material;
    assert.ok(material.roughness >= 0.7);
    assert.ok(material.metalness <= 0.3);
  }
  group.userData.dispose();
});
