#!/usr/bin/env node
// landscape-gen.js — generate src/scenery.js from landscape-manifest.json
//
// Usage:
//   node tools/landscape-gen.js games/<game>/landscape-manifest.json

const fs   = require('fs');
const path = require('path');

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('Usage: node tools/landscape-gen.js <landscape-manifest.json>');
  process.exit(1);
}

const manifest  = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const gameDir   = path.dirname(path.resolve(manifestPath));
const outPath   = path.join(gameDir, 'src', 'scenery.js');

// ─── Codegen helpers ──────────────────────────────────────────────────────────

function sr(field) {
  // emits: _sr(min, max)
  return `_sr(${field[0]}, ${field[1]})`;
}

function neon(paletteVar) {
  return `_neon(${paletteVar})`;
}

function hex(colorStr) {
  // "#00ccff" → 0x00ccff
  return '0x' + colorStr.replace('#', '');
}

// Emits builder function body for each type
function emitBuilder(type, spec, paletteVar) {
  const lines = [];

  if (type === 'tower') {
    lines.push(`  const h = ${sr(spec.h)}, w = ${sr(spec.w)}, d = ${sr(spec.d)};`);
    lines.push(`  const g = new THREE.Group();`);
    lines.push(`  _addMesh(g, new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x1a1a3a, emissive: 0x0a0a20, emissiveIntensity: 0.4, roughness: 0.7, metalness: 0.3 }), h / 2);`);
    lines.push(`  _addMesh(g, new THREE.BoxGeometry(w + 0.2, h * 0.06, d + 0.2), _basicAdd(${neon(paletteVar)}), h * ${sr([0.55, 0.85])});`);
    lines.push(`  _addMesh(g, new THREE.BoxGeometry(w + 0.2, h * 0.04, d + 0.2), _basicAdd(${neon(paletteVar)}), h * ${sr([0.2, 0.45])});`);
    lines.push(`  return g;`);
  } else if (type === 'spire') {
    lines.push(`  const h = ${sr(spec.h)};`);
    lines.push(`  const g = new THREE.Group();`);
    lines.push(`  _addMesh(g, new THREE.CylinderGeometry(0.1, 0.5, h, 5), new THREE.MeshStandardMaterial({ color: 0x1a1a35, emissive: 0x080818, emissiveIntensity: 0.3, roughness: 0.5, metalness: 0.6 }), h / 2);`);
    lines.push(`  _addMesh(g, new THREE.SphereGeometry(0.5, 8, 8), _basicAdd(${neon(paletteVar)}), h + 0.5);`);
    lines.push(`  return g;`);
  } else if (type === 'pylon') {
    lines.push(`  const h = ${sr(spec.h)}, col = ${neon(paletteVar)};`);
    lines.push(`  const g = new THREE.Group();`);
    lines.push(`  _addMesh(g, new THREE.CylinderGeometry(0.5, 0.8, h, 6), new THREE.MeshStandardMaterial({ color: 0x151530, emissive: 0x080820, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.8 }), h / 2);`);
    lines.push(`  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.14, 8, 20), _basicAdd(col));`);
    lines.push(`  ring.rotation.x = Math.PI / 2;`);
    lines.push(`  ring.position.y = h * ${sr([0.45, 0.75])};`);
    lines.push(`  g.add(ring);`);
    lines.push(`  _addMesh(g, new THREE.OctahedronGeometry(0.6), _basicAdd(col), h + 0.6);`);
    lines.push(`  return g;`);
  } else if (type === 'billboard') {
    const pwRange = spec.pw || [4, 8];
    lines.push(`  const h = ${sr(spec.h)}, pw = ${sr(pwRange)}, ph = pw * ${sr([0.4, 0.6])};`);
    lines.push(`  const g = new THREE.Group();`);
    lines.push(`  _addMesh(g, new THREE.CylinderGeometry(0.2, 0.2, h, 5), new THREE.MeshStandardMaterial({ color: 0x222233 }), h / 2);`);
    lines.push(`  _addMesh(g, new THREE.BoxGeometry(pw, ph, 0.25), new THREE.MeshStandardMaterial({ color: 0x0a0a20, emissive: 0x050510, emissiveIntensity: 0.3 }), h + ph / 2);`);
    lines.push(`  _addMesh(g, new THREE.BoxGeometry(pw + 0.5, ph + 0.5, 0.1), _basicAdd(${neon(paletteVar)}), h + ph / 2);`);
    lines.push(`  return g;`);
  } else if (type === 'wall_panel') {
    const W = 55;
    lines.push(`  const H = ${sr(spec.h)};`);
    lines.push(`  const g = new THREE.Group();`);
    lines.push(`  _addMesh(g, new THREE.BoxGeometry(2, H, ${W}), new THREE.MeshStandardMaterial({ color: 0x0c0c20, emissive: 0x060612, emissiveIntensity: 0.3, roughness: 0.8 }), H / 2);`);
    lines.push(`  const _cols = 7, _rows = 8;`);
    lines.push(`  for (let r = 0; r < _rows; r++) {`);
    lines.push(`    for (let c = 0; c < _cols; c++) {`);
    lines.push(`      if (Math.random() < 0.25) continue;`);
    lines.push(`      const wm = new THREE.Mesh(`);
    lines.push(`        new THREE.BoxGeometry(2.6, _sr(0.8, 2.0), _sr(1.0, 3.0)),`);
    lines.push(`        new THREE.MeshBasicMaterial({ color: ${neon(paletteVar)}, blending: THREE.AdditiveBlending, depthWrite: false })`);
    lines.push(`      );`);
    lines.push(`      wm.position.set(0, (r + 0.7) * (H / _rows), ${-W / 2} + (c + 0.5) * ${(W / 7).toFixed(2)});`);
    lines.push(`      g.add(wm);`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  return g;`);
  } else if (type === 'slab') {
    lines.push(`  const h = ${sr(spec.h)}, w = ${sr(spec.w)}, d = ${sr(spec.d)};`);
    lines.push(`  const g = new THREE.Group();`);
    lines.push(`  _addMesh(g, new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: ${neon(paletteVar)}, emissive: ${neon(paletteVar)}, emissiveIntensity: 0.5, roughness: 1.0, metalness: 0 }), h / 2);`);
    if (spec.windows) {
      const { cols = 3, rows = 6, floorBands = 0 } = spec.windows;
      lines.push(`  for (const _sx of [-1, 1]) {`);
      lines.push(`    for (let _r = 0; _r < ${rows}; _r++) {`);
      lines.push(`      for (let _c = 0; _c < ${cols}; _c++) {`);
      lines.push(`        if (Math.random() < 0.35) continue;`);
      lines.push(`        const _wm = new THREE.Mesh(new THREE.BoxGeometry(0.15, _sr(0.8, 1.8), d / ${cols} * 0.55), _basicAdd(${neon(paletteVar)}));`);
      lines.push(`        _wm.position.set(_sx * (w / 2 + 0.08), (_r + 0.5) * (h / ${rows}), -d / 2 + (_c + 0.5) * (d / ${cols}));`);
      lines.push(`        g.add(_wm);`);
      lines.push(`      }`);
      lines.push(`    }`);
      lines.push(`  }`);
      if (floorBands === 1) {
        lines.push(`  _addMesh(g, new THREE.BoxGeometry(w + 0.3, 0.2, d + 0.3), _basicAdd(${neon(paletteVar)}), h);`);
      } else if (floorBands > 1) {
        lines.push(`  for (let _bi = 0; _bi < ${floorBands}; _bi++) {`);
        lines.push(`    const _by = _bi === 0 ? 0.1 : _bi === ${floorBands - 1} ? h : h * _bi / ${floorBands - 1};`);
        lines.push(`    _addMesh(g, new THREE.BoxGeometry(w + 0.3, 0.2, d + 0.3), _basicAdd(${neon(paletteVar)}), _by);`);
        lines.push(`  }`);
      }
    }
    lines.push(`  return g;`);
  }

  return lines.join('\n');
}

// ─── Generate scenery.js ──────────────────────────────────────────────────────

const sections = [];

sections.push(`// scenery.js — generated by tools/landscape-gen.js — do not hand-edit
// source: ${path.basename(manifestPath)}
import * as THREE from 'three';

function _sr(min, max) { return min + Math.random() * (max - min); }
function _neon(pal) { return pal[Math.floor(Math.random() * pal.length)]; }
function _addMesh(g, geo, mat, y) { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); }
function _basicAdd(col) {
  return new THREE.MeshBasicMaterial({ color: col, blending: THREE.AdditiveBlending, depthWrite: false });
}
function _disposeMesh(obj) {
  obj.traverse(c => { if (c.isMesh) { c.geometry.dispose(); if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); } });
}
`);

const allPools = [];

for (const layer of manifest.layers) {
  const palVar = `_PAL_${layer.name.toUpperCase()}`;
  const poolVar = `_pool_${layer.name}`;

  // palette constant
  sections.push(`const ${palVar} = [${layer.buildings[0] ? layer.palette.map(hex).join(', ') : ''}];`);

  // builder functions per type in this layer
  const builderNames = [];
  const seen = new Set();
  for (const b of layer.buildings) {
    const fnName = `_build_${layer.name}_${b.type}`;
    if (!seen.has(fnName)) {
      seen.add(fnName);
      sections.push(`function ${fnName}() {\n${emitBuilder(b.type, b, palVar)}\n}`);
    }
    for (let w = 0; w < b.weight; w++) builderNames.push(fnName);
  }

  const buildersArr = `[${builderNames.join(', ')}]`;

  sections.push(`function _buildItem_${layer.name}() {
  const builders = ${buildersArr};
  return builders[Math.floor(Math.random() * builders.length)]();
}`);

  // pool variable
  sections.push(`let ${poolVar} = [];`);

  // init function
  if (layer.zRange) {
    // random placement (skyline)
    sections.push(`function _init_${layer.name}(scene) {
  ${poolVar} = [];
  for (let i = 0; i < ${layer.countPerSide} * 2; i++) {
    const side = i < ${layer.countPerSide} ? -1 : 1;
    const mesh = _buildItem_${layer.name}();
    const x = side * _sr(${layer.xRange[0]}, ${layer.xRange[1]});
    const z = _sr(${layer.zRange[0]}, ${layer.zRange[1]});
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    ${poolVar}.push({ mesh, side });
  }
}`);
  } else {
    // evenly spaced pool
    sections.push(`function _init_${layer.name}(scene) {
  ${poolVar} = [];
  for (let i = 0; i < ${layer.countPerSide} * 2; i++) {
    const side = i < ${layer.countPerSide} ? -1 : 1;
    const mesh = _buildItem_${layer.name}();
    const x = side * _sr(${layer.xRange[0]}, ${layer.xRange[1]});
    const z = ${layer.zStart} - (i % ${layer.countPerSide}) * ${layer.zSpacing};
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    ${poolVar}.push({ mesh, side });
  }
}`);
  }

  // update function
  if (layer.zRange) {
    // skyline: simple wrap, no rebuild
    sections.push(`function _update_${layer.name}(scene, dt, worldSpeed) {
  const spd = worldSpeed * ${layer.speedMult};
  for (const s of ${poolVar}) {
    s.mesh.position.z += spd * dt;
    if (s.mesh.position.z > ${layer.wrapZ}) {
      s.mesh.position.z = _sr(${layer.zRange[0]}, ${layer.zRange[1]});
      s.mesh.position.x = s.side * _sr(${layer.xRange[0]}, ${layer.xRange[1]});
    }
  }
}`);
  } else {
    // close layer: rebuild on wrap
    sections.push(`function _update_${layer.name}(scene, dt, worldSpeed) {
  const spd = worldSpeed * ${layer.speedMult};
  for (const s of ${poolVar}) {
    s.mesh.position.z += spd * dt;
    if (s.mesh.position.z > ${layer.wrapZ}) {
      scene.remove(s.mesh);
      _disposeMesh(s.mesh);
      s.mesh = _buildItem_${layer.name}();
      s.mesh.position.set(s.side * _sr(${layer.xRange[0]}, ${layer.xRange[1]}), 0, ${layer.zStart - layer.countPerSide * layer.zSpacing});
      scene.add(s.mesh);
    }
  }
}`);
  }

  allPools.push(layer.name);
}

// Public API
sections.push(`export function initScenery(scene) {
${allPools.map(n => `  _init_${n}(scene);`).join('\n')}
}`);

sections.push(`export function updateScenery(scene, dt, worldSpeed) {
${allPools.map(n => `  _update_${n}(scene, dt, worldSpeed);`).join('\n')}
}`);

const output = sections.join('\n\n') + '\n';
fs.writeFileSync(outPath, output);
console.log(`✓ wrote ${outPath} (${output.length} bytes, ${manifest.layers.length} layers)`);
