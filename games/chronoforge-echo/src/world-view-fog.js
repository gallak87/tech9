import { FOG_CELL } from './maps.js';

// A small, disposable fog texture. Feather inward from the explored boundary
// so the unknown area stays opaque rather than exposing distant landmarks.
export function worldViewFogPixels(scene, state) {
  const scale = Math.min(1 / 12, 512 / Math.max(scene.width, scene.height));
  const width = Math.max(1, Math.ceil(scene.width * scale)),
    height = Math.max(1, Math.ceil(scene.height * scale));
  const data = new Uint8ClampedArray(width * height * 4),
    cells = state.fog?.[scene.id] || {};
  const feather = FOG_CELL * 0.65;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const wx = ((x + 0.5) * scene.width) / width,
        wy = ((y + 0.5) * scene.height) / height;
      const cx = Math.floor(wx / FOG_CELL),
        cy = Math.floor(wy / FOG_CELL);
      let opacity = 1;
      if (cells[`${cx},${cy}`]) {
        let distance = feather;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx,
              ny = cy + dy,
              left = nx * FOG_CELL,
              top = ny * FOG_CELL;
            if (
              left >= scene.width ||
              top >= scene.height ||
              left + FOG_CELL <= 0 ||
              top + FOG_CELL <= 0 ||
              cells[`${nx},${ny}`]
            )
              continue;
            distance = Math.min(
              distance,
              Math.hypot(
                Math.max(left - wx, 0, wx - left - FOG_CELL),
                Math.max(top - wy, 0, wy - top - FOG_CELL),
              ),
            );
          }
        const t = distance / feather;
        opacity = 1 - t * t * (3 - 2 * t);
      }
      const shade = Math.round(
        3 * Math.sin(wx / 290 + Math.sin(wy / 370)) +
          2 * Math.cos(wy / 210 - wx / 430),
      );
      const i = (y * width + x) * 4;
      data[i] = 47 + shade;
      data[i + 1] = 61 + shade;
      data[i + 2] = 66 + shade;
      data[i + 3] = Math.round(opacity * 255);
    }
  return { width, height, data };
}
