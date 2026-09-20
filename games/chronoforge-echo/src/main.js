import { dialogueLine, npcIdentity, npcPresent } from './npc-identities.js';
import { Application, Sprite, Texture } from 'pixi.js';
import './style.css';
import './world-view.css';
import { mountWorldView } from './world-view.js';
import {
  ALL_SCENES,
  getScene,
  nearby,
  safeArrival,
  meetsWorldRequirement,
} from './world.js';
import * as Art from './art.js';
import { ENEMIES, ITEMS, HEROES, TECHS } from './content.js';
import {
  encounterInteractionLabel,
  enemyNameWithLevel,
  encounterLeader,
} from './enemy-levels.js';
import { drawEncounterLevels } from './enemy-labels.js';
import { contactEncounter } from './encounter-contact.js';
import * as P from './progression.js';
import { SCENES, interactStory, onEvent } from './narrative.js';
import * as Narrative from './narrative.js';
import {
  createBattle,
  updateBattle,
  battleKey,
  battleClick,
  battleView,
  drawBattle,
} from './combat.js';
import { EchoAudio } from './audio.js';
import { UI } from './ui.js';
import { BattleUI } from './battle-ui.js';
import { GameSession } from './game-session.js';
import { reveal } from './maps.js';
import {
  prepareRecruitment,
  recruitmentActor,
  advanceRecruitment,
  completeRecruitment,
} from './recruitment.js';
import { loadAssets, assetDiagnostics } from './assets.js';
import { createContentRegistry, validateWorld } from './registry.js';
import {
  VIEW_WIDTH,
  VIEW_HEIGHT,
  RENDER_SCALE,
  artContext,
} from './rendering.js';
import { localDevHost } from './dev-access.js';
import { mountUpgradeTour } from './upgrade-tour.js';
import { WorldTraversal } from './world-traversal.js';
const W = VIEW_WIDTH,
  H = VIEW_HEIGHT,
  copy = (v) => JSON.parse(JSON.stringify(v)),
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));
window.addEventListener('unhandledrejection', (e) =>
  errors.push(String(e.reason)),
);
const state = P.createState();
class Game {
  constructor() {
    this.state = state;
    this.mode = 'title';
    this.keys = new Set();
    this.audio = new EchoAudio();
    this.camera = { x: 0, y: 0 };
    this.followPath = [];
    this.followers = [];
    this.near = null;
    this.movePath = [];
    this.time = 0;
    this.visualTime = 0;
    this.frameTimes = [];
    this.logs = [];
    this.session = new GameSession(this);
    this.ui = new UI(this);
    this.battleUI = new BattleUI(this);
    this.rewardQueue = [];
    this.rewardClock = 0;
    this.lastHud = 0;
    this.transition = null;
    this.battle = null;
    this.battleResultTime = 0;
    this.soundLog = 0;
    this.moving = false;
    this.encounterCooldown = 0;
    this.traversal = new WorldTraversal(this);
    this.updateCamera(true);
  }
  get scene() {
    return getScene(this.state.region);
  }
  get visualState() {
    return this.devTools?.visualState(this.state) ?? this.state;
  }
  log(type, data = {}) {
    this.logs.push({ time: +this.state.playTime.toFixed(2), type, ...data });
    if (this.logs.length > 400) this.logs.shift();
  }
  resetSession() {
    return this.session.resetSession();
  }
  startNew() {
    return this.session.startNew();
  }
  load(slot) {
    return this.session.load(slot);
  }
  saveSnapshot() {
    return this.session.saveSnapshot();
  }
  save(slot) {
    return this.session.save(slot);
  }
  presentEnding() {
    if (
      !this.state.flags.pendingEnding ||
      this.mode !== 'world' ||
      this.transition
    )
      return;
    const p = (this.state.endingProgress ??= { index: 0, panel: 'dialogue' });
    if (p.panel === 'ending') {
      this.ui.panel = { type: 'ending' };
      this.ui.render();
      return;
    }
    this.ui.showDialogue(
      SCENES.ending,
      [],
      () => {
        this.state.endingProgress = {
          index: SCENES.ending.length,
          panel: 'ending',
        };
        this.ui.panel = { type: 'ending' };
        this.ui.render();
        this.checkpoint();
      },
      { ending: true, index: clamp(p.index, 0, SCENES.ending.length - 1) },
    );
  }
  completeEnding() {
    const result = Narrative.finishEnding(this.state);
    if (!result.ok) {
      this.ui.feedback(result);
      return;
    }
    delete this.state.endingProgress;
    this.ui.panel = null;
    this.travelHub('haventide');
    this.checkpoint();
    this.ui.render();
  }
  checkpoint() {
    return this.session.checkpoint();
  }
  resetFollowers() {
    this.traversal.resetFollowers();
  }
  updateCamera(immediate = false) {
    this.traversal.updateCamera(immediate);
  }
  condition(req) {
    return meetsWorldRequirement(this.state, req);
  }
  requirement(req) {
    const labels = {
      beacon_restored: 'Restore Haventide’s listening beacon.',
      vex_recruited: 'Invite Vex to join the expedition.',
      rune_recruited: 'Find Rune at Anchor Nine.',
      forest_seal: 'Restore Forest Veil’s Heartwood Relay.',
      final_ready:
        'Restore all four living seals, hear the Crown’s memory, and reach Transcendent civilization.',
    };
    if (typeof req === 'string')
      return labels[req] || 'Open this settlement’s guarded gate first.';
    return [
      req?.tier
        ? 'Civilization required: ' +
          ['', 'Survivor', 'Reclaimer', 'Ascendant', 'Transcendent'][req.tier] +
          '.'
        : '',
      req?.flag ? labels[req.flag] || req.flag : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  interactionLabel(o) {
    if (o.type === 'encounter')
      return encounterInteractionLabel(o, this.state.cleared[o.id]);
    if (o.type === 'pickup')
      return 'Recover ' + (ITEMS[o.item]?.name || o.item);
    if (o.type === 'sign') return 'Read ' + (o.name || 'sign');
    if (o.service === 'construction') return 'Settlement works';
    if (o.type === 'town')
      return this.condition(o.requires)
        ? `Enter ${o.name}`
        : `${o.name} · entrance blocked`;
    if (o.type === 'portal') return o.name;
    return o.name || 'Inspect';
  }
  interact(obj = this.near) {
    if (
      !obj ||
      !npcPresent(obj, this.state) ||
      this.ui.blocked ||
      this.transition ||
      this.state.recruitmentWalk
    )
      return;
    const s = this.state;
    this.keys.clear();
    this.movePath = [];
    if (obj.type === 'sign') {
      this.ui.showReading(obj);
      return;
    }
    if (obj.type === 'pickup') {
      if (s.pickups[obj.id]) return;
      s.pickups[obj.id] = true;
      this.resolveResult(
        P.applyRewards(
          s,
          ITEMS[obj.item]
            ? { items: { [obj.item]: obj.amount || 1 } }
            : { [obj.item]: obj.amount || 1 },
          'pickup:' + obj.id,
        ),
      );
      this.audio.sound('pickup');
      this.checkpoint();
      this.ui.updateHUD();
      return;
    }
    if (obj.type === 'encounter') {
      if (!this.condition(obj.requires)) {
        this.ui.showDialogue([
          { speaker: 'Field notes', text: this.requirement(obj.requires) },
        ]);
        return;
      }
      this.beginBattle(obj);
      return;
    }
    if (['town', 'house', 'cave', 'portal'].includes(obj.type)) {
      if (!this.condition(obj.requires)) {
        if (obj.guard) {
          const guard = this.scene.objects.find((o) => o.id === obj.guard);
          if (guard && !s.cleared[guard.id]) {
            const enemies = guard.enemies.map(enemyNameWithLevel).join(' + ');
            this.ui.confirm(
              `${obj.name} is blockaded`,
              `${enemies} ${guard.enemies.length === 1 ? 'holds' : 'hold'} the steps in front of the entrance. Defeat the gate sentry to enter the settlement.`,
              () => this.beginBattle(guard),
              {
                eyebrow: 'GUARDED ENTRANCE',
                confirmLabel: encounterInteractionLabel(guard),
                cancelLabel: 'Step back',
              },
            );
            return;
          }
        }
        this.ui.showDialogue([
          { speaker: 'Field notes', text: this.requirement(obj.requires) },
        ]);
        return;
      }
      this.travel(obj.to, obj.spawn);
      return;
    }
    if (obj.service === 'construction') {
      this.ui.showBuild();
      return;
    }
    if (obj.service) {
      this.ui.showVendor(obj);
      return;
    }
    const partyCount = s.heroes.length,
      result = interactStory(s, obj.id);
    this.log('interact', { id: obj.id });
    if (partyCount !== s.heroes.length) this.resetFollowers();
    if (result?.recruitment) {
      const id = result.recruitment.id,
        target = this.followers.find((h) => h.id === id) || s,
        source = this.safePoint(
          this.scene,
          obj.x + (obj.hero === id ? 0 : 44),
          obj.y + (obj.hero === id ? 0 : 38),
        );
      prepareRecruitment(s, id, this.scene, source, target, {
        sourceId: obj.id,
      });
      this.moving = false;
      this.near = null;
    }
    if (
      result?.lines?.length ||
      result?.rewards?.length ||
      result?.choices?.length
    )
      this.resolveResult(result);
    else
      this.ui.showDialogue([
        dialogueLine(
          obj.name || 'Field notes',
          obj.dialogue ||
            'A fragment of the old world. Someone thought this place was worth remembering.',
          obj.type === 'npc' ? npcIdentity(obj) : null,
        ),
      ]);
    this.checkpoint();
    this.ui.updateHUD();
  }
  resolveResult(r, done) {
    if (!r) {
      done?.();
      return;
    }
    this.rewards(r.rewards || []);
    if (r.lines?.length) this.ui.showDialogue(r.lines, r.choices || [], done);
    else done?.();
    if (r.ok === false && r.message)
      this.rewards([{ id: 'notice', label: r.message, amount: 1 }]);
  }
  rewards(items) {
    for (const r of items || []) this.rewardQueue.push(r);
  }
  finishRecruitment() {
    const reward = completeRecruitment(this.state);
    this.resetFollowers();
    this.moving = false;
    this.keys.clear();
    this.encounterCooldown = 1;
    this.ui.updateHUD();
    this.checkpoint();
    if (reward) {
      this.ui.rewards([reward]);
      this.audio.sound('confirm');
      this.log('companion_joined', { id: reward.id });
    }
  }
  travel(to, spawn) {
    this.traversal.travel(to, spawn);
  }
  safePoint(scene, x, y) {
    return safeArrival(scene, x, y);
  }
  travelHub(id) {
    if (!this.state.flags[id + '_liberated']) return;
    const scene = getScene(id + '_town');
    this.travel(scene.id, scene.spawn);
  }
  beginBattle(encounter) {
    if (this.mode === 'battle') return;
    const start = () => {
      this.battle = createBattle(this.state, {
        ...encounter,
        biome: this.scene.biome,
      });
      this.mode = 'battle';
      this.battleResultTime = 0;
      this.soundLog = 0;
      this.ui.panel = null;
      this.ui.render();
      this.keys.clear();
      this.log('battle_start', {
        id: encounter.id,
        count: encounter.enemies.length,
      });
    };
    this.movePath = [];
    const leader = encounterLeader(encounter);
    if (!this.state.flags.battle_taught) {
      this.state.flags.battle_taught = true;
      this.ui.showDialogue(
        [
          {
            speaker: 'Kaida',
            text:
              leader === 'rust_scrapper'
                ? 'A rust scrapper. Small enough to handle. Wait for the action gauge, then choose Attack.'
                : `${ENEMIES[leader].name}. ${encounter.guard ? 'That is the sentry blocking the entrance.' : 'It has seen us.'} Wait for the action gauge, then choose Attack.`,
          },
          {
            speaker: 'Field notes',
            text: 'Choose a ready companion, then an action and target. Up/Down selects; Right, Space or Enter confirms. A fresh Space or Enter when the white marker crosses the orange window raises critical chance. Incoming attacks open the same timing slot: catch the orange window to guard, then return to your selection. Left or Backspace goes back; Esc pauses everything.',
          },
        ],
        [],
        start,
      );
    } else start();
  }
  finishBattle() {
    const b = this.battle,
      id = b.encounter.id,
      first = !this.state.cleared[id];
    this.mode = 'world';
    this.battle = null;
    this.encounterCooldown = 2;
    this.keys.clear();
    this.ui.render();
    if (b.result === 'victory') {
      const reward = P.battleReward(b.encounter, first, () => this.random());
      this.rewards(P.applyRewards(this.state, reward).rewards);
      const ending = id === 'void_architect' && !this.state.flags.ending_seen,
        result = onEvent(this.state, 'victory', id);
      if (ending) {
        this.rewards(result?.rewards || []);
        this.state.endingProgress = { index: 0, panel: 'dialogue' };
        this.presentEnding();
      } else this.resolveResult(result);
      this.audio.sound('victory');
      this.log('battle_won', { id, first, xp: reward.xp });
    } else if (b.result === 'defeat') {
      P.rest(this.state);
      this.state.x = Math.max(32, this.state.x - 90);
      const safe = this.safePoint(this.scene, this.state.x, this.state.y);
      this.state.x = safe.x;
      this.state.y = safe.y;
      this.ui.showDialogue([
        {
          speaker: 'Kaida',
          text: 'Not here. Not yet. We can retreat, mend what broke, and try a different approach.',
        },
        {
          speaker: 'Field notes',
          text: 'The crew has recovered. No equipment, quest progress, or settlement upgrades were lost. Learn techniques, improve defenses, or try the path around.',
        },
      ]);
      this.log('battle_lost', { id });
    } else {
      this.state.x -= 70;
      const safe = this.safePoint(this.scene, this.state.x, this.state.y);
      Object.assign(this.state, safe);
      this.log('battle_retreat', { id });
    }
    this.resetFollowers();
    this.updateCamera(true);
    this.checkpoint();
  }
  random() {
    let n = this.state.rng >>> 0;
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    this.state.rng = n >>> 0;
    return this.state.rng / 4294967296;
  }
  walkTo(x, y) {
    this.traversal.walkTo(x, y);
  }
  update(dt) {
    this.devTools?.update();
    this.time += dt;
    if (this.rewardQueue.length) {
      this.rewardClock -= dt;
      if (
        this.rewardClock <= 0 &&
        document.querySelector('#rewards').children.length < 3
      ) {
        this.ui.rewards(
          this.rewardQueue.splice(
            0,
            Math.min(
              2,
              3 - document.querySelector('#rewards').children.length,
              this.rewardQueue.length,
            ),
          ),
        );
        this.rewardClock = 0.85;
      }
    }
    this.audio.update(
      this.state.region,
      this.mode === 'battle',
      this.ui.blocked,
    );
    if (this.mode === 'title') {
      this.visualTime += dt;
      this.updateCamera(true);
      return;
    }
    if (this.ui.blocked || this.devTools?.paused || this.upgradeTour?.open)
      return;
    this.visualTime += dt;
    this.state.playTime += dt;
    if (this.transition) {
      if (this.traversal.updateTransition(dt)) {
        this.ui.updateHUD();
      }
      return;
    }
    if (this.mode === 'battle') {
      if (this.battle.result) {
        updateBattle(this.battle, this.state, dt);
        this.battleResultTime += dt;
        if (this.battleResultTime > 1.35) this.finishBattle();
        return;
      }
      updateBattle(this.battle, this.state, dt);
      const logs = this.battle.logs.filter((l) => l.seq > this.soundLog);
      for (const l of logs) {
        if (l.kind === 'timing') this.audio.sound('timing');
        else if (l.kind === 'crit') this.audio.sound('crit');
        else if (l.kind === 'damage') this.audio.sound('hit');
        else if (l.kind === 'heal') this.audio.sound('heal');
      }
      this.soundLog = this.battle.logSerial;
      return;
    }
    if (this.state.recruitmentWalk) {
      this.keys.clear();
      this.movePath = [];
      this.moving = false;
      this.near = null;
      if (advanceRecruitment(this.state, dt)) this.finishRecruitment();
      else
        this.moving =
          !!this.state.recruitmentWalk.leaderPath &&
          this.state.recruitmentWalk.elapsed <
            this.state.recruitmentWalk.leaderDuration;
      this.updateCamera();
      this.ui.positionInteraction();
      return;
    }
    P.production(this.state, dt);
    this.encounterCooldown = Math.max(0, this.encounterCooldown - dt);
    const s = this.state,
      r = this.scene,
      previous = { x: s.x, y: s.y };
    this.traversal.move(dt);
    this.updateCamera();
    const near = nearby(r, s.x, s.y, s);
    this.near = near[0] || null;
    this.ui.positionInteraction();
    const encounter =
      this.encounterCooldown === 0 ? contactEncounter(r, s, previous) : null;
    if (encounter) {
      this.beginBattle(encounter);
      return;
    }
    if (this.traversal.autoTravel(near)) return;
    if (this.time - this.lastHud > 0.16) {
      this.lastHud = this.time;
      this.ui.updateHUD();
    }
  }
  draw(ctx) {
    ctx.clearRect(0, 0, W, H);
    if (this.mode === 'battle') {
      drawBattle(ctx, this.battle, this.state, this.visualTime);
    } else {
      Art.drawWorld(
        ctx,
        this.scene,
        this.camera,
        this.visualTime,
        this.visualState,
        { contactReady: this.mode === 'world' && this.encounterCooldown === 0 },
      );
      const arriving = recruitmentActor(this.state),
        actors = [
          {
            id: 'kaida',
            x: this.state.x,
            y: this.state.y,
            facing: this.state.facing,
          },
          ...this.followers.filter((a) => a.id !== arriving?.id),
          ...(arriving ? [arriving] : []),
        ].sort((a, b) => a.y - b.y);
      for (const a of actors) {
        ctx.save();
        ctx.globalAlpha = a.opacity ?? 1;
        Art.drawHero(
          ctx,
          a.id,
          Math.round(a.x - this.camera.x),
          Math.round(a.y - this.camera.y),
          {
            time: a.animationTime ?? this.visualTime,
            moving: (a.moving ?? this.moving) && this.mode !== 'title',
            facing: a.facing,
          },
        );
        ctx.restore();
      }
      if (Art.drawForeground)
        Art.drawForeground(
          ctx,
          this.scene,
          this.camera,
          this.visualTime,
          this.visualState,
          actors,
        );
      drawEncounterLevels(ctx, this.scene, this.camera, this.visualState);
      if (this.movePath.length) {
        const p = this.movePath.at(-1);
        ctx.strokeStyle = '#e8e1c788';
        ctx.strokeRect(
          Math.round(p.x - this.camera.x) - 5,
          Math.round(p.y - this.camera.y) - 3,
          10,
          6,
        );
      }
    }
    if (this.transition) {
      const t = this.transition.time / this.transition.duration;
      ctx.fillStyle = `rgba(10,24,29,${Math.sin(t * Math.PI)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
async function boot() {
  const content = createContentRegistry('base', {
    scenes: ALL_SCENES,
    enemies: ENEMIES,
    items: ITEMS,
    heroes: HEROES,
    techs: TECHS,
  });
  validateWorld(content);
  await loadAssets(Art);
  const g = new Game(),
    canvas = document.createElement('canvas');
  canvas.width = W * RENDER_SCALE;
  canvas.height = H * RENDER_SCALE;
  const ctx = artContext(canvas.getContext('2d', { alpha: false }));
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  const app = new Application();
  await app.init({
    width: W,
    height: H,
    antialias: false,
    resolution: RENDER_SCALE,
    background: '#101e23',
    preference: 'webgl',
    autoStart: false,
  });
  document.querySelector('#stage').append(app.canvas);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'linear';
  const sprite = new Sprite(texture);
  sprite.width = W;
  sprite.height = H;
  app.stage.addChild(sprite);
  document.querySelector('#loading').remove();
  g.resetFollowers();
  g.ui.render();
  g.audio.set(g.state.settings);
  g.log('ready', { native: [W, H] });
  g.worldView = mountWorldView(g);
  g.upgradeTour = mountUpgradeTour(g);
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      g.worldView.dispose();
      g.upgradeTour.dispose();
    });
  if (import.meta.env.DEV && localDevHost(location)) {
    const { mountDevTools } = await import('./dev-tools.js');
    g.devTools = mountDevTools(g);
  }
  window.__ECHO_READY__ = true;
  window.addEventListener('keydown', (e) => {
    if (
      g.upgradeTour?.handleKey(e) ||
      g.worldView?.handleKey(e) ||
      g.devTools?.handleKey(e)
    )
      return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    g.audio.unlock();
    if (
      [
        ' ',
        'Enter',
        'Escape',
        'Tab',
        'Backspace',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(key)
    )
      e.preventDefault();
    if (e.repeat) return;
    if (g.keys.has(key)) return;
    g.keys.add(key);
    if (key === 'Escape') {
      g.ui.handleEscape();
      return;
    }
    if (g.ui.handleKey(key)) return;
    if (g.state.recruitmentWalk) {
      if (key === ' ' || key === 'Enter') g.finishRecruitment();
      return;
    }
    if (g.mode === 'battle') {
      battleKey(g.battle, g.state, key);
      return;
    }
    if (
      key === ' ' ||
      key === 'Enter' ||
      key === (g.state.settings.keys?.interact || 'f')
    ) {
      e.preventDefault();
      g.interact();
    }
  });
  window.addEventListener('keyup', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    g.keys.delete(key);
    if (g.battle) battleKey(g.battle, g.state, { key, type: 'keyup' });
  });
  window.addEventListener('blur', () => g.keys.clear());
  document.addEventListener('visibilitychange', () => {
    if (
      document.hidden &&
      g.mode !== 'title' &&
      !g.ui.menu &&
      !g.upgradeTour?.open &&
      !g.worldView?.open
    ) {
      g.ui.menu = true;
      g.keys.clear();
      g.ui.render();
    }
  });
  app.canvas.addEventListener('pointerdown', (e) => {
    g.audio.unlock();
    if (g.ui.blocked || g.devTools?.open || g.state.recruitmentWalk) return;
    const r = app.canvas.getBoundingClientRect(),
      x = ((e.clientX - r.left) * W) / r.width,
      y = ((e.clientY - r.top) * H) / r.height;
    if (g.mode === 'battle') {
      if (battleClick(g.battle, g.state, x, y) === 'pause') g.ui.toggleMenu();
      return;
    }
    if (
      g.near &&
      Math.hypot(x + g.camera.x - g.near.x, y + g.camera.y - g.near.y) < 80
    ) {
      g.interact();
      return;
    }
    g.walkTo(x + g.camera.x, y + g.camera.y);
  });
  let prev = performance.now();
  function frame(now) {
    const interval = now - prev;
    prev = now;
    g.frameTimes.push(interval);
    if (g.frameTimes.length > 3600) g.frameTimes.shift();
    try {
      g.update(Math.min(0.05, interval / 1000));
      g.session.autosaveInventory();
      g.draw(ctx);
      g.battleUI.render();
      texture.source.update();
      app.renderer.render(app.stage);
    } catch (e) {
      fatal(e);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
    window.__ECHO__ = {
      get game() {
        return g;
      },
      drawHero: Art.drawHero,
      actorBounds: Art.actorBounds,
      snapshot: () => ({
        state: copy(g.state),
        scene: g.scene.id,
        mode: g.mode,
        battle: g.battle ? battleView(g.battle, g.state) : null,
        panel: g.ui.panel?.type,
        paused: g.ui.menu,
        errors: [...errors],
        assets: copy(assetDiagnostics),
        artMetrics: Art.artMetrics(),
        frameTimes: g.frameTimes.slice(-600),
        logs: copy(g.logs),
      }),
      preset(name) {
        g.state = P.createState();
        g.ui.panel = null;
        g.ui.menu = false;
        g.mode = 'world';
        g.battle = null;
        if (name === 'party' || name === 'battle-four' || name === 'final') {
          P.recruit(g.state, 'vex');
          P.recruit(g.state, 'rune');
          P.awardXp(g.state, name === 'final' ? 17000 : 2500);
          g.state.heroes.forEach(
            (h) =>
              (h.skills = Object.values(TECHS)
                .filter((t) => t.heroes.includes(h.id))
                .map((t) => t.id)),
          );
        }
        if (name === 'settlement') {
          g.state.flags.haventide_liberated = true;
          g.state.region = 'haventide_town';
          Object.assign(g.state, g.scene.spawn);
          g.state.resources = { food: 500, ore: 500, energy: 500, renown: 500 };
        }
        if (name === 'battle' || name === 'battle-four' || name === 'final') {
          g.state.flags.battle_taught = true;
          g.battle = createBattle(g.state, {
            id: 'test_' + name,
            biome: 'coast',
            enemies:
              name === 'battle'
                ? ['rust_scrapper']
                : name === 'final'
                  ? ['void_architect']
                  : [
                      'rust_scrapper',
                      'drone_sentinel',
                      'mutant_hound',
                      'gravbot',
                    ],
            boss: name === 'final',
          });
          g.mode = 'battle';
        }
        g.resetFollowers();
        g.updateCamera(true);
        reveal(g.state, g.scene);
        g.ui.render();
        return this.snapshot();
      },
      interact(id) {
        const obj = [...g.scene.objects, ...g.scene.portals].find(
          (o) => o.id === id,
        );
        if (!obj) throw Error('Unknown object ' + id);
        const pt = g.safePoint(g.scene, obj.x, obj.y + 25);
        Object.assign(g.state, pt);
        g.near = obj;
        g.interact(obj);
      },
      goto(id) {
        const r = getScene(id);
        g.state.region = id;
        Object.assign(g.state, r.spawn);
        g.ui.panel = null;
        g.ui.menu = false;
        g.mode = 'world';
        g.battle = null;
        g.resetFollowers();
        g.updateCamera(true);
        reveal(g.state, r);
        g.ui.render();
      },
      step(seconds) {
        for (let i = 0; i < seconds * 60; i++) g.update(1 / 60);
      },
      key(k) {
        if (!g.ui.handleKey(k) && g.battle) battleKey(g.battle, g.state, k);
      },
      allScenes: Object.keys(ALL_SCENES),
    };
  }
}
function fatal(e) {
  console.error(e);
  const load = document.querySelector('#loading');
  if (load) load.remove();
  document.querySelector('#overlay').innerHTML =
    `<div class="fatal"><h2>The field instrument needs attention.</h2><p>Required content failed to load. Reload after correcting the error.</p><pre></pre></div>`;
  document.querySelector('.fatal pre').textContent = e.stack || String(e);
  window.__ECHO_READY__ = false;
}
boot().catch(fatal);
