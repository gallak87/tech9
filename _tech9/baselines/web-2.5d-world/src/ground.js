// Authored surface treatment for this example. The shared runtime knows nothing
// about its palette, road network or shore. All textures are unchanged presets.
const hash = (n) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
function roadPath(ctx, road) {
  ctx.beginPath();
  road.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}
const roadEdges = new WeakMap();
function edges(road) {
  if (roadEdges.has(road)) return roadEdges.get(road);
  const points = [];
  let travelled = 0;
  for (let j = 1; j < road.points.length; j++) {
    const a = road.points[j - 1],
      b = road.points[j],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    for (let d = 0; d < length; d += 7) {
      const t = d / length;
      for (const side of [-1, 1]) {
        const variation =
          Math.sin((travelled + d) * 0.085 + side) * 3.5 +
          (hash(j * 800 + Math.floor(d) + side) - 0.5) * 7;
        const width = road.width / 2 + variation;
        points.push({
          x: a[0] + dx * t - (dy / length) * width * side,
          y: a[1] + dy * t + (dx / length) * width * side,
          r: 3 + hash(d * 3 + j + side) * 5,
        });
      }
    }
    travelled += length;
  }
  roadEdges.set(road, points);
  return points;
}

export function drawGround(ctx, { scene, camera, viewport, patterns, time }) {
  ctx.fillStyle = patterns[0];
  ctx.fillRect(camera.x, camera.y, viewport.width, viewport.height);
  // Overlapping source-material patches soften the conspicuous atlas repeat.
  for (let i = 0; i < 70; i++) {
    const x = hash(i + 1) * scene.width,
      y = hash(i + 91) * scene.height,
      r = 45 + hash(i + 291) * 125;
    if (
      x + r < camera.x ||
      x - r > camera.x + viewport.width ||
      y + r < camera.y ||
      y - r > camera.y + viewport.height
    )
      continue;
    ctx.fillStyle = patterns[i % 3 === 0 ? 3 : 1];
    for (let k = 5; k > 0; k--) {
      ctx.globalAlpha = 0.035;
      ctx.beginPath();
      ctx.ellipse(x, y, (r * k) / 5, ((r * k) / 5) * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const water of scene.water) {
    polygon(ctx, water);
    ctx.fillStyle = patterns[5];
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (const [width, alpha] of [
      [86, 0.22],
      [56, 0.3],
      [26, 0.6],
    ]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = patterns[4];
      ctx.globalAlpha = alpha;
      polygon(ctx, water);
      ctx.stroke();
    }
    ctx.strokeStyle = '#d4e5cd';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.13;
    for (
      let y = Math.floor(camera.y / 47) * 47;
      y < camera.y + viewport.height;
      y += 47
    ) {
      ctx.beginPath();
      for (let x = camera.x; x < camera.x + viewport.width; x += 12) {
        const py = y + Math.sin(x * 0.019 + time * 0.6) * 3.5;
        x === camera.x ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    // A thin weathered bank sits between the grass and shallow water.
    ctx.strokeStyle = patterns[2];
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    polygon(ctx, water);
    ctx.stroke();
  }
  for (const clearing of scene.clearings) {
    ctx.fillStyle = patterns[2];
    for (let k = 6; k > 0; k--) {
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      ctx.ellipse(
        clearing.x,
        clearing.y,
        (clearing.radius * k) / 6,
        ((clearing.radius * k) / 6) * 0.6,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  for (const road of scene.roads) {
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = patterns[2];
    for (const [extra, alpha] of [
      [18, 0.1],
      [10, 0.18],
      [3, 0.42],
      [-7, 1],
    ]) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = road.width + extra;
      roadPath(ctx, road);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = patterns[0];
    ctx.beginPath();
    for (const p of edges(road)) {
      if (
        p.x < camera.x - 12 ||
        p.y < camera.y - 12 ||
        p.x > camera.x + viewport.width + 12 ||
        p.y > camera.y + viewport.height + 12
      )
        continue;
      ctx.moveTo(p.x + p.r, p.y);
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = patterns[2];
    ctx.beginPath();
    for (const p of edges(road)) {
      ctx.moveTo(p.x + p.r * 0.6, p.y);
      ctx.ellipse(p.x, p.y, p.r * 0.6, p.r * 0.35, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Ground contact and broad shade use the same placements as visible scenery.
  for (const prop of scene.props) {
    if (!['tree', 'cypress', 'cottage', 'ring'].includes(prop.frame)) continue;
    const radius =
      prop.frame === 'tree' ? prop.height * 0.4 : prop.height * 0.22;
    if (
      prop.x + radius < camera.x ||
      prop.x - radius > camera.x + viewport.width ||
      prop.y + radius < camera.y ||
      prop.y - radius > camera.y + viewport.height
    )
      continue;
    const shadow = ctx.createRadialGradient(
      prop.x + radius * 0.22,
      prop.y - 8,
      5,
      prop.x + radius * 0.22,
      prop.y - 8,
      radius,
    );
    shadow.addColorStop(0, 'rgba(14,40,30,.14)');
    shadow.addColorStop(1, 'rgba(14,40,30,0)');
    ctx.fillStyle = shadow;
    ctx.save();
    ctx.translate(0, prop.y * 0.55);
    ctx.scale(1, 0.45);
    ctx.fillRect(prop.x - radius, prop.y - radius, radius * 2, radius * 2);
    ctx.restore();
  }
}
