// A material compile does not upload geometry/textures or exercise every actual
// draw variant. Submit off-camera and initially hidden effects during loading.
export function drawUnculledScene(scene, draw) {
  const visibleLights = new Set();
  scene.traverseVisible((object) => {
    if (object.isLight) visibleLights.add(object);
  });
  const retained = [];
  scene.traverse((object) => {
    retained.push([object, object.visible, object.frustumCulled]);
    // Revealing a hidden group must not add lights and change shader variants.
    object.visible = !object.isLight || visibleLights.has(object);
    object.frustumCulled = false;
  });
  try {
    return draw();
  } finally {
    for (const [object, visible, frustumCulled] of retained) {
      object.visible = visible;
      object.frustumCulled = frustumCulled;
    }
  }
}
