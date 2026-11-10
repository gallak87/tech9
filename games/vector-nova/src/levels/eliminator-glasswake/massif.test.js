import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeEliminatorTrack } from './track/model.js';
import { createGlasswakePlacementPlan } from './scenery.js';
import { createFractureMassifPlan } from './massif.js';

async function load(path) {
  const bytes = await fs.readFile(new URL(path, import.meta.url));
  return (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene;
}

function inside(root, point) {
  const ray = new T.Raycaster(
    point,
    new T.Vector3(0.823, 0.371, 0.431).normalize(),
  );
  const hits = ray
    .intersectObject(root, true)
    .filter(
      (hit, i, all) =>
        hit.distance > 0.00001 &&
        (!i || Math.abs(hit.distance - all[i - 1].distance) > 0.00001),
    );
  return hits.length % 2 === 1;
}

function footContacts(template, matrix, terrain) {
  const feet = new Map(),
    ray = new T.Raycaster();
  for (const part of template.parts) {
    const positions = part.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const point = new T.Vector3().fromBufferAttribute(positions, i);
      if (Math.abs(point.y) < 0.000001)
        feet.set(
          point
            .toArray()
            .map((value) => value.toFixed(5))
            .join(','),
          point,
        );
    }
  }
  return [...feet.values()].map((native) => {
    const world = native.clone().applyMatrix4(matrix);
    const support = terrain.find(
      (part) => part.bounds.containsPoint(world) && inside(part.group, world),
    );
    assert.ok(
      support,
      'every actual exported foot vertex is inside closed placed geology',
    );
    ray.set(world, new T.Vector3(0, 1, 0));
    const surface = ray.intersectObject(support.group, true)[0]?.point;
    assert.ok(surface, 'actual supporting cap is above the embedded foot');
    return { world, surface, burial: surface.y - world.y };
  });
}

test('three unequal fault sectors have real founded feet, joined geology and exact whole-course clearance', async () => {
  const scenes = await Promise.all([
    load(
      '../../../public/assets/levels/glasswake/glasswake-environment-v5.glb',
    ),
    load('../../../public/assets/levels/eliminator-glasswake/fault-massif.glb'),
  ]);
  const geometries = new Set(),
    materials = new Set();
  try {
    const templates = new Map();
    for (const scene of scenes) {
      scene.updateMatrixWorld(true);
      for (const root of scene.children) {
        const parts = [];
        root.traverse((object) => {
          if (!object.isMesh) return;
          geometries.add(object.geometry);
          for (const material of [object.material].flat()) {
            material.side = T.DoubleSide;
            materials.add(material);
          }
          const geometry = object.geometry
            .clone()
            .applyMatrix4(object.matrixWorld);
          geometries.add(geometry);
          parts.push({ geometry, material: object.material });
        });
        templates.set(root.name, {
          parts,
          bounds: new T.Box3().setFromObject(root),
        });
      }
    }
    const track = createGlasswakeEliminatorTrack(),
      original = createGlasswakePlacementPlan(track, templates);
    const plan = createFractureMassifPlan(track, templates);
    const extraMatrices = new Set(
      plan.foundationPlacements.map((part) => part.matrix.elements.join(',')),
    );
    const foundations = original.placements.filter(
      (part) =>
        part.kind === 'foundation' &&
        !extraMatrices.has(part.matrix.elements.join(',')),
    );
    assert.equal(
      plan.placements.length,
      6,
      'three massifs each with a joined lower source shoulder',
    );
    assert.equal(
      plan.foundationPlacements.length,
      3,
      'three overlapping canonical foundation extensions',
    );
    const boundsOnly = new Map(
      [...templates].map(([name, template]) => [
        name,
        { bounds: template.bounds },
      ]),
    );
    const cheapPlan = createFractureMassifPlan(track, boundsOnly);
    assert.deepEqual(
      cheapPlan.placement.matrix.elements,
      plan.placement.matrix.elements,
      'runtime placement needs only baked bounds, not source vertices or diagnostics',
    );
    assert.ok(plan.placement.matrix.elements.every(Number.isFinite));
    assert.ok(plan.placement.matrix.determinant() > 0);
    assert.ok(
      Math.abs(plan.foundationPlacements[0].bounds.max.y + 130) < 0.000001,
    );
    // Saved production-view diagnostics belong in this test, never readiness.
    const manifest = JSON.parse(
      await fs.readFile(
        new URL(
          '../../../assets/levels/eliminator-glasswake/fault-massif-manifest.json',
          import.meta.url,
        ),
      ),
    );
    const opening = manifest.geometry.features.obliqueUndercut;
    assert.ok(opening.sharedRimVertices > 100);
    const nativeMouth = new T.Vector3(...opening.mouthReference);
    const mouth = nativeMouth.clone().applyMatrix4(plan.placement.matrix);
    const camera = new T.PerspectiveCamera(67.68789808917198, 1.6, 0.1, 60000);
    camera.position.set(
      1026.9781379825654,
      283.4042632111517,
      705.9713064915525,
    );
    camera.quaternion.set(
      -0.1759128047942395,
      -0.33951906490376327,
      0.01874212457168065,
      0.9238128719837355,
    );
    camera.updateMatrixWorld(true);
    const mouthNDC = mouth.clone().project(camera);
    assert.ok(Math.abs(mouthNDC.x) < 0.9 && Math.abs(mouthNDC.y) < 0.9);
    const facing = new T.Vector3(-1, 0, 0)
      .transformDirection(plan.placement.matrix)
      .dot(camera.position.clone().sub(mouth).normalize());
    assert.ok(facing > 0.95, 'actual mouth faces the saved approach');
    const recessRay = new T.Raycaster(
      nativeMouth.clone().add(new T.Vector3(-300, 0, 0)),
      new T.Vector3(1, 0, 0),
    );
    const recessHits = recessRay
      .intersectObject(scenes[1], true)
      .filter(
        (hit, i, all) =>
          !i || Math.abs(hit.distance - all[i - 1].distance) > 0.0001,
      );
    assert.ok(
      recessHits[0].point.x - nativeMouth.x > 50,
      'measured oblique opening has real depth behind its rim',
    );
    assert.equal(
      recessHits[0].object.material.name,
      'Cobalt buried blue-black core',
    );
    assert.ok(
      recessHits[1].point.x - recessHits[0].point.x > 40,
      'a thick closed rear volume remains behind the undercut',
    );
    function terrainGroup(placement) {
      const group = new T.Group();
      for (const part of templates.get('basal_strata').parts)
        group.add(new T.Mesh(part.geometry, part.material));
      group.applyMatrix4(placement.matrix);
      group.updateMatrixWorld(true);
      return { group, bounds: new T.Box3().setFromObject(group) };
    }
    const existing = foundations.map(terrainGroup),
      extras = plan.foundationPlacements.map(terrainGroup);
    const terrain = [...existing, ...extras];
    for (const station of plan.stations) {
      const contacts = footContacts(
        templates.get('fracture_massif'),
        station.placement.matrix,
        terrain,
      );
      assert.equal(contacts.length, 97);
      for (const contact of contacts) {
        assert.ok(Math.abs(contact.world.y + 145) < 0.000001);
        assert.ok(contact.burial > 0);
        assert.ok(
          terrain.some(
            (part) =>
              part.bounds.containsPoint(contact.world) &&
              inside(part.group, contact.world),
          ),
          'every actual exported foot vertex is inside closed placed geology',
        );
      }
      const hero = new T.Group();
      for (const part of templates.get('fracture_massif').parts)
        hero.add(new T.Mesh(part.geometry, part.material));
      hero.applyMatrix4(station.placement.matrix);
      hero.updateMatrixWorld(true);
      const shoulder = templates.get(station.shoulder.prototype),
        shoulderFeet = [];
      let sharedBody = false;
      for (const part of shoulder.parts) {
        const positions = part.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const native = new T.Vector3().fromBufferAttribute(positions, i);
          const point = native.clone().applyMatrix4(station.shoulder.matrix);
          if (native.y < shoulder.bounds.min.y + 4) shoulderFeet.push(point);
          if (!sharedBody && inside(hero, point)) sharedBody = true;
        }
      }
      assert.ok(
        sharedBody,
        'actual source shoulder enters the closed massif body',
      );
      assert.ok(
        shoulderFeet.length > 20,
        'verify the actual low formed shoulder foot',
      );
      for (const point of shoulderFeet)
        assert.ok(
          terrain.some(
            (part) =>
              part.bounds.containsPoint(point) && inside(part.group, point),
          ),
          `the ${station.id} shoulder foot is buried in the same closed basal geology`,
        );
    }
    for (const extra of extras) {
      let overlap = false;
      extra.group.traverse((object) => {
        if (!object.isMesh || overlap) return;
        const positions = object.geometry.attributes.position;
        for (let i = 0; i < positions.count && !overlap; i++) {
          const point = new T.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(object.matrixWorld);
          overlap = existing.some(
            (part) =>
              part.bounds.containsPoint(point) && inside(part.group, point),
          );
        }
      });
      assert.ok(
        overlap,
        'new foundation physically overlaps the existing closed basal body',
      );
    }
    const worldParts = [];
    for (const placement of [...plan.placements, ...plan.foundationPlacements])
      for (const part of templates.get(placement.prototype).parts) {
        const geometry = part.geometry.clone().applyMatrix4(placement.matrix);
        geometries.add(geometry);
        worldParts.push({ geometry, placement });
      }
    const box = new T.Box3(
      new T.Vector3(-42, -12, -10),
      new T.Vector3(42, 90, 10),
    );
    const triangle = new T.Triangle(),
      a = new T.Vector3(),
      b = new T.Vector3(),
      c = new T.Vector3();
    let volumes = 0,
      triangles = 0;
    // Check actual triangles even though the intended shoulder is far enough
    // away for broad-phase bounds alone to reject every road volume.
    for (let s = 0; s < track.length; s += 12) {
      volumes++;
      const frame = track.sample(s),
        inverse = new T.Matrix4()
          .compose(frame.position, frame.quaternion, new T.Vector3(1, 1, 1))
          .invert();
      for (const { geometry, placement } of worldParts) {
        const positions = geometry.getAttribute('position'),
          index = geometry.index;
        for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
          a.fromBufferAttribute(
            positions,
            index ? index.getX(i) : i,
          ).applyMatrix4(inverse);
          b.fromBufferAttribute(
            positions,
            index ? index.getX(i + 1) : i + 1,
          ).applyMatrix4(inverse);
          c.fromBufferAttribute(
            positions,
            index ? index.getX(i + 2) : i + 2,
          ).applyMatrix4(inverse);
          assert.ok(
            !box.intersectsTriangle(triangle.set(a, b, c)),
            `${placement.prototype} at ${placement.distance}m intersects banked road at ${s}m`,
          );
          triangles++;
        }
      }
    }
    assert.equal(volumes, 409);
    assert.ok(triangles > 3000000);
  } finally {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const scene of scenes) scene.clear();
  }
});
