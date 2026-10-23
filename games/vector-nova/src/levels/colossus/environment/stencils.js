import * as T from 'three';

const labels = [
  ['intake', 'ROLL MILL'],
  ['press', 'PRESS'],
  ['crossfeed', 'CROSSFEED'],
  ['gantry', 'GANTRY'],
  ['cooling', 'COOLING'],
  ['headstock', 'HEADSTOCK'],
];
const atlasWidth = 1024,
  atlasHeight = 512,
  rowHeight = 80;

export function createProcessStencils({ shape = false } = {}) {
  const group = new T.Group();
  group.name = 'Colossus / painted process crosshead stencils';
  const geometries = new Set();
  let disposed = false,
    texture = null,
    material = null;
  if (!shape) {
    if (typeof document === 'undefined') {
      texture = new T.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1);
      texture.needsUpdate = true;
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = atlasWidth;
      canvas.height = atlasHeight;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, atlasWidth, atlasHeight);
      context.fillStyle = '#ffffff';
      context.textBaseline = 'middle';
      for (const [index, [, label]] of labels.entries()) {
        const y = index * rowHeight + rowHeight / 2;
        context.font = '600 42px monospace';
        context.textAlign = 'left';
        context.fillText(String(index + 1).padStart(2, '0'), 54, y, 120);
        context.font = '700 58px "Arial Narrow", Arial, sans-serif';
        context.textAlign = 'center';
        context.fillText(label, 588, y, 760);
      }
      texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
    }
    texture.name = 'Colossus / six process stencil atlas';
    material = new T.MeshStandardMaterial({
      name: 'Colossus / matte process stencil paint',
      map: texture,
      color: '#a9b0aa',
      roughness: 0.94,
      metalness: 0,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    // No emissive term; daylight and cast shadows keep paint part of the beam.
  }
  return {
    group,
    get texture() {
      return texture;
    },
    get material() {
      return material;
    },
    addHall({ id, matrix, size, position }) {
      if (shape || disposed) return null;
      const index = labels.findIndex(([key]) => key === id);
      if (index < 0) return null;
      // Current hall crosshead is [312,22,24]. Keep generous ends and 3 m
      // vertical steel margins. Scale down safely if a future beam is smaller.
      const width = Math.min(216, size[0] - 16),
        height = Math.min(16, size[1] - 6);
      if (width <= 0 || height <= 0) return null;
      const geometry = new T.PlaneGeometry(width, height);
      const uv = geometry.attributes.uv;
      const bottom = 1 - ((index + 1) * rowHeight) / atlasHeight;
      for (let i = 0; i < uv.count; i++)
        uv.setY(i, bottom + (uv.getY(i) * rowHeight) / atlasHeight);
      // Hall local +Z follows travel. The approaching driver sees its -Z face.
      // Rotating the actual plane also orients its U axis for readable text;
      // do not double-side or negate its UVs, which would mirror the stencil.
      geometry.rotateY(Math.PI);
      geometry.translate(
        position[0],
        position[1],
        position[2] - size[2] / 2 - 0.035,
      );
      geometry.applyMatrix4(matrix);
      geometry.name = id + ' / painted front crosshead stencil';
      geometries.add(geometry);
      const mesh = new T.Mesh(geometry, material);
      mesh.name = geometry.name;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      geometries.forEach((g) => g.dispose());
      geometries.clear();
      material?.dispose();
      texture?.dispose();
    },
  };
}
