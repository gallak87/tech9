export function interactionOverlapsHero(label, anchor, camera, bounds, scale) {
  const x = Math.round(anchor.x - camera.x) * scale,
    y = Math.round(anchor.y - camera.y) * scale;
  return (
    label.left < x + bounds.right * scale &&
    label.left + label.width > x + bounds.left * scale &&
    label.top < y + bounds.bottom * scale &&
    label.top + label.height > y + bounds.top * scale
  );
}
