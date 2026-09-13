// Authored, cached pixel artwork for the original harbor streets. These are
// presentation layers only: the world coordinates and collision remain in world.js.
const cache = new Map();
const P = {
  ink: '#252b31', deep: '#253b37', moss: '#415e43', grass: '#59734d', grassLight: '#829361',
  cream: '#dfc59b', plaster: '#c2a681', plasterShade: '#947e69', wood: '#685044',
  woodDark: '#423932', woodLight: '#ae855b', gold: '#d7ac62', roof: '#645362',
};
const rect = (c, color, x, y, w, h) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function rng(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function surface(w, h) { const a = document.createElement('canvas'); a.width = w; a.height = h; return a; }
function cached(key, w, h, draw) {
  if (!cache.has(key)) { const a = surface(w, h), c = a.getContext('2d'); c.imageSmoothingEnabled = false; draw(c); cache.set(key, a); }
  return cache.get(key);
}
// Rasterized shapes keep the same one-pixel edge language at every material.
function poly(c, col, points) {
  const minY = Math.floor(Math.min(...points.map(p => p[1]))), maxY = Math.ceil(Math.max(...points.map(p => p[1])));
  c.fillStyle = col;
  for (let y = minY; y < maxY; y++) {
    const hits = [], yy = y + .5;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a[1] > yy) !== (b[1] > yy)) hits.push(a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) c.fillRect(Math.round(hits[i]), y, Math.max(1, Math.round(hits[i + 1]) - Math.round(hits[i])), 1);
  }
}
function ellipse(c, col, x, y, rx, ry) {
  c.fillStyle = col;
  for (let yy = -Math.ceil(ry); yy <= ry; yy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2)));
    if (half) c.fillRect(Math.round(x - half), Math.round(y + yy), half * 2, 1);
  }
}
function line(c, col, x0, y0, x1, y1, width = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) { rect(c, col, x0, y0, width, width); if (x0 === x1 && y0 === y1) break; const e = error * 2; if (e >= dy) { error += dy; x0 += sx; } if (e <= dx) { error += dx; y0 += sy; } }
}
function clipPoly(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.clip(); }
function mix(a, b, t) { return '#' + [1, 3, 5].map(n => Math.round(parseInt(a.slice(n, n + 2), 16) * (1 - t) + parseInt(b.slice(n, n + 2), 16) * t).toString(16).padStart(2, '0')).join(''); }

function tuft(c, x, y, size = 1, warm = false) {
  const lo = '#3d5239', mid = warm ? '#7d8850' : '#617b4d', hi = warm ? '#a8a266' : '#91a369';
  line(c, lo, x - 4 * size, y, x + 5 * size, y);
  line(c, mid, x - 1, y, x - 5 * size, y - 4 * size); line(c, mid, x, y, x + 3 * size, y - 6 * size);
  line(c, hi, x, y - 1, x - 1, y - 5 * size); line(c, hi, x + 3, y - 1, x + 5 * size, y - 3 * size);
}
function pavingStone(c, x, y, w, h, col, rnd) {
  const cut = 1 + Math.floor(rnd() * 3), pts = [[x + cut, y], [x + w - 2, y], [x + w, y + 2], [x + w - 1, y + h - 1], [x + 2, y + h], [x, y + h - 3], [x, y + 2]];
  poly(c, '#545b52', pts.map(([a, b]) => [a, b + 2])); poly(c, col, pts);
  line(c, mix(col, '#e8d8b3', .23), x + cut, y, x + w - 3, y);
  line(c, mix(col, '#383e3c', .22), x + 3, y + h - 1, x + w - 2, y + h - 1);
  if (rnd() < .36) { const xx = x + 3 + Math.floor(rnd() * (w - 6)); line(c, mix(col, '#3c4840', .22), xx, y + 1, xx + 2, y + h / 2); }
  if (rnd() < .45) rect(c, mix(col, '#e8d6ad', .16), x + 3, y + 3, Math.max(2, w - 8), 1);
}
function stoneField(c, x, y, w, h, seed, warm = false) {
  const rnd = rng(seed), colors = warm ? ['#aa9878', '#b8a686', '#a39379', '#c0ad8b', '#b09e7f', '#a5957a'] : ['#788278', '#899181', '#737e76', '#919787', '#818777', '#9c9d89'];
  rect(c, warm ? '#8d8468' : '#536454', x, y, w, h);
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  for (let yy = y - 2, row = 0; yy < y + h; yy += 11, row++) {
    let xx = x - (row % 2 ? 10 : 0);
    while (xx < x + w) { const ww = 13 + Math.floor(rnd() * 10), hh = 7 + Math.floor(rnd() * 3); pavingStone(c, xx + 1, yy + 1, ww - 2, hh, colors[Math.floor(rnd() * colors.length)], rnd); xx += ww; }
  }
  c.restore();
}
function water(c) {
  const coast = [[0, 0], [265, 0], [265, 32], [190, 32], [190, 84], [122, 84], [122, 140], [68, 140], [68, 228], [0, 228]];
  // A stone retaining wall follows exactly the traversability polygon.
  c.save(); c.beginPath(); coast.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.strokeStyle = '#39493e'; c.lineWidth = 18; c.stroke(); c.strokeStyle = '#a0a28a'; c.lineWidth = 8; c.stroke(); c.restore();
  poly(c, '#264e61', coast); c.save(); clipPoly(c, coast);
  for (let yy = 0; yy < 230; yy++) rect(c, mix('#315e71', '#20495a', yy / 230), 0, yy, 268, 1);
  const rnd = rng(4246);
  for (let i = 0; i < 130; i++) {
    const x = Math.floor(rnd() * 265), y = Math.floor(rnd() * 230), w = 4 + Math.floor(rnd() * 29);
    line(c, ['#376c79', '#467984', '#2b596b', '#578890'][i % 4], x, y, x + w, y);
    if (i % 4 === 0) { line(c, '#7caaa1', x + 3, y - 1, x + w - 3, y - 1); line(c, '#244b5b', x + 8, y + 2, x + w + 7, y + 2); }
  }
  for (const [xx, yy, ww] of [[174, 31, 83], [127, 82, 55], [73, 138, 45], [6, 222, 55]]) {
    for (let i = 0; i < 4; i++) { line(c, ['#77aaa2', '#467c82', '#376876', '#305e6e'][i], xx, yy - i * 4, xx + ww - i * 3, yy - i * 4); }
  }
  c.restore();
  for (const [xx, yy, length] of [[190, 34, 72], [122, 86, 65], [69, 142, 51], [0, 230, 65]]) {
    for (let a = 0; a < length; a += 13) { rect(c, '#565f55', xx + a, yy, 1, 5); rect(c, '#c0b99a', xx + a + 2, yy, 9, 1); }
  }
  // Jetty planks, tarred posts, rope coils, and a moored clinker-built skiff.
  poly(c, '#172f3b77', [[20, 82], [71, 86], [72, 223], [24, 228]]);
  for (let y = 84; y < 214; y += 8) {
    rect(c, '#554536', 20, y, 46, 7); rect(c, y % 16 ? '#98774e' : '#a08357', 21, y, 44, 5);
    line(c, '#c1a275', 22, y, 64, y); line(c, '#71573c', 24, y + 3, 61, y + 3);
    for (const x of [25, 60]) rect(c, '#403c33', x, y + 1, 1, 1);
  }
  for (const y of [85, 143, 208]) for (const x of [18, 64]) {
    rect(c, '#292e2d', x, y - 2, 6, 16); rect(c, '#836c4d', x, y - 4, 5, 14); ellipse(c, '#c8b189', x + 2, y - 4, 3, 2); rect(c, '#51473b', x + 1, y + 4, 5, 2);
  }
  ellipse(c, '#d0bd8f', 43, 98, 8, 3); ellipse(c, '#7b6447', 43, 98, 5, 2); ellipse(c, '#b49e71', 43, 98, 3, 1);
  line(c, '#b1a382', 66, 146, 80, 139); line(c, '#526656', 67, 147, 81, 140);
  poly(c, '#203744', [[77, 97], [96, 86], [115, 99], [115, 153], [96, 174], [78, 154]]);
  poly(c, '#705242', [[77, 94], [94, 84], [112, 94], [112, 151], [94, 171], [77, 151]]);
  poly(c, '#c0905f', [[80, 95], [94, 89], [109, 95], [107, 151], [94, 165], [81, 150]]);
  poly(c, '#564437', [[83, 99], [94, 92], [106, 99], [104, 148], [94, 160], [84, 147]]);
  for (const y of [109, 136]) { rect(c, '#aa8057', 83, y, 22, 5); rect(c, '#dcc093', 83, y, 22, 1); }
  line(c, '#d5bb88', 93, 98, 99, 153, 2); poly(c, '#9e7951', [[95, 149], [103, 147], [106, 160], [101, 164]]);
  line(c, '#d5b383', 78, 95, 79, 150); line(c, '#d5b383', 79, 150, 93, 168);
}
function compass(c) {
  ellipse(c, '#596457', 402, 324, 47, 29); ellipse(c, '#b5ac89', 400, 320, 46, 29);
  ellipse(c, '#6b715b', 400, 320, 43, 26); ellipse(c, '#c5b891', 400, 320, 41, 24);
  ellipse(c, '#9d9777', 400, 320, 34, 20); ellipse(c, '#b1a882', 400, 319, 32, 18);
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; line(c, '#5c6853', 400 + Math.cos(a) * 39, 320 + Math.sin(a) * 23, 400 + Math.cos(a) * (i % 3 ? 36 : 33), 320 + Math.sin(a) * (i % 3 ? 21 : 19)); }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, long = i % 2 ? 21 : 34, x = 400 + Math.sin(a) * long, y = 320 - Math.cos(a) * long * .66;
    poly(c, '#6a6951', [[400, 320], [400 + Math.cos(a) * 5, 320 + Math.sin(a) * 4], [x + 1, y + 1]]);
    poly(c, i % 2 ? '#b3a067' : '#e1bd6f', [[400, 320], [400 - Math.cos(a) * 5, 320 - Math.sin(a) * 4], [x, y]]);
  }
  ellipse(c, '#715f40', 400, 320, 5, 3); ellipse(c, '#e1c684', 400, 319, 3, 2);
}
function flowerBed(c, x, y) {
  rect(c, '#3a4e3e', x - 31, y - 2, 64, 13); rect(c, '#657460', x - 30, y - 4, 60, 11);
  for (let a = -29; a < 30; a += 10) { rect(c, '#a6a78c', x + a, y - 4, 9, 2); rect(c, '#475b48', x + a, y + 6, 9, 2); }
  rect(c, '#4c4b35', x - 27, y - 4, 53, 4);
  for (let i = 0; i < 13; i++) {
    const xx = x - 26 + i * 4, yy = y - 4 - (i * 7) % 5;
    line(c, '#68804a', xx, y, xx, yy - 7); line(c, '#92a55e', xx, yy, xx - 3, yy - 2); line(c, '#4b6947', xx, yy + 1, xx + 3, yy - 2);
    const col = i % 3 ? '#d4ab89' : '#bd7684'; rect(c, col, xx - 1, yy - 8, 3, 3); rect(c, '#f1cd9b', xx, yy - 8, 1, 1);
  }
}
function groundArt(c, region) {
  const rnd = rng(515384);
  rect(c, '#566e49', 0, 0, 800, 400);
  // Authored meadow contours around the harbor and high street.
  for (const [col, pts] of [
    ['#496343', [[260, 0], [365, 0], [347, 96], [317, 148], [332, 224], [302, 273], [64, 273], [68, 192], [136, 154], [178, 89]]],
    ['#425e43', [[451, 0], [800, 0], [800, 216], [754, 244], [670, 195], [626, 154], [543, 149], [482, 103]]],
    ['#60774e', [[198, 63], [306, 50], [335, 91], [315, 167], [266, 164], [223, 184], [162, 162], [137, 132]]],
    ['#668053', [[479, 120], [551, 105], [631, 136], [676, 184], [731, 207], [741, 256], [490, 252]]],
    ['#475f43', [[0, 367], [348, 369], [351, 400], [0, 400]]],
    ['#4b6545', [[450, 362], [800, 359], [800, 400], [441, 400]]],
  ]) poly(c, col, pts);
  for (let i = 0; i < 1500; i++) {
    const x = Math.floor(rnd() * 800), y = Math.floor(rnd() * 400);
    // Small connected blades and moss flecks follow large forms instead of a tiled grid.
    const light = rnd() > .69;
    rect(c, light ? '#718454' : '#4d6844', x, y, 2 + Math.floor(rnd() * 4), 1);
    if (light) rect(c, '#849460', x + 1, y - 1, 1, 1);
  }
  // Road corridors remain precisely aligned with the adjoining region.
  rect(c, '#485740', 0, 273, 800, 94); rect(c, '#485740', 351, 0, 98, 400);
  rect(c, '#8a8966', 0, 279, 800, 82); rect(c, '#8a8966', 358, 0, 84, 400);
  rect(c, '#b5a17c', 0, 284, 800, 73); rect(c, '#b5a17c', 363, 0, 74, 400);
  for (let yy = 0; yy < 245; yy += 10) {
    pavingStone(c, 351, yy, 6, 9, '#82907a', rnd); pavingStone(c, 442, yy + 3, 5, 9, '#77856f', rnd);
    rect(c, '#c0ad88', 366, yy, 64, 1); if (yy % 30 === 0) tuft(c, 348, yy + 5, .7);
  }
  // Fine wheel-rut wear in the north road; uneven stones on the plaza apron.
  line(c, '#a69473', 380, 0, 385, 247, 2); line(c, '#a99775', 418, 0, 411, 246, 2);
  for (let i = 0; i < 130; i++) { const x = 365 + Math.floor(rnd() * 70), y = Math.floor(rnd() * 249); rect(c, i % 4 ? '#bdac86' : '#948567', x, y, 1 + Math.floor(rnd() * 3), 1); }
  // Raised pavement retains the old 60..740 / 245..377 walkable square.
  rect(c, '#344b3e', 54, 240, 692, 147); rect(c, '#647461', 58, 243, 684, 139);
  stoneField(c, 62, 248, 676, 131, 29153);
  for (let x = 58; x < 742; x += 19) { pavingStone(c, x, 244, 18, 6, '#a0a18a', rnd); pavingStone(c, x, 379, 18, 5, '#7f8a73', rnd); }
  stoneField(c, 0, 296, 800, 51, 3984, true);
  // Side roads approach in the original palette, without visible region seams.
  for (let yy = 296; yy < 347; yy++) for (let xx = 767; xx < 800; xx++) {
    const t = (xx - 767) / 33; c.globalAlpha = t * .8; rect(c, region.palette.road, xx, yy, 1, 1);
  }
  c.globalAlpha = 1;
  stoneField(c, 375, 347, 50, 53, 7231, true);
  compass(c);
  // Plants spring from pavement joints and the road shoulders, never from doors.
  for (const [x, y, s] of [[41, 279, 1], [24, 366, .8], [81, 390, .8], [132, 386, .7], [307, 390, .8], [348, 371, .7], [452, 389, .8], [564, 389, 1], [681, 387, .8], [760, 378, 1], [760, 274, .8], [465, 234, .7], [335, 229, .7]]) tuft(c, x, y, s, x > 400);
  for (const x of [190, 610]) flowerBed(c, x, 372);
  water(c);
  // Reveal the existing biome blend at the east seam and ease back into the
  // untouched commons ground at y=400. The last column/row is exactly the base.
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (let x = 766; x < 800; x++) { c.globalAlpha = (x - 765) / 34; rect(c, '#ffffff', x, 0, 1, 400); }
  for (let y = 384; y < 400; y++) { c.globalAlpha = (y - 383) / 16; rect(c, '#ffffff', 0, y, 800, 1); }
  c.restore();
}

/** Draw after the existing local ground; transparent below y=400 leaves the commons intact. */
export function drawHaventideGround(ctx, region) {
  if (region.id !== 'haventide') return false;
  const a = cached('ground', 800, 400, c => groundArt(c, region));
  ctx.drawImage(a, 0, 0); return true;
}

function beam(c, x, y, w, h, vertical = true) {
  rect(c, P.woodDark, x, y, w, h); rect(c, P.wood, x + 1, y, w - 1, h - 1);
  if (vertical) { rect(c, '#a6815c', x + 1, y + 1, 1, h - 2); rect(c, '#473d35', x + w - 1, y + 1, 1, h - 1); line(c, '#7d5e46', x + 3, y + 7, x + 2, y + h - 5); }
  else { rect(c, '#bb9369', x, y, w - 1, 1); rect(c, '#493a33', x + 1, y + h - 1, w - 1, 1); }
  for (const [xx, yy] of vertical ? [[x + 2, y + 3], [x + 2, y + h - 5]] : [[x + 4, y + 2], [x + w - 6, y + 2]]) { rect(c, '#3a3831', xx, yy, 1, 1); rect(c, '#c0a17c', xx, yy - 1, 1, 1); }
}
function masonry(c, x, y, w, h, seed, dark = false) {
  const rnd = rng(seed); rect(c, dark ? '#554e48' : '#84735f', x, y, w, h);
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  for (let yy = y, row = 0; yy < y + h; yy += 7, row++) for (let xx = x - (row % 2 ? 6 : 0); xx < x + w; xx += 12) {
    const shade = rnd(), col = dark ? mix('#716a5d', '#9c8870', shade) : mix('#a18e72', '#cfb593', shade);
    rect(c, col, xx + 1, yy + 1, 10, 5); line(c, mix(col, '#efdab6', .24), xx + 1, yy + 1, xx + 10, yy + 1);
    if (shade > .7) rect(c, mix(col, '#574c43', .3), xx + 4, yy + 3, 3, 1);
  }
  c.restore();
}
function roof(c, x, y, half = 67, height = 42, color = P.roof) {
  const shape = [[x - half, y], [x - half + 18, y - height], [x + half - 19, y - height], [x + half, y]];
  poly(c, '#35343d', shape.map(([xx, yy]) => [xx, yy + 6])); poly(c, '#493f4c', shape);
  c.save(); clipPoly(c, shape); const rnd = rng(half * 340 + height * 66);
  for (let row = 0, yy = y - height - 2; yy < y + 1; yy += 6, row++) {
    for (let xx = x - half - 8 + (row % 2) * 5; xx < x + half; xx += 10) {
      const col = mix(color, row < 2 ? '#ba8d9a' : '#92748a', .07 + rnd() * .38);
      rect(c, '#423945', xx, yy, 10, 7); rect(c, col, xx + 1, yy, 8, 5);
      line(c, mix(col, '#d8abb1', .25), xx + 1, yy, xx + 8, yy); line(c, mix(col, '#332f3b', .21), xx + 2, yy + 5, xx + 7, yy + 5);
      if (rnd() > .7) line(c, '#867281', xx + 3, yy + 2, xx + 6, yy + 2);
    }
  }
  c.restore();
  line(c, '#b69a9b', x - half + 17, y - height, x - half, y, 2);
  line(c, '#564650', x + half - 18, y - height, x + half, y, 2);
  beam(c, x - half - 1, y + 1, half * 2 + 3, 4, false);
  for (let xx = x - half + 20; xx < x + half - 17; xx += 9) { rect(c, '#796575', xx, y - height - 3, 9, 4); rect(c, '#baa095', xx, y - height - 3, 8, 1); rect(c, '#4a414c', xx + 8, y - height - 2, 1, 3); }
}
function window(c, x, y, w = 19, h = 24, warm = false) {
  rect(c, '#4b403c', x - 2, y - 2, w + 4, h + 5); rect(c, '#a68560', x - 1, y - 1, w + 2, h + 2); rect(c, '#353c3d', x, y, w, h);
  const glass = warm ? ['#e1aa60', '#efc079', '#9d7153'] : ['#668c91', '#abc1b1', '#496972'];
  rect(c, glass[0], x + 2, y + 2, w - 4, h - 4); rect(c, glass[1], x + 2, y + 2, w - 4, 5); rect(c, glass[2], x + 2, y + h - 6, w - 4, 4);
  line(c, '#e4c698', x + 2, y + 2, x + 2, y + h - 3); line(c, '#809f9c', x + 3, y + h - 8, x + w - 5, y + 4);
  rect(c, '#71523e', x + Math.floor(w / 2), y, 2, h); rect(c, '#cfab77', x + Math.floor(w / 2), y + 1, 1, h - 2);
  rect(c, '#705340', x + 1, y + Math.floor(h / 2), w - 2, 2); rect(c, '#d4b183', x + 1, y + Math.floor(h / 2), w - 2, 1);
  rect(c, '#463a33', x - 4, y + h + 2, w + 8, 3); rect(c, '#d3b78e', x - 4, y + h + 1, w + 8, 2);
}
function shutter(c, x, y, w, h, side) {
  const col = side ? '#637567' : '#718675'; rect(c, '#494d40', x, y, w, h); rect(c, col, x + 1, y, w - 2, h - 1);
  for (let yy = y + 2; yy < y + h - 2; yy += 4) { rect(c, '#98a084', x + 1, yy, w - 2, 1); rect(c, '#495e52', x + 1, yy + 2, w - 2, 1); }
  rect(c, '#c1aa80', x, y + 4, w, 2); rect(c, '#c1aa80', x, y + h - 7, w, 2);
}
function flowers(c, x, y, w = 27) {
  beam(c, x, y, w, 7, false); rect(c, '#473d30', x + 1, y, w - 2, 2);
  for (let i = 0; i < w - 3; i += 3) { const yy = y - (i * 3) % 6; line(c, '#52704a', x + i + 1, y, x + i + 2, yy - 3); rect(c, '#899856', x + i, yy - 2, 4, 2); rect(c, i % 2 ? '#ba6d83' : '#dc9c99', x + i + 1, yy - 5, 3, 3); rect(c, '#f2c29f', x + i + 1, yy - 5, 1, 1); }
}
function barrel(c, x, y, size = 1) {
  c.save(); c.translate(x, y); c.scale(size, size);
  poly(c, '#423b31', [[-8, -20], [-11, -15], [-11, -4], [-7, 1], [7, 1], [11, -4], [11, -15], [7, -20]]);
  poly(c, '#8d6947', [[-7, -19], [-9, -15], [-9, -4], [-6, 0], [6, 0], [9, -4], [9, -15], [6, -19]]);
  for (const xx of [-6, -2, 3, 7]) { line(c, '#503f32', xx, -17, xx + (xx > 0 ? -1 : 1), -1); line(c, '#b58b57', xx + 1, -17, xx + (xx > 0 ? 0 : 2), -2); }
  for (const yy of [-15, -5]) { rect(c, '#545952', -10, yy, 20, 3); rect(c, '#a3a08a', -9, yy, 17, 1); rect(c, '#c8bc8e', -5, yy + 1, 1, 1); }
  ellipse(c, '#c39e6d', 0, -19, 8, 3); ellipse(c, '#7f6042', 0, -19, 6, 2); line(c, '#b38d5b', -4, -19, 4, -19);
  c.restore();
}
function crate(c, x, y, w = 21, h = 17) {
  rect(c, '#514234', x, y - h, w, h); rect(c, '#aa8255', x + 1, y - h + 1, w - 2, h - 2);
  for (let xx = x + 4; xx < x + w; xx += 5) rect(c, '#76583c', xx, y - h + 2, 1, h - 3);
  beam(c, x, y - h, w, 3, false); beam(c, x, y - 3, w, 3, false); line(c, '#dbb783', x + 2, y - 4, x + w - 3, y - h + 3, 2);
  for (const xx of [x + 1, x + w - 2]) for (const yy of [y - h + 1, y - 2]) rect(c, '#463f34', xx, yy, 1, 1);
}
function door(c, x, y, service) {
  // Entrance/steps end at the original y-5 front boundary.
  masonry(c, x - 20, y - 51, 40, 41, 991, true); rect(c, '#292d2b', x - 15, y - 48, 30, 38);
  rect(c, '#7b563d', x - 12, y - 44, 25, 33);
  for (let a = -11; a < 12; a += 5) { rect(c, a < 0 ? '#946a46' : '#684a37', x + a, y - 43, 4, 31); rect(c, '#b78d59', x + a, y - 42, 1, 30); }
  for (const yy of [y - 38, y - 18]) { rect(c, '#4b4437', x - 12, yy, 10, 2); rect(c, '#a09a75', x - 10, yy, 1, 1); }
  rect(c, '#372f29', x + 6, y - 29, 4, 5); rect(c, '#e6bc6c', x + 7, y - 28, 2, 3); rect(c, '#fff0af', x + 7, y - 28, 1, 1);
  rect(c, '#5a5848', x - 24, y - 10, 48, 7); rect(c, '#aea589', x - 23, y - 11, 46, 4); rect(c, '#dfc9a0', x - 22, y - 11, 43, 1); rect(c, '#626952', x - 18, y - 3, 35, 1);
  if (service === 'inn') { rect(c, '#77504b', x - 13, y - 7, 26, 4); rect(c, '#b08661', x - 11, y - 7, 22, 1); }
}
function sign(c, x, y, type) {
  rect(c, '#333939', x, y, 23, 2); line(c, '#9b9274', x + 1, y, x + 18, y - 7); rect(c, '#333939', x + 18, y - 7, 2, 19);
  for (const dx of [5, 20]) { rect(c, '#383c35', x + dx, y + 2, 1, 7); rect(c, '#c0b084', x + dx + 1, y + 3, 1, 5); }
  rect(c, '#3b3732', x, y + 9, 27, 22); rect(c, '#926e48', x + 1, y + 10, 25, 20); rect(c, '#d3b37e', x + 2, y + 11, 23, 17); rect(c, '#edcf91', x + 3, y + 11, 21, 1); rect(c, '#704f35', x + 2, y + 28, 23, 1);
  const xx = x + 13, yy = y + 19, col = '#564534';
  if (type === 'inn') { rect(c, col, xx - 7, yy - 2, 14, 5); rect(c, col, xx - 8, yy - 5, 2, 10); rect(c, col, xx + 6, yy - 1, 2, 6); rect(c, '#f8d59c', xx - 5, yy - 3, 4, 2); }
  if (type === 'shop') { poly(c, col, [[xx - 6, yy - 3], [xx + 6, yy - 3], [xx + 5, yy + 6], [xx - 5, yy + 6]]); line(c, col, xx - 3, yy - 3, xx - 2, yy - 6); line(c, col, xx - 2, yy - 6, xx + 2, yy - 6); line(c, col, xx + 2, yy - 6, xx + 3, yy - 3); rect(c, '#e9c485', xx - 3, yy, 6, 1); }
  if (type === 'smith') { poly(c, col, [[xx - 8, yy - 4], [xx + 8, yy - 4], [xx + 5, yy], [xx + 2, yy], [xx + 2, yy + 4], [xx + 6, yy + 4], [xx + 6, yy + 6], [xx - 6, yy + 6], [xx - 6, yy + 4], [xx - 2, yy + 4], [xx - 2, yy], [xx - 5, yy]]); rect(c, '#f9de9c', xx - 7, yy - 5, 14, 1); }
  if (type === 'archive') { poly(c, col, [[xx - 8, yy - 6], [xx - 1, yy - 5], [xx, yy - 3], [xx + 1, yy - 5], [xx + 8, yy - 6], [xx + 8, yy + 6], [xx + 1, yy + 5], [xx, yy + 6], [xx - 1, yy + 5], [xx - 8, yy + 6]]); rect(c, '#e6c691', xx - 6, yy - 3, 4, 7); rect(c, '#e6c691', xx + 2, yy - 3, 4, 7); }
}
function buildingArt(c, service) {
  const x = 96, y = 191;
  ellipse(c, '#20332c40', x + 9, y + 1, 67, 12);
  // Recessed plaster bays sit on a hand-laid stone foundation, with the shaded
  // east return visible inside the same old collision footprint.
  poly(c, '#4a463e', [[x - 57, y - 88], [x + 51, y - 88], [x + 61, y - 77], [x + 61, y - 12], [x - 57, y - 12]]);
  rect(c, '#c0a17d', x - 55, y - 87, 106, 66); rect(c, '#9e8267', x + 51, y - 79, 9, 64);
  rect(c, '#d4b78e', x - 54, y - 82, 103, 51); rect(c, '#ad916f', x - 54, y - 83, 103, 9);
  const rnd = rng(service.length * 8287);
  for (let i = 0; i < 85; i++) { const xx = x - 53 + Math.floor(rnd() * 103), yy = y - 75 + Math.floor(rnd() * 45); rect(c, i % 3 ? '#c9ad83' : '#bea17a', xx, yy, 2 + Math.floor(rnd() * 5), 1); }
  masonry(c, x - 56, y - 27, 108, 15, 4285); masonry(c, x + 52, y - 25, 8, 14, 711, true);
  for (const dx of [-56, -23, 21, 48]) beam(c, x + dx, y - 87, 5, 65);
  beam(c, x - 58, y - 31, 111, 5, false); beam(c, x - 58, y - 78, 113, 5, false);
  line(c, '#634b39', x - 49, y - 75, x - 27, y - 54, 3); line(c, '#ac8257', x - 49, y - 75, x - 27, y - 54);
  line(c, '#634b39', x + 25, y - 54, x + 47, y - 75, 3); line(c, '#ad8359', x + 25, y - 54, x + 47, y - 75);
  rect(c, '#665849', x - 58, y - 88, 114, 8); rect(c, '#847159', x - 56, y - 84, 109, 3);
  window(c, x - 47, y - 67, 18, 25, service === 'smith'); window(c, x + 27, y - 67, 18, 25, service === 'inn');
  if (service !== 'smith') { shutter(c, x - 53, y - 67, 5, 24, false); shutter(c, x + 46, y - 67, 5, 24, true); }
  roof(c, x, y - 80, 67, 39);
  // Carved corbels carry the eaves and cast small directional shadows.
  for (const xx of [-51, -26, 23, 49]) { rect(c, '#483c34', x + xx, y - 75, 4, 7); rect(c, '#bb9468', x + xx, y - 75, 2, 5); }
  if (service !== 'smith') {
    masonry(c, x + 31, y - 139, 12, 39, 777, true); rect(c, '#4b443e', x + 28, y - 140, 18, 4); rect(c, '#c4ae8b', x + 27, y - 141, 20, 2); rect(c, '#343a38', x + 31, y - 141, 12, 1);
  }
  if (service === 'inn') {
    rect(c, '#4e3d34', x - 24, y - 143, 47, 38); rect(c, '#c7a783', x - 21, y - 142, 41, 37);
    poly(c, '#513d38', [[x - 28, y - 139], [x, y - 164], [x + 28, y - 139]]); poly(c, '#887083', [[x - 24, y - 140], [x, y - 160], [x + 24, y - 140]]);
    for (let row = 0; row < 3; row++) line(c, '#ad8a97', x - 7 - row * 6, y - 155 + row * 6, x + 7 + row * 6, y - 155 + row * 6);
    line(c, '#d4b699', x - 28, y - 139, x, y - 164, 2); line(c, '#6d5156', x, y - 164, x + 28, y - 139, 2); beam(c, x - 28, y - 140, 57, 3, false);
    window(c, x - 13, y - 134, 26, 25, true); flowers(c, x - 53, y - 39, 28); flowers(c, x + 23, y - 39, 28);
    barrel(c, x - 65, y - 4, .8); crate(c, x - 53, y - 4, 19, 14);
    // Climbing vine wraps the left timber rather than reading as flat ornament.
    for (let i = 0; i < 16; i++) { const yy = y - 28 - i * 3, xx = x - 55 + Math.round(Math.sin(i * .8) * 3); line(c, '#536948', xx, yy, xx + 1, yy - 4); ellipse(c, i % 2 ? '#7e8c4e' : '#496743', xx + (i % 2 ? -3 : 3), yy, 3, 1); }
  } else if (service === 'shop') {
    // A real draped canvas awning: top highlights, sagging seams and shaded hems.
    poly(c, '#35372f66', [[x - 57, y - 50], [x + 59, y - 49], [x + 60, y - 30], [x - 57, y - 29]]);
    beam(c, x - 54, y - 62, 3, 50); beam(c, x + 53, y - 62, 3, 50);
    for (let i = 0; i < 10; i++) {
      const xx = x - 58 + i * 12, light = i % 2, base = light ? '#d6bc8b' : '#8c5c70';
      poly(c, '#574046', [[xx, y - 65], [xx + 12, y - 65], [xx + 14, y - 43], [xx + 11, y - 37], [xx + 3, y - 37], [xx, y - 41]]);
      poly(c, base, [[xx + 1, y - 65], [xx + 11, y - 65], [xx + 13, y - 43], [xx + 10, y - 40], [xx + 3, y - 40], [xx, y - 42]]);
      poly(c, light ? '#edd5a1' : '#b07d8b', [[xx + 1, y - 64], [xx + 4, y - 64], [xx + 5, y - 44], [xx + 1, y - 43]]);
      line(c, light ? '#aa8868' : '#6e495c', xx + 11, y - 63, xx + 13, y - 43);
      line(c, light ? '#f3d99f' : '#c18f99', xx + 3, y - 41, xx + 10, y - 41);
    }
    for (const xx of [-48, 33]) {
      crate(c, x + xx - 10, y - 3, 29, 18); rect(c, '#463e2f', x + xx - 9, y - 23, 27, 6);
      for (let i = 0; i < 7; i++) { const a = x + xx - 8 + (i * 7) % 23, b = y - 23 - (i % 2) * 3; ellipse(c, xx < 0 ? '#aa8150' : '#667c47', a, b, 3, 3); ellipse(c, xx < 0 ? '#dec078' : '#a1b46a', a - 1, b - 1, 2, 1); }
    }
    crate(c, x - 30, y - 122, 27, 13); barrel(c, x + 13, y - 122, .7);
  } else if (service === 'smith') {
    // Soot-dark chimney and an arched furnace, built from individual voussoirs.
    masonry(c, x + 24, y - 169, 25, 82, 2461, true); rect(c, '#3c3e3b', x + 25, y - 167, 4, 78); rect(c, '#aa977a', x + 44, y - 166, 3, 77);
    rect(c, '#514a40', x + 20, y - 171, 33, 6); rect(c, '#d0b18a', x + 20, y - 172, 33, 2); rect(c, '#333a35', x + 26, y - 171, 21, 2);
    rect(c, '#373b38', x - 50, y - 70, 27, 35); masonry(c, x - 53, y - 67, 6, 32, 626, true); masonry(c, x - 27, y - 67, 6, 32, 633, true);
    poly(c, '#5b4a3d', [[x - 48, y - 58], [x - 43, y - 65], [x - 32, y - 65], [x - 27, y - 58], [x - 27, y - 38], [x - 48, y - 38]]);
    rect(c, '#763d2e', x - 46, y - 57, 17, 18); rect(c, '#b35b35', x - 45, y - 50, 16, 11);
    for (const [dx, h] of [[-43, 13], [-39, 19], [-35, 12]]) { poly(c, '#e68e42', [[x + dx - 2, y - 39], [x + dx - 1, y - 47], [x + dx, y - 39 - h], [x + dx + 3, y - 44], [x + dx + 4, y - 39]]); poly(c, '#f5c36d', [[x + dx, y - 39], [x + dx + 1, y - 47], [x + dx + 3, y - 39]]); }
    for (let i = 0; i < 6; i++) { const a = Math.PI + i * Math.PI / 5; rect(c, i < 3 ? '#b69c7d' : '#8c7761', x - 39 + Math.cos(a) * 13, y - 56 + Math.sin(a) * 12, 6, 5); }
    rect(c, '#dfac6e', x - 54, y - 36, 34, 3); rect(c, '#685443', x - 54, y - 33, 34, 2);
    // Riveted sheet-metal repairs catch the light differently from slate.
    poly(c, '#514951', [[x - 47, y - 108], [x - 19, y - 110], [x - 14, y - 92], [x - 48, y - 89]]); poly(c, '#8a7b79', [[x - 45, y - 107], [x - 21, y - 108], [x - 18, y - 94], [x - 46, y - 91]]); line(c, '#b8a699', x - 45, y - 106, x - 21, y - 107);
    for (const dx of [-42, -24]) for (const yy of [-103, -95]) { rect(c, '#48484a', x + dx, y + yy, 2, 2); rect(c, '#cfbaa0', x + dx, y + yy, 1, 1); }
    barrel(c, x - 63, y - 3, .65); crate(c, x + 35, y + 2, 20, 13);
    poly(c, '#373d3d', [[x + 30, y - 20], [x + 62, y - 20], [x + 58, y - 15], [x + 49, y - 13], [x + 50, y - 8], [x + 57, y - 5], [x + 57, y - 3], [x + 36, y - 3], [x + 36, y - 6], [x + 42, y - 9], [x + 42, y - 14], [x + 35, y - 14]]);
    line(c, '#c7beb0', x + 30, y - 20, x + 61, y - 20); line(c, '#889590', x + 36, y - 18, x + 54, y - 18); rect(c, '#6e7773', x + 43, y - 14, 6, 5);
  } else if (service === 'archive') {
    masonry(c, x - 28, y - 151, 56, 46, 2518); beam(c, x - 29, y - 112, 58, 4, false);
    poly(c, '#3c4543', [[x - 34, y - 150], [x - 22, y - 169], [x, y - 185], [x + 23, y - 168], [x + 34, y - 150]]);
    poly(c, '#597c73', [[x - 31, y - 152], [x - 20, y - 168], [x, y - 181], [x + 22, y - 166], [x + 30, y - 152]]);
    poly(c, '#7e9a80', [[x - 31, y - 152], [x - 20, y - 168], [x, y - 181], [x - 5, y - 153]]);
    for (let i = 0; i < 4; i++) { const yy = y - 156 - i * 6, ww = 26 - i * 6; line(c, '#a7af84', x - ww, yy, x + ww, yy); }
    line(c, '#d0bb83', x, y - 182, x - 5, y - 152); rect(c, '#b29664', x - 1, y - 188, 2, 7); ellipse(c, '#ead39a', x, y - 188, 2, 2); beam(c, x - 34, y - 151, 69, 4, false);
    window(c, x - 15, y - 143, 30, 28, false);
    for (let i = 0; i < 5; i++) { line(c, '#62787c', x - 12 + i * 5, y - 139, x - 2 + i * 5, y - 123); line(c, '#b9c7b3', x - 12 + i * 5, y - 124, x - 2 + i * 5, y - 140); }
    rect(c, '#ddd0a7', x - 1, y - 143, 2, 27); flowers(c, x - 52, y - 38, 28); flowers(c, x + 24, y - 38, 28);
    crate(c, x - 63, y - 3, 21, 18); rect(c, '#6d5360', x - 59, y - 27, 14, 8); rect(c, '#d9c69a', x - 58, y - 26, 12, 5); rect(c, '#516c66', x - 62, y - 31, 16, 4); rect(c, '#ead5a9', x - 61, y - 30, 14, 2);
  }
  door(c, x, y, service); sign(c, x + 51, y - 79, service);
}

/** World coordinates; y is the original service-door/feet anchor. */
export function drawHaventideBuilding(ctx, obj, region) {
  if (region.id !== 'haventide' || obj.type !== 'door' || !['inn', 'shop', 'smith', 'archive'].includes(obj.service)) return false;
  const a = cached(`building:${obj.service}`, 192, 206, c => buildingArt(c, obj.service));
  ctx.drawImage(a, Math.round(obj.x - 96), Math.round(obj.y - 191)); return true;
}

function leafCluster(c, x, y, rx, ry, seed, bright) {
  const rnd = rng(seed), colors = bright ? ['#375845', '#426d4e', '#568158', '#759664', '#9da873'] : ['#2d4940', '#365c46', '#47734f', '#648452', '#8b9a60'];
  // Eight irregular lobes form a broad volume. Individual leaf pairs only occur
  // within that silhouette, with highlights favoring its upper-left shoulder.
  const outline = [];
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, k = .86 + rnd() * .2; outline.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
  poly(c, colors[0], outline.map(([a, b]) => [a, b + 3])); poly(c, colors[1], outline);
  c.save(); clipPoly(c, outline);
  ellipse(c, colors[2], x - rx * .14, y - ry * .14, rx * .88, ry * .85);
  ellipse(c, colors[3], x - rx * .21, y - ry * .35, rx * .62, ry * .53);
  for (let i = 0; i < rx * ry * .62; i++) {
    const xx = x - rx + rnd() * rx * 2, yy = y - ry + rnd() * ry * 2;
    const illumination = (x - xx) / rx * .22 + (y - yy) / ry * .36 + rnd() * .48;
    const col = illumination > .63 ? colors[4] : illumination > .23 ? colors[3] : illumination > -.11 ? colors[2] : colors[0];
    rect(c, col, xx, yy, 2 + (i % 3), 1); if (i % 3 === 0) rect(c, col, xx + 1, yy - 1, 2, 1);
    if (illumination > .7 && i % 2 === 0) rect(c, '#b1b886', xx, yy - 1, 1, 1);
  }
  c.restore();
}
function treeArt(c, variant) {
  const x = 64, y = 142, flip = variant % 2 ? 1 : -1;
  ellipse(c, '#19332c2b', x + 12, y + 3, 44, 13); ellipse(c, '#233b2d46', x + 5, y + 1, 29, 8);
  poly(c, '#343e32', [[x - 7, y - 59], [x + 8, y - 60], [x + 6, y - 28], [x + 11, y - 8], [x + 24, y], [x + 14, y + 2], [x + 3, y - 2], [x - 6, y + 2], [x - 21, y], [x - 10, y - 11], [x - 6, y - 28]]);
  poly(c, '#69563e', [[x - 5, y - 60], [x + 5, y - 60], [x + 3, y - 28], [x + 7, y - 8], [x + 14, y - 1], [x + 4, y - 5], [x - 4, y - 2], [x - 14, y - 1], [x - 6, y - 14]]);
  line(c, '#a78d5c', x - 4, y - 54, x - 4, y - 18, 2); line(c, '#8b744b', x - 4, y - 18, x - 10, y - 4, 2);
  for (const [dx, dy] of [[-22, -77], [25, -82], [-34, -55], [29, -54]]) { line(c, '#333e32', x + (dx < 0 ? -3 : 3), y - 38, x + dx, y + dy, 5); line(c, '#82704b', x + (dx < 0 ? -3 : 3), y - 39, x + dx, y + dy, 2); }
  for (const [dx, yy] of [[0, -40], [2, -22], [-3, -11]]) { ellipse(c, '#3d4232', x + dx, y + yy, 2, 4); line(c, '#a68a55', x + dx - 2, y + yy - 4, x + dx - 2, y + yy + 2); }
  // Branch-attached boughs overlap back-to-front. The varied silhouettes and
  // directional value clusters remain readable at the walking scale.
  const boughs = [[-26, -61, 21, 19], [29, -67, 25, 22], [-32, -89, 19, 18], [26, -94, 24, 20], [-7, -111, 26, 21], [-10, -81, 30, 24], [14, -76, 23, 20], [-20, -62, 17, 15], [5, -54, 20, 14]];
  boughs.forEach(([dx, dy, rx, ry], i) => leafCluster(c, x + dx * flip, y + dy + (variant === 2 ? i % 3 * 2 : 0), rx, ry, 928 * (variant + 1) + i * 49, i === 4 || i === 5));
  tuft(c, x - 12, y + 2, .7); tuft(c, x + 13, y, .7);
  for (const [dx, dy] of [[-22, 4], [22, 7], [34, -1]]) { rect(c, '#85884d', x + dx, y + dy, 3, 1); rect(c, '#ad9b58', x + dx + 1, y + dy - 1, 1, 1); }
}
function rockArt(c, variant) {
  const x = 64, y = 142;
  ellipse(c, '#263d3044', x + 6, y + 2, 30, 9);
  poly(c, '#384638', [[x - 28, y - 1], [x - 33, y - 15], [x - 25, y - 34], [x - 7, y - 45], [x + 19, y - 36], [x + 30, y - 21], [x + 32, y - 5], [x + 16, y + 1]]);
  poly(c, '#8c9381', [[x - 29, y - 15], [x - 23, y - 33], [x - 6, y - 42], [x + 17, y - 34], [x + 5, y - 23], [x - 8, y - 18]]);
  poly(c, '#6a7968', [[x - 29, y - 15], [x - 8, y - 18], [x + 5, y - 23], [x + 12, y - 6], [x - 9, y - 2], [x - 25, y - 5]]);
  poly(c, '#506353', [[x + 5, y - 23], [x + 18, y - 32], [x + 28, y - 20], [x + 29, y - 7], [x + 12, y - 4]]);
  line(c, '#b5b49a', x - 23, y - 33, x - 6, y - 42); line(c, '#c4bea0', x - 6, y - 42, x + 14, y - 35); line(c, '#a4a88d', x - 26, y - 29, x - 28, y - 17);
  for (const [dx, dy, ex, ey] of [[-3, -39, -7, -31], [-7, -31, -1, -25], [7, -20, 13, -16], [13, -16, 15, -7], [-22, -13, -10, -14]]) line(c, '#596658', x + dx, y + dy, x + ex, y + ey);
  const rnd = rng(429 + variant * 994); for (let i = 0; i < 30; i++) { const xx = x - 20 + rnd() * 39, yy = y - 10 - rnd() * 23; rect(c, i % 3 ? '#7c896e' : '#acac88', xx, yy, 2 + i % 3, 1); }
  for (const [dx, dy] of [[-23, -8], [-12, -4], [17, -5]]) { ellipse(c, '#4a6948', x + dx, y + dy, 7, 3); rect(c, '#8c9a5f', x + dx - 3, y + dy - 2, 5, 1); }
  tuft(c, x - 29, y, .8); tuft(c, x + 20, y + 1, .7);
}
function lampArt(c) {
  const x = 64, y = 142;
  ellipse(c, '#283e3242', x + 6, y + 2, 17, 5); rect(c, '#323c36', x - 7, y - 4, 15, 5); rect(c, '#9b9675', x - 6, y - 4, 12, 1);
  poly(c, '#343c39', [[x - 5, y - 4], [x - 2, y - 12], [x - 2, y - 52], [x + 3, y - 52], [x + 3, y - 12], [x + 6, y - 4]]);
  line(c, '#b4a57b', x - 1, y - 51, x - 1, y - 9); line(c, '#676f58', x + 1, y - 50, x + 1, y - 8);
  for (const yy of [-15, -45, -51]) { rect(c, '#414940', x - 4, y + yy, 9, 3); rect(c, '#a89b72', x - 4, y + yy, 8, 1); }
  ellipse(c, '#e2ba5c0c', x, y - 62, 20, 16); ellipse(c, '#f0c56412', x, y - 62, 14, 12);
  poly(c, '#34393a', [[x - 10, y - 70], [x + 10, y - 70], [x + 8, y - 52], [x - 8, y - 52]]);
  poly(c, '#ad7544', [[x - 8, y - 69], [x + 8, y - 69], [x + 6, y - 54], [x - 6, y - 54]]);
  rect(c, '#efc575', x - 6, y - 67, 11, 11); rect(c, '#ffe8a5', x - 4, y - 66, 6, 10); rect(c, '#fff3c1', x - 3, y - 64, 3, 7);
  line(c, '#c79f64', x - 8, y - 69, x - 6, y - 54); line(c, '#635f49', x + 7, y - 68, x + 6, y - 54); rect(c, '#7a714f', x, y - 69, 1, 15);
  rect(c, '#4c4b3c', x - 10, y - 54, 20, 3); rect(c, '#ac9564', x - 9, y - 54, 18, 1);
  poly(c, '#36413c', [[x - 13, y - 70], [x - 8, y - 73], [x - 3, y - 79], [x + 3, y - 79], [x + 8, y - 73], [x + 13, y - 70]]);
  poly(c, '#6c7961', [[x - 11, y - 71], [x - 2, y - 78], [x, y - 78], [x - 2, y - 71]]); line(c, '#a9a57a', x - 11, y - 71, x - 2, y - 78); rect(c, '#c2b081', x - 1, y - 82, 2, 4); rect(c, '#3a4239', x - 12, y - 70, 25, 2);
}

/** Returns false for props that should retain the regular regional renderer. */
export function drawHaventideScenery(ctx, obj, region) {
  if (region.id !== 'haventide' || !['tree', 'rock', 'lamp'].includes(obj.type)) return false;
  const variant = obj.variant || 0, a = cached(`prop:${obj.type}:${variant}`, 128, 158, c => obj.type === 'tree' ? treeArt(c, variant) : obj.type === 'rock' ? rockArt(c, variant) : lampArt(c));
  const size = obj.size || 1;
  ctx.drawImage(a, Math.round(obj.x - 64 * size), Math.round(obj.y - 142 * size), Math.round(128 * size), Math.round(158 * size)); return true;
}
