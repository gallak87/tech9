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

  /** Build the character to be measured.
   *
   *  SYNCHRONOUS, and for a graduated character that is not enough: the body is
   *  a fetch that lands ~120 frames later, so a gate that sampled here would
   *  measure the code-built placeholder and pass, green, against a mesh nothing
   *  renders. `beginAsync` is the one callers should use. */
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
    return { id, faction, heightM: actor.heightM, tris: actor.tris, source: actor.source };
  }

  /** begin(), then wait for a generated body if this character has one.
   *
   *  Returns the same summary, with `source` reading 'gltf' once the swap has
   *  landed. Anything that ASSERTS on pixels must await this — see begin(). */
  async function beginAsync(id = 'kaida', faction = 'ally') {
    const info = begin(id, faction);
    if (actor?.forgeReady) {
      await actor.forgeReady;
      /* The swap replaces the body and its skeleton, so the idle pose has to be
         re-applied to the bones that now exist. */
      setPose('idle', 0);
    }
    return { ...info, heightM: actor.heightM, tris: actor.tris, source: actor.source };
  }

  function setPose(name, t = 0) {
    if (!actor) return null;
    const p = samplePose(name, t);
    for (const b of actor.bones) {
      const j = p.j[b.name];
      const x = j ? j[0] : 0, y = j ? j[1] : 0, z = j ? j[2] : 0;
      /* Same write path as the Animator (poses.js). A forged rig binds in an
         A-pose with arbitrary bone axes, so an absolute spec-space rotation has
         to go through its per-bone correction; writing bone.rotation directly
         zeroes the bind of every bone the pose does not name and lays the
         character on her side. `retarget` exists on a forged actor only. */
      if (actor.retarget) actor.retarget.set(b, x, y, z);
      else b.rotation.set(x, y, z);
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
    const g = actor.mesh.geometry;
    const r = actor.partRanges?.[part];
    const nums = [];
    let verts;

    if (r) {
      /* Code-built: parts are authored, so the fingerprint is per-part and the
         assertion is genuinely about THIS part's identity. */
      const c = g.getAttribute('color').array;
      const m = g.getAttribute('aMat').array;
      for (let i = r.start; i < r.start + r.count; i++) {
        nums.push(c[i * 3], c[i * 3 + 1], c[i * 3 + 2], m[i]);
      }
      verts = r.count;
    } else {
      /* Forged: NOT COVERED, and saying so rather than returning a number.
         A generated mesh has no authored part tags, so there is nothing to hash
         per part. A whole-mesh hash was tried and is worse than nothing: it is
         stable within one build and different between two builds of the same
         character, and it did not move when a material scalar on the body was
         changed — a drift detector that cries drift when nothing drifted and
         stays quiet when something did. Proven by --selftest, which is why the
         attempt is not in the tree.

         Material identity for a graduated character is covered instead by
         `npm run retry:probe`, which has 34 checks against the asset itself.
         Closing this properly means finding the forged body's real material on
         the actor — `actor.mesh` is not it — and is its own piece of work. */
      return { part, verts: 0, scope: 'uncovered', hash: null };
    }

    const mat = actor.mesh.material;
    nums.push(mat.color.r, mat.color.g, mat.color.b, mat.roughness, mat.metalness,
      mat.envMapIntensity, mat.emissive.r, mat.emissive.g, mat.emissive.b,
      mat.vertexColors ? 1 : 0, mat.flatShading ? 1 : 0);
    for (const k of Object.keys(uniforms || {}).sort()) {
      const v = uniforms[k].value;
      nums.push(typeof v === 'number' ? v : (v?.x ?? 0), typeof v === 'number' ? 0 : (v?.y ?? 0));
    }
    return { part, verts, scope: 'part', hash: fnv1a(nums) };
  }

  function end(quiet = false) {
    if (actor) {
      scene.remove(actor.root);
      /* A forged body owns geometry and textures the disposes below cannot
         reach. Four characters plus a selftest run means this leaks fast. */
      actor.releaseForge?.();
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
    beginAsync,
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
