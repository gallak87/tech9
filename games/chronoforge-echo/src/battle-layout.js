const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Prefer each enemy's overhead position, then the nearest free space. Treat
// the other silhouettes and already placed meters as obstacles, including a
// little breathing room. This only positions HUD; formation anchors stay put.
export function placeEnemyHud(entries, viewport) {
  const placed = [];
  return entries.map((entry) => {
    const obstacles = [
      ...entries.filter((other) => other !== entry).map((other) => other.body),
      ...placed,
    ].map((box) => ({
      x: box.x - 4,
      y: box.y - 4,
      w: box.w + 8,
      h: box.h + 8,
    }));
    const clampX = (x) =>
      Math.max(viewport.x, Math.min(x, viewport.x + viewport.w - entry.w));
    const clampY = (y) =>
      Math.max(viewport.y, Math.min(y, viewport.y + viewport.h - entry.h));
    const xs = [
      entry.x,
      ...obstacles.flatMap((box) => [box.x - entry.w, box.x + box.w]),
    ].map(clampX);
    const ys = [
      entry.y,
      ...obstacles.flatMap((box) => [box.y - entry.h, box.y + box.h]),
    ].map(clampY);
    const candidates = ys.flatMap((y) =>
      xs.map((x) => ({ x, y, w: entry.w, h: entry.h })),
    );
    // Horizontal adjustments preserve the clear association with its head.
    candidates.sort(
      (a, b) =>
        Math.abs(a.x - entry.x) +
        Math.abs(a.y - entry.y) * 2 -
        Math.abs(b.x - entry.x) -
        Math.abs(b.y - entry.y) * 2,
    );
    const box =
      candidates.find(
        (candidate) =>
          !obstacles.some((obstacle) => intersects(candidate, obstacle)),
      ) || candidates[0];
    placed.push(box);
    return { ...entry, ...box };
  });
}
