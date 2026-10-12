import * as T from 'three';

// Oblique mirror-camera math adapted from Three.js Water (MIT); see THREE-LICENSE.txt.
// Only nearby structures use this mean-plane approximation. Swell faces and the
// distant ocean retain the aligned, rough sky reflection in the surface shader.
export function createNacreOceanReflection(mesh, waterY) {
  const target = new T.WebGLRenderTarget(512, 512, {
    type: T.HalfFloatType,
    depthBuffer: true,
  });
  const camera = new T.PerspectiveCamera();
  const matrix = new T.Matrix4();
  const position = new T.Vector3();
  const direction = new T.Vector3();
  const up = new T.Vector3();
  const lastPosition = new T.Vector3(Infinity, Infinity, Infinity);
  const lastDirection = new T.Vector3();
  const plane = new T.Plane();
  const clip = new T.Vector4(),
    q = new T.Vector4();
  const uniforms = mesh.material.uniforms;
  uniforms.sceneReflection = { value: target.texture };
  uniforms.reflectionMatrix = { value: matrix };
  uniforms.reflectionReady = { value: 0 };
  let enabled = true,
    disposed = false,
    rendering = false,
    frame = 0,
    captures = 0;
  mesh.onBeforeRender = (renderer, scene, source) => {
    if (disposed || rendering || !enabled || !source.isPerspectiveCamera)
      return;
    source.getWorldPosition(position);
    source.getWorldDirection(direction);
    if (position.y < waterY + 5) {
      uniforms.reflectionReady.value = 0;
      return;
    }
    const moved =
      position.distanceToSquared(lastPosition) > 18 * 18 ||
      direction.dot(lastDirection) < 0.985;
    if (!moved && ++frame < 3) return;
    camera.copy(source, false);
    camera.matrixAutoUpdate = true;
    camera.matrixWorldAutoUpdate = true;
    camera.position.copy(position);
    camera.position.y = 2 * waterY - position.y;
    direction.y *= -1;
    up.set(0, 1, 0).applyQuaternion(
      source.getWorldQuaternion(new T.Quaternion()),
    );
    up.y *= -1;
    camera.up.copy(up);
    camera.lookAt(direction.clone().add(camera.position));
    camera.updateMatrixWorld();
    camera.projectionMatrix.copy(source.projectionMatrix);
    matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    matrix
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    plane
      .set(new T.Vector3(0, 1, 0), -waterY)
      .applyMatrix4(camera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const elements = camera.projectionMatrix.elements;
    q.set(
      (Math.sign(clip.x) + elements[8]) / elements[0],
      (Math.sign(clip.y) + elements[9]) / elements[5],
      -1,
      (1 + elements[10]) / elements[14],
    );
    clip.multiplyScalar(2 / clip.dot(q));
    elements[2] = clip.x;
    elements[6] = clip.y;
    elements[10] = clip.z + 1 - 0.003;
    elements[14] = clip.w;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const previousTarget = renderer.getRenderTarget();
    const previousXr = renderer.xr.enabled;
    const previousShadows = renderer.shadowMap.autoUpdate;
    const hidden = [];
    scene.traverse((object) => {
      if (
        object.visible &&
        (object === mesh || object.userData.nacreReflectionExclude)
      ) {
        hidden.push(object);
        object.visible = false;
      }
    });
    rendering = true;
    try {
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target);
      renderer.state.buffers.depth.setMask(true);
      if (!renderer.autoClear) renderer.clear();
      renderer.render(scene, camera);
      lastPosition.copy(position);
      source.getWorldDirection(lastDirection);
      uniforms.reflectionReady.value = 1;
      frame = 0;
      captures++;
    } finally {
      hidden.forEach((object) => {
        object.visible = true;
      });
      renderer.xr.enabled = previousXr;
      renderer.shadowMap.autoUpdate = previousShadows;
      renderer.setRenderTarget(previousTarget);
      if (source.viewport) renderer.state.viewport(source.viewport);
      rendering = false;
    }
  };
  return {
    configure(quality) {
      const next = quality !== 'low';
      if (next !== enabled) {
        enabled = next;
        frame = 0;
        lastPosition.set(Infinity, Infinity, Infinity);
        uniforms.reflectionReady.value = 0;
      }
    },
    getPresentation: () => ({ enabled, size: 512, stride: 3, captures }),
    dispose() {
      if (disposed) return;
      disposed = true;
      uniforms.reflectionReady.value = 0;
      mesh.onBeforeRender = () => {};
      target.dispose();
    },
  };
}
