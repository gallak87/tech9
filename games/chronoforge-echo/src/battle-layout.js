const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Presentation anchors only. Combat homes, timing, targets and save snapshots
// remain untouched when a phone rotates during an action.
export function mobileBattleLayout(viewport) {
  const width = viewport.width / 1.25,
    height = viewport.height / 1.25;
  const cssScale = (viewport.cssScale || 0.8) * 1.25;
  const top = Math.min(height * 0.3, 76 / cssScale),
    usableHeight = Math.max(1, height - top - 8 / cssScale);
  const point = ([x, y]) => ({ x: x * width, y: top + y * usableHeight });
  const portrait = viewport.portrait;
  return {
    width,
    height,
    portrait,
    top,
    cssScale,
    actorScale: Math.min(1, usableHeight / (portrait ? 340 : 270), width / 350),
    heroes: (portrait
      ? [
          [0.22, 0.7],
          [0.15, 0.85],
          [0.37, 0.9],
        ]
      : [
          [0.23, 0.51],
          [0.14, 0.77],
          [0.32, 0.86],
        ]
    ).map(point),
    enemies: {
      1: (portrait ? [[0.72, 0.43]] : [[0.72, 0.68]]).map(point),
      2: (portrait
        ? [
            [0.61, 0.32],
            [0.8, 0.58],
          ]
        : [
            [0.65, 0.4],
            [0.83, 0.8],
          ]
      ).map(point),
      3: (portrait
        ? [
            [0.6, 0.3],
            [0.82, 0.48],
            [0.58, 0.64],
          ]
        : [
            [0.7, 0.38],
            [0.58, 0.79],
            [0.85, 0.85],
          ]
      ).map(point),
      4: (portrait
        ? [
            [0.3, 0.31],
            [0.76, 0.31],
            [0.45, 0.59],
            [0.81, 0.59],
          ]
        : [
            [0.56, 0.4],
            [0.83, 0.4],
            [0.56, 0.85],
            [0.83, 0.85],
          ]
      ).map(point),
    },
  };
}

export function mobileBattlePresentation(battle, layout) {
  const heroes = battle.heroes.map((actor, index) => ({
    ...actor,
    home: layout.heroes[index],
  }));
  const enemies = battle.enemies.map((actor, index) => ({
    ...actor,
    home: layout.enemies[battle.enemies.length][index],
  }));
  const original = [...battle.heroes, ...battle.enemies],
    presented = [...heroes, ...enemies];
  const floaters = battle.floaters.map((floater) => {
    let nearest = 0,
      distance = Infinity;
    original.forEach((actor, index) => {
      const next = Math.hypot(
        floater.x - actor.home.x,
        floater.y - actor.home.y,
      );
      if (next < distance) {
        nearest = index;
        distance = next;
      }
    });
    return {
      ...floater,
      x:
        presented[nearest].home.x +
        (floater.x - original[nearest].home.x) * layout.actorScale,
      y:
        presented[nearest].home.y +
        (floater.y - original[nearest].home.y) * layout.actorScale,
    };
  });
  return { ...battle, heroes, enemies, floaters, presentation: layout };
}

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
