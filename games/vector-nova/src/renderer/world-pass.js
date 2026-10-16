import { Pass } from 'three/addons/postprocessing/Pass.js';

// Depth consumers prepare their own data before any effect can overwrite the
// beauty attachment. Their color composite keeps the ordinary world-pass slot.
export function attachWorldPass(composer, pass, { beauty, output }) {
  let preparation;
  if (typeof pass.prepareSceneDepth === 'function') {
    preparation = new Pass();
    preparation.needsSwap = false;
    Object.defineProperty(preparation, 'enabled', {
      get: () => pass.enabled,
    });
    preparation.render = (renderer, _writeBuffer, readBuffer, dt) => {
      pass.prepareSceneDepth(renderer, readBuffer.depthTexture, dt);
    };
    composer.insertPass(preparation, composer.passes.indexOf(beauty) + 1);
  }
  composer.insertPass(pass, composer.passes.indexOf(output));
  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    if (preparation) composer.removePass(preparation);
    composer.removePass(pass);
  };
}
