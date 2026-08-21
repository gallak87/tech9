import * as THREE from 'three';
import { WORLD } from './profile.js';
import { seaCeilingMaterial } from './world-materials.js';

// ─────────────────────────────────────────────────────────────────────────────
// The canopy — a lid over a `terrain` world.
//
// Only Aquas has one, and it is the reason Aquas is not another canyon. The
// heightfield is single-valued, so `terrain` can never put geometry above the
// rail; `works` can, but only as a built roof at a fixed height in a box. This
// is the third case: an open natural corridor with a *surface* over it, 330 m
// up, that you can see and cannot pass.
//
// It is one plane, not a mesh of the sea. Nothing about a surface seen from
// 300 m below survives as geometry — swell subtends under a degree from there
// and the read is entirely refraction, caustics and the critical angle, all of
// which live in the shader (`seaCeilingMaterial`). What the geometry has to do
// is exactly two things: cover the frame, and carry enough vertices that the
// fog varyings interpolate honestly across it.
//
// ── Why it follows the camera ────────────────────────────────────────────────
// water.js is rail-aligned specifically so the waterline cannot drift, and that
// reasoning does not transfer: a lid has no shoreline, no contact with the
// terrain and no feature at a fixed world position. Its shader reads world XZ,
// so moving the plane under it changes nothing that is drawn. One plane that
// follows is 8k triangles against the ~90 chunks a rail-aligned version of the
// same coverage would need.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CANOPY = {
  /** World Y of the surface. */
  y: 330,
  /** Half-extent of the plane. Must clear the fog's useful range. */
  half: 7200,
  /** Segments per side. Fog depth is a varying, so this is a fog-accuracy dial. */
  seg: 64,
  tint: [0.20, 0.62, 0.66],
  sunTint: [1.30, 1.80, 1.72],
  /** Clearance under the surface that `ceilingAt` reports. */
  margin: 14,
};

export class Canopy {
  constructor(root) {
    this.group = new THREE.Group();
    this.group.name = 'canopy';
    root.add(this.group);
    this.jobs = [];
    this.mesh = null;
    this.material = null;
    this._sun = null;
    this._sunDir = new THREE.Vector3(0, 1, 0);

    this.cfg = { ...DEFAULT_CANOPY, ...(WORLD.canopy || {}) };
    this.jobs.push(() => this._build());
  }

  /** Underside of the surface, or Infinity where a world has no lid. */
  static ceilingY() {
    if (!WORLD.canopy) return Infinity;
    const c = { ...DEFAULT_CANOPY, ...WORLD.canopy };
    return c.y - c.margin;
  }

  _build() {
    const C = this.cfg;
    const g = new THREE.PlaneGeometry(C.half * 2, C.half * 2, C.seg, C.seg);
    g.rotateX(-Math.PI / 2);
    this.material = seaCeilingMaterial({ tint: C.tint, sunTint: C.sunTint });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'canopy.surface';
    this.mesh.position.y = C.y;
    // The plane is always overhead and always the far plane of anything looking
    // up; culling it against a frustum whose corner it straddles costs a frame
    // where the sky is simply missing.
    this.mesh.frustumCulled = false;
    // Behind everything solid. It never occludes: nothing in the level is above
    // it, so writing depth only risks z-fighting with a boss that station-keeps
    // high.
    this.mesh.renderOrder = -900;
    this.group.add(this.mesh);
  }

  /** Track the camera in XZ. World-space UVs, so nothing shifts when it moves. */
  updateLOD(camPos) {
    if (!this.mesh) return;
    this.mesh.position.x = camPos.x;
    this.mesh.position.z = camPos.z;
  }

  /**
   * `scene` is walked once, for the key light. The sun patch is the brightest
   * thing on the lid and it has to sit where the sun actually is, or the level
   * has two suns in it.
   */
  update(dt, time, scene) {
    const sh = this.material && this.material.userData.shader;
    if (!sh) return;
    sh.uniforms.uTime.value = time;
    if (!this._sun && scene) {
      let best = -1;
      scene.traverse((o) => {
        if (o.isDirectionalLight && o.intensity > best) { best = o.intensity; this._sun = o; }
      });
    }
    if (this._sun) {
      this._sunDir.copy(this._sun.position).sub(this._sun.target.position).normalize();
      sh.uniforms.uSunDir.value.copy(this._sunDir);
    }
  }

  dispose() {
    if (this.mesh) this.mesh.geometry.dispose();
    if (this.material) this.material.dispose();
    this.group.removeFromParent();
    this.mesh = null;
    this.material = null;
    this._sun = null;
  }
}

export { DEFAULT_CANOPY };
