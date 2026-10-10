import * as THREE from 'three';

/**
 * A photographed-object lighting rig, captured once into the existing 256px
 * PMREM budget. Broad softboxes describe the body; the narrow side strips let
 * glass, clearcoat and edge bevels resolve independently of diffuse lighting.
 * The cards are only reflection sources, never extra runtime draw calls.
 */
export function createStudioEnvironment(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color().setRGB(0.025, 0.028, 0.032);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const materials = [];

  function card(position, dimensions, radiance, tint, roll = 0) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint).multiplyScalar(radiance),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    mesh.rotateZ(roll);
    mesh.scale.set(dimensions[0], dimensions[1], 1);
    room.add(mesh);
  }

  // Continuous neutral wall bounce keeps shadow-side composite readable.
  card([0, 1, 9], [18, 9], 0.32, '#d9dde1');
  card([8, 1, 0], [16, 9], 0.18, '#e0e6ec');
  card([-8, 1, 0], [16, 9], 0.12, '#e7e3dc');
  card([0, -5, 0], [20, 20], 0.06, '#777f88');

  // Key softbox and offset longitudinal strip produce broad/narrow reflections
  // with dark space between them, rather than a uniformly bright hemisphere.
  card([-4.7, 4.2, -6.4], [5.4, 8], 2.2, '#fff6e9', 0.12);
  card([4.8, 4, -1.5], [0.8, 9], 9, '#eaf2ff', 0.12);
  card([0, 3.8, -7], [7, 1.2], 6, '#f4f7ff');
  card([-6, 1.4, 2.8], [1.1, 6], 3, '#fff8ed');

  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(room, 0.015, 0.1, 40, { size: 256 });
  } finally {
    generator.dispose();
    geometry.dispose();
    for (const material of materials) material.dispose();
    room.clear();
  }
}
