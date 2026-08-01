import * as THREE from 'three';
import { WORLD, centrelineX, centrelineY, terrainHeight, terrainNormal, profileAt, heightAtU } from './profile.js';
import { terrainMaterial, waterMaterial, deepWaterMaterial } from './world-materials.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { registerWorldShots } from './shots.js';

// ─────────────────────────────────────────────────────────────────────────────
// Corneria — the river corridor you fly down at 175 m/s.
//
// Nine kilometres of it: an open bay, a gorge that closes to a hundred metres,
// a city built up both banks, a breached dam and a delta that opens back out to
// sea. This file owns nothing but the assembly; the shape lives in profile.js,
// the meshing in terrain.js / water.js, the built world in city.js and
// landmarks.js.
//
// World axes: the rail runs toward -Z, +X is right, +Y is up. Water sits at 0.
// ─────────────────────────────────────────────────────────────────────────────

export { WORLD, centrelineX, centrelineY, terrainHeight, terrainNormal };

export class Corneria {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'corneria';
    scene.add(this.root);

    this.terrainMat = terrainMaterial();
    this.waterMat = waterMaterial();
    this._time = 0;
    this._camPos = new THREE.Vector3(0, 60, 0);

    this.deepMat = deepWaterMaterial();
    this.terrain = new Terrain(this.root, this.terrainMat);
    this.water = new Water(this.root, this.waterMat, this.deepMat);

    // A one-triangle sentinel drawn before everything else, purely so the world
    // learns where the camera is. `update(dt)` has no other way to find out, and
    // distance-driven LOD is the difference between 90k and 900k triangles.
    this._probe = this._makeProbe();
    this.root.add(this._probe);

    registerWorldShots(this);
  }

  _makeProbe() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100000;
    mesh.onBeforeRender = (_r, _s, camera) => {
      this._camPos.copy(camera.position);
      this._applyLOD();
    };
    return mesh;
  }

  _applyLOD() {
    this.terrain.updateLOD(this._camPos);
    this.water.updateLOD(this._camPos);
  }

  update(dt) {
    this._time += dt;
    // Both water materials, not just the river. The open-ocean apron now runs
    // the same surface shader, and it was the only mesh in the level whose clock
    // never advanced — 42 km of sea with its ripples frozen mid-frame.
    for (const m of [this.waterMat, this.deepMat]) {
      const sh = m.userData.shader;
      if (sh && sh.uniforms.uTime) sh.uniforms.uTime.value = this._time;
    }
  }

  /** Ground clearance at a world point — used by the flight model and by AI. */
  groundAt(x, z) { return Math.max(terrainHeight(x, z), WORLD.waterLevel); }

  /** Terrain height ignoring the water — placement helper for the built world. */
  landAt(x, z) { return terrainHeight(x, z); }

  landAtU(u, z) { return heightAtU(u, z, profileAt(z, {})); }
}
