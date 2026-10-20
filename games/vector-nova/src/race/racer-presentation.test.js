import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { createRacerPresentation } from './racer-presentation.js';

test('racing applies the shared Arc glow to the struck rival, preserves pause, and clears it on exit', async () => {
  const scene = new Scene();
  const groups = [];
  const state = { flashes: [] };
  const racers = {
    enabled: true,
    opponents: ['rook', 'latch'].map((id) => ({
      specification: { id, name: id },
      state: { steer: 0 },
      runtime: {
        pose: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
      },
    })),
  };
  const presentation = await createRacerPresentation({
    racers,
    scene,
    combat: { view: () => state },
    loadRival: async () => {
      const group = new Group();
      const geometry = new BoxGeometry();
      const material = new MeshBasicMaterial();
      group.add(new Mesh(geometry, material));
      groups.push(group);
      return {
        group,
        dispose() {
          group.removeFromParent();
          geometry.dispose();
          material.dispose();
        },
      };
    },
  });
  const effects = groups.map((group) =>
    group.getObjectByName('Combat / hull hit outline'),
  );
  state.flashes = [{ target: 'latch', kind: 'arc', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, false);
  assert.equal(effects[1].visible, true);
  const strength = effects[1].children[0].material.uniforms.strength;
  assert.equal(strength.value, 1);
  presentation.update({ mode: 'paused' });
  assert.equal(strength.value, 1);
  presentation.update({ mode: 'racing', settings: { reducedMotion: true } });
  assert.equal(strength.value, 0.45);
  state.flashes.push({ target: 'latch', kind: 'arc', age: 0 });
  presentation.update({ mode: 'racing' });
  assert.equal(
    strength.value,
    0,
    'a new pellet contact starts a fresh soft pulse',
  );
  state.flashes = [{ target: 'rook', kind: 'aegis', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.ok(
    effects.every((effect) => !effect.visible),
    'shield blocks do not pretend to hit bare hull',
  );
  state.flashes = [{ target: 'rook', kind: 'repulsor', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, true);
  assert.equal(effects[1].visible, false);
  const response = effects[0].children[0].material.uniforms;
  assert.ok(
    response.color.value.r > response.color.value.b,
    'Repulsor hits tint the whole target rose',
  );
  assert.equal(response.strength.value, 1);
  state.flashes = [{ target: 'rook', kind: 'arc', age: 0.08 }];
  presentation.update({ mode: 'title' });
  assert.ok(effects.every((effect) => !effect.visible));
  presentation.dispose();
  presentation.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok(effects.every((effect) => effect.parent === null));
});
