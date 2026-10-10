import * as T from 'three';

// Shared race paint, separate from each level's gantries and jump guidance.
// The marker follows timing's checkpoint zero; open routes can name an actual
// finishDistance. Level presentation may override width, height and paint tones
// for its road construction without changing timing or the sampled route.
export function createFinishMarker(
  track,
  {
    width = track.width - Math.min(1.6, track.width * 0.1),
    height = 0.13,
    tileSize = 1.5,
    light = 0xe4e4e4,
    dark = 0x181818,
  } = {},
) {
  const distance =
    track.closed === false
      ? (track.finishDistance ?? track.length)
      : (track.checkpoints?.[0]?.distance ?? track.checkpoints?.[0]?.s ?? 0);
  if (
    !Number.isFinite(track.length) ||
    track.length <= 0 ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance > track.length ||
    !Number.isFinite(width) ||
    width <= 0 ||
    width > track.width ||
    !Number.isFinite(height) ||
    !Number.isFinite(tileSize) ||
    tileSize <= 0
  )
    throw new Error('Invalid finish marker dimensions or timing distance');

  const columns = Math.min(
    64,
    Math.max(2, Math.round(width / tileSize / 2) * 2),
  );
  const tileWidth = width / columns;
  const depth = Math.min(tileWidth * 2, track.length);
  // Closed circuits straddle the timing seam. At an open route's endpoint,
  // keep the painted band on the final supported metres rather than sampling
  // beyond the route or folding its end back onto the start.
  const start =
    track.closed === false
      ? Math.max(0, Math.min(distance - depth / 2, track.length - depth))
      : distance - depth / 2;
  const positions = [],
    normals = [],
    colors = [],
    indices = [];
  const tones = [new T.Color(light), new T.Color(dark)];
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < columns; column++) {
      const base = positions.length / 3;
      const color = tones[(row + column) % 2];
      for (const [side, along] of [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ]) {
        const s = start + ((row + along) * depth) / 2;
        const x = -width / 2 + (column + side) * tileWidth;
        const frame = track.sample(s);
        // Sample every corner so banking and curvature conform across both
        // rows, including implementations which reuse one scratch frame.
        const point = frame.position
          .clone()
          .addScaledVector(frame.right, x)
          .addScaledVector(frame.up, height);
        positions.push(point.x, point.y, point.z);
        normals.push(frame.up.x, frame.up.y, frame.up.z);
        colors.push(color.r, color.g, color.b);
      }
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Timing-aligned start / finish checker';
  mesh.receiveShadow = true;
  mesh.renderOrder = 3;
  const group = new T.Group();
  group.name = 'Race finish marking';
  group.userData = {
    finishDistance: distance,
    start,
    end: start + depth,
    width,
    height,
    columns,
  };
  group.add(mesh);
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
