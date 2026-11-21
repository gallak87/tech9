import { editorDragCurve } from './route.js';

// Map the authored centerline into the same viewBox as the game's circuit cards.
export function editorRouteOutline(document) {
  if (document.points.length < 2) return null;
  const curve = editorDragCurve(document);
  const points = curve.getPoints(Math.max(64, document.points.length * 3));
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const left = Math.min(...xs);
  const top = Math.min(...zs);
  const width = Math.max(...xs) - left;
  const height = Math.max(...zs) - top;
  const scale = Math.min(260 / Math.max(1, width), 150 / Math.max(1, height));
  const xy = points.map(({ x, z }) => [
    +(150 + (x - left - width / 2) * scale).toFixed(1),
    +(95 + (z - top - height / 2) * scale).toFixed(1),
  ]);
  return {
    path: 'M' + xy.join('L') + (curve.closed ? 'Z' : ''),
    start: xy[0],
    closed: curve.closed,
    length: Math.max(0, curve.getLength() - (curve.closed ? 0 : 600)),
  };
}
