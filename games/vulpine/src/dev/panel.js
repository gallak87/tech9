import { TUNE as FLIGHT } from '../game/flight.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dev panel — DOM overlay of playtest shortcuts.
//
// DOM rather than the HUD canvas so it can never land in a capture. Hidden
// until backquote for the same reason: the screenshot harness drives the same
// dev server and never presses keys. `?dev=1` opens it on load.
//
// Talks to the game only through `window.__VULPINE__`, so nothing here can
// change behaviour while the panel is closed. Add tools to `TOOLS`.
// ─────────────────────────────────────────────────────────────────────────────

const CSS = `
.vdev {
  position: fixed; right: 12px; bottom: 12px; z-index: 50;
  display: none; flex-direction: column; gap: 5px; width: 208px;
  max-height: calc(100vh - 24px); overflow-y: auto;
  padding: 9px; border-radius: 7px;
  background: rgba(6,12,20,0.88); border: 1px solid rgba(120,200,255,0.28);
  box-shadow: 0 6px 22px rgba(0,0,0,0.5);
  font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #cfe6f7; user-select: none;
}
.vdev.open { display: flex; }
.vdev h6 {
  margin: 0 0 2px; font-size: 9px; letter-spacing: 1.6px; font-weight: 600;
  color: #ffb454; text-transform: uppercase;
}
.vdev button {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 6px 7px; cursor: pointer; text-align: left;
  font: inherit; color: #cfe6f7;
  background: rgba(20,38,56,0.9); border: 1px solid rgba(120,200,255,0.22);
  border-radius: 4px;
}
.vdev button:hover { background: rgba(32,58,84,0.95); border-color: rgba(120,200,255,0.45); }
.vdev button:active { transform: translateY(1px); }
.vdev button[data-on="1"] { background: rgba(30,74,52,0.95); border-color: rgba(120,255,180,0.5); color: #d6ffe8; }
.vdev button[disabled] { opacity: 0.45; cursor: default; }
.vdev kbd {
  flex: none; min-width: 15px; padding: 1px 4px; text-align: center;
  font: inherit; font-size: 10px; color: #9fd0ff;
  background: rgba(0,0,0,0.45); border: 1px solid rgba(120,200,255,0.3);
  border-radius: 3px;
}
.vdev .vdev-hint { font-size: 9px; color: #6f8ba3; letter-spacing: 0.4px; }
.vdev .vdev-fps {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 5px 7px; border-radius: 4px;
  background: rgba(0,0,0,0.45); border: 1px solid rgba(120,200,255,0.22);
  font-variant-numeric: tabular-nums;
}
.vdev .vdev-fps b {
  flex: none; white-space: nowrap;
  font-size: 15px; font-weight: 600; color: #5cf0a0;
}
.vdev .vdev-fps b.warn { color: #ffc161; }
.vdev .vdev-fps b.bad { color: #ff5a52; }
.vdev .vdev-fps span {
  font-size: 9px; color: #6f8ba3; text-align: right; line-height: 1.35;
  white-space: nowrap;
}
.vdev .vdev-knob { display: flex; flex-direction: column; gap: 1px; }
.vdev .vdev-knob-top {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 10px; color: #9fd0ff;
}
.vdev .vdev-knob-top b { font-weight: 600; color: #ffd489; font-variant-numeric: tabular-nums; }
.vdev input[type=range] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 12px;
  background: transparent; cursor: ew-resize; margin: 0;
}
.vdev input[type=range]::-webkit-slider-runnable-track {
  height: 3px; border-radius: 2px; background: rgba(120,200,255,0.25);
}
.vdev input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; margin-top: -4px;
  width: 11px; height: 11px; border-radius: 50%;
  background: #9fd0ff; border: 1px solid rgba(6,12,20,0.9);
}
.vdev .vdev-row { display: flex; flex-wrap: wrap; gap: 3px; }
.vdev .vdev-row button {
  width: auto; flex: 1 1 auto; justify-content: center; padding: 3px 5px; font-size: 9px;
}
`;

export function installDevPanel(api) {
  if (typeof document === 'undefined' || document.querySelector('.vdev')) return null;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'vdev';

  let infiniteBombs = false;
  let busy = false;

  /* ── tools ──────────────────────────────────────────────────────────────── */

  /**
   * Run the sim forward until the carrier exists.
   *
   * Replays rather than teleporting the rail: waves trigger on `flight.railZ`
   * crossings, so jumping the position dumps every backlogged wave into one
   * tick. `seek` only steps forward, hence the guard and the top-up loop.
   */
  function skipToBoss(btn) {
    if (busy) return;
    if (api.combat.boss) { flash(btn, 'already'); return; }
    busy = true;
    setLabel(btn, 'seeking…');
    // Let the label paint before we block the thread for a few thousand steps.
    requestAnimationFrame(() => {
      try {
        api.seek(48);                         // ~z -8300 at 175 m/s
        let guard = 0;
        while (!api.combat.boss && guard++ < 400) api.step(30);
      } finally {
        busy = false;
        render();
        if (!api.combat.boss) flash(btn, 'no boss?');
      }
    });
  }

  /**
   * Kill the carrier now, skipping to it first if it is not up yet. One button
   * rather than two presses, because what this exists to exercise is what
   * happens *after* the kill and getting there should not be a ritual.
   */
  function killBoss(btn) {
    if (busy) return;
    if (!api.combat.boss) {
      skipToBoss(btn);
      // skipToBoss defers its work to the next frame; kill on the one after, so
      // the carrier has spawned and its health bar has been published.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!api.combat.killBoss()) flash(btn, 'no boss?');
        render();
      }));
      return;
    }
    if (!api.combat.killBoss()) flash(btn, 'already dying');
    render();
  }

  /**
   * Drop straight to the moment after the carrier dies — the top of the ascent.
   * Skips the fight and the victory lap both, so the transition can be watched
   * without flying 9 km first.
   */
  function skipLevel(btn) {
    if (busy) return;
    const camp = api.ctx.campaign;
    if (!camp) { flash(btn, 'no campaign'); return; }
    if (!camp.next) { flash(btn, 'last level'); return; }
    // A live carrier would otherwise follow the ship into the ascent; the field
    // is not cleared until the rebuild, which is two phases away.
    api.combat.killBoss();
    camp.forceHop();
    render();
  }

  function toggleBombs() { infiniteBombs = !infiniteBombs; render(); }

  /** Step the tap gun up one tier, without flying to the pre-boss grants. */
  function upgradeWeapon(btn) {
    const w = api.state && api.state.weapon;
    if (w && w.tier >= w.tiers - 1) { flash(btn, 'maxed'); return; }
    api.combat.grantWeapon();
    render();
  }

  /* ── look knobs ─────────────────────────────────────────────────────────────
     Live so the owner can dial a look in one play session and read the numbers
     back, instead of the agent guessing a grade and burning a capture loop on
     each attempt. Every `set` writes the same field the tuning default writes,
     so whatever lands here can be pasted straight into source.

     `motion` is the blur *gain*, not its strength: main.js rewrites strength
     from boost every frame, so a knob on strength would be lost immediately. */
  const P = () => api.engine.post;
  const GU = () => api.engine.post.grade.material.uniforms;
  const KNOBS = [
    // Ranges bracket the *preset's* live values (environment.js `corneria`),
    // not the pass constructor defaults — the preset overwrites those in
    // `env.apply()`, so the constructor numbers are never what is on screen.
    { id: 'exposure', label: 'exposure', min: 0.05, max: 0.60, step: 0.005, dp: 3,
      get: () => P().params.exposure, set: (v) => api.post({ exposure: v }) },
    { id: 'trim', label: 'trim (late gain)', min: 0.4, max: 1.6, step: 0.01, dp: 2,
      get: () => P().params.trim, set: (v) => api.post({ trim: v }) },
    { id: 'bloom', label: 'bloom', min: 0, max: 0.20, step: 0.002, dp: 3,
      get: () => P().params.bloom.strength, set: (v) => api.post({ bloom: { strength: v } }) },
    { id: 'dirt', label: 'lens dirt', min: 0, max: 0.20, step: 0.005, dp: 3,
      get: () => P().params.bloom.dirt, set: (v) => api.post({ bloom: { dirt: v } }) },
    { id: 'godrays', label: 'god rays', min: 0, max: 0.7, step: 0.005, dp: 3,
      get: () => P().godRays.params.intensity, set: (v) => api.post({ godRays: { intensity: v } }) },
    { id: 'flare', label: 'lens flare', min: 0, max: 1.0, step: 0.01, dp: 2,
      get: () => P().flare.params.intensity, set: (v) => { P().flare.params.intensity = v; } },
    { id: 'ao', label: 'ambient occl', min: 0, max: 2.0, step: 0.01, dp: 2,
      get: () => P().ao.params.intensity, set: (v) => { P().ao.params.intensity = v; } },
    { id: 'sat', label: 'saturation', min: 0.6, max: 1.5, step: 0.01, dp: 2,
      get: () => GU().uSaturation.value, set: (v) => api.post({ grade: { saturation: v } }) },
    { id: 'contrast', label: 'contrast', min: 0.7, max: 1.4, step: 0.01, dp: 2,
      get: () => GU().uContrast.value, set: (v) => api.post({ grade: { contrast: v } }) },
    { id: 'ca', label: 'chromatic ab', min: 0, max: 3.0, step: 0.05, dp: 2,
      get: () => GU().uCA.value, set: (v) => api.post({ grade: { ca: v } }) },
    { id: 'vignette', label: 'vignette', min: 0, max: 1.6, step: 0.01, dp: 2,
      get: () => GU().uVignette.value, set: (v) => api.post({ grade: { vignette: v } }) },
    { id: 'motion', label: 'motion blur', min: 0, max: 2.0, step: 0.01, dp: 2,
      get: () => P().motion.gain, set: (v) => { P().motion.gain = v; } },
    { id: 'refl', label: 'reflections', min: 0, max: 1.0, step: 0.01, dp: 2,
      get: () => api.world.reflection.strength, set: (v) => { api.world.reflection.strength = v; } },
    // Flight feel. These three are hands-on questions, not measurable ones —
    // whether the corridor rotating around you reads as flying it or as the
    // camera wandering is not something a probe can answer.
    // `feel: true` keeps these out of the macros and on screen always — they are
    // not a quality axis and there is no low-to-high ordering to collapse them
    // onto.
    { id: 'railyaw', label: 'rail yaw follow', min: 0, max: 1.0, step: 0.01, dp: 2, feel: true,
      get: () => FLIGHT.railYawFollow, set: (v) => { FLIGHT.railYawFollow = v; } },
    { id: 'aimlead', label: 'aim lead', min: 0, max: 2.5, step: 0.01, dp: 2, feel: true,
      get: () => FLIGHT.aimLeadScale, set: (v) => { FLIGHT.aimLeadScale = v; } },
    { id: 'yawslide', label: 'yaw into slide', min: 0, max: 0.008, step: 0.0002, dp: 4, feel: true,
      get: () => FLIGHT.yawPerOffsetVel, set: (v) => { FLIGHT.yawPerOffsetVel = v; } },
    { id: 'camlead', label: 'cam lead', min: 0, max: 2.5, step: 0.01, dp: 2, feel: true,
      get: () => FLIGHT.camLeadGain, set: (v) => { FLIGHT.camLeadGain = v; } },
  ];

  /* ── macros ─────────────────────────────────────────────────────────────────
     Three dials over the thirteen look knobs, five authored steps each. Not
     interpolated between a low and a high profile: step 3 has to land on the
     shipped preset exactly, and several params (god rays, flare, CA) are zero
     there, so a low→high lerp cannot pass through it.

     The fine knobs still exist — `adv` reveals them and `dumpLook` still reads
     every one — because dialling a single param and pasting the result into
     `environment.js` is how the shipped look was arrived at. */
  const MACROS = [
    {
      id: 'post', label: 'post / glow', hint: ['off', 'subtle', 'shipped', 'rich', 'overcooked'],
      // godrays, flare and ca are 0 at shipped by owner call, so they stay dark
      // below step 3 and only open up above it.
      steps: {
        bloom: [0, 0.022, 0.040, 0.070, 0.120],
        dirt: [0, 0.010, 0.022, 0.045, 0.090],
        godrays: [0, 0, 0, 0.16, 0.34],
        flare: [0, 0, 0, 0.19, 0.42],
        ca: [0, 0, 0, 0.9, 1.9],
        vignette: [0, 0.55, 0.92, 1.15, 1.45],
      },
    },
    {
      id: 'image', label: 'image punch', hint: ['flat', 'soft', 'shipped', 'punchy', 'heavy'],
      steps: {
        exposure: [0.14, 0.17, 0.20, 0.25, 0.32],
        trim: [1.00, 1.00, 1.00, 1.06, 1.14],
        sat: [0.85, 0.98, 1.08, 1.20, 1.34],
        contrast: [0.90, 0.98, 1.05, 1.14, 1.26],
      },
    },
    {
      id: 'detail', label: 'detail / cost', hint: ['cheapest', 'low', 'shipped', 'high', 'max'],
      // `motion` is the blur gain, which ships at 1.0 — the *pass* is what is off
      // at every quality tier, and this knob does not touch that. Moving it below
      // step 3 only matters once the pass is re-enabled.
      steps: {
        ao: [0, 0.45, 0.86, 1.20, 1.60],
        motion: [0, 0.50, 1.00, 1.50, 2.00],
        refl: [0, 0.40, 0.72, 0.88, 1.00],
      },
    },
  ];

  /** Live step of a macro: the index whose values every member currently matches. */
  function macroStep(m) {
    for (let i = 0; i < 5; i++) {
      let all = true;
      for (const [id, vals] of Object.entries(m.steps)) {
        const k = KNOBS.find(x => x.id === id);
        if (!k || Math.abs(k.get() - vals[i]) > 1e-4) { all = false; break; }
      }
      if (all) return i;
    }
    return -1;                      // hand-tuned away from every step
  }

  function applyMacro(m, i) {
    for (const [id, vals] of Object.entries(m.steps)) {
      KNOBS.find(x => x.id === id)?.set(vals[i]);
    }
  }

  /** Pass toggles, for isolating what a look actually costs. */
  const TOGGLES = ['bloom', 'godRays', 'flare', 'ao', 'motion', 'dof', 'smaa', 'taa'];

  /** Log + copy every knob, so a dialled-in look can be pasted back verbatim. */
  function dumpLook(btn) {
    const out = {};
    for (const k of KNOBS) out[k.id] = +k.get().toFixed(4);
    out.hullMask = P().motion.mask;
    out.passes = TOGGLES.reduce((a, id) => (a[id] = !!P()[id]?.enabled, a), {});
    const text = JSON.stringify(out, null, 2);
    console.log('[dev] look:\n' + text);
    navigator.clipboard?.writeText(text).then(
      () => flash(btn, 'copied!'),
      () => flash(btn, 'logged'),
    );
  }

  const TOOLS = [
    { id: 'boss', label: 'Skip to boss', tag: '1', code: 'Digit1', run: skipToBoss },
    { id: 'killboss', label: 'Kill boss', tag: '6', code: 'Digit6', run: killBoss },
    {
      id: 'skiplevel', tag: '7', code: 'Digit7', run: skipLevel,
      label: 'Skip level (ascend)',
      // Carries the live level, so the panel says where the run actually is.
      live: () => {
        const c = api.ctx.campaign;
        return c ? `Skip level → ${c.next ? c.next.name : 'END'}` : 'Skip level';
      },
    },
    { id: 'bombs', label: 'Infinite bombs', tag: '2', code: 'Digit2', run: toggleBombs, on: () => infiniteBombs },
    {
      id: 'wpn', tag: '3', code: 'Digit3', run: upgradeWeapon,
      label: 'Weapon +1',
      // The label carries the live tier, so the panel doubles as the readout
      // when the HUD is hidden for a capture.
      live: () => {
        const w = api.state && api.state.weapon;
        return w ? `Weapon +1 (${w.label})` : 'Weapon +1';
      },
    },
    {
      id: 'hullmask', tag: '4', code: 'Digit4',
      label: 'Hull blur mask',
      run: () => { P().motion.mask = !P().motion.mask; render(); },
      on: () => P().motion.mask,
    },
    { id: 'dump', label: 'Copy look values', tag: '5', code: 'Digit5', run: dumpLook },
  ];

  /* ── dom ────────────────────────────────────────────────────────────────── */

  const head = document.createElement('h6');
  head.textContent = 'dev';
  root.appendChild(head);

  // Frame cost, for judging a look change against what it costs. Sampled at 5 Hz
  // rather than per frame because a number that changes 60 times a second cannot
  // be read, and `avgFrameMs` is already smoothed. 16.6 ms is the contract
  // budget, so the colour breaks there.
  const fpsBox = document.createElement('div');
  fpsBox.className = 'vdev-fps';
  const fpsNum = document.createElement('b');
  const fpsDetail = document.createElement('span');
  fpsBox.append(fpsNum, fpsDetail);
  root.appendChild(fpsBox);

  function renderFps() {
    const s = api.stats();
    const ms = s.frameMs;
    fpsNum.textContent = `${Math.round(s.fps)} fps`;
    fpsNum.className = ms > 22 ? 'bad' : ms > 16.6 ? 'warn' : '';
    fpsDetail.innerHTML =
      `${ms.toFixed(1)} ms<br>${s.calls} dr · ${(s.tris / 1e6).toFixed(2)}M tri`;
  }

  const buttons = new Map();
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    const name = document.createElement('span');
    name.textContent = t.label;
    const kbd = document.createElement('kbd');
    kbd.textContent = t.tag;
    b.append(name, kbd);
    b.addEventListener('click', () => {
      t.run(b);
      // a focused button eats the next Space, which is the fire key
      b.blur();
    });
    root.appendChild(b);
    buttons.set(t.id, { el: b, name, tool: t });
  }

  /* ── look section ───────────────────────────────────────────────────────── */
  const lookHead = document.createElement('h6');
  lookHead.textContent = 'look';
  root.appendChild(lookHead);

  const macros = [];
  for (const m of MACROS) {
    const wrap = document.createElement('div');
    wrap.className = 'vdev-knob';
    const top = document.createElement('div');
    top.className = 'vdev-knob-top';
    const name = document.createElement('span');
    name.textContent = m.label;
    const val = document.createElement('b');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '1'; input.max = '5'; input.step = '1';
    const show = () => {
      const i = macroStep(m);
      // -1 means a fine knob has been dragged off every authored step. Saying so
      // beats snapping the slider to a step whose values are not on screen.
      val.textContent = i < 0 ? 'custom' : `${i + 1} · ${m.hint[i]}`;
      if (i >= 0) input.value = String(i + 1);
    };
    input.addEventListener('input', () => {
      applyMacro(m, parseInt(input.value, 10) - 1);
      show();
      syncFine();
    });
    input.addEventListener('change', () => input.blur());
    top.append(name, val);
    wrap.append(top, input);
    root.appendChild(wrap);
    macros.push({ m, input, show });
  }

  const advBtn = document.createElement('button');
  advBtn.type = 'button';
  advBtn.append(Object.assign(document.createElement('span'), { textContent: 'Fine knobs' }));
  advBtn.addEventListener('click', () => {
    fineWrap.style.display = fineWrap.style.display === 'none' ? 'contents' : 'none';
    advBtn.dataset.on = fineWrap.style.display === 'none' ? '0' : '1';
    advBtn.blur();
  });
  advBtn.dataset.on = '0';
  root.appendChild(advBtn);

  // `display: contents` so the children stay in the panel's own flex column and
  // keep their spacing; a block wrapper would nest a second layout context.
  const fineWrap = document.createElement('div');
  fineWrap.style.display = 'none';
  root.appendChild(fineWrap);

  const feelHead = document.createElement('h6');
  feelHead.textContent = 'feel';
  let feelHeadPlaced = false;

  const knobs = [];
  // Look knobs into the collapsed section, feel knobs into the panel proper.
  // Partitioned rather than filtered in one pass so the `feel` header can sit
  // between them without depending on KNOBS' ordering.
  for (const k of [...KNOBS.filter(x => !x.feel), ...KNOBS.filter(x => x.feel)]) {
    const wrap = document.createElement('div');
    wrap.className = 'vdev-knob';
    const top = document.createElement('div');
    top.className = 'vdev-knob-top';
    const name = document.createElement('span');
    name.textContent = k.label;
    const val = document.createElement('b');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(k.min); input.max = String(k.max); input.step = String(k.step);
    const show = () => { val.textContent = k.get().toFixed(k.dp); };
    input.addEventListener('input', () => {
      k.set(parseFloat(input.value));
      show();
      // A fine knob can move a macro off its step, or onto a different one.
      for (const mm of macros) mm.show();
    });
    // a focused slider eats the arrow keys, which are the steering keys
    input.addEventListener('change', () => input.blur());
    top.append(name, val);
    wrap.append(top, input);
    // A flag, not `feelHead.isConnected`: `root` is still detached here, so the
    // header never reads as connected and appendChild would re-move it down the
    // list once per feel knob, landing it above the last one instead of the first.
    if (k.feel && !feelHeadPlaced) { root.appendChild(feelHead); feelHeadPlaced = true; }
    (k.feel ? root : fineWrap).appendChild(wrap);
    knobs.push({ k, input, show });
  }

  /** Re-read every fine knob from source, after a macro has written them. */
  function syncFine() {
    for (const { k, input, show } of knobs) { input.value = String(k.get()); show(); }
  }

  const togHead = document.createElement('h6');
  togHead.textContent = 'passes';
  root.appendChild(togHead);
  const togRow = document.createElement('div');
  togRow.className = 'vdev-row';
  const toggles = [];
  for (const id of TOGGLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = id;
    b.addEventListener('click', () => {
      const p = P()[id];
      if (p) api.post({ enable: { [id]: !p.enabled } });
      render();
      b.blur();
    });
    togRow.appendChild(b);
    toggles.push({ id, el: b });
  }
  root.appendChild(togRow);

  const hint = document.createElement('div');
  hint.className = 'vdev-hint';
  hint.textContent = '` to hide · 5 look · 6 kill boss · 7 skip level';
  root.appendChild(hint);
  document.body.appendChild(root);

  function setLabel(btn, text) {
    for (const { el, name, tool } of buttons.values()) {
      if (el === btn) name.textContent = text || (tool.live ? tool.live() : tool.label);
    }
  }

  function flash(btn, text) {
    setLabel(btn, text);
    setTimeout(() => setLabel(btn, null), 900);
  }

  function render() {
    for (const { el, name, tool } of buttons.values()) {
      if (tool.on) el.dataset.on = tool.on() ? '1' : '0';
      if (!busy) name.textContent = tool.live ? tool.live() : tool.label;
    }
    buttons.get('boss').el.disabled = busy || !!api.combat.boss;
    // Sliders are only re-synced from source here, never per frame — dragging
    // one must not fight a writer that rounds the value back.
    syncFine();
    for (const { show } of macros) show();
    for (const { id, el } of toggles) el.dataset.on = P()[id]?.enabled ? '1' : '0';
  }

  /* ── keys ───────────────────────────────────────────────────────────────── */

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Backquote') { root.classList.toggle('open'); e.preventDefault(); return; }
    if (!root.classList.contains('open')) return;
    const t = TOOLS.find(x => x.code === e.code);
    if (!t) return;
    e.preventDefault();
    t.run(buttons.get(t.id).el);
  });

  // Bombs are spent inside the fixed step; refilling once per frame is enough.
  let fpsT = 0;
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (infiniteBombs && api.state) api.state.bombs = 3;
    // Only while visible — a closed panel should cost nothing.
    if (t - fpsT > 200 && root.classList.contains('open')) { fpsT = t; renderFps(); }
  };
  requestAnimationFrame(tick);

  try {
    if (new URLSearchParams(location.search).get('dev')) root.classList.add('open');
  } catch { /* non-browser host */ }

  render();
  return { root, open: () => root.classList.add('open'), close: () => root.classList.remove('open') };
}
