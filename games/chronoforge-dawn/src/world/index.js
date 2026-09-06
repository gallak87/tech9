import * as THREE from 'three';
import { bus } from '../core/events.js';
import { disposeTree } from '../core/engine.js';
import { makeField } from './field.js';
import { buildMap, meshCost } from './build.js';
import { buildProto, PROTO_ID, heightAt as protoHeightAt, normalAt as protoNormalAt } from './proto.js';
import { MAPS, PLAYER_START, TILE_M } from '../../docs/specs/world-graph.mjs';
import { LOCKED_PITCH_DEG, LOCKED_YAW_DEG, FRAME_HEIGHT_M, CAMERA_FOV_DEG } from '../core/const.js';

// ─────────────────────────────────────────────────────────────────────────────
// The world runtime — twelve authored maps plus the Phase 0 placeholder, one
// live at a time. Implements docs/specs/world-runtime.md exactly.
//
// `?map=<id>` picks the boot map and DEFAULTS TO `proto`. That default is not
// laziness: every probe baseline in docs/STATUS.json was measured on the 240 m
// dune field and Phase 2.5's character gate drives on it, so switching the
// default is a separate decision made after the new maps have been looked at.
//
// Coordinate frame: authoring data is in TILES with the origin at the map's NW
// corner; the engine centres the map on the world origin. src/world/field.js
// owns that conversion and NOTHING OUTSIDE src/world/ EVER SEES A TILE
// (CONTRACT.md §4.10).
//
// Phase 4a is blocked-in ground. No props, no scatter, no fog of war, no
// weather, no per-biome lighting — vertex colour off the biome's authored
// albedo table is the whole look pass, and src/render/ is frozen this session.
// ─────────────────────────────────────────────────────────────────────────────

export { PROTO_ID };
export const MAP_IDS = [PROTO_ID, ...Object.keys(MAPS)];

/** `heightAt`/`normalAt` re-exported so a probe can evaluate the placeholder
 *  field without a live scene, exactly as it could before this file grew. */
export { protoHeightAt as heightAt, protoNormalAt as normalAt };

const isKnown = (id) => id === PROTO_ID || !!MAPS[id];

export function installWorld(ctx) {
  const { engine } = ctx;

  const root = new THREE.Group();
  root.name = 'world';
  engine.scene.add(root);

  /* These two Vector3s are IDENTITY-STABLE for the life of the module.
     core/shots.js clones them, traversal/index.js calls `.set()` on `focus`
     every frame, and main.js reads `ctx.world.focus` on every frame it draws.
     A rebuild that handed out a NEW vector would leave all three holding the
     dead one, so a map switch is a `.copy()`, never a reassignment. */
  const focus = new THREE.Vector3();
  const propFocus = new THREE.Vector3();

  /** The live map. Everything below reads through it, so the api's own
   *  `heightAt`/`normalAt` keep stable function identity across a switch. */
  let live = null;

  /* ── teardown ────────────────────────────────────────────────────────────
     disposeTree() frees geometries, materials AND every texture hanging off
     those materials. That is right for a subtree a lane fully owns and WRONG
     here: `materials.ground` is the shared kit instance, and the water plane's
     material is a clone that still points at the shared ground normal/rough
     textures. Disposing either takes the ground out from under every other
     lane's screenshot on the next switch.

     So: drop the material reference from every mesh first, then hand the tree
     to disposeTree — which now finds only geometries — and dispose this build's
     OWN materials by hand. Material.dispose() does not touch textures, so the
     shared maps survive. */
  function teardown() {
    if (!live) return 0;
    live.group.traverse((o) => { if (o.material) o.material = null; });
    const freed = disposeTree(live.group);
    for (const m of live.owned) m.dispose();
    live = null;
    return freed;
  }

  /** Where a review camera aims. The player start for the home region — that is
   *  the frame the tutorial vista was authored for — and the map centre
   *  everywhere else, because nothing else on a blocked-in map is a subject. */
  function focusFor(field) {
    const v = new THREE.Vector3();
    if (field.mapId === PLAYER_START.mapId) return field.toWorld(PLAYER_START.x, PLAYER_START.y, v);
    return v.set(0, field.heightAt(0, 0), 0);
  }

  function build(id) {
    const freed = teardown();

    if (id === PROTO_ID) {
      const p = buildProto(ctx);
      root.add(p.group);
      live = {
        mapId: PROTO_ID, biomeId: null, group: p.group, owned: p.owned, field: null,
        widthM: p.widthM, depthM: p.depthM, size: p.size,
        heightAt: p.heightAt, normalAt: p.normalAt, stats: p.stats,
      };
      focus.copy(p.focus);
      propFocus.copy(p.propFocus);
    } else {
      const field = makeField(id);
      const b = buildMap(field, ctx);
      root.add(b.group);
      live = {
        mapId: id, biomeId: field.biomeId, group: b.group, owned: b.owned, field,
        widthM: field.widthM, depthM: field.depthM,
        // main.js clamps the shadow focus with size*0.5 on BOTH axes, so the
        // long side is the conservative choice on a rectangular map.
        size: Math.max(field.widthM, field.depthM),
        heightAt: field.heightAt, normalAt: field.normalAt, stats: b.stats,
      };
      const f = focusFor(field);
      focus.copy(f);
      propFocus.set(f.x, f.y + 1.4, f.z + 1.5);
    }

    api.mapId = live.mapId;
    api.biomeId = live.biomeId;
    api.widthM = live.widthM;
    api.depthM = live.depthM;
    api.size = live.size;

    bus.emit('world:built', {
      mapId: live.mapId, biomeId: live.biomeId,
      widthM: live.widthM, depthM: live.depthM,
      size: live.size, seed: live.mapId === PROTO_ID ? 'phase0' : live.mapId,
      freedGeometries: freed,
    });
    return live;
  }

  const _v = new THREE.Vector3();

  const api = {
    root, focus, propFocus,

    /* Set by build(); declared here so the shape is visible in one place. */
    mapId: PROTO_ID, biomeId: null, size: 240, widthM: 240, depthM: 240,

    /** Every id `setMap` accepts. */
    get maps() { return MAP_IDS; },

    /** WORLD metres in, metres out. Stable identity across a map switch. */
    heightAt(x, z) { return live.heightAt(x, z); },
    normalAt(x, z, out) { return live.normalAt(x, z, out); },

    /** Tile (authoring data) -> world metres, y on the surface.
     *  `proto` is not a tile map; it answers on the same 2 m grid centred on
     *  the origin so a caller gets a point on the terrain rather than a throw. */
    toWorld(tx, ty, out = new THREE.Vector3()) {
      if (live.field) return live.field.toWorld(tx, ty, out);
      const x = (tx + 0.5) * TILE_M - live.widthM / 2;
      const z = (ty + 0.5) * TILE_M - live.depthM / 2;
      return out.set(x, live.heightAt(x, z), z);
    },

    /** Dispose the live map and build `id`. Throws on an unknown id. */
    setMap(id) {
      if (!isKnown(id)) throw new Error(`[world] unknown map "${id}" — one of: ${MAP_IDS.join(', ')}`);
      if (live?.mapId === id) return id;
      build(id);
      return id;
    },

    /** Phase 4a has nothing to animate. The seam stays so weather and water
     *  motion land without touching main.js. */
    update(_dt) {},

    report() {
      return {
        mapId: live.mapId, biomeId: live.biomeId,
        widthM: live.widthM, depthM: live.depthM, size: live.size,
        focus: [+focus.x.toFixed(2), +focus.y.toFixed(2), +focus.z.toFixed(2)],
        ...live.stats,
      };
    },

    /** Walk every map once and come back. The map-switch leak check drives
     *  this, and a showcase that left the world on some other map would be a
     *  trap for whatever ran next. */
    showcase() {
      const was = live.mapId;
      const out = MAP_IDS.map((id) => (api.setMap(id), api.report()));
      api.setMap(was);
      return out;
    },

    dispose() { teardown(); disposeTree(root); },
  };

  /* ── boot ────────────────────────────────────────────────────────────────
     An unknown ?map= WARNS and falls back rather than throwing. A throw here
     quarantines the whole lane (core/modules.js), and a typo in a URL must not
     cost the screen — `setMap` still throws, which is what the contract asks
     of the programmatic entry point. */
  let wanted = ctx.mapId || PROTO_ID;
  if (!isKnown(wanted)) {
    console.warn(`[world] unknown ?map=${wanted} — falling back to ${PROTO_ID}`);
    wanted = PROTO_ID;
  }
  build(wanted);

  /* A review camera framed to the map extents, registered from this lane's own
     file (CONTRACT.md §1). `wide` sits 132 m out, which was cut for the 240 m
     placeholder and leaves a 90 m map small in the middle of a lot of sky. */
  ctx.registerShot?.('map', (c) => {
    const d = Math.max(live.widthM, live.depthM) * 1.15;
    _v.copy(focus);
    /* 18 deg, not 30. At 30 the whole frame is below the horizon, so the
       backdrop is the featureless underside of environment.js's sky dome and
       the map reads as a plate in a void — which looks like a missing sky and
       is a camera that never pointed at one. 18 keeps the terrain shape
       legible and puts the horizon and its haze band in the top third. */
    const y = THREE.MathUtils.degToRad(214), p = THREE.MathUtils.degToRad(18);
    c.camera.position.set(
      _v.x + Math.sin(y) * Math.cos(p) * d,
      _v.y + Math.sin(p) * d + 4,
      _v.z + Math.cos(y) * Math.cos(p) * d,
    );
    c.camera.fov = 30;
    c.camera.near = Math.max(0.35, d * 0.02);
    /* Never shorter than the sky. environment.js scales its Sky dome to
       SKY_RADIUS 4000, which is also the engine camera's default far, and a
       far plane cut to the MAP's size clips the dome away entirely — the
       frame then reads as a lit plate floating in the clear colour, which
       looks like a missing sky and is a clipped one. */
    c.camera.far = 4000;
    c.camera.updateProjectionMatrix();
    c.camera.lookAt(_v);
  });

  /* The GAMEPLAY framing, as a still. Every other review camera here is a
     reviewer's camera — it goes where a reviewer wants to stand. This one goes
     where the game puts it: LOCKED_PITCH_DEG down, LOCKED_YAW_DEG around, and
     backed off far enough to frame exactly FRAME_HEIGHT_M of world through a
     CAMERA_FOV_DEG lens. It is the only shot here that answers "what does this
     level look like while you are playing it". */
  ctx.registerShot?.('game', (c) => {
    const dist = (FRAME_HEIGHT_M / 2) / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG / 2));
    const p = THREE.MathUtils.degToRad(LOCKED_PITCH_DEG);
    const y = THREE.MathUtils.degToRad(LOCKED_YAW_DEG);
    _v.copy(focus);
    c.camera.position.set(
      _v.x + Math.sin(y) * Math.cos(p) * dist,
      _v.y + Math.sin(p) * dist,
      _v.z + Math.cos(y) * Math.cos(p) * dist,
    );
    c.camera.fov = CAMERA_FOV_DEG;
    c.camera.near = 0.5;
    c.camera.far = 4000;
    c.camera.updateProjectionMatrix();
    c.camera.lookAt(_v);
  });

  ctx.dev?.register({
    group: 'world', label: 'Map', type: 'select',
    options: () => MAP_IDS,
    get: () => api.mapId,
    set: (v) => api.setMap(v),
  });
  ctx.dev?.register({
    group: 'world', label: 'Extent', type: 'readout',
    get: () => `${live.widthM}x${live.depthM}m  ${live.stats.vertices.toLocaleString()}v`,
  });

  return api;
}

export { makeField, buildMap, meshCost };
