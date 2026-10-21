import * as THREE from 'three';

/** Optional self-shadow pass. Borrows the renderer and an exclusively owned ship root. */
export function createShipShadow(
  renderer,
  root,
  sunDirection,
  { size = 1536, interval = 2 } = {},
) {
  if (!renderer?.isWebGLRenderer || !root?.isObject3D)
    throw new TypeError('Ship shadows require a WebGLRenderer and ship root.');
  if (
    !Number.isInteger(size) ||
    size < 128 ||
    size > 4096 ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 8
  )
    throw new RangeError('Shadow size must be 128–4096 and interval 1–8.');
  const sun = new THREE.Vector3();
  function readSun(direction) {
    if (
      !Array.isArray(direction) ||
      direction.length !== 3 ||
      !direction.every(Number.isFinite) ||
      Math.hypot(...direction) < 1e-8
    )
      throw new RangeError(
        'Sun direction requires three finite, nonzero components.',
      );
    sun.fromArray(direction).normalize();
  }
  readSun(sunDirection);
  const target = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.name = 'Sailing ship self shadow';
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
  depth.toneMapped = false;
  const scene = new THREE.Scene();
  scene.overrideMaterial = depth;
  // Retain the caller's parent transform while isolating the ship for depth.
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  scene.add(holder);
  const camera = new THREE.OrthographicCamera(-15, 15, 15, -15, 1, 90);
  const aim = new THREE.Vector3();
  const bias = new THREE.Matrix4().set(
    0.5,
    0,
    0,
    0.5,
    0,
    0.5,
    0,
    0.5,
    0,
    0,
    0.5,
    0.5,
    0,
    0,
    0,
    1,
  );
  const matrix = new THREE.Matrix4();
  const captureProjection = new THREE.Matrix4();
  const captureTransform = new THREE.Matrix4();
  const inverseTransform = new THREE.Matrix4();
  const uniforms = {
    shipShadowMap: { value: target.texture },
    shipShadowMatrix: { value: matrix },
    shipShadowTexel: { value: 1 / size },
  };
  let frame = 0;
  let disposed = false;
  const hooks = new Map();
  function restore(mat, hook) {
    if (mat.onBeforeCompile === hook.installed)
      mat.onBeforeCompile = hook.compile;
    if (mat.customProgramCacheKey === hook.installedKey)
      mat.customProgramCacheKey = hook.cacheKey;
    delete mat.userData.shipSelfShadow;
    mat.needsUpdate = true;
  }
  function attach() {
    if (disposed) return;
    const materials = new Set();
    root.traverse((object) => {
      if (object.material)
        for (const mat of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(mat);
    });
    for (const [mat, hook] of hooks)
      if (!materials.has(mat)) {
        restore(mat, hook);
        hooks.delete(mat);
      }
    for (const mat of materials) {
      if (
        mat.isMeshStandardMaterial &&
        !hooks.has(mat) &&
        mat.userData.shipSelfShadow
      )
        throw new Error(
          'A ship material already has another self-shadow owner.',
        );
    }
    for (const mat of materials) {
      if (!mat.isMeshStandardMaterial || hooks.has(mat)) continue;
      mat.userData.shipSelfShadow = true;
      const compile = mat.onBeforeCompile;
      const cacheKey = mat.customProgramCacheKey;
      const key = mat.customProgramCacheKey();
      mat.onBeforeCompile = (shader, gl) => {
        compile.call(mat, shader, gl);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader =
          'uniform mat4 shipShadowMatrix; varying vec4 vShipShadow;\n' +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvShipShadow=shipShadowMatrix*modelMatrix*vec4(transformed,1.0);',
        );
        shader.fragmentShader =
          'uniform sampler2D shipShadowMap; uniform float shipShadowTexel; varying vec4 vShipShadow;\n' +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\n#include <packing>',
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          vec3 shipP=vShipShadow.xyz/vShipShadow.w;
          float shipLit=1.0;
          if(shipP.x>0.0 && shipP.x<1.0 && shipP.y>0.0 && shipP.y<1.0 && shipP.z>0.0 && shipP.z<1.0){
            shipLit=0.0;
            for(int sx=-1;sx<=1;sx++) for(int sy=-1;sy<=1;sy++){
              float stored=unpackRGBAToDepth(texture2D(shipShadowMap,shipP.xy+vec2(float(sx),float(sy))*shipShadowTexel));
              shipLit+=step(shipP.z-0.0007,stored)/9.0;
            }
          }
          reflectedLight.directDiffuse*=mix(0.42,1.0,shipLit);
          reflectedLight.directSpecular*=mix(0.35,1.0,shipLit);
          reflectedLight.indirectDiffuse*=mix(0.87,1.0,shipLit);`,
        );
      };
      mat.customProgramCacheKey = () => `${key}:ship-self-shadow-v1`;
      hooks.set(mat, {
        compile,
        cacheKey,
        installed: mat.onBeforeCompile,
        installedKey: mat.customProgramCacheKey,
      });
      mat.needsUpdate = true;
    }
    frame = 0;
  }
  function render(profile) {
    if (disposed) return;
    if (
      ![profile?.length, profile?.mastHeight].every(
        (n) => Number.isFinite(n) && n > 0,
      )
    )
      throw new RangeError(
        'Shadow bounds require positive length and mastHeight.',
      );
    root.updateWorldMatrix(true, true);
    if (frame++ % interval !== 0) {
      // Keep cached depth attached to the moving hull between shadow captures.
      matrix
        .copy(captureProjection)
        .multiply(captureTransform)
        .multiply(inverseTransform.copy(root.matrixWorld).invert());
      return;
    }
    const span =
      (Math.max(profile.length * 0.73, profile.mastHeight * 0.76) + 1.4) *
      root.matrixWorld.getMaxScaleOnAxis();
    if (!Number.isFinite(span) || span <= 0)
      throw new RangeError(
        'Ship shadow requires a finite, nonzero world scale.',
      );
    camera.left = camera.bottom = -span;
    camera.right = camera.top = span;
    aim.set(0, profile.mastHeight * 0.44, 0).applyMatrix4(root.matrixWorld);
    const distance = Math.max(44, span * 3);
    camera.near = 0.1;
    camera.far = distance + span * 3;
    camera.position.copy(aim).addScaledVector(sun, distance);
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    matrix
      .copy(bias)
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    captureProjection.copy(matrix);
    captureTransform.copy(root.matrixWorld);
    const parent = root.parent;
    const index = parent?.children.indexOf(root);
    const previousTarget = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.enabled;
    const xr = renderer.xr.enabled;
    if (parent) holder.matrix.copy(parent.matrixWorld);
    else holder.matrix.identity();
    try {
      holder.add(root);
      renderer.xr.enabled = false;
      renderer.shadowMap.enabled = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
    } catch (error) {
      frame = 0;
      throw error;
    } finally {
      holder.remove(root);
      if (parent) {
        parent.add(root);
        parent.children.splice(parent.children.indexOf(root), 1);
        parent.children.splice(index, 0, root);
      }
      renderer.setRenderTarget(previousTarget, face, mip);
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      renderer.shadowMap.enabled = shadows;
      renderer.xr.enabled = xr;
    }
  }
  return {
    attach,
    render,
    setSunDirection(direction) {
      if (disposed) return;
      readSun(direction);
      frame = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [mat, hook] of hooks) restore(mat, hook);
      hooks.clear();
      target.dispose();
      depth.dispose();
      scene.clear();
    },
  };
}
