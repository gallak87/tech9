import test from 'node:test';
import assert from 'node:assert/strict';
import { graphicsBudget } from './quality-budget.js';

test('Low reduces shadow area ninefold and bounds phone resolution and map size', () => {
  const high = graphicsBudget({ quality: 'high' }, { dpr: 3 });
  const low = graphicsBudget({ quality: 'low' }, { dpr: 3, mobile: true });
  assert.equal(high.shadowSize ** 2 / low.shadowSize ** 2, 9);
  assert.equal(low.pixelRatio, 0.85);
  assert.equal(low.textureSize, 512);
  assert.equal(low.editorPanoramaSize, 1024);
  assert.equal(graphicsBudget({ quality: 'low' }).editorPanoramaSize, 2048);
  assert.equal(high.editorPanoramaSize, Infinity);
  assert.equal(low.anisotropy, 2);
  assert.equal(low.postEffects, false);
  assert.equal(
    graphicsBudget({ quality: 'high' }, { dpr: 3, mobile: true }).pixelRatio,
    1,
  );
});
