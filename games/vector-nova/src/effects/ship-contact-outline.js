import { Color, DoubleSide, Group, Matrix4, Mesh, ShaderMaterial } from 'three';

const clamp = (value) => Math.max(0, Math.min(1, value));
export function contactOutlineStrength(
  { contact = 0, envelope = 0 } = {},
  reducedMotion = false,
  time = 0,
) {
  const release = clamp(envelope);
  if (reducedMotion) return release * (contact ? 0.22 : 0.16);
  // The simulation clock keeps the same slow phase through contact and cooling;
  // contact-duration telemetry may cap or reset when the ship leaves a hazard.
  const pulse =
    0.65 + 0.35 * (0.5 + 0.5 * Math.cos((time * Math.PI * 2) / 1.2));
  return release * pulse * (contact ? 0.76 : 0.58);
}

// The combat-style hull coat and broad rim share one draw per borrowed mesh.
// Single-pass double sides avoid adding a second halo or transparency pass.
export function createShipContactOutline({ color = '#ff4020', label } = {}) {
  const group = new Group();
  group.name = label
    ? label + ' / hull contact envelope'
    : 'Thermal contact / lava-red hull envelope';
  group.visible = false;
  const material = new ShaderMaterial({
    name: label
      ? label + ' / hull and rim'
      : 'Thermal contact / lava-red hull and rim',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
    uniforms: {
      strength: { value: 0 },
      color: { value: new Color(color) },
    },
    vertexShader: `
      varying vec3 hullNormal, hullView;
      void main() {
        vec4 p = modelViewMatrix * vec4(position + normal * .16, 1.);
        hullNormal = normalize(normalMatrix * normal);
        hullView = -p.xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float strength;
      varying vec3 hullNormal, hullView;
      void main() {
        float rim = pow(clamp(1. - abs(dot(normalize(hullNormal), normalize(hullView))), 0., 1.), 1.6);
        float coverage = gl_FrontFacing ? .24 + rim * .52 : .85;
        gl_FragColor = vec4(color, coverage * strength);
        #include <colorspace_fragment>
      }`,
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
      mesh.name =
        (label ? label + ' edge / ' : 'Thermal edge / ') + source.name;
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
