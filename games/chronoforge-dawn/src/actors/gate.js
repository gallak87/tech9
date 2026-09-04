import * as THREE from 'three';
import { buildActor } from './rig.js';
import { makeActorMaterial } from './material.js';
import { samplePose, POSE_NAMES } from './poses.js';
import { quantiseColor } from '../../docs/specs/palette.mjs';
import { HERO_HEIGHTS_M, HEIGHT_TOLERANCE, TONE_BANDS } from '../../docs/specs/rig.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// The rig gate's measurement rig — the half of tools/rig.mjs that has to live
// in the page because it needs the GPU.
//
// It builds its OWN actor in its OWN scene under its OWN fixed lights and
// renders to its OWN 192×288 target. Nothing here reads the live world, the
// hour, the exposure or the post chain, and that is deliberate: the gate's
// question is "is this the same character in every pose", and a measurement
// that moves when the sun moves cannot answer it. How it LOOKS is the
// screenshots' job.
//
// The gate exposes `actor` so a tool can reach in and deliberately break
// something. A gate that has never been shown to fail is not evidence.
// ─────────────────────────────────────────────────────────────────────────────

const W = 192, H = 288;
const FRAME_M = 2.10;                 // metres of world across the target height
const M_PER_PX = FRAME_M / H;

function fnv1a(nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    const v = Math.round((Number.isFinite(n) ? n : 0) * 1e6) | 0;
    for (let s = 0; s < 32; s += 8) {
      h ^= (v >>> s) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

export function makeGate(ctx) {
  const { engine } = ctx;
  const renderer = engine.renderer;

  let scene = null, cam = null, rt = null, buf = null;
  let actor = null, material = null, uniforms = null;

  function ensure() {
    if (scene) return;
    scene = new THREE.Scene();
    scene.name = 'rig-gate';

    // A 20°/8° three-quarter so limb spread contributes to the silhouette
    // instead of hiding behind the torso, but the character still reads
    // front-on. Orthographic: a perspective divide would make silhouette area
    // a function of how far a limb reaches toward the lens.
    const aspect = W / H;
    cam = new THREE.OrthographicCamera(
      -FRAME_M * aspect / 2, FRAME_M * aspect / 2, FRAME_M / 2, -FRAME_M / 2, 0.05, 30);
    const yaw = THREE.MathUtils.degToRad(20), pitch = THREE.MathUtils.degToRad(8);
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * 6, 0.90 + Math.sin(pitch) * 6, Math.cos(yaw) * Math.cos(pitch) * 6);
    cam.lookAt(0, 0.90, 0);

    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(2.6, 3.4, 4.2);
    key.castShadow = false;
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.1);
    rim.position.set(-3.0, 1.6, -3.4);
    rim.castShadow = false;
    scene.add(key, rim, new THREE.AmbientLight(0x3a4358, 0.9));

    rt = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
      depthBuffer: true,
      samples: 0,                       // no MSAA: an antialiased edge is not a
    });                                 // silhouette, it is a guess about one
    buf = new Uint8Array(W * H * 4);
  }

  function begin(id = 'kaida', faction = 'ally') {
    ensure();
    end(true);
    uniforms = {
      uSnapPx: { value: 0 },            // the gate measures the rig, not the snap
      uResolution: { value: new THREE.Vector2(W, H) },
      uBands: { value: TONE_BANDS },
      uBandStrength: { value: 0.85 },
      uPivot: { value: 0.34 },
      uTopGain: { value: 6.0 },
      uEmissive: { value: 3.2 },
    };
    material = makeActorMaterial(uniforms, { name: 'gate-actor' });
    actor = buildActor({ id, faction, uniforms, material });
    scene.add(actor.root);
    setPose('idle', 0);
    return { id, faction, heightM: actor.heightM, tris: actor.tris };
  }

  function setPose(name, t = 0) {
    if (!actor) return null;
    const p = samplePose(name, t);
    for (const b of actor.bones) {
      const j = p.j[b.name];
      b.rotation.set(j ? j[0] : 0, j ? j[1] : 0, j ? j[2] : 0);
    }
    actor.root.position.set(0, p.root.y, p.root.z);
    actor.root.rotation.y = p.root.yaw;
    actor.root.updateMatrixWorld(true);
    return { name, t };
  }

  /** Render and read back. Everything the gate asserts comes out of here. */
  function sample() {
    if (!actor) return null;
    const prevRT = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);

    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);

    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevColor, prevAlpha);

    let area = 0, minX = W, maxX = -1, minY = H, maxY = -1;
    const hist = new Map();
    const qcache = new Map();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (buf[i + 3] < 128) continue;
        area++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        const packed = (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
        let q = qcache.get(packed);
        if (q === undefined) {
          q = quantiseColor('#' + packed.toString(16).padStart(6, '0'), 6);
          qcache.set(packed, q);
        }
        hist.set(q, (hist.get(q) || 0) + 1);
      }
    }
    const bboxH = maxY >= 0 ? (maxY - minY + 1) : 0;
    const bboxW = maxX >= 0 ? (maxX - minX + 1) : 0;
    const shares = {};
    for (const [k, v] of hist) shares[k] = v / Math.max(1, area);
    return {
      area, bboxW, bboxH,
      heightM: bboxH * M_PER_PX,
      widthM: bboxW * M_PER_PX,
      colors: [...hist.keys()].sort(),
      shares,
      distinct: hist.size,
      mPerPx: M_PER_PX, w: W, h: H,
    };
  }

  /**
   * Material fingerprint for a named part. "Zero material drift in a fixed head
   * and torso sample" means exactly this: the vertex colours, the per-vertex
   * material classes and every shading uniform behind them must be
   * byte-identical in every pose. A pose that mutated a material — the classic
   * "flash the hero red when hurt" done wrong — moves this hash.
   */
  function fingerprint(part = 'head') {
    if (!actor) return null;
    const r = actor.partRanges[part];
    if (!r) return null;
    const g = actor.mesh.geometry;
    const c = g.getAttribute('color').array;
    const m = g.getAttribute('aMat').array;
    const nums = [];
    for (let i = r.start; i < r.start + r.count; i++) {
      nums.push(c[i * 3], c[i * 3 + 1], c[i * 3 + 2], m[i]);
    }
    const mat = actor.mesh.material;
    nums.push(mat.color.r, mat.color.g, mat.color.b, mat.roughness, mat.metalness,
      mat.envMapIntensity, mat.emissive.r, mat.emissive.g, mat.emissive.b,
      mat.vertexColors ? 1 : 0, mat.flatShading ? 1 : 0);
    for (const k of Object.keys(uniforms).sort()) {
      const v = uniforms[k].value;
      nums.push(typeof v === 'number' ? v : (v?.x ?? 0), typeof v === 'number' ? 0 : (v?.y ?? 0));
    }
    return { part, verts: r.count, hash: fnv1a(nums) };
  }

  function end(quiet = false) {
    if (actor) {
      scene.remove(actor.root);
      actor.mesh.geometry.dispose();
      actor.weapon?.geometry.dispose();
      actor.beacon?.geometry.dispose();
      actor.beaconMat?.dispose();
      material?.dispose();
      actor = null; material = null;
    }
    return quiet ? undefined : true;
  }

  return {
    begin, setPose, sample, fingerprint, end,
    poses: POSE_NAMES,
    heroes: Object.keys(HERO_HEIGHTS_M),
    heightTolerance: HEIGHT_TOLERANCE,
    heroHeights: HERO_HEIGHTS_M,
    get actor() { return actor; },
    get scene() { return scene; },
    get uniforms() { return uniforms; },
    /** Raw RGBA of the last sample(), bottom-up, W×H. tools/rig.mjs composites
     *  the pose contact sheet from this in-page — a gate whose result nobody
     *  can look at is a number arguing with itself. */
    get pixels() { return buf; },
    get size() { return { w: W, h: H }; },
    dispose() {
      end(true);
      rt?.dispose();
      scene = null; cam = null; rt = null;
    },
  };
}
