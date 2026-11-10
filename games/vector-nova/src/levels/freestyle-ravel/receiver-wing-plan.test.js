import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRavelFreestyleTrack } from './track/model.js';
import { createSailbreakPlan } from './scenery.js';
import { createReceiverAnchorPlan } from './receiver-anchor.js';
import { createReceiverWingPlan } from './receiver-wing-plan.js';

const EPSILON = 0.0001;
const PREFERENCES = [
  [0.85, 1, 0],
  [1, 1, -0.45],
  [1.15, 0.75, -0.25],
  [0.9, 0.7, 0],
  [1.1, 0.9, 0.15],
];

async function loadAsset(namespace, filename) {
  const bytes = await fs.readFile(
    new URL(
      `../../../public/assets/levels/${namespace}/${filename}`,
      import.meta.url,
    ),
  );
  return (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene;
}

function actualSocket(root, name, placement) {
  root.updateWorldMatrix(true, true);
  const joint =
    root.getObjectByName(name) ?? root.getObjectByName(`${root.name}__${name}`);
  assert.ok(joint, `actual GLB socket ${root.name}/${name} exists`);
  return new T.Vector3()
    .setFromMatrixPosition(
      root.matrixWorld.clone().invert().multiply(joint.matrixWorld),
    )
    .applyMatrix4(placement);
}

function near(a, b, message) {
  assert.ok(a.distanceTo(b) < EPSILON, `${message}: ${a.distanceTo(b)}m`);
}

function connected(stays, a, b, message) {
  assert.ok(
    stays.some(
      (stay) =>
        stay.a.distanceTo(a) < EPSILON && stay.b.distanceTo(b) < EPSILON,
    ),
    message,
  );
}

function finitePositive(matrix, name) {
  assert.ok(matrix.elements.every(Number.isFinite), `${name} matrix is finite`);
  assert.ok(
    matrix.determinant() > 0,
    `${name} uses a proper positive transform`,
  );
  const scale = new T.Vector3();
  matrix.decompose(new T.Vector3(), new T.Quaternion(), scale);
  assert.ok(
    scale.toArray().every((value) => value > 0),
    `${name} has no mirrored axes`,
  );
}

function checkConnections(anchor, wing, roots) {
  const ringPlacement = anchor.prototypes.find(
    (part) => part.prototype === 'tension_spindle',
  ).matrix;
  const crownPlacement = anchor.prototypes.find(
    (part) => part.prototype === 'sail_load_crown',
  ).matrix;
  for (const part of [
    ...anchor.prototypes,
    ...anchor.gallery,
    ...wing.prototypes,
  ])
    finitePositive(part.matrix, part.name);
  for (let i = 1; i < anchor.gallery.length; i++)
    near(
      anchor.gallery[i - 1].b,
      anchor.gallery[i].a,
      'gallery has no missing link',
    );
  for (const segment of anchor.gallery) {
    near(
      actualSocket(roots.gallery, 'joint_port', segment.matrix),
      segment.a,
      'native port gallery joint seats on connection',
    );
    near(
      actualSocket(roots.gallery, 'joint_starboard', segment.matrix),
      segment.b,
      'native starboard gallery joint seats on connection',
    );
  }
  const firstGallery = anchor.gallery[0].a,
    lastGallery = anchor.gallery.at(-1).b;
  assert.ok(
    ['gallery_port', 'gallery_starboard'].some(
      (name) =>
        firstGallery.distanceTo(
          actualSocket(roots.crown, name, crownPlacement),
        ) < EPSILON,
    ),
    'service gallery reaches a real crown socket',
  );
  assert.ok(
    [0, 1, 2].some(
      (i) =>
        lastGallery.distanceTo(
          actualSocket(roots.spindle, `cable_socket_${i}`, ringPlacement),
        ) < EPSILON,
    ),
    'service gallery reaches a real spindle socket',
  );
  const wingPlacement = wing.prototypes.find(
    (part) => part.prototype === 'receiver_foil_wing',
  ).matrix;
  near(
    actualSocket(roots.wing, 'wing_root', wingPlacement),
    actualSocket(roots.spindle, 'cable_socket_2', ringPlacement),
    'wing root touches actual spindle socket2',
  );
  assert.ok(wing.rootContactError < 1e-8);
  assert.equal(
    wing.prototypes.length,
    3,
    'one wing and two cutters are retained',
  );
  assert.equal(
    wing.stays.length,
    6,
    'both inner stays and all four cutter stays are retained',
  );
  for (const [i, suffix] of ['a', 'b'].entries()) {
    connected(
      wing.stays,
      actualSocket(roots.spindle, `cable_socket_${i}`, ringPlacement),
      actualSocket(roots.wing, `wing_inner_${suffix}`, wingPlacement),
      'real spindle socket reaches real inner hem',
    );
    const cutter = wing.sockets.cutters.find((part) => part.suffix === suffix);
    const corner = actualSocket(
      roots.wing,
      `wing_outer_${suffix}`,
      wingPlacement,
    );
    for (const name of ['cable_socket_starboard', 'tow_eye']) {
      const source = actualSocket(roots.cutter, name, cutter.matrix);
      near(
        cutter.sockets[name],
        source,
        'reported cutter socket equals actual GLB source',
      );
      connected(
        wing.stays,
        source,
        corner,
        'real cutter hardpoint reaches its actual outer hem',
      );
    }
  }
  for (const stay of [...anchor.arms, ...anchor.stays, ...wing.stays]) {
    assert.ok(
      [...stay.a.toArray(), ...stay.b.toArray(), stay.width].every(
        Number.isFinite,
      ),
    );
    assert.ok(
      stay.a.distanceTo(stay.b) > 0 && stay.width > 0,
      'each physical link has finite positive extent',
    );
  }
}

test('all five receiver installations fit as complete, socketed positive graphs using the actual source GLBs', async (t) => {
  const scenes = await Promise.all([
    loadAsset('freestyle-ravel', 'receiver-wing.glb'),
    loadAsset('ravel', 'anchor-fleet.glb'),
    loadAsset('ravel', 'tension-gallery.glb'),
  ]);
  const roots = {
    wing: scenes[0].getObjectByName('receiver_foil_wing'),
    cutter: scenes[1].getObjectByName('anchor_cutter'),
    spindle: scenes[1].getObjectByName('tension_spindle'),
    crown: scenes[2].getObjectByName('sail_load_crown'),
    gallery: scenes[2].getObjectByName('tension_gallery_segment'),
  };
  try {
    const track = createRavelFreestyleTrack(),
      scene = createSailbreakPlan(track);
    for (const station of scene.stations)
      await t.test(
        `arrival ${station.index + 1}: default and authored silhouette`,
        () => {
          const anchor = createReceiverAnchorPlan({ track, station });
          assert.equal(
            anchor.clearance.safe,
            true,
            JSON.stringify(anchor.clearance.blockers),
          );
          const [preferredScale, preferredAlongScale, preferredYaw] =
            PREFERENCES[station.index];
          for (const preference of [
            {},
            { preferredScale, preferredAlongScale, preferredYaw },
          ]) {
            const wing = createReceiverWingPlan({
              track,
              station,
              anchor,
              wingRoot: roots.wing,
              cutterRoot: roots.cutter,
              ...preference,
            });
            assert.equal(
              wing.clearance.safe,
              true,
              JSON.stringify(wing.clearance.blockers),
            );
            assert.deepEqual(wing.clearance.blockers, []);
            assert.ok(
              wing.clearance.meshVertices > 50000,
              'all source vertices are checked without thinning',
            );
            assert.ok(
              wing.clearance.segmentSamples > 250,
              'every retained stay receives finite-width segment checks',
            );
            checkConnections(anchor, wing, roots);
          }
        },
      );
  } finally {
    const geometries = new Set(),
      materials = new Set();
    for (const scene of scenes)
      scene.traverse((object) => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        for (const material of [object.material].flat())
          materials.add(material);
      });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const scene of scenes) scene.clear();
  }
});
