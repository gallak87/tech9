import { formatTime } from './TrialRules.js';
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const medalMark = (m) =>
  ({ gold: '◆', silver: '◇', bronze: '◈', finished: '✓' })[m] || '—';
export class GameUI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.abort = new AbortController();
    this.resetArmed = false;
    root.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('[data-action]');
        if (b) game.action(b.dataset.action, b.dataset.value);
      },
      { signal: this.abort.signal },
    );
    root.addEventListener(
      'change',
      (e) => {
        if (e.target.dataset.setting)
          game.setting(e.target.dataset.setting, e.target.value);
      },
      { signal: this.abort.signal },
    );
    this.render();
  }
  render() {
    const g = this.game,
      s = g.state,
      r = g.route,
      v = g.vehicles[g.vehicle],
      results = Object.values(g.records),
      complete = results.length,
      medals = results.filter((x) => x.medal !== 'finished').length;
    this.root.innerHTML = `<header class="masthead"><a class="wordmark" href="#" data-action="garage"><span class="brand-icon">↟</span><span>TRAIL<span class="wordmark-sub">DRIVING PARK</span></span></a><div class="park-label"><span class="live-dot"></span> NORTH CASCADE / OPEN SEASON</div><button class="quiet" data-action="${s === 'garage' ? 'settings' : 'pause'}">${s === 'garage' ? 'SETTINGS ↗' : s === 'paused' ? 'RESUME ↗' : 'PAUSE Ⅱ'}</button></header>
 ${
   s === 'garage'
     ? `<section class="garage panel"><div class="eyebrow">THE TRAILHEAD &nbsp; / &nbsp; 01</div><h1>Take the<br>long way.</h1><p class="lede">Three machines. One wild playground.<br>Find your line through the high country.</p><div class="section-label">01 &nbsp; CHOOSE YOUR RIDE</div><div class="vehicle-tabs">${Object.entries(
         g.vehicles,
       )
         .map(
           ([id, spec]) =>
             `<button class="vehicle-tab ${id === g.vehicle ? 'selected' : ''}" data-action="vehicle" data-value="${id}" aria-pressed="${id === g.vehicle}"><span>${id === 'jeep' ? '01' : id === 'atv' ? '02' : '03'}</span>${esc(spec.name || id)}</button>`,
         )
         .join(
           '',
         )}</div><p class="handling">${esc(v.summary)}</p><div class="section-label">02 &nbsp; PICK A TRAIL</div><div class="routes">${g.routes
         .map((route, i) => {
           const rec = g.records[`${g.vehicle}:${route.id}`];
           return `<button class="route-card ${route.id === r.id ? 'selected' : ''}" data-action="route" data-value="${route.id}" aria-pressed="${route.id === r.id}" style="--route:${route.color}"><span class="route-no">0${i + 1}</span><span class="route-title">${esc(route.name)}<small>${esc(route.subtitle)} · ${(route.length / 1000).toFixed(1)} KM</small></span><span class="record ${rec?.medal || ''}">${rec ? medalMark(rec.medal) + ' ' + formatTime(rec.time) : '↗'}</span></button>`;
         })
         .join(
           '',
         )}</div><div class="start-actions"><button class="primary" data-action="start">START TIME TRIAL <span>↗</span></button><button class="secondary" data-action="free">FREE DRIVE</button></div><div class="progress"><span>${complete} / 9 COMBINATIONS</span><span>${medals} MEDALS EARNED</span><div class="progress-track"><i style="width:${(complete / 9) * 100}%"></i></div></div></section><div class="preview-label"><span class="eyebrow">READY FOR THE ROUGH</span><strong>${esc(v.name)}</strong><span>${Math.round(v.topSpeed * 3.6)} KM/H &nbsp; / &nbsp; ${g.vehicle === 'bike' ? 'ASSISTED BALANCE' : 'ALL-TERRAIN TRACTION'}</span></div><footer class="garage-footer"><span>46° 52′ N &nbsp; 121° 45′ W</span><span>600 × 600 METRES OF POSSIBILITY</span></footer>`
     : ''
 }
 ${s === 'driving' || s === 'paused' ? `<div class="run-heading"><span class="eyebrow">${g.mode === 'trial' ? 'TIME TRIAL' : 'FREE DRIVE'} / ${esc(v.name)}</span><h2>${esc(r.name)}</h2><div id="objective">${g.mode === 'trial' ? `GATE ${g.rules.nextGate + 1} / ${r.gates.length}` : 'EXPLORE THE PARK · FOLLOW THE TRAILS'}</div></div><div class="timing"><span>${g.mode === 'trial' ? 'ELAPSED TIME' : 'HIGH COUNTRY'}</span><strong id="timer">00:00.00</strong><small id="penalty"></small></div><div class="telemetry"><strong id="speed">0</strong><span>KM/H</span><div class="surface"><span id="gear">N</span><span id="surface">FIRM TRAIL</span></div></div><div class="map-wrap"><canvas id="minimap" width="220" height="220" aria-label="Trail map and vehicle position"></canvas><span>N ↑ &nbsp; / &nbsp; TRAIL MAP</span></div><div class="drive-controls"><span><kbd>W S</kbd> throttle / reverse</span><span><kbd>A D</kbd> steer</span><span><kbd>SPACE</kbd> brake</span><span><kbd>C</kbd> view</span><span><kbd>R</kbd> recover +5s</span><span><kbd>T</kbd> retry</span></div><div id="notice" role="status"></div>` : ''}
 ${s === 'paused' ? `<div class="scrim"><section class="modal"><span class="eyebrow">TAKE A BREATHER</span><h2>Trail paused.</h2><p>Held controls are cleared. Your run is waiting.</p><button class="primary" data-action="resume">BACK TO THE TRAIL ↗</button><button class="secondary" data-action="restart">RESTART RUN</button><button class="quiet" data-action="garage">RETURN TO GARAGE</button>${this.settingsMarkup()}</section></div>` : ''}
 ${s === 'results' ? `<div class="scrim result-scrim"><section class="modal results"><div class="eyebrow">${esc(r.name)} / ${esc(v.name)}</div><span class="medal-badge ${g.result.medal}">${medalMark(g.result.medal)}</span><h2>${g.result.medal === 'finished' ? 'Trail complete.' : g.result.medal[0].toUpperCase() + g.result.medal.slice(1) + ' earned.'}</h2><strong class="result-time">${formatTime(g.result.time)}</strong><p>${formatTime(g.result.drivingTime)} driving + ${g.result.penalties}s recovery</p><div class="result-best">${g.result.best ? 'NEW PERSONAL BEST' : 'PERSONAL BEST ' + formatTime(g.records[`${g.vehicle}:${r.id}`].time)}</div><div class="medal-targets">${['Gold', 'Silver', 'Bronze'].map((m, i) => `<span>${m}<strong>${formatTime(r.medals[g.vehicle][i])}</strong></span>`).join('')}</div><button class="primary" data-action="restart">RIDE IT AGAIN ↗</button><button class="secondary" data-action="nextVehicle">TRY ANOTHER VEHICLE</button><button class="quiet" data-action="garage">BACK TO TRAILHEAD</button>${g.result.saved ? '' : '<p>Storage is unavailable; this record lasts for this session.</p>'}</section></div>` : ''}
 ${s === 'settings' ? `<div class="scrim"><section class="modal"><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2>Park settings.</h2>${this.settingsMarkup()}<button class="secondary" data-action="resetRecords">${this.resetArmed ? 'CONFIRM RESET ALL 9 RECORDS' : 'RESET SAVED RECORDS'}</button><button class="primary" data-action="garage">BACK TO TRAILHEAD ↗</button></section></div>` : ''}`;
  }
  settingsMarkup() {
    const g = this.game;
    return `<div class="settings"><label>Graphics<select data-setting="quality" aria-label="Graphics">${['balanced', 'high', 'ultra'].map((q) => `<option value="${q}" ${q === g.app.settings.quality ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></label><label>Engine & terrain<input type="range" min="0" max="1" step="0.05" value="${g.volume}" data-setting="volume" aria-label="Volume"></label><button class="quiet" data-action="mute">${g.volume === 0 ? 'UNMUTE AUDIO' : 'MUTE AUDIO'}</button><p class="settings-note">Esc / P pause · C chase / driver view<br>R grounded recovery · T restart<br>S brakes, then reverses at low speed.</p></div>`;
  }
  update(snapshot) {
    const g = this.game;
    if (!['driving', 'paused'].includes(g.state)) return;
    const find = (id) => this.root.querySelector('#' + id);
    find('speed').textContent = Math.round(Math.abs(snapshot.speed) * 3.6);
    find('gear').textContent =
      snapshot.speed < -0.2 ? 'R' : snapshot.speed > 0.2 ? 'D' : 'N';
    find('surface').textContent = (
      typeof snapshot.surface === 'string'
        ? snapshot.surface
        : snapshot.surface?.kind || 'trail'
    ).toUpperCase();
    find('timer').textContent =
      g.mode === 'trial'
        ? formatTime(g.rules.elapsed + g.rules.penalties)
        : 'FREE';
    find('penalty').textContent = g.rules.penalties
      ? `+${g.rules.penalties} SEC RECOVERY`
      : '';
    if (g.mode === 'trial')
      find('objective').textContent =
        `GATE ${Math.min(g.rules.nextGate + 1, g.route.gates.length)} / ${g.route.gates.length} · FOLLOW ${g.route.name.toUpperCase()}`;
    find('notice').textContent =
      g.noticeUntil > performance.now() ? g.notice : '';
    this.map(find('minimap'), snapshot);
  }
  map(canvas, s) {
    if (!canvas) return;
    const c = canvas.getContext('2d'),
      g = this.game;
    const xy = (p) => [
      ((p.x + 300) / 600) * 200 + 10,
      ((p.z + 300) / 600) * 200 + 10,
    ];
    c.clearRect(0, 0, 220, 220);
    c.fillStyle = '#102a28dd';
    c.fillRect(0, 0, 220, 220);
    c.strokeStyle = '#ffffff0c';
    for (let i = 10; i < 220; i += 25) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 220);
      c.moveTo(0, i);
      c.lineTo(220, i);
      c.stroke();
    }
    for (const r of g.routes) {
      c.strokeStyle = r.id === g.route.id ? r.color : '#ffffff28';
      c.lineWidth = r.id === g.route.id ? 3 : 1;
      c.beginPath();
      r.points.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](...xy(p)));
      c.stroke();
    }
    if (g.mode === 'trial') {
      const gate = g.route.gates[g.rules.nextGate];
      if (gate) {
        c.fillStyle = '#f6d675';
        c.beginPath();
        c.arc(...xy(gate), 5, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.save();
    c.translate(...xy(s));
    c.rotate(s.heading);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5, 6);
    c.closePath();
    c.fill();
    c.restore();
  }
  dispose() {
    this.abort.abort();
    this.root.replaceChildren();
  }
}
