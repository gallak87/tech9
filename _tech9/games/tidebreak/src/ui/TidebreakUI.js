import { GATES, DOCK_ZONE, coastRadius } from '../world/islandDefinition.js';
import { VESSELS } from '../game/vessels.js';
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60),
    s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`;
}
export class TidebreakUI {
  constructor(app, boat, rules, actions) {
    Object.assign(this, { app, boat, rules, actions });
    this.previous = '';
    document.querySelector('#app-ui').innerHTML = `
      <header class="masthead"><div class="wordmark">TIDEBREAK<span id="vessel-label">NORTHLIGHT SAILING CLUB</span></div><div class="route-status"><span id="route-eyebrow">YOUR FIRST LAP</span><strong id="route-title">A loop around Northlight</strong><div class="steps"><i></i><i></i><i></i></div></div><div class="clock"><span>LAP TIME</span><strong id="timer">00:00.0</strong><small id="best">SESSION BEST —</small></div></header>
      <section id="menu" class="menu"><p class="eyebrow" id="menu-eyebrow">NORTHLIGHT ISLAND / EARLY MORNING</p><h1 id="menu-title">Take the<br><em>helm.</em></h1><p class="intro" id="menu-copy">Choose your ship. Circle Northlight.<br>Bring her gently home.</p><fieldset id="fleet" class="fleet"><legend>CHOOSE YOUR SHIP</legend>${VESSELS.map((v) => `<button type="button" class="vessel-card" data-vessel="${v.id}" aria-pressed="${v.id === boat.vessel.id}">${shipIcon(v.id)}<span class="vessel-info"><strong>${v.name}</strong><small>${v.type} · ${v.length} m</small><span>${v.description}</span></span><b class="vessel-check" aria-hidden="true">✓</b></button>`).join('')}</fieldset><div class="controls"><div><kbd>W</kbd><kbd>S</kbd><span>Fill sails / slow / backwater</span></div><div><kbd>A</kbd><kbd>D</kbd><span>Steer with your speed</span></div><div><kbd>P</kbd><kbd>R</kbd><span>Pause / return to dock</span></div><div><kbd>C</kbd><span>At the wheel / outside camera</span></div></div><button id="primary">Cast off <span>↗</span></button><button id="reset" class="secondary" hidden>Return to dock</button><p class="route-note" id="route-note">Pass gates 01 → 02 → 03. Return to the mooring ring<br>at less than 0.8 m/s. Assisted sailing · no wind management.</p><details id="graphics"><summary>Graphics & atmosphere <span>＋</span></summary><div class="settings"><label>Quality<select id="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><label>Sunlight<input id="sunlight" type="range" min="0.4" max="1.6" step="0.1"></label><label>Coastal haze<input id="atmosphere" type="range" min="0.4" max="1.6" step="0.1"></label><label>Vegetation<input id="richness" type="range" min="0.4" max="1.6" step="0.1"></label><label>Exposure<input id="exposure" type="range" min="0.4" max="1.6" step="0.1"></label></div></details></section>
      <footer class="helm"><div class="speed"><strong id="speed">0.0</strong><span>m/s<small id="gear">IDLE</small></span><div class="speed-track"><i id="speed-bar"></i></div></div><div class="help"><span id="notice">The water is yours.</span><small>W/S sail & slow · A/D steer · P pause · R reset</small></div><div class="chart"><span>NORTHLIGHT <b>N ↑</b></span><canvas id="chart" width="240" height="240" aria-label="Course chart: three gates clockwise around the island"></canvas><small id="chart-caption">01 EAST → 02 NORTH → 03 WEST</small></div></footer><button id="camera-switch" title="Switch camera (C)">CAPTAIN VIEW <kbd>C</kbd></button><button id="pause" title="Pause (P)">Ⅱ</button><div class="narrow">Best played with a keyboard and a wider window.</div>`;
    this.nodes = Object.fromEntries(
      [...document.querySelectorAll('[id]')].map((n) => [n.id, n]),
    );
    this.nodes.primary.onclick = () => {
      actions.primary();
      this.refresh();
    };
    this.nodes.reset.onclick = () => actions.reset();
    this.nodes.fleet.querySelectorAll('[data-vessel]').forEach((button) => {
      button.onclick = () => actions.selectVessel(button.dataset.vessel);
    });
    this.nodes.pause.onclick = () => actions.pause();
    this.nodes['camera-switch'].onclick = () => actions.camera();
    for (const key of [
      'quality',
      'sunlight',
      'atmosphere',
      'richness',
      'exposure',
    ]) {
      this.nodes[key].value = app.settings[key];
      this.nodes[key].oninput = () =>
        app.setSettings({
          [key]:
            key === 'quality'
              ? this.nodes[key].value
              : Number(this.nodes[key].value),
        });
    }
    this.ctx = this.nodes.chart.getContext('2d');
    this.updateVessel();
    this.refresh();
  }
  updateVessel() {
    const vessel = this.boat.vessel;
    this.nodes['vessel-label'].textContent =
      `${vessel.name.toUpperCase()} · ${vessel.type.toUpperCase()}`;
    this.nodes.fleet.querySelectorAll('[data-vessel]').forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.vessel === vessel.id),
      );
    });
  }
  updateCamera() {
    this.nodes['camera-switch'].innerHTML =
      this.app.controls.mode === 'captain'
        ? 'OUTSIDE VIEW <kbd>C</kbd>'
        : 'CAPTAIN VIEW <kbd>C</kbd>';
  }
  refresh() {
    const state = this.rules.state,
      n = this.nodes;
    if (state === this.previous) return;
    this.previous = state;
    n.menu.hidden = state === 'running';
    n.pause.hidden = state !== 'running';
    n.reset.hidden = state === 'ready';
    n.fleet.hidden = state !== 'ready';
    n.reset.textContent =
      state === 'finished' ? 'Choose another ship' : 'Return to dock';
    document.body.dataset.state = state;
    if (state === 'ready') {
      n['menu-eyebrow'].textContent = 'NORTHLIGHT ISLAND / EARLY MORNING';
      n['menu-title'].innerHTML = 'Take the<br><em>helm.</em>';
      n['menu-copy'].innerHTML =
        'Choose your ship. Circle Northlight.<br>Bring her gently home.';
      n.primary.innerHTML = 'Cast off <span>↗</span>';
    }
    if (state === 'paused') {
      n['menu-eyebrow'].textContent = 'TAKE A BREATH';
      n['menu-title'].innerHTML = 'At your<br><em>own pace.</em>';
      n['menu-copy'].textContent =
        'Your lap is paused. Resume when you’re ready to make waves.';
      n.primary.innerHTML = 'Resume lap <span>↗</span>';
    }
    if (state === 'finished') {
      n['menu-eyebrow'].textContent = 'ALL THREE GATES · SAFELY MOORED';
      n['menu-title'].innerHTML = 'Welcome<br><em>home.</em>';
      n['menu-copy'].textContent =
        `Around the island in ${formatTime(this.rules.elapsed)}. There’s always a smoother line.`;
      n.primary.innerHTML = 'Sail again <span>↗</span>';
    }
  }
  update() {
    this.refresh();
    const b = this.boat,
      r = this.rules,
      n = this.nodes,
      next = GATES[r.nextGate],
      speed = Math.hypot(b.vx, b.vz);
    n.timer.textContent = formatTime(r.elapsed);
    n.best.textContent = `SESSION BEST ${Number.isFinite(r.best) ? formatTime(r.best) : '—'}`;
    n.speed.textContent = speed.toFixed(1);
    n.gear.textContent =
      b.speed < -0.1 ? 'REVERSE' : speed > 0.15 ? 'UNDER WAY' : 'IDLE';
    n['speed-bar'].style.width = `${Math.min(100, (speed / 7) * 100)}%`;
    n['route-eyebrow'].textContent = next
      ? `GATE ${String(r.nextGate + 1).padStart(2, '0')} / 03`
      : 'RETURN TO THE JETTY';
    const target = next ?? DOCK_ZONE,
      dist = Math.round(Math.hypot(target.x - b.x, target.z - b.z));
    n['route-title'].textContent = next
      ? `${next.name} · ${dist} m`
      : `Mooring ring · ${dist} m · below 0.8 m/s`;
    document
      .querySelectorAll('.steps i')
      .forEach(
        (el, i) =>
          (el.className =
            i < r.nextGate ? 'done' : i === r.nextGate ? 'active' : ''),
      );
    n.notice.textContent =
      r.state === 'finished'
        ? 'A good run. A gentle return.'
        : r.notice ||
          (r.nextGate === 3
            ? 'Ease into the gold ring. Hold below 0.8 m/s.'
            : 'Keep the island to port. Pass between the numbered buoys.');
    this.drawChart();
  }
  drawChart() {
    const c = this.ctx,
      b = this.boat,
      r = this.rules;
    c.clearRect(0, 0, 240, 240);
    c.save();
    c.translate(120, 120);
    c.scale(0.84, 0.84);
    c.strokeStyle = '#c8d3bb30';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 0, 112, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#88a79345';
    c.strokeStyle = '#aac1a475';
    c.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2,
        rad = coastRadius(a);
      const x = Math.cos(a) * rad,
        z = Math.sin(a) * rad;
      i ? c.lineTo(x, z) : c.moveTo(x, z);
    }
    c.fill();
    c.stroke();
    c.font = 'bold 13px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    GATES.forEach((g, i) => {
      c.fillStyle =
        i < r.nextGate ? '#8ba79a' : i === r.nextGate ? '#ffda91' : '#b7c7bf';
      c.beginPath();
      c.arc(g.x, g.z, 10, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#12343a';
      c.fillText(String(i + 1), g.x, g.z);
    });
    c.strokeStyle = '#e7c483';
    c.strokeRect(
      DOCK_ZONE.x - DOCK_ZONE.radius,
      DOCK_ZONE.z - DOCK_ZONE.radius,
      DOCK_ZONE.radius * 2,
      DOCK_ZONE.radius * 2,
    );
    c.translate(b.x, b.z);
    c.rotate(b.heading);
    c.fillStyle = '#fff2d1';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(4, 5);
    c.lineTo(0, 3);
    c.lineTo(-4, 5);
    c.closePath();
    c.fill();
    c.restore();
  }
  dispose() {
    document.querySelector('#app-ui').innerHTML = '';
  }
}

function shipIcon(id) {
  const sails =
    id === 'galleon'
      ? '<path d="M25 15 Q36 19 48 15 L45 33 Q36 37 27 33 Z M25 37 Q36 41 48 37 L45 49 Q36 52 27 49 Z M51 8 Q62 12 73 8 L70 28 Q62 32 53 28 Z M51 33 Q62 37 73 33 L70 48 Q62 51 53 48 Z"/>'
      : '<path d="M36 12 L36 49 Q51 49 59 46 Z M61 6 L61 43 Q77 44 88 40 Z M31 22 L14 49 L31 49 Z"/>';
  return `<svg viewBox="0 0 100 75" aria-hidden="true"><g fill="currentColor" opacity=".9">${sails}</g><path d="M10 54 Q44 63 88 50 L81 65 Q41 75 18 64 Z" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="1.3"><path d="M36 9 V60 M61 4 V57 M6 68 Q30 73 47 69 T92 69"/></g></svg>`;
}
