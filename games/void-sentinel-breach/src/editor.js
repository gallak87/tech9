import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── State ────────────────────────────────────────────────────────────────────
let manifest = null;
let previewMeshes = [];

// Seeded RNG — same seed = same layout. Sliders reuse seed; Apply picks a new one.
let _seed = Date.now();
function _rng() {
  _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0;
  let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
let _seedSnapshot = _seed;
let _originalSeed = _seed;
function resetRng() { _seed = _seedSnapshot; }
function newSeed() { _seedSnapshot = Date.now() ^ (Math.random() * 0xFFFFFF | 0); _seed = _seedSnapshot; }
function restoreOriginalSeed() { _seedSnapshot = _originalSeed; _seed = _originalSeed; }

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const debouncedPreview = debounce(() => { resetRng(); buildPreview(); }, 100);

// ─── ThreeJS setup ────────────────────────────────────────────────────────────
const wrap = document.getElementById('canvas-wrap');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(wrap.clientWidth, wrap.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
wrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000814);

scene.add(new THREE.AmbientLight(0x223344, 1.2));
const sun = new THREE.DirectionalLight(0x8899ff, 2.5);
sun.position.set(-10, 20, 10);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xff4400, 0.6);
rim.position.set(5, -2, -10);
scene.add(rim);

// ground grid for reference
const gridHelper = new THREE.GridHelper(200, 40, 0x112233, 0x0a1520);
gridHelper.position.z = -80;
scene.add(gridHelper);

const camera = new THREE.PerspectiveCamera(65, wrap.clientWidth / wrap.clientHeight, 0.1, 600);
camera.position.set(0, 14, 35);
camera.lookAt(0, 6, -80);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, -80);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.update();

window.addEventListener('resize', () => {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ─── Builder helpers ──────────────────────────────────────────────────────────
function sr(range) { return range[0] + _rng() * (range[1] - range[0]); }
function neon(palette) { return new THREE.Color(palette[Math.floor(_rng() * palette.length)]); }
function basicAdd(col) {
  return new THREE.MeshBasicMaterial({ color: col, blending: THREE.AdditiveBlending, depthWrite: false });
}
function addMesh(g, geo, mat, y) {
  const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m);
}

function buildWallPanel(spec, palette) {
  const H = sr(spec.h);
  const W = 55;
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(2, H, W),
    new THREE.MeshStandardMaterial({ color: 0x0c0c20, emissive: 0x060612, emissiveIntensity: 0.3, roughness: 0.8 }),
    H / 2);
  const cols = 7, rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (_rng() < 0.25) continue;
      const wm = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, sr([0.8, 2.0]), sr([1.0, 3.0])),
        basicAdd(neon(palette))
      );
      wm.position.set(0, (r + 0.7) * (H / rows), -W / 2 + (c + 0.5) * (W / cols));
      g.add(wm);
    }
  }
  return g;
}

function buildSlab(spec, palette) {
  const h = sr(spec.h), w = sr(spec.w || [4, 12]), d = sr(spec.d || [4, 10]);
  const col = neon(palette);
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 1 }),
    h / 2);
  return g;
}

function buildTower(spec, palette) {
  const h = sr(spec.h), w = sr(spec.w || [2, 5]), d = sr(spec.d || [2, 4]);
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0x1a1a3a, emissive: 0x0a0a20, emissiveIntensity: 0.4, roughness: 0.7 }),
    h / 2);
  addMesh(g, new THREE.BoxGeometry(w + 0.2, h * 0.06, d + 0.2), basicAdd(neon(palette)), h * sr([0.55, 0.85]));
  return g;
}

function buildSpire(spec, palette) {
  const h = sr(spec.h);
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.1, 0.5, h, 5),
    new THREE.MeshStandardMaterial({ color: 0x1a1a35, emissive: 0x080818, emissiveIntensity: 0.3, roughness: 0.5, metalness: 0.6 }),
    h / 2);
  addMesh(g, new THREE.SphereGeometry(0.5, 8, 8), basicAdd(neon(palette)), h + 0.5);
  return g;
}

const BUILDERS = { wall_panel: buildWallPanel, slab: buildSlab, tower: buildTower, spire: buildSpire };

function buildItem(layer) {
  const weighted = [];
  for (const b of layer.buildings) for (let w = 0; w < (b.weight || 1); w++) weighted.push(b);
  const spec = weighted[Math.floor(_rng() * weighted.length)];
  const fn = BUILDERS[spec.type];
  return fn ? fn(spec, layer.palette) : null;
}

// ─── Preview build ────────────────────────────────────────────────────────────
function disposeGroup(g) {
  g.traverse(c => {
    if (c.isMesh) { c.geometry.dispose(); if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); }
  });
}

function buildPreview() {
  previewMeshes.forEach(m => { scene.remove(m); disposeGroup(m); });
  previewMeshes = [];

  for (const layer of manifest.layers) {
    const count = (layer.countPerSide || 10) * 2;
    const perSide = layer.countPerSide || 10;
    const spacing = layer.zSpacing || 50;
    const xRange = layer.xRange || [10, 14];

    for (let i = 0; i < count; i++) {
      const side = i < perSide ? -1 : 1;
      const mesh = buildItem(layer);
      if (!mesh) continue;
      const x = side * (xRange[0] + _rng() * (xRange[1] - xRange[0]));
      let z;
      if (layer.zRange) {
        z = layer.zRange[0] + _rng() * (layer.zRange[1] - layer.zRange[0]);
      } else {
        z = (layer.zStart || -10) - (i % perSide) * spacing;
      }
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      previewMeshes.push(mesh);
    }
  }
}

// ─── Slider UI ────────────────────────────────────────────────────────────────
function makeSlider(label, value, min, max, step, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const row = document.createElement('div');
  row.className = 'field-row';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min; slider.max = max; slider.step = step;
  slider.value = value;
  const val = document.createElement('span');
  val.className = 'val';
  val.textContent = value;
  slider.addEventListener('input', () => {
    val.textContent = slider.value;
    onChange(parseFloat(slider.value));
    debouncedPreview();
  });
  row.append(slider, val);
  wrap.append(lbl, row);
  return wrap;
}

function makePalette(palette, layerIndex) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lbl = document.createElement('label');
  lbl.textContent = 'Palette';
  const row = document.createElement('div');
  row.className = 'palette-row';
  palette.forEach((color, ci) => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = color;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = color;
    input.addEventListener('input', () => {
      swatch.style.background = input.value;
      manifest.layers[layerIndex].palette[ci] = input.value;
      debouncedPreview();
    });
    swatch.appendChild(input);
    row.appendChild(swatch);
  });
  wrap.append(lbl, row);
  return wrap;
}

function buildUI() {
  const container = document.getElementById('layers');
  container.innerHTML = '';

  manifest.layers.forEach((layer, li) => {
    const block = document.createElement('div');
    block.className = 'layer-block';

    const title = document.createElement('div');
    title.className = 'layer-title';
    title.innerHTML = `<span>${layer.name}</span><span>▾</span>`;

    const body = document.createElement('div');
    body.className = 'layer-body';

    if (layer.countPerSide !== undefined) {
      body.appendChild(makeSlider('Count / side', layer.countPerSide, 1, 30, 1, v => { manifest.layers[li].countPerSide = v; }));
    }
    if (layer.xRange) {
      body.appendChild(makeSlider('X offset (min)', layer.xRange[0], 0, 60, 0.5, v => { manifest.layers[li].xRange[0] = v; }));
      body.appendChild(makeSlider('X offset (max)', layer.xRange[1], 0, 60, 0.5, v => { manifest.layers[li].xRange[1] = v; }));
    }
    if (layer.zSpacing !== undefined) {
      body.appendChild(makeSlider('Z spacing', layer.zSpacing, 5, 120, 1, v => { manifest.layers[li].zSpacing = v; }));
    }
    if (layer.speedMult !== undefined) {
      body.appendChild(makeSlider('Speed mult', layer.speedMult, 0.1, 2.0, 0.05, v => { manifest.layers[li].speedMult = v; }));
    }
    layer.buildings.forEach((b, bi) => {
      if (b.h) {
        body.appendChild(makeSlider(`${b.type} h min`, b.h[0], 1, 100, 1, v => { manifest.layers[li].buildings[bi].h[0] = v; }));
        body.appendChild(makeSlider(`${b.type} h max`, b.h[1], 1, 100, 1, v => { manifest.layers[li].buildings[bi].h[1] = v; }));
      }
    });
    body.appendChild(makePalette(layer.palette, li));

    title.addEventListener('click', () => {
      body.style.display = body.style.display === 'none' ? '' : 'none';
    });

    block.append(title, body);
    container.appendChild(block);
  });
}

// ─── Actions ──────────────────────────────────────────────────────────────────
const status = document.getElementById('status');
let originalManifest = null;

document.getElementById('btn-newseed').addEventListener('click', () => { newSeed(); buildPreview(); });

document.getElementById('btn-reset').addEventListener('click', () => {
  manifest = JSON.parse(originalManifest);
  restoreOriginalSeed();
  buildUI();
  buildPreview();
});

document.getElementById('btn-save').addEventListener('click', async () => {
  status.style.color = '#8af';
  status.textContent = 'saving…';
  try {
    const res = await fetch('/api/save-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manifest, null, 2),
    });
    const json = await res.json();
    if (json.ok) {
      status.style.color = '#6a8';
      status.textContent = '✓ saved & generated';
    } else {
      throw new Error(json.error);
    }
  } catch (e) {
    status.style.color = '#e55';
    status.textContent = '✗ ' + e.message;
  }
  setTimeout(() => status.textContent = '', 3000);
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const res = await fetch('/landscape-manifest.json');
  const text = await res.text();
  originalManifest = text;
  manifest = JSON.parse(text);
  buildUI();
  buildPreview();
  _originalSeed = _seedSnapshot; // lock in the seed used for the initial layout
}

init();
