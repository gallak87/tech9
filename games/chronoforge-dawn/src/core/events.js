// ─────────────────────────────────────────────────────────────────────────────
// The event bus. The ONLY way two lanes talk to each other.
//
// A lane may import from `core/` and from its own folder. It may not import
// another lane's module. When `traversal` needs to tell `battle` that the party
// walked into an enemy, it emits — it does not call battle.
//
//   bus.on('encounter:start', (p) => { … });
//   bus.emit('encounter:start', { enemyId, tile });
//
// Every event name is declared in ARCHITECTURE.md §Events. Emitting an
// undeclared event warns in dev so the table cannot silently drift.
//
// Handlers are isolated: one throwing handler never stops the others and never
// propagates into the emitter's frame. That is the whole point.
// ─────────────────────────────────────────────────────────────────────────────

/** Declared events, lane → names. Add here AND in ARCHITECTURE.md. */
export const EVENTS = {
  core: ['ready', 'resize', 'quality:changed', 'module:failed'],
  world: ['world:built', 'time:changed', 'weather:changed', 'fog:revealed'],
  actors: ['actor:spawned', 'actor:despawned', 'actor:pose'],
  traversal: ['party:moved', 'party:arrived', 'footfall', 'collision'],
  places: ['door:enter', 'door:exit', 'interior:loaded', 'npc:talk'],
  battle: ['encounter:start', 'battle:begin', 'battle:turn', 'battle:hit',
    'battle:tech', 'battle:combo', 'battle:end'],
  progression: ['xp:gained', 'level:up', 'item:gained', 'item:equipped',
    'quest:updated', 'save:written', 'save:loaded'],
  settlement: ['tick:resource', 'building:placed', 'building:upgraded', 'tier:up'],
  ui: ['menu:opened', 'menu:closed', 'menu:tab'],
  fx: ['shake', 'flash', 'timefreeze'],
};

const DECLARED = new Set(Object.values(EVENTS).flat());

export class EventBus {
  constructor() {
    this.map = new Map();
    this.log = [];          // last N events, for the dev overlay and probes
    this.logCap = 256;
    this.strict = true;     // warn on undeclared names
  }

  on(name, fn) {
    let a = this.map.get(name);
    if (!a) this.map.set(name, a = []);
    a.push(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const un = this.on(name, (p) => { un(); fn(p); });
    return un;
  }

  off(name, fn) {
    const a = this.map.get(name);
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }

  emit(name, payload) {
    if (this.strict && !DECLARED.has(name)) {
      console.warn(`[bus] undeclared event "${name}" — add it to EVENTS in core/events.js`);
      DECLARED.add(name);            // warn once, not every frame
    }
    this.log.push({ name, t: performance.now() });
    if (this.log.length > this.logCap) this.log.shift();
    const a = this.map.get(name);
    if (!a) return 0;
    // Copy: a handler is allowed to unsubscribe itself mid-dispatch.
    for (const fn of a.slice()) {
      try { fn(payload); }
      catch (e) { console.error(`[bus] handler for "${name}" threw:`, e); }
    }
    return a.length;
  }

  /** Names with at least one live listener — census.mjs asserts no orphans. */
  listened() { return [...this.map.entries()].filter(([, a]) => a.length).map(([n]) => n); }
}

export const bus = new EventBus();
