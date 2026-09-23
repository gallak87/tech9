export function interactionOverlapsHero(
  label,
  anchor,
  camera,
  bounds,
  scale,
  offset = { x: 0, y: 0 },
) {
  const x = Math.round(anchor.x - camera.x) * scale + offset.x,
    y = Math.round(anchor.y - camera.y) * scale + offset.y;
  return (
    label.left < x + bounds.right * scale &&
    label.left + label.width > x + bounds.left * scale &&
    label.top < y + bounds.bottom * scale &&
    label.top + label.height > y + bounds.top * scale
  );
}
