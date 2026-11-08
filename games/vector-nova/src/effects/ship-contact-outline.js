import { BackSide, Color, Group, Matrix4, Mesh, ShaderMaterial } from 'three';

const clamp = (value) => Math.max(0, Math.min(1, value));
export function contactOutlineStrength(
  { contact = 0, contactDuration = 0, contactAge = 5 } = {},
  reducedMotion = false,
) {
  const age = contact ? contactDuration : contactAge;
  const release = Math.pow(1 - clamp(age / 0.85), 0.8);
  if (reducedMotion) return release * (contact ? 0.13 : 0.08);
  const pulse =
    0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.cos((age * Math.PI * 2) / 0.32), 2);
  return release * pulse * (contact ? 0.38 : 0.24);
}

// One restrained back-face shell per existing opaque mesh. Geometry stays
// borrowed; no copied vertex buffers, halo, texture or postprocessing pass.
export function createShipContactOutline() {
  const group = new Group();
  group.name = 'Thermal contact / smoke-gray hull outline';
  group.visible = false;
  const material = new ShaderMaterial({
    name: 'Thermal contact / smoke-gray edge',
    transparent: true,
    depthWrite: false,
    side: BackSide,
    toneMapped: false,
    uniforms: {
      strength: { value: 0 },
      color: { value: new Color('#41464a') },
    },
    vertexShader:
      'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*.075,1.);}',
    fragmentShader:
      'uniform vec3 color;uniform float strength;void main(){gl_FragColor=vec4(color,strength);}',
  });
  const inverse = new Matrix4();
  let root,
    modelKey,
    disposed = false;
  const parts = [];
  const eligible = (source, ship) => {
    for (let node = source; node && node !== ship; node = node.parent)
      if (node.userData.aoExclude || node.userData.exhaustHeat) return false;
    return true;
  };
  const visible = (source) => {
    for (let node = source; node; node = node.parent) {
      if (!node.visible) return false;
      if (node === root) return true;
    }
    return false;
  };
  function bind(ship) {
    if (root === ship && modelKey === ship.userData) return;
    group.removeFromParent();
    group.clear();
    parts.length = 0;
    root = ship;
    modelKey = ship.userData;
    ship.traverse((source) => {
      if (
        !source.isMesh ||
        !eligible(source, ship) ||
        !source.geometry.getAttribute('normal')
      )
        return;
      const surfaces = Array.isArray(source.material)
        ? source.material
        : [source.material];
      if (surfaces.every((surface) => surface.transparent)) return;
      const mesh = new Mesh(source.geometry, material);
      mesh.name = 'Thermal edge / ' + source.name;
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
      group.add(mesh);
      parts.push({ source, mesh });
    });
    ship.add(group);
  }
  return {
    group,
    update(ship, strength = 0) {
      if (disposed) return;
      if (ship) bind(ship);
      material.uniforms.strength.value = strength;
      group.visible = Boolean(ship && strength > 0.002 && parts.length);
      if (!group.visible) return;
      ship.updateWorldMatrix(true, true);
      inverse.copy(ship.matrixWorld).invert();
      for (const { source, mesh } of parts) {
        mesh.visible = visible(source);
        mesh.matrix.multiplyMatrices(inverse, source.matrixWorld);
        mesh.matrixWorldNeedsUpdate = true;
      }
    },
    reset() {
      group.visible = false;
      material.uniforms.strength.value = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      parts.length = 0;
      material.dispose();
    },
  };
}
