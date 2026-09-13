import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createHumanoid, HUMANOID_BONES } from '../src/characters/humanoid.js';
import { CLIPS, applyPose } from '../src/animation/clips.js';
import { DEFAULT_STATE, sanitizeState, readPreset } from '../src/config.js';

const point = object => object.getWorldPosition(new Vector3());

test('humanoid variants retain a valid shared skeleton and normalized skin weights', () => {
  for (const profile of [DEFAULT_STATE.character, { ...DEFAULT_STATE.character, height: 1.4, build: 1.3 }, { ...DEFAULT_STATE.character, height: 2.1, headScale: 0.8 }]) {
    const rig = createHumanoid(profile);
    assert.deepEqual(rig.skeleton.bones.map(b => b.name), HUMANOID_BONES);
    const skins = rig.meshes.filter(m => m.isSkinnedMesh);
    assert.ok(skins.length >= 5, 'body and limbs need deforming surfaces');
    let mixed = 0;
    for (const mesh of skins) {
      const weights = mesh.geometry.getAttribute('skinWeight');
      const indices = mesh.geometry.getAttribute('skinIndex');
      assert.equal(weights.count, mesh.geometry.getAttribute('position').count);
      for (let vertex = 0; vertex < weights.count; vertex++) {
        let sum = 0, influences = 0;
        for (let c = 0; c < 4; c++) {
          const weight = weights.array[vertex * 4 + c];
          const bone = indices.array[vertex * 4 + c];
          assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1);
          assert.ok(bone >= 0 && bone < rig.skeleton.bones.length);
          sum += weight;
          if (weight > 0.001) influences++;
        }
        assert.ok(Math.abs(sum - 1) < 1e-5);
        if (influences > 1) mixed++;
      }
    }
    assert.ok(mixed > 30, 'joint transitions must blend influences');
    rig.dispose();
    rig.dispose();
  }
});

test('every clip produces finite joint and deformed surface positions', () => {
  const rig = createHumanoid(DEFAULT_STATE.character);
  for (const clip of CLIPS) {
    for (let frame = 0; frame <= 24; frame++) {
      const pose = applyPose(rig, clip.id, frame / 24 * clip.duration);
      assert.ok(Number.isFinite(pose.progress));
      for (const bone of Object.values(rig.bones)) {
        assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `${clip.id}: ${bone.name}`);
      }
      for (const mesh of rig.meshes) {
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i += Math.max(1, Math.floor(positions.count / 20))) {
          const p = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
          assert.ok(p.toArray().every(Number.isFinite), `${clip.id}: ${mesh.name}`);
          assert.ok(p.length() < 8, `${clip.id}: runaway geometry in ${mesh.name}`);
        }
      }
    }
  }
  rig.dispose();
});

test('idle feet stay planted and absolute sampling does not accumulate drift', () => {
  const rig = createHumanoid(DEFAULT_STATE.character);
  const anchors = [point(rig.bones.footL), point(rig.bones.footR)];
  for (let i = 0; i <= 30; i++) {
    applyPose(rig, 'idle', i * 0.12);
    assert.ok(point(rig.bones.footL).distanceTo(anchors[0]) < 1e-5);
    assert.ok(point(rig.bones.footR).distanceTo(anchors[1]) < 1e-5);
    assert.equal(rig.root.position.x, 0);
  }
  applyPose(rig, 'walk', 0.31);
  const before = rig.skeleton.bones.map(b => b.matrixWorld.elements.slice());
  applyPose(rig, 'attack', 0.82);
  applyPose(rig, 'hit', 0.18);
  applyPose(rig, 'walk', 0.31);
  assert.deepEqual(rig.skeleton.bones.map(b => b.matrixWorld.elements.slice()), before);
  rig.dispose();
});

test('default sword contact reaches the stage target with the actual mesh attachment', () => {
  const rig = createHumanoid(DEFAULT_STATE.character);
  const contact = CLIPS.find(c => c.id === 'attack').markers.find(m => m.label === 'Contact').time;
  applyPose(rig, 'attack', contact, DEFAULT_STATE.motion);
  const h = rig.metrics.height;
  const target = new Vector3(-h * 0.13, h * 0.62, h * 0.65);
  assert.ok(point(rig.weapon.tip).distanceTo(target) < 0.02);
  rig.dispose();
});

test('preset imports preserve nested edits and reject malformed or future files', () => {
  const changed = sanitizeState({ character: { palette: { hair: '#abcdef' } }, cameraPose: { position: [2, 2, 4], target: [0, 0.8, 0] } });
  const loaded = readPreset(JSON.parse(JSON.stringify(changed)));
  assert.equal(loaded.character.palette.hair, '#abcdef');
  assert.equal(loaded.character.palette.coat, DEFAULT_STATE.character.palette.coat);
  assert.deepEqual(loaded.cameraPose, changed.cameraPose);
  assert.equal(sanitizeState({ camera: 'side' }, loaded).cameraPose, null);
  const bounded = sanitizeState({ exposure: Infinity, character: { height: 900, palette: { hair: 'bad' } } });
  assert.equal(bounded.exposure, DEFAULT_STATE.exposure);
  assert.equal(bounded.character.height, 2.1);
  assert.equal(bounded.character.palette.hair, DEFAULT_STATE.character.palette.hair);
  assert.throws(() => readPreset({ version: 2, character: {}, motion: {} }));
  assert.throws(() => readPreset({ version: 1 }));
});
