import { GATES, DOCK_ZONE, coastRadius } from '../world/islandDefinition.js';
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
      <header class="masthead"><div class="wordmark">TIDEBREAK<span>ISLAND RUN · 01</span></div><div class="route-status"><span id="route-eyebrow">YOUR FIRST LAP</span><strong id="route-title">A loop around Northlight</strong><div class="steps"><i></i><i></i><i></i></div></div><div class="clock"><span>LAP TIME</span><strong id="timer">00:00.0</strong><small id="best">SESSION BEST —</small></div></header>
      <section id="menu" class="menu"><p class="eyebrow" id="menu-eyebrow">NORTHLIGHT ISLAND / EARLY MORNING</p><h1 id="menu-title">Find your<br><em>sea legs.</em></h1><p class="intro" id="menu-copy">One boat. Three gates. A little room to drift.<br>Circle the island, then bring her gently home.</p><div class="controls"><div><kbd>W</kbd><kbd>S</kbd><span>Throttle / brake / reverse</span></div><div><kbd>A</kbd><kbd>D</kbd><span>Steer with your speed</span></div><div><kbd>P</kbd><kbd>R</kbd><span>Pause / return to dock</span></div></div><button id="primary">Cast off <span>↗</span></button><button id="reset" class="secondary" hidden>Return to dock</button><p class="route-note" id="route-note">Pass gates 01 → 02 → 03. Return to the mooring ring<br>at less than 0.8 m/s. An easy lap takes 2–4 minutes.</p><details id="graphics"><summary>Graphics & atmosphere <span>＋</span></summary><div class="settings"><label>Quality<select id="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><label>Sunlight<input id="sunlight" type="range" min="0.4" max="1.6" step="0.1"></label><label>Coastal haze<input id="atmosphere" type="range" min="0.4" max="1.6" step="0.1"></label><label>Vegetation<input id="richness" type="range" min="0.4" max="1.6" step="0.1"></label><label>Exposure<input id="exposure" type="range" min="0.4" max="1.6" step="0.1"></label></div></details></section>
      <footer class="helm"><div class="speed"><strong id="speed">0.0</strong><span>m/s<small id="gear">IDLE</small></span><div class="speed-track"><i id="speed-bar"></i></div></div><div class="help"><span id="notice">The water is yours.</span><small>W/S throttle & brake · A/D steer · P pause · R reset</small></div><div class="chart"><span>NORTHLIGHT <b>N ↑</b></span><canvas id="chart" width="240" height="240" aria-label="Course chart: three gates clockwise around the island"></canvas><small id="chart-caption">01 EAST → 02 NORTH → 03 WEST</small></div></footer><button id="pause" title="Pause (P)">Ⅱ</button><div class="narrow">Best played with a keyboard and a wider window.</div>`;
    this.nodes = Object.fromEntries(
      [...document.querySelectorAll('[id]')].map((n) => [n.id, n]),
    );
    this.nodes.primary.onclick = () => {
      actions.primary();
      this.refresh();
    };
    this.nodes.reset.onclick = () => actions.reset();
    this.nodes.pause.onclick = () => actions.pause();
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
    this.refresh();
  }
  refresh() {
    const state = this.rules.state,
      n = this.nodes;
    if (state === this.previous) return;
    this.previous = state;
    n.menu.hidden = state === 'running';
    n.pause.hidden = state !== 'running';
    n.reset.hidden = state === 'ready';
    document.body.dataset.state = state;
    if (state === 'ready') {
      n['menu-eyebrow'].textContent = 'NORTHLIGHT ISLAND / EARLY MORNING';
      n['menu-title'].innerHTML = 'Find your<br><em>sea legs.</em>';
      n['menu-copy'].innerHTML =
        'One boat. Three gates. A little room to drift.<br>Circle the island, then bring her gently home.';
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
    c.strokeRect(8, 103, 14, 14);
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
